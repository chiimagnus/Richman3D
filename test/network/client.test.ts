import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { Miniflare } from "miniflare";
import { roomRuntime } from "../fixtures/network";
import { RoomClient, readRoomCredential, roomCredential } from "../../src/network/RoomClient";
import { OnlineSession } from "../../src/app/OnlineSession";
import type { PresentationPort } from "../../src/app/PresentationQueue";
import { CITY } from "../../src/domain/maps/city";
import { QUICK_RULES } from "../../src/domain/rules";
import { availableCommands } from "../../src/ui/viewModel";
import { matchId } from "../../src/app/matchId";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { IDBFactory } from "fake-indexeddb";

const options = { seats: 2, mapId: CITY.id, rulesVersion: QUICK_RULES.version };
const storage = { setItem: vi.fn() };
const port = (): PresentationPort => ({ sync: vi.fn(), stop: vi.fn(), present: vi.fn(async (_events, _signal, settle) => { settle(); }) });
async function until(predicate: () => boolean): Promise<void> { await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 5000, interval: 10 }); }

describe("browser client and online session against native workerd", () => {
  let runtime: Miniflare;
  let directory: string;
  let origin: string;
  const clients: RoomClient[] = [];
  const sessions: OnlineSession[] = [];
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "richman-client-"));
    runtime = await roomRuntime(directory);
    origin = (await runtime.ready).origin;
    vi.stubGlobal("WebSocket", class extends WebSocket {
      constructor(url: string | URL, protocols: string[]) { super(url, protocols, { origin }); }
    });
  });
  afterEach(async () => {
    sessions.splice(0).forEach((session) => session.dispose());
    clients.splice(0).forEach((client) => client.dispose());
    await runtime.dispose(); await rm(directory, { recursive: true, force: true }); vi.unstubAllGlobals();
  });
  async function enter(credential: ReturnType<typeof roomCredential>) {
    const client = new RoomClient(credential, storage, origin); clients.push(client);
    await client.enter(); await until(() => client.getSnapshot().status === "connected"); return client;
  }
  async function start(presentation?: PresentationPort) {
    const first = await enter(roomCredential("create", "Host", "", options));
    const second = await enter(roomCredential("join", "Guest", first.credential.code, null));
    await until(() => first.getSnapshot().room!.members.length === 2 && first.getSnapshot().room!.members.every((member) => member.connected));
    expect(first.start()).toBe(true); expect(first.start()).toBe(false);
    await until(() => first.getSnapshot().room?.snapshot !== null && second.getSnapshot().room?.snapshot !== null);
    const left = new OnlineSession(first); const right = new OnlineSession(second); sessions.push(left, right);
    left.bind(presentation ?? port()); right.bind(presentation ?? port()); return { first, second, left, right };
  }

  it("keeps fixed seats, serializes cash transfers, preserves rejected reasons and reconnects without replay", async () => {
    const { first, second, left, right } = await start();
    expect(left.getSnapshot().viewPlayerId).toBe("p1"); expect(right.getSnapshot().viewPlayerId).toBe("p2");
    const initial = left.getSnapshot().displayed;
    const actor = initial.turnPlayerId;
    const sender = actor === "p1" ? left : right;
    const recipient = actor === "p1" ? right : left;
    const recipientClient = actor === "p1" ? second : first;
    const other = actor === "p1" ? "p2" : "p1";
    await recipient.dispatch({ kind: "roll", actor, expectedRevision: 0 });
    expect(left.getSnapshot().committed.revision).toBe(0);
    await sender.dispatch({ kind: "trade_propose", actor, expectedRevision: 0, terms: { recipientId: other, givePropertyIds: [], receivePropertyIds: [], cash: { payerId: actor, amount: 50 } } });
    await until(() => recipient.getSnapshot().displayed.revision === 1 && !recipient.getSnapshot().presenting);
    await recipient.dispatch({ kind: "trade_accept", actor: other, expectedRevision: 1, proposalRevision: 1 });
    await until(() => left.getSnapshot().displayed.revision === 2 && right.getSnapshot().displayed.revision === 2 && !right.getSnapshot().presenting);
    expect(left.getSnapshot().displayed.players.map((player) => player.cash)).toEqual(initial.players.map((player) => player.cash + (player.id === actor ? -50 : 50)));
    expect(right.getSnapshot().displayed.players.map((player) => player.cash)).toEqual(left.getSnapshot().displayed.players.map((player) => player.cash));
    expect(recipientClient.command({ kind: "trade_accept", actor: other, expectedRevision: 1, proposalRevision: 1 })).toBe(true);
    await until(() => recipientClient.getSnapshot().error === "stale_revision" && !recipientClient.getSnapshot().pending);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recipientClient.getSnapshot().error).toBe("stale_revision");
    const replacement = await enter(first.credential);
    await until(() => first.getSnapshot().status === "disconnected");
    expect(availableCommands(left.getSnapshot())).toEqual([]);
    expect(replacement.getSnapshot().room!.snapshot!.revision).toBe(2);
    expect(replacement.getSnapshot().room!.playerId).toBe("p1");
    expect(replacement.getSnapshot().room!.snapshot!.players[1]!.hand).toBeNull();
  });

  it("gates animations, skips safely, pauses only presentation and cannot revive a disposed session", async () => {
    const { first, second, left, right } = await start();
    const actor = left.getSnapshot().displayed.turnPlayerId;
    const active = actor === "p1" ? left : right;
    const observer = actor === "p1" ? right : left;
    const client = actor === "p1" ? first : second;
    observer.pause();
    await active.dispatch({ kind: "roll", actor, expectedRevision: 0 });
    await until(() => observer.getSnapshot().displayed.revision === 1);
    expect(observer.getSnapshot().mode).toBe("paused");
    expect(observer.getSnapshot().presenting).toBe(false);
    await until(() => !active.getSnapshot().presenting);
    await observer.resume();
    expect(observer.getSnapshot().mode).toBe("running");
    const revision = observer.getSnapshot().displayed.revision;
    observer.dispose();
    const snapshot = client.getSnapshot().room!.snapshot!;
    const command = snapshot.decision.kind === "awaiting_purchase" ? { kind: "skip" as const, actor, expectedRevision: revision } : { kind: "roll" as const, actor: snapshot.turnPlayerId, expectedRevision: revision };
    const nextClient = command.actor === "p1" ? first : second;
    expect(nextClient.command(command)).toBe(true);
    await until(() => nextClient.getSnapshot().room!.snapshot!.revision > revision);
    expect(observer.getSnapshot().mode).toBe("disposed");
    expect(observer.getSnapshot().displayed.revision).toBe(revision);
  });

  it("blocks the next decision during animation and ignores late settlement after reset", async () => {
    const late: (() => number)[] = [];
    const presentation: PresentationPort = { sync: vi.fn(), stop: vi.fn(), present: vi.fn((_events, _signal, settle) => { late.push(settle); return new Promise<void>(() => {}); }) };
    const { first, second, left, right } = await start(presentation);
    const actor = left.getSnapshot().displayed.turnPlayerId;
    const active = actor === "p1" ? left : right;
    await active.dispatch({ kind: "roll", actor, expectedRevision: 0 });
    await until(() => left.getSnapshot().presenting && right.getSnapshot().presenting && late.length === 2);
    expect(availableCommands(active.getSnapshot())).toEqual([]);
    expect(active.getSnapshot().displayed.revision).toBe(0);
    active.skipPresentation();
    await until(() => !active.getSnapshot().presenting && active.getSnapshot().displayed.revision === 1);
    const observer = actor === "p1" ? right : left;
    const observerClient = actor === "p1" ? second : first;
    observerClient.reconnect();
    await until(() => observerClient.getSnapshot().status === "connected" && !observer.getSnapshot().presenting);
    late.forEach((settle) => expect(settle()).toBe(0));
    expect(observer.getSnapshot().displayed.revision).toBe(1);
    expect(observer.getSnapshot().settledRoll).toBeNull();
  });

  it("enters and leaves through the real application without writing the local save or reviving old rooms", async () => {
    vi.stubGlobal("document", { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("window", { location: { origin, hash: "", href: origin }, sessionStorage: storage, localStorage: { getItem: () => null } });
    const database = new IDBFactory();
    const store = new GameStore(() => database);
    const app = new GameApp(store);
    const unbind = app.subscribe(() => { const session = app.getSnapshot().session; if (session && !session.getSnapshot().attached) session.bind(port()); });
    try {
      await app.enterRoom(roomCredential("create", "Host", "", options));
      const host = app.getSnapshot().room!;
      await until(() => host.getSnapshot().status === "connected");
      const guest = await enter(roomCredential("join", "Guest", host.credential.code, null));
      await until(() => host.getSnapshot().room!.members.every((member) => member.connected) && host.getSnapshot().room!.members.length === 2);
      expect(host.start()).toBe(true);
      await until(() => app.getSnapshot().session?.kind === "online");
      const session = app.getSnapshot().session!;
      expect(session.getSnapshot().viewPlayerId).toBe("p1");
      expect(session.getSnapshot().save.kind).toBe("disabled");
      expect(await store.read()).toBeNull();
      await app.leave();
      expect(app.getSnapshot().session).toBeNull(); expect(app.getSnapshot().room).toBeNull();
      expect(session.getSnapshot().mode).toBe("disposed"); expect(host.getSnapshot().status).toBe("disposed");
      expect(guest.getSnapshot().room!.snapshot).not.toBeNull();
      expect(await store.read()).toBeNull();
      await app.enterRoom(host.credential);
      await until(() => app.getSnapshot().session?.kind === "online");
      expect(app.getSnapshot().session).not.toBe(session);
      expect(app.getSnapshot().session!.getSnapshot().displayed.revision).toBe(0);
    } finally { unbind(); app.dispose(); }
  });
});

it("validates remembered credentials without deleting corrupt or inaccessible data", () => {
  const credential = roomCredential("create", "Host", "", options);
  expect(readRoomCredential({ getItem: () => JSON.stringify(credential) })).toEqual({ kind: "valid", credential });
  expect(readRoomCredential({ getItem: () => JSON.stringify({ ...credential, token: "invalid" }) })).toEqual({ kind: "invalid" });
  expect(readRoomCredential({ getItem: () => "{" })).toEqual({ kind: "invalid" });
  expect(readRoomCredential({ getItem: () => { throw new Error(); } })).toEqual({ kind: "unavailable" });
});

it("creates valid unique local save identities without secure-context randomUUID", () => {
  const identifiers = Array.from({ length: 100 }, () => matchId());
  expect(new Set(identifiers).size).toBe(100);
  identifiers.forEach((identifier) => expect(identifier).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/));
});
