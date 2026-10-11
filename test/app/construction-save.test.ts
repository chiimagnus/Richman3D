import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { makeSave } from "../../src/storage/snapshot";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { assetManagementView, availableCommands } from "../../src/ui/viewModel";
import { buildProperties, propertyMatch, propertyMatchId, visitOwnedProperty } from "../fixtures/property-match";

it("persists one visit's construction and next turn without repeated charges or duplicate notices", async () => {
  const state = makeSave(visitOwnedProperty(propertyMatch(), "neon-avenue").snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  const sync = vi.fn();
  session.bind({ sync, stop() {}, async present() {} });
  expect(session.confirmHandover("p1")).toBe(true);
  const command = availableCommands(session.getSnapshot()).find((candidate) => candidate.kind === "upgrade")!;
  const before = game.snapshot;
  session.skipPresentation(); session.pause(); await session.resume();
  expect(game.snapshot).toBe(before);
  expect((await store.read())?.snapshot).toEqual(before);
  await session.dispatch(command);
  const after = game.snapshot;
  expect(after.revision).toBe(before.revision + 1);
  expect(after.properties["neon-avenue"]!.level).toBe(1);
  expect(after.players[0]!.cash).toBe(before.players[0]!.cash - 90);
  expect(after.turnPlayerId).toBe("p2");
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
  const game = buildProperties(propertyMatch(), ["neon-avenue", "harbor-walk"]);
  const initialCash = game.snapshot.players[0]!.cash;
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
  expect(game.snapshot.players[0]).toMatchObject({ cash: initialCash + 80, statistics: { constructionRefunds: 80 } });
  session.dispose();
});
