import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command, PlayerId } from "../../src/domain/types";
import { projectGame, PROTOCOL_VERSION, type ServerMessage } from "../../src/network/protocol";
import { itemCheckpoint } from "../fixtures/items";
import { QUICK_RULES } from "../../src/domain/rules";
import { CITY } from "../../src/domain/maps/city";

type StateMessage = Extract<ServerMessage, { kind: "state" }>;
type Socket = NonNullable<Awaited<ReturnType<Miniflare["dispatchFetch"]>>["webSocket"]>;
const origin = "http://game.test";
const code = "ABCDEFGH";
const firstToken = "a".repeat(64);
const secondToken = "b".repeat(64);
const options = { seats: 2, mapId: CITY.id, rulesVersion: QUICK_RULES.version };

function inbox(socket: Socket) {
  const messages: ServerMessage[] = [];
  let wake = () => {};
  socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data)) as ServerMessage); wake(); });
  socket.accept();
  return async function take(predicate: (message: ServerMessage) => boolean = () => true): Promise<ServerMessage> {
    for (;;) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0]!;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("No server message")), 3000);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    }
  };
}

describe("authoritative rooms in real workerd", () => {
  let runtime: Miniflare;
  let directory: string;
  let script: string;
  const sockets: Socket[] = [];

  const spawn = () => new Miniflare({ resourcePersistencePath: directory, telemetry: { enabled: false }, workers: [{ config: {
    name: "game", compatibilityDate: "2026-05-08",
    manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: script } } },
    env: { ROOMS: { type: "durable-object", worker: "game", exportName: "Room" }, ROOM_LIMIT: { type: "rate-limit", namespace: "874621009", simple: { limit: 60, period: 60 } } },
    exports: { Room: { type: "durable-object", storage: "sqlite" } },
  } }] });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "richman-network-"));
    const result = await build({ entryPoints: ["src/server/worker.ts"], bundle: true, format: "esm", platform: "neutral", external: ["cloudflare:workers"], write: false });
    script = result.outputFiles[0]!.text;
    runtime = spawn();
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) { try { socket.close(); } catch {} }
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  async function post(action: string, body: unknown, requestOrigin = origin) {
    return runtime.dispatchFetch(`${origin}/api/rooms/${code}/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin }, body: JSON.stringify(body) });
  }
  async function connect(token: string) {
    const response = await runtime.dispatchFetch(`${origin}/api/rooms/${code}/socket`, { headers: { Upgrade: "websocket", Origin: origin, "Sec-WebSocket-Protocol": `richman-v${PROTOCOL_VERSION}, seat.${token}` } });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    sockets.push(socket);
    const take = inbox(socket);
    const state = await take((message) => message.kind === "state") as StateMessage;
    return { socket, take, state };
  }
  async function room() {
    expect((await post("create", { token: firstToken, name: "房主", options })).status).toBe(200);
    expect((await post("join", { token: secondToken, name: "Guest" })).status).toBe(200);
    const first = await connect(firstToken);
    const second = await connect(secondToken);
    first.socket.send(JSON.stringify({ kind: "start" }));
    const started = (message: ServerMessage) => message.kind === "state" && message.room.snapshot !== null;
    first.state = await first.take(started) as StateMessage;
    second.state = await second.take(started) as StateMessage;
    return { first, second };
  }

  it("validates HTTP, origin, room configuration and idempotent membership", async () => {
    expect((await post("create", { token: firstToken, name: "Host", options }, "https://evil.test")).status).toBe(403);
    expect((await post("create", { token: firstToken, name: "Host", options: { ...options, seats: 5 } })).status).toBe(400);
    expect((await post("create", { token: firstToken, name: "Host", options })).status).toBe(200);
    expect((await post("create", { token: firstToken, name: "Host", options })).status).toBe(200);
    expect((await post("join", { token: secondToken, name: "Guest" })).status).toBe(200);
    expect((await post("join", { token: secondToken, name: "Guest" })).status).toBe(200);
    expect((await post("join", { token: "c".repeat(64), name: "Third" })).status).toBe(409);
    const client = await connect(secondToken);
    expect(client.state.room.members.map((member) => member.id)).toEqual(["p1", "p2"]);
    expect(JSON.stringify(client.state)).not.toContain(firstToken);
    client.socket.send(JSON.stringify({ kind: "start" }));
    expect(await client.take((message) => message.kind === "error")).toMatchObject({ error: "forbidden" });
    const forbidden = await runtime.dispatchFetch(`${origin}/api/rooms/${code}/socket`, { headers: { Upgrade: "websocket", Origin: origin, "Sec-WebSocket-Protocol": `richman-v1, seat.${"c".repeat(64)}` } });
    expect(forbidden.status).toBe(403);
  });

  it("rejects oversized HTTP bodies before membership changes and keeps the room usable", async () => {
    expect((await post("create", { token: firstToken, name: "Host", options, padding: "x".repeat(10000) })).status).toBe(400);
    expect((await post("create", { token: firstToken, name: "Host", options })).status).toBe(200);
    expect((await post("join", { token: secondToken, name: "é".repeat(1600) })).status).toBe(400);
    const host = await connect(firstToken);
    expect(host.state.room.members).toHaveLength(1);
    expect((await post("join", { token: secondToken, name: "Guest" })).status).toBe(200);
    const guest = await connect(secondToken);
    expect(guest.state.room.members).toHaveLength(2);
  });

  it("synchronizes real cash/ownership/trades and rejects impersonation and duplicate economic commands", async () => {
    const { first, second } = await room();
    const clients = { p1: first, p2: second };
    let state = first.state.room.snapshot!;
    expect(second.state.room.snapshot!.properties).toEqual(state.properties);
    expect(state).not.toHaveProperty("random"); expect(state).not.toHaveProperty("deck"); expect(state.config).not.toHaveProperty("seed");
    expect(first.state.room.snapshot!.players[1]!.hand).toBeNull();
    expect(second.state.room.snapshot!.players[0]!.hand).toBeNull();
    const actor = state.turnPlayerId as "p1" | "p2";
    const other = actor === "p1" ? "p2" : "p1";
    clients[other].socket.send(JSON.stringify({ kind: "command", command: { kind: "roll", actor, expectedRevision: state.revision } }));
    expect(await clients[other].take((message) => message.kind === "error")).toMatchObject({ error: "forbidden" });
    const beforeCash = state.players.map((player) => player.cash);
    const proposal: Command = { kind: "trade_propose", actor, expectedRevision: state.revision, terms: { recipientId: other, givePropertyIds: [], receivePropertyIds: [], cash: { payerId: actor, amount: 50 } } };
    clients[actor].socket.send(JSON.stringify({ kind: "command", command: proposal }));
    const revision = state.revision + 1;
    const updated = (message: ServerMessage) => message.kind === "state" && message.room.snapshot?.revision === revision;
    await first.take(updated); await second.take(updated);
    const accept: Command = { kind: "trade_accept", actor: other, expectedRevision: revision, proposalRevision: revision };
    clients[other].socket.send(JSON.stringify({ kind: "command", command: accept }));
    const traded = (message: ServerMessage) => message.kind === "state" && message.room.snapshot?.revision === revision + 1;
    const firstTrade = await first.take(traded) as StateMessage;
    const secondTrade = await second.take(traded) as StateMessage;
    state = firstTrade.room.snapshot!;
    expect(state.players.map((player) => player.cash)).toEqual(secondTrade.room.snapshot!.players.map((player) => player.cash));
    for (const [index, player] of state.players.entries()) expect(player.cash).toBe(beforeCash[index]! + (player.id === actor ? -50 : 50));
    clients[other].socket.send(JSON.stringify({ kind: "command", command: accept }));
    expect(await clients[other].take((message) => message.kind === "error")).toMatchObject({ error: "stale_revision" });
    const unchanged = await clients[other].take((message) => message.kind === "state" && message.reset) as StateMessage;
    expect(unchanged.room.snapshot!.players.map((player) => player.cash)).toEqual(state.players.map((player) => player.cash));
    for (let attempts = 0; attempts < 20; attempts += 1) {
      if (state.decision.kind === "game_over") throw new Error("Match ended");
      const current = state.decision.actorId as "p1" | "p2";
      const command: Command = { kind: state.decision.kind === "awaiting_purchase" ? "buy" : "roll", actor: current, expectedRevision: state.revision };
      clients[current].socket.send(JSON.stringify({ kind: "command", command }));
      const changed = (message: ServerMessage) => message.kind === "state" && message.room.snapshot?.revision === state.revision + 1;
      const left = await first.take(changed) as StateMessage;
      const right = await second.take(changed) as StateMessage;
      state = left.room.snapshot!;
      expect(state.properties).toEqual(right.room.snapshot!.properties);
      expect(state.players.map(({ cash, position }) => ({ cash, position }))).toEqual(right.room.snapshot!.players.map(({ cash, position }) => ({ cash, position })));
      if (command.kind === "buy") {
        expect(Object.values(state.properties).some((property) => property.ownerId === current)).toBe(true);
        return;
      }
    }
    throw new Error("No purchase reached");
  });

  it("restores the same seat and persisted game after runtime destruction", async () => {
    const { first } = await room();
    const snapshot = first.state.room.snapshot!;
    for (const socket of sockets.splice(0)) socket.close();
    await runtime.dispose();
    runtime = spawn();
    const restored = await connect(firstToken);
    expect(restored.state.room.playerId).toBe("p1");
    expect(restored.state.room.snapshot).toEqual(snapshot);
    expect(restored.state.reset).toBe(true);
  });

  it("replaces only the reconnecting socket without resetting the other client's animation", async () => {
    const { first, second } = await room();
    const closed = new Promise<number>((resolve) => first.socket.addEventListener("close", (event) => resolve(event.code)));
    const replacement = await connect(firstToken);
    expect(await closed).toBe(1008);
    expect(replacement.state.room.playerId).toBe("p1");
    const presence = await second.take((message) => message.kind === "state" && message.room.snapshot !== null && !message.reset) as StateMessage;
    expect(presence.events).toEqual([]);
    expect(presence.room.snapshot!.revision).toBe(first.state.room.snapshot!.revision);
  });

  it("serializes simultaneous duplicate commands to exactly one rule commit", async () => {
    const { first, second } = await room();
    const state = first.state.room.snapshot!;
    const current = state.turnPlayerId === "p1" ? first : second;
    const command = { kind: "command", command: { kind: "roll", actor: state.turnPlayerId, expectedRevision: state.revision } };
    current.socket.send(JSON.stringify(command)); current.socket.send(JSON.stringify(command));
    const committed = await current.take((message) => message.kind === "state" && !message.reset && message.room.snapshot?.revision === 1) as StateMessage;
    expect(await current.take((message) => message.kind === "error")).toMatchObject({ error: "stale_revision" });
    const restored = await current.take((message) => message.kind === "state" && message.reset) as StateMessage;
    expect(restored.room.snapshot).toEqual(committed.room.snapshot);
  });
});

it("projects only the current seat's real private hand, never the deck or random seed", () => {
  const snapshot = itemCheckpoint("controlled-dice").snapshot;
  for (const id of ["p1", "p2"] as PlayerId[]) {
    const view = projectGame(snapshot, id);
    expect(view.players.find((player) => player.id === id)!.hand).toEqual(snapshot.players.find((player) => player.id === id)!.hand);
    expect(view.players.find((player) => player.id !== id)!.hand).toBeNull();
    expect(view.config).not.toHaveProperty("seed"); expect(view).not.toHaveProperty("random"); expect(view).not.toHaveProperty("deck");
  }
});
