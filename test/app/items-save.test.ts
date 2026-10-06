import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { SaveError } from "../../src/storage/snapshot";
import { cardType } from "../../src/domain/cards";
import { legalCommands } from "../../src/domain/selectors";
import { fullHandCheckpoint, itemCheckpoint } from "../fixtures/items";
import { propertyMatchId } from "../fixtures/property-match";

const instant = { sync() {}, stop() {}, async present() {} };

it("saves confirmed controlled dice once, retries only storage, restores the active item and rolls the selected result", async () => {
  const game = itemCheckpoint("controlled-dice");
  const factory = new IDBFactory();
  const persistence = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store: persistence, expected: null, source: "local" });
  await session.initializeSave();
  session.bind(instant);
  const command = legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item" && cardType(command.instanceId) === "controlled-dice" && command.total === 12)!;
  const save = vi.spyOn(persistence, "save").mockRejectedValueOnce(new SaveError("unavailable"));
  try {
    await session.dispatch(command);
    const confirmed = game.snapshot;
    expect(confirmed.activeItem).toMatchObject({ total: 12 });
    expect(session.getSnapshot().save.kind).toBe("unsaved");
    await session.retrySave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(game.snapshot).toBe(confirmed);
    const saved = (await persistence.read())!;
    expect(saved.snapshot).toEqual(confirmed);
    session.dispose();
    const raw = saved.record.state;
    const restored = Game.restore({ ...raw, config: { ...raw.config, players: raw.config.players.map((player) => ({ ...player, controller: "human" })) } });
    const resumed = new GameSession(restored, propertyMatchId);
    resumed.bind(instant);
    expect(resumed.confirmHandover("p1")).toBe(true);
    const before = restored.snapshot;
    await resumed.dispatch({ kind: "roll", actor: "p1", expectedRevision: before.revision });
    expect(restored.snapshot.lastRoll).toEqual([6, 6]);
    expect(restored.snapshot.random).toEqual(before.random);
    expect(restored.snapshot.activeItem).toBeNull();
    expect(restored.snapshot.revision).toBe(before.revision + 1);
    resumed.dispose();
  } finally { save.mockRestore(); session.dispose(); }
});

it("restores a full hand behind local handover and persists the real fourth-card discard without consuming a second turn", async () => {
  const game = fullHandCheckpoint();
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const state = game.snapshot;
  const { rules: _rules, map: _map, ...raw } = state;
  const local = Game.restore({ ...raw, config: { ...raw.config, players: raw.config.players.map((player) => ({ ...player, controller: "human" })) } });
  const session = new GameSession(local, propertyMatchId, { store, expected: null, source: "local" });
  await session.initializeSave();
  session.bind(instant);
  expect(session.handoverActor).toBe("p1");
  const command = legalCommands(local.snapshot, "p1").at(-1)!;
  await session.dispatch(command);
  expect(local.snapshot.revision).toBe(state.revision);
  expect(session.confirmHandover("p1")).toBe(true);
  await session.dispatch(command);
  const after = local.snapshot;
  expect(after.revision).toBe(state.revision + 1);
  expect(after.players[0]!.hand).toEqual(state.players[0]!.hand.slice(0, 3));
  expect(session.handoverActor).toBe("p2");
  expect(session.getSnapshot().viewPlayerId).toBeNull();
  expect((await store.read())!.snapshot).toEqual(after);
  expect((await store.read("backup"))!.snapshot).toEqual({ ...state, config: local.snapshot.config });
  await session.dispatch(command);
  expect(local.snapshot).toBe(after);
  session.dispose();
});
