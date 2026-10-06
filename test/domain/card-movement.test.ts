import { afterEach, expect, it, vi } from "vitest";
import { movement } from "../../src/domain/movement";
import { QUICK_RULES } from "../../src/domain/rules";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { eventText } from "../../src/ui/eventText";
import { propertyMatchId } from "../fixtures/property-match";
import { movementCheckpoint } from "../fixtures/card-movement";

afterEach(() => vi.restoreAllMocks());

function roll(game: Game) {
  const result = game.apply({ kind: "roll", actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision });
  if (!result.ok) throw new Error(result.reason);
  const moved = result.events.find((event) => event.kind === "card_moved");
  if (!moved) throw new Error("Missing real card movement");
  return { ...result, moved };
}

it("calculates forward and backward paths at the same rule-owned boundary, including crossings without rewards", () => {
  expect(movement(18, 20, "forward", 3, QUICK_RULES, false)).toEqual({ direction: "forward", from: 18, to: 1, path: [19, 0, 1], passedStart: true, startBonus: QUICK_RULES.passStartBonus, drawChance: false });
  expect(movement(1, 20, "backward", 3, QUICK_RULES, false)).toEqual({ direction: "backward", from: 1, to: 18, path: [0, 19, 18], passedStart: false, startBonus: 0, drawChance: false });
  expect(movement(1, 2, "backward", 3, QUICK_RULES, false).path).toEqual([0, 1, 0]);
});

it.each(Array.from({ length: 20 }, (_, index) => index))("teleports from %s directly to Start and uses a changed rule bonus only once", (from) => {
  expect(movement(from, 20, "teleport", 1, { ...QUICK_RULES, passStartBonus: 213 }, false)).toEqual({ direction: "teleport", from, to: 0, path: [0], passedStart: false, startBonus: 213, drawChance: false });
});

it.each([
  [110, "return-start", [0], "start"],
  [55, "retreat-three", [10, 9, 8], "property_available"],
  [772, "advance-three", [3, 4, 5], "property_available"],
  [8, "advance-three", [12, 13, 14], "tax"],
  [177, "retreat-three", [6, 5, 4], "tax"],
  [452, "retreat-three", [1, 0, 19], "chance_ignored"],
] as const)("seed %s presents the dice, card and final landing in order and commits one ordinary turn", (seed, cardId, path, landing) => {
  const game = new Game(createMatchConfig(seed));
  const before = game.snapshot;
  const result = roll(game);
  expect(result.events.slice(0, 2).map((event) => event.kind)).toEqual(["rolled", "card_moved"]);
  expect(result.moved.result).toMatchObject({ cardId, path, drawChance: false, landing: { kind: landing } });
  expect(result.events.filter((event) => event.kind === "turn").length).toBe(landing === "property_available" ? 0 : 1);
  expect(result.snapshot.deck.discardPile).toEqual([result.moved.result.instanceId]);
  expect(result.snapshot.deck.pending).toBeNull();
  expect(result.snapshot.random.draws - before.random.draws).toBe(2 + QUICK_RULES.chanceCards.length * 2 - 1);
  if (cardId === "return-start") expect(result.snapshot.players[0]).toMatchObject({ cash: 1700, statistics: { startBonus: 200 } });
  if (seed === 452) expect(result.snapshot.players[0]).toMatchObject({ cash: 1500, statistics: { startBonus: 0 } });
  for (const language of ["en", "zh-CN"] as const) {
    expect(eventText(language, result.moved, result.snapshot)).not.toMatch(/undefined|\{\w+\}/);
    expect(eventText(language, result.moved, result.snapshot)).toContain(language === "en" ? "No further Chance" : "不连抽机会");
  }
  const saved = makeSave(result.snapshot, propertyMatchId);
  expect(readSave(saved).snapshot).toEqual(result.snapshot);
  expect(Game.restore(saved.state).snapshot).toEqual(result.snapshot);
});

it("a forward card crossing Start awards once and lands on Chance without redrawing or changing the dice", () => {
  const game = movementCheckpoint(53, "p1", undefined, 19);
  const before = game.snapshot;
  const result = roll(game);
  expect(result.moved.result).toMatchObject({ path: [0, 1, 2], startBonus: QUICK_RULES.passStartBonus, landing: { kind: "chance_ignored" } });
  const dice = result.events[0]!;
  expect(dice.kind).toBe("rolled");
  expect(result.snapshot.lastRoll).toEqual(dice.kind === "rolled" ? dice.result.dice : null);
  expect(result.snapshot.players[0]!.cash).toBe(before.players[0]!.cash + QUICK_RULES.passStartBonus);
  expect(result.events.filter((event) => event.kind === "turn")).toHaveLength(1);
  expect(Game.restore(makeSave(result.snapshot, propertyMatchId).state).snapshot).toEqual(result.snapshot);
});

