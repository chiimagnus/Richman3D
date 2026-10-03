import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave, SaveError } from "../../src/storage/snapshot";

const matchId = "00000000-0000-4000-8000-000000000001";

async function fixture() {
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const game = new Game(createMatchConfig(940));
  const session = new GameSession(game, matchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  const present = vi.fn(async () => {});
  session.bind({ sync() {}, stop() {}, present });
  return { store, factory, game, session, present };
}

it("waits for the actual save before presenting or allowing another input; rejected input never writes", async () => {
  const { store, game, session, present } = await fixture();
  const original = store.save.bind(store);
  let release = () => {};
  const writes = vi.spyOn(store, "save").mockImplementation(async (record, expected) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return original(record, expected);
  });
  const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
  await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce());
  expect(game.snapshot.revision).toBe(1);
  expect(session.getSnapshot().save.kind).toBe("saving");
  expect(present).not.toHaveBeenCalled();
  await session.dispatch({ kind: "buy", actor: "p1", expectedRevision: 1 });
  expect(game.snapshot.revision).toBe(1);
  session.pause();
  await session.resume();
  expect(session.getSnapshot().mode).toBe("paused");
  release();
  await work;
  expect((await store.read())?.record.state).toEqual(session.exportRecord().state);
  await session.resume();
  expect(session.getSnapshot().mode).toBe("running");
  await session.dispatch({ kind: "buy", actor: "p1", expectedRevision: 0 });
  expect(writes).toHaveBeenCalledOnce();
  writes.mockRestore();
});

it("storage refusal preserves accepted rules and retries latest unsaved progress against the last persisted revision", async () => {
  const { store, game, session } = await fixture();
  const initial = (await store.read())!.record;
  const writes = vi.spyOn(store, "save").mockRejectedValue(new SaveError("unavailable"));
  await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
  expect(game.snapshot.revision).toBe(1);
  expect(session.getSnapshot()).toMatchObject({ mode: "paused", save: { kind: "unsaved", acknowledged: false }, error: null });
  await session.continueUnsaved();
  for (let count = 0; count < 3; count += 1) await session.dispatch(legalCommands(game.snapshot, "p1").at(-1)!);
  expect(game.snapshot.revision).toBeGreaterThan(3);
  expect(session.getSnapshot()).toMatchObject({ mode: "running", save: { kind: "unsaved", acknowledged: true } });
  expect((await store.read())?.record).toEqual(initial);
  const beforeRetry = game.snapshot;
  writes.mockRestore();
  await session.retrySave();
  expect(session.getSnapshot().save.kind).toBe("saved");
  expect(game.snapshot).toBe(beforeRetry);
  expect((await store.read())?.record.state).toEqual(session.exportRecord().state);
  expect((await store.read("backup"))?.record).toEqual(initial);
});

it("a competing page forces conflict pause and cannot be acknowledged as ordinary unsaved play", async () => {
  const { factory, store, session, game, present } = await fixture();
  const initial = (await store.read())!.record;
  const competing = Game.restore(initial.state);
  competing.apply(legalCommands(competing.snapshot, "p1")[0]!);
  const latest = makeSave(competing.snapshot, matchId);
  await new GameStore(() => factory).save(latest, initial);
  await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
  expect(session.getSnapshot()).toMatchObject({ mode: "paused", save: { kind: "conflict" } });
  await session.continueUnsaved();
  await session.resume();
  expect(session.getSnapshot().mode).toBe("paused");
  expect(present).not.toHaveBeenCalled();
  expect((await store.read())?.record).toEqual(latest);
  expect(game.snapshot.revision).toBe(1);
});

it("disposed sessions may finish the pending transaction but cannot present or issue a late computer command", async () => {
  const { store, session, game, present } = await fixture();
  const original = store.save.bind(store);
  let release = () => {};
  const writes = vi.spyOn(store, "save").mockImplementation(async (record, expected) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return original(record, expected);
  });
  const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
  await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce());
  session.dispose();
  const disposed = session.getSnapshot();
  release();
  await work;
  expect(present).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toBe(disposed);
  expect(game.snapshot.revision).toBe(1);
  writes.mockRestore();
});
