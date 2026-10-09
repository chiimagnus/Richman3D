import { expect, it } from "vitest";
import { matchSummary } from "../../src/domain/records";
import { matchAchievements } from "../../src/domain/achievements";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { propertyMatch } from "../fixtures/property-match";
import { debtMatch } from "../fixtures/debt-match";
import { recordMatch } from "../fixtures/record-match";

it("summarizes committed rankings, actual finances and replay conditions without custom names or a full snapshot", () => {
  const game = recordMatch({ ...createMatchConfig(1, 3), mapId: "harbor", mapVersion: 1 });
  const summary = matchSummary(game.snapshot, crypto.randomUUID(), "free", 100);
  expect(summary).toMatchObject({ mode: "free", mapId: "harbor", rounds: 20, roundLimit: 20, seed: 1, endedAt: 100 });
  expect(summary.players.map((entry) => entry.statistics)).toEqual(game.snapshot.players.map((entry) => entry.statistics));
  expect(JSON.stringify(summary)).not.toMatch(/"name"|"properties"|"random"|"hand"/);
  expect(() => matchSummary(new Game(createMatchConfig()).snapshot, "", "free", 0)).toThrow();
});

it("real purchases award human ownership but not a bot purchase", () => {
  const game = new Game(createMatchConfig()); const awards = [];
  for (let count = 0; count < 80 && awards.length < 2; count += 1) {
    const before = game.snapshot; if (before.decision.kind === "game_over") break;
    const choices = legalCommands(before, before.decision.actorId);
    const result = game.apply(choices.find((choice) => choice.kind === "buy" || choice.kind === "roll") ?? choices[0]!);
    if (!result.ok) throw new Error(result.reason);
    if (result.events.some((event) => event.kind === "purchased")) {
      const earned = matchAchievements(before, result.snapshot, result.events);
      expect(earned.includes("first-purchase")).toBe(before.decision.actorId === "p1"); awards.push(earned);
    }
  }
  expect(awards).toHaveLength(2);
});

it("uses real group ownership, balanced level-three construction and a bilateral trade", () => {
  const game = propertyMatch();
  for (const level of [1, 2, 3]) for (const propertyId of ["neon-avenue", "harbor-walk"]) {
    const before = game.snapshot;
    const result = game.apply({ kind: "upgrade", propertyId, actor: "p1", expectedRevision: before.revision });
    if (!result.ok) throw new Error(result.reason);
    const earned = matchAchievements(before, result.snapshot, result.events);
    expect(earned).toContain("complete-group"); expect(earned.includes("level-three")).toBe(level === 3);
  }
  const trade = new Game(createMatchConfig(940));
  expect(trade.apply({ kind: "trade_propose", actor: "p1", expectedRevision: 0, terms: { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p2", amount: 50 } } }).ok).toBe(true);
  const before = trade.snapshot;
  if (before.decision.kind !== "awaiting_trade") throw new Error("Missing proposal");
  const result = trade.apply({ kind: "trade_accept", actor: "p2", expectedRevision: before.revision, proposalRevision: before.decision.proposal.revision });
  if (!result.ok) throw new Error(result.reason);
  expect(matchAchievements(before, result.snapshot, result.events)).toContain("first-trade");
});

it("selling buildings only rescues debt after the final real payment, not upon bankruptcy", () => {
  const game = debtMatch(30, 3);
  for (const [index, propertyId] of ["neon-avenue", "harbor-walk", "neon-avenue"].entries()) {
    const before = game.snapshot;
    const result = game.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: before.revision });
    if (!result.ok) throw new Error(result.reason);
    const earned = matchAchievements(before, result.snapshot, result.events);
    expect(earned).toContain("building-sale"); expect(earned.includes("debt-rescued")).toBe(index === 2);
  }
  const failing = debtMatch(0, 1);
  for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(failing.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: failing.snapshot.revision }).ok).toBe(true);
  const before = failing.snapshot;
  const result = failing.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision });
  if (!result.ok) throw new Error(result.reason);
  expect(matchAchievements(before, result.snapshot, result.events)).not.toContain("debt-rescued");
});