it.each(["p1", "p2"] as const)("retreat into owned land resolves the actual owner/rent for %s without drawing again", (actor) => {
  const game = movementCheckpoint(65, actor);
  const before = game.snapshot;
  const result = roll(game);
  expect(result.moved.result.landing.kind).toBe(actor === "p2" ? "property_owned" : "rent");
  expect(result.events.filter((event) => event.kind === "paid")).toHaveLength(actor === "p2" ? 0 : 1);
  if (actor === "p1") {
    expect(result.snapshot.players[0]!.cash).toBe(before.players[0]!.cash - 36);
    expect(result.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + 36);
  }
  expect(Game.restore(makeSave(result.snapshot, propertyMatchId).state).snapshot).toEqual(result.snapshot);
});

it("a movement-card debt restores the final rent source and pays once after liquidation, without moving or switching twice", () => {
  const game = movementCheckpoint(65, "p1", 30);
  roll(game);
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { source: { kind: "rent", propertyId: "river-market" }, amount: 36 } });
  expect(before.players[0]!.position).toBe(8);
  expect(before.deck.pending).toBeNull();
  expect(before.deck.discardPile).toHaveLength(1);
  const restored = Game.restore(makeSave(before, propertyMatchId).state);
  expect(restored.snapshot).toEqual(before);
  expect(restored.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision }).ok).toBe(false);
  const liquidated = restored.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision });
  expect(liquidated.ok).toBe(true);
  if (!liquidated.ok) throw new Error(liquidated.reason);
  expect(liquidated.events.map((event) => event.kind)).toEqual(["liquidated", "paid", "ended"]);
  expect(restored.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + 30);
  expect(restored.snapshot.random).toEqual(before.random);
  expect(restored.snapshot.deck).toEqual(before.deck);
  expect(Game.restore(makeSave(restored.snapshot, propertyMatchId).state).snapshot).toEqual(restored.snapshot);
});

it("a moved-to tax debt uses the shared bankruptcy payment and ends once without rediscarding the card", () => {
  const game = movementCheckpoint(53, "p1", 30);
  roll(game);
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { source: { kind: "tax", amount: 120 } } });
  const restored = Game.restore(makeSave(before, propertyMatchId).state);
  const command = { kind: "bankrupt" as const, actor: "p1" as const, expectedRevision: before.revision };
  const result = restored.apply(command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.events.map((event) => event.kind)).toEqual(["liquidated", "paid", "ended"]);
  expect(restored.snapshot.players[0]!.cash).toBe(0);
  expect(restored.snapshot.deck).toEqual(before.deck);
  expect(restored.snapshot.random).toEqual(before.random);
  const after = restored.snapshot;
  expect(restored.apply(command).ok).toBe(false);
  expect(restored.snapshot).toBe(after);
  expect(Game.restore(makeSave(after, propertyMatchId).state).snapshot).toEqual(after);
});

it("a moved-to property waits for one purchase or skip before ending the original turn", () => {
  for (const kind of ["buy", "skip"] as const) {
    const game = new Game(createMatchConfig(55));
    const result = roll(game);
    expect(result.snapshot.turnPlayerId).toBe("p1");
    expect(game.apply({ kind, actor: "p1", expectedRevision: result.snapshot.revision }).ok).toBe(true);
    expect(game.snapshot.turnPlayerId).toBe("p2");
    expect(game.snapshot.completedRounds).toBe(0);
    expect(game.snapshot.history.filter((entry) => entry.event.kind === "turn")).toHaveLength(1);
    expect(Game.restore(makeSave(game.snapshot, propertyMatchId).state).snapshot).toEqual(game.snapshot);
  }
});

it("movement-card bonus overflow rolls back the dice, shuffle, position and all statistics", () => {
  const game = new Game(createMatchConfig(110), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER });
  const before = game.snapshot;
  const listener = vi.fn();
  game.subscribe(listener);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 })).toEqual({ ok: false, reason: "calculation_failed" });
  expect(game.snapshot).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

it.each([
  (raw: any) => { raw.history[1].event.result.direction = "forward"; },
  (raw: any) => { raw.history[1].event.result.from = 12; },
  (raw: any) => { raw.history[1].event.result.path = [12, 13, 14]; },
  (raw: any) => { raw.history[1].event.result.startBonus = 200; },
  (raw: any) => { raw.history[1].event.result.drawChance = true; },
  (raw: any) => { raw.history[1].event.result.instanceId = "retreat-three:2"; },
  (raw: any) => { raw.history.splice(1, 1); },
  (raw: any) => { raw.deck.pending = raw.deck.discardPile.pop(); },
])("rejects forged movement chains and deck references %# without repairing the input", (mutate) => {
  const game = new Game(createMatchConfig(55));
  roll(game);
  const raw = JSON.parse(JSON.stringify(makeSave(game.snapshot, propertyMatchId).state));
  mutate(raw);
  const bytes = JSON.stringify(raw);
  expect(() => Game.restore(raw)).toThrow();
  expect(JSON.stringify(raw)).toBe(bytes);
});

it("preserves the previous unpublished v9 save rather than migrating its deck or movement events", () => {
  const raw = JSON.parse(JSON.stringify(makeSave(new Game().snapshot, propertyMatchId)));
  raw.rulesVersion = raw.state.config.rulesVersion = "city-v9-quick";
  const bytes = JSON.stringify(raw);
  expect(() => readSave(raw)).toThrow("incompatible");
  expect(JSON.stringify(raw)).toBe(bytes);
});
