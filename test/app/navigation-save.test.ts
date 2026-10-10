import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import type { GameSession } from "../../src/app/GameSession";
import { makeSave, readSave, SaveError } from "../../src/storage/snapshot";
import { Game } from "../../src/domain/game";

vi.mock("../../src/ui/SceneHost", () => ({ SceneHost: () => null }));
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const app = new GameApp(store);
  const bound = new Set<GameSession>();
  const present = vi.fn(async () => {});
  app.subscribe(() => {
    const session = app.getSnapshot().session;
    if (session?.kind === "local" && !bound.has(session)) { bound.add(session); session.bind({ sync() {}, stop() {}, present }); }
  });
  await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("empty"));
  return { app, store, present };
}

it("a late leave waiting for a rule save cannot cancel the later new-match intent or overwrite its current key", async () => {
  const { app, store, present } = await fixture();
  try {
    await app.start(createMatchConfig(940));
    const old = app.getSnapshot().session!;
    const original = store.save.bind(store);
    let release = () => {};
    const writes = vi.spyOn(store, "save").mockImplementationOnce(async (record, expected) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original(record, expected);
    });
    const rolling = old.dispatch(legalCommands(old.getSnapshot().committed, "p1")[0]!);
    await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce());
    const leaving = app.leave();
    const starting = app.start(createMatchConfig(768));
    release();
    await Promise.all([rolling, leaving, starting]);
    const current = app.getSnapshot().session!;
    if (current.kind !== "local") throw new Error("Expected local session");
    expect(current.matchId).not.toBe(old.matchId);
    expect(current.getSnapshot().committed.config.seed).toBe(768);
    expect(old.getSnapshot().mode).toBe("disposed");
    expect((await store.read())?.record.matchId).toBe(current.matchId);
    expect((await store.read())?.record.revision).toBe(0);
    expect((await store.read("backup"))?.record).toMatchObject({ matchId: old.matchId, revision: 1 });
    expect(present).not.toHaveBeenCalled();
    writes.mockRestore();
  } finally { app.dispose(); }
});

it("canceling a pending menu continuation cannot create a late restored session", async () => {
  const { app, store } = await fixture();
  try {
    await app.start(createMatchConfig(940));
    await app.leave();
    const original = store.read.bind(store);
    let release = () => {};
    vi.spyOn(store, "read").mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original();
    });
    const continuing = app.continueSaved();
    expect(app.getSnapshot().loading).toBe(true);
    await app.leave();
    release();
    await continuing;
    expect(app.getSnapshot().session).toBeNull();
    expect(app.getSnapshot().loading).toBe(false);
    expect((await store.read())?.record.revision).toBe(0);
  } finally { app.dispose(); }
});

it("confirmed import replaces persistence before disposing the old session and waits for explicit continuation", async () => {
  const { app, store, present } = await fixture();
  try {
    await app.start(createMatchConfig(940));
    const old = app.getSnapshot().session!;
    old.pause();
    const current = await store.readRaw();
    const incoming = readSave(makeSave(new Game(createMatchConfig(768)).snapshot, crypto.randomUUID(), "local", 1000));
    const replace = store.replace.bind(store);
    const writing = vi.spyOn(store, "replace").mockImplementationOnce(async (record, expected) => {
      expect(old.getSnapshot().mode).toBe("paused");
      expect(app.getSnapshot().session).toBe(old);
      return replace(record, expected);
    });
    await app.replaceSaved(incoming, current, "imported");
    expect(writing).toHaveBeenCalledOnce();
    expect(old.getSnapshot().mode).toBe("disposed");
    expect(app.getSnapshot().session).toBeNull();
    const saved = (await store.read())!;
    expect(saved.record).toMatchObject({ source: "imported", savedAt: 1000, state: incoming.record.state });
    expect(saved.record.matchId).not.toBe(incoming.record.matchId);
    expect((await store.read("backup"))?.record).toEqual(current);
    expect(present).not.toHaveBeenCalled();
    await app.continueSaved();
    expect(app.getSnapshot().session?.getSnapshot().committed).toEqual(incoming.snapshot);
  } finally { app.dispose(); }
});

it.each(["unavailable", "conflict"] as const)("failed %s replacement preserves the live session and both stored snapshots", async (kind) => {
  const { app, store } = await fixture();
  try {
    await app.start(createMatchConfig(940));
    const old = app.getSnapshot().session!;
    const current = await store.readRaw();
    const backup = await store.readRaw("backup");
    const incoming = readSave(makeSave(new Game(createMatchConfig(768)).snapshot, crypto.randomUUID()));
    vi.spyOn(store, "replace").mockRejectedValueOnce(new SaveError(kind));
    await expect(app.replaceSaved(incoming, current, "imported")).rejects.toMatchObject({ kind });
    expect(app.getSnapshot().session).toBe(old);
    expect(old.getSnapshot().mode).toBe("paused");
    if (old.kind !== "local") throw new Error("Expected local session");
    expect(old.getSnapshot().committed.config.seed).toBe(940);
    expect(app.getSnapshot().loading).toBe(false);
    expect(await store.readRaw()).toEqual(current);
    expect(await store.readRaw("backup")).toEqual(backup);
  } finally { app.dispose(); }
});
