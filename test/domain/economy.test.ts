import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { CITY } from "../../src/domain/maps/city";
import { QUICK_RULES } from "../../src/domain/rules";
import { constructionCost, liquidationValue, mortgageValue, netAssets, propertyTile, propertyValue, rentAmount, rentFor } from "../../src/domain/economy";
import { legalCommands, playerAssets, publicProperty } from "../../src/domain/selectors";
import { makeSave, readSave } from "../../src/storage/snapshot";
import type { GameSnapshot, PropertyState } from "../../src/domain/types";

const matchId = "00000000-0000-4000-8000-000000000005";

function completeCityGroup(): Game {
  const game = new Game(createMatchConfig(940));
  for (const kind of ["roll", "buy"] as const) expect(game.apply(legalCommands(game.snapshot, "p1").find((command) => command.kind === kind)!).ok).toBe(true);
  const state = makeSave(game.snapshot, matchId).state;
  return Game.restore({ ...state,
    properties: { ...state.properties, "harbor-walk": { ...state.properties["harbor-walk"]!, ownerId: "p1" } },
    players: state.players.map((player) => player.id === "p1" ? { ...player, cash: player.cash - 140, statistics: { ...player.statistics, purchases: player.statistics.purchases + 140, purchaseBookValue: player.statistics.purchaseBookValue + 140 } } : player),
  });
}

function withLevels(snapshot: GameSnapshot, level: PropertyState["level"]): GameSnapshot {
  return { ...snapshot, properties: Object.fromEntries(Object.entries(snapshot.properties).map(([id, state]) => {
    const tile = propertyTile(snapshot.map, id);
    return [id, tile.group === "cyan" ? { ...state, level, constructionCosts: Array<number>(level).fill(constructionCost(tile, snapshot.rules)) } : state];
  })) };
}

it.each([0, 1, 2, 3] as const)("computes level %s rents with one complete/unmortgaged group factor", (level) => {
  const full = withLevels(completeCityGroup().snapshot, level);
  expect(rentFor(full, "neon-avenue")).toBe([48, 96, 192, 336][level]);
  const partial = { ...full, properties: { ...full.properties, "harbor-walk": { ...full.properties["harbor-walk"]!, ownerId: null } } };
  expect(rentFor(partial, "neon-avenue")).toBe([32, 64, 128, 224][level]);
  const mortgaged = { ...full, properties: { ...full.properties, "harbor-walk": { ...full.properties["harbor-walk"]!, mortgagePrincipal: 70 } } };
  expect(rentFor(mortgaged, "neon-avenue")).toBe([32, 64, 128, 224][level]);
  expect(rentFor(mortgaged, "harbor-walk")).toBe(0);
});

it("rounds rent only once, construction upward and each actual-cost sale downward, without floating-point overflow", () => {
  const tile = { ...propertyTile(CITY, "neon-avenue"), price: 141, rent: 1 };
  expect(rentAmount(tile, { level: 1, mortgagePrincipal: 0 }, QUICK_RULES, true)).toBe(3);
  expect(constructionCost(tile, QUICK_RULES)).toBe(71);
  expect(mortgageValue(tile, QUICK_RULES)).toBe(70);
  const maximum = { ...tile, price: Number.MAX_SAFE_INTEGER };
  expect(constructionCost(maximum, QUICK_RULES)).toBe(4503599627370496);
  expect(mortgageValue(maximum, QUICK_RULES)).toBe(4503599627370495);
  const snapshot = withLevels(completeCityGroup().snapshot, 2);
  const discounted = { ...snapshot, properties: { ...snapshot.properties, "neon-avenue": { ...snapshot.properties["neon-avenue"]!, constructionCosts: [71, 71] } } };
  expect(propertyValue(discounted, "p1")).toBe(320 + 140 + 142);
  expect(liquidationValue(discounted, "p1")).toBe(160 + 70 + 70);
});

it("distinguishes liquidation from book assets, and adding mortgage cash cannot inflate net assets", () => {
  const before = completeCityGroup().snapshot;
  expect(propertyValue(before, "p1")).toBe(320);
  expect(liquidationValue(before, "p1")).toBe(160);
  const borrowed = { ...before,
    properties: { ...before.properties, "neon-avenue": { ...before.properties["neon-avenue"]!, mortgagePrincipal: 90 } },
    players: before.players.map((player) => player.id === "p1" ? { ...player, cash: player.cash + 90 } : player),
  };
  expect(propertyValue(borrowed, "p1")).toBe(230);
  expect(liquidationValue(borrowed, "p1")).toBe(70);
  expect(netAssets(borrowed, "p1")).toBe(netAssets(before, "p1"));
});

it("charges a real opponent the projected group rent, preserves the transfer and restores historical rent after losing the group", () => {
  const game = completeCityGroup();
  const before = game.snapshot;
  expect(publicProperty(before, "neon-avenue").rent).toBe(48);
  const result = game.apply(legalCommands(before, "p2")[0]!);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.events[0]).toMatchObject({ result: { landing: { kind: "rent", amount: 48 } } });
  expect(game.snapshot.players.map((player) => player.cash)).toEqual([1228, 1452]);
  expect(playerAssets(game.snapshot, "p1")).toMatchObject({ cash: 1228, propertyValue: 320, netAssets: 1548, liquidationValue: 160 });
  const record = makeSave(game.snapshot, matchId);
  expect(Game.restore(readSave(record).record.state).snapshot).toEqual(game.snapshot);
  const lost = { ...record.state,
    properties: { ...record.state.properties, "harbor-walk": { ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] } },
    players: record.state.players.map((player) => player.id === "p1" ? { ...player, statistics: { ...player.statistics, purchases: 180, purchaseBookValue: 180, taxesPaid: 140 } } : player),
  };
  const restored = Game.restore(lost);
  expect(rentFor(restored.snapshot, "neon-avenue")).toBe(32);
  expect([...restored.snapshot.history].reverse().find((entry) => entry.event.kind === "rolled")?.event).toMatchObject({ result: { landing: { amount: 48 } } });
});

