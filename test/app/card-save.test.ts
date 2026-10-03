import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave, SaveError } from "../../src/storage/snapshot";
import { chanceDebtCheckpoint, chanceDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

const instant = { sync() {}, stop() {}, async present() {} };

it("saves an unpaid entity before interrupted presentation, restores it and retries a rescue save without paying or discarding twice", async () => {
  const state = makeSave(chanceDebtCheckpoint().snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  session.bind({ ...instant, present: async () => new Promise(() => {}) });
  session.confirmHandover("p1");
  const rolling = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  await vi.waitFor(() => {
    expect(game.snapshot.deck.pending).toBe("maintenance-cost:2");
    expect(session.getSnapshot().save.kind).toBe("saved");
  });
  session.pause();
  await rolling;
  const pending = (await store.read())!;
  expect(pending.snapshot).toEqual(game.snapshot);
  session.dispose();
  const restored = Game.restore(pending.record.state);
  const resumed = new GameSession(restored, propertyMatchId, { store, expected: pending.record, source: "local" });
  await resumed.initializeSave();
  resumed.bind(instant);
  expect(resumed.handoverActor).toBe("p1");
  expect(restored.snapshot).toEqual(pending.snapshot);
  resumed.confirmHandover("p1");
  const save = vi.spyOn(store, "save").mockRejectedValueOnce(new SaveError("unavailable"));
  try {
    const command = { kind: "mortgage" as const, actor: "p1" as const, propertyId: "river-market", expectedRevision: restored.snapshot.revision };
    await resumed.dispatch(command);
    const paid = restored.snapshot;
    expect(paid.revision).toBe(pending.record.revision + 1);
    expect(paid.deck.pending).toBeNull();
    expect(paid.deck.discardPile).toEqual(["maintenance-cost:2"]);
    expect(paid.players[0]).toMatchObject({ cash: 40, statistics: { chanceExpense: 90 } });
    expect(paid.random).toEqual(pending.snapshot.random);
    expect(resumed.getSnapshot().save.kind).toBe("unsaved");
    expect((await store.read())!.record).toEqual(pending.record);
    await resumed.retrySave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(restored.snapshot).toBe(paid);
    expect((await store.read())!.snapshot).toEqual(paid);
    expect((await store.read("backup"))!.snapshot).toEqual(pending.snapshot);
    await resumed.resume();
    await resumed.dispatch(command);
    expect(restored.snapshot).toBe(paid);
    expect(save).toHaveBeenCalledTimes(2);
  } finally { save.mockRestore(); resumed.dispose(); }
});

it("the real computer session settles and saves a pending cash card before handing over to a human, without redrawing", async () => {
  const state = makeSave(chanceDebtMatch().snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human" })) } });
  const before = game.snapshot;
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  try {
    await session.initializeSave();
    session.bind(instant);
    await session.activate();
    await vi.waitFor(() => {
      expect(game.snapshot.deck.pending).toBeNull();
      expect(session.getSnapshot().save.kind).toBe("saved");
      expect(session.getSnapshot().presenting).toBe(false);
    });
    expect(game.snapshot.revision).toBe(before.revision + 1);
    expect(game.snapshot.deck.discardPile).toEqual([before.deck.pending]);
    expect(game.snapshot.players[0]).toMatchObject({ cash: 40, statistics: { chanceExpense: 90 } });
    expect(game.snapshot.random).toEqual(before.random);
    expect(session.handoverActor).toBe("p2");
    expect((await store.read())!.snapshot).toEqual(game.snapshot);
  } finally { session.dispose(); }
});
