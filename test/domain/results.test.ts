import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { QUICK_RULES } from "../../src/domain/rules";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands, netAssets, propertyValue } from "../../src/domain/selectors";
import type { FinancialStats, PlayerId } from "../../src/domain/types";
import { eventText } from "../../src/ui/eventText";

it("one actual buy and rent payment reconcile cash, ranking and both sides of the financial statement", () => {
  const game = new Game(createMatchConfig(940), { ...QUICK_RULES, roundLimit: 1 });
  for (const kind of ["roll", "buy", "roll"] as const) expect(game.apply({ kind, actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const snapshot = game.snapshot;
  expect(snapshot.players[0]).toMatchObject({ cash: 1352, statistics: { purchases: 180, rentReceived: 32, rentPaid: 0 } });
  expect(snapshot.players[1]).toMatchObject({ cash: 1468, statistics: { rentPaid: 32, rentReceived: 0 } });
  expect(snapshot.decision).toMatchObject({ result: { winnerIds: ["p1"], rankings: [{ playerId: "p1", netAssets: 1532, propertyValue: 180, cash: 1352 }, { playerId: "p2", netAssets: 1468 }] } });
  expect(netAssets(snapshot, "p1")).toBe(1532);
  expect(game.apply({ kind: "buy", actor: "p1", expectedRevision: snapshot.revision }).ok).toBe(false);
  expect(game.snapshot).toBe(snapshot);
});

it("all real event transfers reconcile with each committed cash balance through complete games, not animation counts", () => {
  const branches = new Set<string>();
  for (const seed of [940, 768, 17981]) {
    const game = new Game(createMatchConfig(seed));
    const expected = new Map<PlayerId, FinancialStats>(game.snapshot.players.map((player) => [player.id, { ...player.statistics }]));
    const record = (id: PlayerId, field: keyof FinancialStats, amount: number) => {
      const previous = expected.get(id)!;
      expected.set(id, { ...previous, [field]: previous[field] + amount });
    };
    for (let count = 0; game.snapshot.decision.kind !== "game_over" && count < 200; count += 1) {
      const before = game.snapshot;
      const command = chooseBotCommand(before) ?? legalCommands(before, before.turnPlayerId).find((action) => action.kind === (before.decision.kind === "awaiting_purchase" ? (count === 1 ? "buy" : "skip") : "roll"))!;
      const result = game.apply(command);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      for (const event of result.events) {
        if (event.kind === "purchased") { record(event.actor, "purchases", event.price); branches.add("purchase"); }
        if (event.kind === "rolled") {
          const action = event.result;
          record(action.playerId, "startBonus", action.startBonus);
          if (action.startBonus > 0) branches.add("bonus");
          const landing = action.landing;
          if (landing.kind === "tax") { record(action.playerId, "taxesPaid", landing.amount); branches.add("tax"); }
          if (landing.kind === "chance") { record(action.playerId, landing.amount >= 0 ? "chanceIncome" : "chanceExpense", Math.abs(landing.amount)); branches.add(landing.amount >= 0 ? "chance_income" : "chance_expense"); }
          if (landing.kind === "rent") { record(action.playerId, "rentPaid", landing.amount); record(landing.ownerId, "rentReceived", landing.amount); branches.add("rent"); }
        }
        eventText("en", event, result.snapshot);
        eventText("zh-CN", event, result.snapshot);
        eventText("en", event, result.snapshot);
      }
      for (const player of result.snapshot.players) {
        const totals = expected.get(player.id)!;
        expect(player.statistics).toEqual(totals);
        expect(player.cash).toBe(result.snapshot.rules.startingCash + totals.startBonus + totals.rentReceived + totals.chanceIncome - totals.rentPaid - totals.taxesPaid - totals.chanceExpense - totals.purchases);
        expect(netAssets(result.snapshot, player.id)).toBe(player.cash + propertyValue(result.snapshot, player.id));
      }
      expect(game.snapshot).toBe(result.snapshot);
      expect(game.apply(command).ok).toBe(false);
      expect(game.snapshot).toBe(result.snapshot);
      expect(before.players[0]!.statistics).not.toBe(result.snapshot.players[0]!.statistics);
    }
    expect(game.snapshot.decision.kind).toBe("game_over");
  }
  expect([...branches].sort()).toEqual(["bonus", "chance_expense", "chance_income", "purchase", "rent", "tax"]);
});

it("failed candidate money calculation cannot commit any statistic", () => {
  const game = new Game(createMatchConfig(17981), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER - 198 });
  for (const kind of ["roll", "skip", "roll"] as const) expect(game.apply({ kind, actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const before = game.snapshot;
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision })).toEqual({ ok: false, reason: "calculation_failed" });
  expect(game.snapshot).toBe(before);
  expect(game.snapshot.players[0]?.statistics.startBonus).toBe(0);
});
