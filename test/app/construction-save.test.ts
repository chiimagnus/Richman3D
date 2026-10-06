import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { assetManagementView } from "../../src/ui/viewModel";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";

it("persists one real construction, rejects repeated captured revisions and publishes no duplicate success notice or next turn", async () => {
  const game = propertyMatch();
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  const sync = vi.fn();
  session.bind({ sync, stop() {}, async present() {} });
  const command = assetManagementView(session.getSnapshot())!.properties["neon-avenue"]!.upgrade.command!;
  const before = game.snapshot;
  await session.dispatch(command);
  const after = game.snapshot;
  expect(after.revision).toBe(before.revision + 1);
  expect(after.properties["neon-avenue"]!.level).toBe(1);
  expect(after.players[0]!.cash).toBe(before.players[0]!.cash - 90);
  expect(after.turnPlayerId).toBe("p1");
  expect(after.random).toEqual(before.random);
  expect(session.getSnapshot()).toMatchObject({ notice: null, presenting: false, mode: "running", save: { kind: "saved" } });
  expect(sync).toHaveBeenLastCalledWith(after);
  expect((await store.read())?.snapshot).toEqual(after);
  const writes = vi.spyOn(store, "save");
  await session.dispatch(command);
  expect(game.snapshot).toBe(after);
  expect(writes).not.toHaveBeenCalled();
  session.dispose();
});

it("persists balanced building sales through the shared session without duplicate notices or stale operation rewrites", async () => {
  const game = propertyMatch();
  const initialCash = game.snapshot.players[0]!.cash;
  for (const id of ["neon-avenue", "harbor-walk"]) expect(game.apply({ kind: "upgrade", propertyId: id, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  session.bind({ sync() {}, stop() {}, async present() {} });
  for (const [id, kind] of [["neon-avenue", "sell_building"], ["harbor-walk", "sell_building"]] as const) {
    const before = game.snapshot;
    const command = assetManagementView(session.getSnapshot())!.properties[id]![kind].command!;
    await session.dispatch(command);
    const after = game.snapshot;
    expect(after.revision).toBe(before.revision + 1);
    expect(after.random).toEqual(before.random);
    expect((await store.read())?.snapshot).toEqual(after);
    expect(session.getSnapshot().notice).toBeNull();
    await session.dispatch(command);
    expect(game.snapshot).toBe(after);
  }
  expect(game.snapshot.players[0]).toMatchObject({ cash: initialCash - 80, statistics: { constructionRefunds: 80 } });
  session.dispose();
});
