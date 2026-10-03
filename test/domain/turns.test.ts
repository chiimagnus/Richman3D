import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { CITY } from "../../src/domain/maps/city";
import { QUICK_RULES } from "../../src/domain/rules";
import { matchResult } from "../../src/domain/selectors";
import { nextTurn } from "../../src/domain/turns";

it.each([20, 40])("waits for the last actual purchase at %s complete rounds, then ranks net assets and cash", (roundLimit) => {
  const rules = { ...QUICK_RULES, roundLimit, passStartBonus: 0 };
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "start" ? tile : { type: "property" as const, id: tile.id, price: 100, rent: 0, group: "cyan" as const }) };
  const game = new Game(createMatchConfig(940), rules, map);
  while (game.snapshot.completedRounds < roundLimit - 1 || game.snapshot.turnPlayerId === "p1") {
    const snapshot = game.snapshot;
    expect(game.apply({ kind: snapshot.decision.kind === "awaiting_purchase" ? "skip" : "roll", actor: snapshot.turnPlayerId, expectedRevision: snapshot.revision }).ok).toBe(true);
  }
  expect(game.apply({ kind: "roll", actor: "p2", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
  expect(game.snapshot.completedRounds).toBe(roundLimit - 1);
  const final = game.apply({ kind: "buy", actor: "p2", expectedRevision: game.snapshot.revision });
  expect(final.ok).toBe(true);
  expect(game.snapshot.completedRounds).toBe(roundLimit);
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit", winnerIds: ["p1"], rankings: [{ netAssets: 1500, cash: 1500 }, { netAssets: 1500, cash: 1400, propertyValue: 100 }] } });
  if (final.ok) expect(final.events.map((event) => event.kind)).toEqual(["purchased", "ended"]);
  const before = game.snapshot;
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it.each([20, 40])("retains a true tie after %s actual rounds, without seat-order tiebreak", (roundLimit) => {
  const rules = { ...QUICK_RULES, roundLimit, passStartBonus: 0, chanceCards: QUICK_RULES.chanceCards.map((card) => ({ ...card, amount: 0 })) };
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "start" ? tile : { type: "tax" as const, id: tile.id, amount: 0 }) };
  const game = new Game(createMatchConfig(768), rules, map);
  for (let turn = 0; turn < roundLimit * 2; turn += 1) {
    const result = game.apply({ kind: "roll", actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision });
    expect(result.ok).toBe(true);
    if (turn < roundLimit * 2 - 1) expect(game.snapshot.decision.kind).not.toBe("game_over");
  }
  expect(game.snapshot.completedRounds).toBe(roundLimit);
  expect(game.snapshot.decision).toMatchObject({ result: { winnerIds: ["p1", "p2"], rankings: [{ rank: 1 }, { rank: 1 }] } });
});

it("last survivor wins and fixed slots skip eliminated seats", () => {
  const game = new Game(createMatchConfig(6), { ...QUICK_RULES, startingCash: 50 });
  game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 });
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: 1 }).ok).toBe(true);
  expect(game.snapshot.decision).toMatchObject({ result: { reason: "last_survivor", winnerIds: ["p2"] } });
  const snapshot = game.snapshot;
  expect(matchResult(snapshot, "last_survivor").winnerIds).toEqual(["p2"]);
  expect(nextTurn({ ...snapshot, turnPlayerId: "p2" })).toEqual({ turnPlayerId: "p2", completedRounds: 1 });
});
