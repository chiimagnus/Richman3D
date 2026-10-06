import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { SaveError } from "../../src/storage/snapshot";
import { movementCheckpoint } from "../fixtures/card-movement";
import { propertyMatchId } from "../fixtures/property-match";

const instant = { sync() {}, stop() {}, async present() {} };

it("persists the entire dice/card/tax chain before animation, restores debt and retries only storage after bankruptcy", async () => {
  const game = movementCheckpoint(53, "p1", 30);
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  session.bind({ ...instant, present: () => new Promise(() => {}) });
  const moving = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  await vi.waitFor(() => {
    expect(game.snapshot.decision.kind).toBe("awaiting_debt");
    expect(session.getSnapshot().save.kind).toBe("saved");
  });
  session.pause();
  await moving;
  const saved = (await store.read())!;
  expect(saved.snapshot).toEqual(game.snapshot);
  session.dispose();
  const restored = Game.restore(saved.record.state);
  const resumed = new GameSession(restored, propertyMatchId, { store, expected: saved.record, source: "local" });
  await resumed.initializeSave();
  resumed.bind(instant);
  const save = vi.spyOn(store, "save").mockRejectedValueOnce(new SaveError("unavailable"));
  try {
    await resumed.dispatch({ kind: "bankrupt", actor: "p1", expectedRevision: restored.snapshot.revision });
    const paid = restored.snapshot;
    expect(paid.players[0]!.cash).toBe(0);
    expect(paid.deck).toEqual(saved.snapshot.deck);
    expect(resumed.getSnapshot().save.kind).toBe("unsaved");
    await resumed.retrySave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(restored.snapshot).toBe(paid);
    expect((await store.read())!.snapshot).toEqual(paid);
    expect((await store.read("backup"))!.snapshot).toEqual(saved.snapshot);
    expect(paid.random).toEqual(saved.snapshot.random);
  } finally { save.mockRestore(); resumed.dispose(); }
});