it("rolls back state, money and candidate RNG when real group rent overflows", () => {
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "property" && tile.id !== "neon-avenue" ? { type: "tax" as const, id: tile.id, amount: 0 } : tile.type === "property" ? { ...tile, rent: Number.MAX_SAFE_INTEGER } : tile) };
  const game = new Game(createMatchConfig(940), QUICK_RULES, map);
  for (const kind of ["roll", "buy"] as const) expect(game.apply(legalCommands(game.snapshot, "p1").find((command) => command.kind === kind)!).ok).toBe(true);
  const before = game.snapshot;
  expect(game.apply(legalCommands(before, "p2")[0]!)).toEqual({ ok: false, reason: "calculation_failed" });
  expect(game.snapshot).toBe(before);
});

it("cannot retain half a rent transfer if crediting the owner exceeds safe cash", () => {
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "property" && tile.id !== "neon-avenue" ? { type: "tax" as const, id: tile.id, amount: 0 } : tile.type === "property" ? { ...tile, rent: 500 } : tile) };
  const game = new Game(createMatchConfig(940), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER }, map);
  for (const kind of ["roll", "buy"] as const) expect(game.apply(legalCommands(game.snapshot, "p1").find((command) => command.kind === kind)!).ok).toBe(true);
  const before = game.snapshot;
  expect(game.apply(legalCommands(before, "p2")[0]!)).toEqual({ ok: false, reason: "calculation_failed" });
  expect(game.snapshot).toBe(before);
});

it("rejects a cash-safe Start reward when the resulting net assets exceed the snapshot boundary", () => {
  const game = new Game(createMatchConfig(17981));
  for (const kind of ["roll", "buy", "roll"] as const) expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((command) => command.kind === kind)!).ok).toBe(true);
  const record = makeSave(game.snapshot, matchId);
  const restored = Game.restore({ ...record.state, players: record.state.players.map((player) => player.id === "p1" ? {
    ...player, cash: Number.MAX_SAFE_INTEGER - 300,
    statistics: { ...player.statistics, chanceIncome: Number.MAX_SAFE_INTEGER - 1500 },
  } : player) });
  const before = restored.snapshot;
  expect(netAssets(before, "p1")).toBe(Number.MAX_SAFE_INTEGER);
  expect(readSave(makeSave(before, matchId)).snapshot).toEqual(before);
  expect(restored.apply(legalCommands(before, "p1")[0]!)).toEqual({ ok: false, reason: "calculation_failed" });
  expect(restored.snapshot).toBe(before);
  expect(readSave(makeSave(restored.snapshot, matchId)).snapshot).toEqual(before);
});

it.each([
  (state: any) => { state.properties.unknown = state.properties["harbor-walk"]; },
  (state: any) => { state.properties["city-tax"] = state.properties["harbor-walk"]; },
  (state: any) => { delete state.properties["harbor-walk"]; },
  (state: any) => { state.properties["harbor-walk"].ownerId = "p4"; },
  (state: any) => { state.properties["harbor-walk"].ownerId = null; state.properties["harbor-walk"].mortgagePrincipal = 70; },
  (state: any) => { state.properties["harbor-walk"].level = 4; },
  (state: any) => { state.properties["harbor-walk"].level = 1; },
  (state: any) => { state.properties["harbor-walk"].constructionCosts = [70]; },
  (state: any) => { state.properties["harbor-walk"].mortgagePrincipal = 69; },
  (state: any) => { state.properties["harbor-walk"].level = 1; state.properties["harbor-walk"].constructionCosts = [-1]; },
  (state: any) => { state.properties["harbor-walk"].level = 1; state.properties["harbor-walk"].constructionCosts = [71]; },
  (state: any) => { state.properties["harbor-walk"].level = 1; state.properties["harbor-walk"].constructionCosts = [70]; state.properties["neon-avenue"].mortgagePrincipal = 90; },
  (state: any) => { state.properties["harbor-walk"].level = 3; state.properties["harbor-walk"].constructionCosts = [70, 70, 70]; },
  (state: any) => { state.owners = {}; },
])("rejects malformed property state %# without accepting partial ownership or a legacy alias", (mutate) => {
  const game = completeCityGroup();
  const before = game.snapshot;
  const state = JSON.parse(JSON.stringify(makeSave(before, matchId).state));
  mutate(state);
  expect(() => Game.restore(state)).toThrow();
  expect(game.snapshot).toBe(before);
});

it("preserves unsupported v2 saves instead of silently converting their old owners map", () => {
  const record = JSON.parse(JSON.stringify(makeSave(new Game(createMatchConfig(940)).snapshot, matchId)));
  record.rulesVersion = record.state.config.rulesVersion = "city-v2-quick";
  delete record.state.properties;
  record.state.owners = {};
  const before = JSON.stringify(record);
  expect(() => readSave(record)).toThrow("incompatible");
  expect(JSON.stringify(record)).toBe(before);
});
