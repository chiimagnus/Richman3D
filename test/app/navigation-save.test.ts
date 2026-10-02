import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import type { GameSession } from "../../src/app/GameSession";

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
    if (session && !bound.has(session)) { bound.add(session); session.bind({ sync() {}, stop() {}, present }); }
  });
  await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("empty"));
  return { app, store, present };
}

it("a late leave waiting for a rule save cannot cancel the later new-match intent or overwrite its current key", async () => {
  const { app, store, present } = await fixture();
  try {
    await app.start(createMatchConfig(341));
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
    const starting = app.start(createMatchConfig(101));
    release();
    await Promise.all([rolling, leaving, starting]);
    const current = app.getSnapshot().session!;
    expect(current.matchId).not.toBe(old.matchId);
    expect(current.getSnapshot().committed.config.seed).toBe(101);
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
    await app.start(createMatchConfig(341));
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
