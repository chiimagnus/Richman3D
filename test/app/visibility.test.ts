import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import type { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { makeSave } from "../../src/storage/snapshot";

vi.mock("../../src/ui/SceneHost", () => ({ SceneHost: () => null }));
afterEach(() => vi.unstubAllGlobals());

async function fixture(pendingBot = false) {
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: { lang: "" } });
  vi.stubGlobal("document", document);
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  if (pendingBot) {
    const game = new Game(createMatchConfig(6));
    game.apply(legalCommands(game.snapshot, "p1")[0]!);
    await store.save(makeSave(game.snapshot, crypto.randomUUID()), null);
  }
  const app = new GameApp(store);
  const bound = new Set<GameSession>();
  const present = vi.fn(async () => {});
  const stop = vi.fn();
  app.subscribe(() => {
    const session = app.getSnapshot().session;
    if (session?.kind === "local" && !bound.has(session)) { bound.add(session); session.bind({ sync() {}, stop, present }); }
  });
  await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe(pendingBot ? "valid" : "empty"));
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")); };
  return { app, store, present, stop, visibility };
}

it("continuation finishing after the page becomes hidden cannot activate a saved computer turn", async () => {
  const { app, store, present, visibility } = await fixture(true);
  try {
    const before = (await store.read())!;
    const continuing = app.continueSaved();
    visibility(true);
    await continuing;
    const session = app.getSnapshot().session!;
    if (session.kind !== "local") throw new Error("Expected local session");
    expect(session.getSnapshot().mode).toBe("paused");
    expect(session.getSnapshot().committed).toEqual(before.snapshot);
    expect((await store.read())!.record).toEqual(before.record);
    expect(present).not.toHaveBeenCalled();
    visibility(false);
    expect(session.getSnapshot().mode).toBe("paused");
    await session.resume();
    expect(session.getSnapshot().committed.turnPlayerId).toBe("p1");
    expect(session.getSnapshot().committed.revision).toBeGreaterThan(before.record.revision);
  } finally { app.dispose(); }
});

it("hidden during a committed save preserves payment, cancels presentation and resumes exactly one bot chain explicitly", async () => {
  const { app, store, present, stop, visibility } = await fixture();
  try {
    await app.start(createMatchConfig(6));
    const session = app.getSnapshot().session!;
    if (session.kind !== "local") throw new Error("Expected local session");
    const save = store.save.bind(store);
    let release = () => {};
    const writing = vi.spyOn(store, "save").mockImplementationOnce(async (record, expected) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return save(record, expected);
    });
    const work = session.dispatch(legalCommands(session.getSnapshot().committed, "p1")[0]!);
    await vi.waitFor(() => expect(writing).toHaveBeenCalledOnce());
    visibility(true);
    const committed = session.getSnapshot().committed;
    expect(committed.players[0]?.cash).toBe(1420);
    release();
    await work;
    expect(present).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect((await store.read())!.snapshot).toEqual(committed);
    await session.activate();
    expect(session.getSnapshot().committed).toBe(committed);
    visibility(false);
    expect(session.getSnapshot().mode).toBe("paused");
    const expected = Game.restore(session.exportRecord().state);
    for (let count = 0; count < 4; count += 1) {
      const command = (chooseBotAction(observeBot(expected.snapshot), "normal")?.command ?? null);
      if (!command) break;
      expected.apply(command);
    }
    await Promise.all([session.resume(), session.resume()]);
    expect(session.getSnapshot().committed).toEqual(expected.snapshot);
    expect((await store.read())!.snapshot).toEqual(expected.snapshot);
  } finally { app.dispose(); }
});
