import { expect, it } from "vitest";
import { HARBOR } from "../../src/domain/maps/harbor";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { completeGroup, rentFor } from "../../src/domain/economy";
import { legalCommands } from "../../src/domain/selectors";
import { movement } from "../../src/domain/movement";
import { QUICK_RULES } from "../../src/domain/rules";
import { makeSave } from "../../src/storage/snapshot";

const matchId = "00000000-0000-4000-8000-000000000010";

it("has 24 contiguous positions and five scattered groups with the agreed prices", () => {
  expect(HARBOR.tiles).toHaveLength(24);
  expect(HARBOR.tiles.filter((tile) => tile.type === "property")).toHaveLength(15);
  expect(HARBOR.tiles.filter((tile) => tile.type === "chance")).toHaveLength(5);
  expect(HARBOR.tiles.filter((tile) => tile.type === "tax").map((tile) => tile.amount)).toEqual([80, 100, 120]);
  for (const group of ["cyan", "amber", "violet", "emerald", "rose"]) {
    const indices = HARBOR.tiles.flatMap((tile, index) => tile.type === "property" && tile.group === group ? [index] : []);
    expect(indices).toHaveLength(3);
    expect(new Set(indices.map((index) => Math.floor(index / 6))).size).toBeGreaterThan(1);
  }
  expect(movement(23, 24, "forward", 3, QUICK_RULES, false)).toMatchObject({ path: [0, 1, 2], startBonus: QUICK_RULES.passStartBonus });
  expect(movement(1, 24, "backward", 3, QUICK_RULES, false)).toMatchObject({ path: [0, 23, 22], startBonus: 0 });
  for (let index = 0; index < 24; index += 1) expect(movement(index, 24, "teleport", 1, QUICK_RULES, false)).toMatchObject({ path: [0], startBonus: QUICK_RULES.passStartBonus });
});

it.each([2, 3, 4])("%s-seat harbor games use the production policies, economics and restore path", (seats) => {
  const config = createMatchConfig(31, seats);
  const game = new Game({ ...config, mapId: HARBOR.id, mapVersion: HARBOR.version, players: config.players.map((player) => ({ ...player, controller: "bot", difficulty: "hard" })) });
  let count = 0;
  while (game.snapshot.decision.kind !== "game_over" && count++ < 1000) {
    const before = game.snapshot;
    const action = chooseBotAction(observeBot(before))!;
    const result = game.apply(action.command);
    expect(result.ok).toBe(true);
    expect(game.snapshot.map.tiles).toEqual(HARBOR.tiles);
    expect(game.snapshot.players.every((player) => player.position < HARBOR.tiles.length && player.cash >= 0)).toBe(true);
    if (before.completedRounds !== game.snapshot.completedRounds || result.ok && result.events.some((event) => event.kind === "ended")) {
      const { map: _map, rules: _rules, ...state } = game.snapshot;
      expect(Game.restore(state).snapshot).toEqual(game.snapshot);
    }
  }
  expect(game.snapshot.decision.kind).toBe("game_over");
});

it("a real dispersed group can grow evenly and sell buildings through the shared commands without consuming randomness", () => {
  let checkpoint: Game | null = null;
  for (let seed = 1; seed <= 50 && !checkpoint; seed += 1) {
    const config = createMatchConfig(seed);
    const game = new Game({ ...config, mapId: HARBOR.id, mapVersion: HARBOR.version });
    for (let count = 0; count < 150 && game.snapshot.decision.kind !== "game_over"; count += 1) {
      const state = game.snapshot;
      const actor = state.decision.kind === "game_over" ? state.turnPlayerId : state.decision.actorId;
      if (state.decision.kind === "awaiting_roll" && actor === "p1" && completeGroup(state, HARBOR.tiles[1] as Extract<typeof HARBOR.tiles[number], { type: "property" }>)) { checkpoint = game; break; }
      const kind = state.decision.kind === "awaiting_purchase" ? actor === "p1" && ["pier-walk", "fish-market", "coastal-street"].includes(state.decision.propertyId) ? "buy" : "skip"
        : state.decision.kind === "awaiting_discard" ? "discard_item" : state.decision.kind === "awaiting_debt" ? "bankrupt" : "roll";
      expect(game.apply(legalCommands(state, actor).find((command) => command.kind === kind)!).ok).toBe(true);
    }
  }
  expect(checkpoint).not.toBeNull();
  const game = checkpoint!;
  const random = game.snapshot.random;
  expect(rentFor(game.snapshot, "pier-walk")).toBe(22 * QUICK_RULES.groupRentPercent / 100);
  for (const propertyId of ["pier-walk", "fish-market", "coastal-street"]) expect(game.apply({ kind: "upgrade", actor: "p1", propertyId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  for (const propertyId of ["pier-walk", "fish-market", "coastal-street"]) expect(game.apply({ kind: "sell_building", actor: "p1", propertyId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.random).toEqual(random);
  expect(Game.restore(makeSave(game.snapshot, matchId).state).snapshot).toEqual(game.snapshot);
});
