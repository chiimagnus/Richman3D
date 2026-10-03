import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { QUICK_RULES } from "../../src/domain/rules";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { netAssets, propertyValue } from "../../src/domain/economy";
import type { FinancialStats, PlayerId } from "../../src/domain/types";
import { eventText } from "../../src/ui/eventText";
import { builtRentDebtMatch, debtMatch, rentDebtMatch } from "../fixtures/debt-match";
import { propertyMatch } from "../fixtures/property-match";

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
  const tradeGame = propertyMatch();
  for (const game of [...[940, 768, 17981].map((seed) => new Game(createMatchConfig(seed))), builtRentDebtMatch(), debtMatch(30, 3), rentDebtMatch(30, true), tradeGame]) {
    const expected = new Map<PlayerId, FinancialStats>(game.snapshot.players.map((player) => [player.id, { ...player.statistics }]));
    const record = (id: PlayerId, field: keyof FinancialStats, amount: number) => {
      const previous = expected.get(id)!;
      expected.set(id, { ...previous, [field]: previous[field] + amount });
    };
    for (let count = 0; game.snapshot.decision.kind !== "game_over" && count < 200; count += 1) {
      const before = game.snapshot;
      const actions = legalCommands(before, before.decision.kind === "game_over" ? before.turnPlayerId : before.decision.actorId);
      const command = game === tradeGame && count === 0 ? { kind: "trade_propose" as const, actor: "p1" as const, expectedRevision: before.revision,
        terms: { recipientId: "p2" as const, givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2" as const, amount: 180 } } }
        : (chooseBotAction(observeBot(before), "normal")?.command ?? null) ?? actions.find((action) => action.kind === (before.decision.kind === "awaiting_purchase" ? (count === 1 ? "buy" : "skip") : before.decision.kind === "awaiting_auction" ? "auction_pass" : before.decision.kind === "awaiting_debt" ? "bankrupt" : "roll")) ?? actions[0]!;
      const result = game.apply(command);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      for (const event of result.events) {
        if (event.kind === "trade_accepted") {
          const proposal = event.proposal;
          for (const [ids, giver, receiver] of [[proposal.givePropertyIds, proposal.proposerId, proposal.recipientId], [proposal.receivePropertyIds, proposal.recipientId, proposal.proposerId]] as const) {
            for (const id of ids) {
              const tile = result.snapshot.map.tiles.find((candidate) => candidate.id === id)!;
              if (tile.type !== "property") throw new Error("Expected property");
              record(giver, "tradeBookValueGiven", tile.price);
              record(receiver, "tradeBookValueReceived", tile.price);
            }
          }
          if (proposal.cash) {
            record(proposal.cash.payerId, "tradeCashPaid", proposal.cash.amount);
            record(proposal.cash.payerId === proposal.proposerId ? proposal.recipientId : proposal.proposerId, "tradeCashReceived", proposal.cash.amount);
          }
          branches.add("trade");
        }
        if (event.kind === "purchased") {
          record(event.actor, "purchases", event.price);
          const tile = result.snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId)!;
          if (tile.type !== "property") throw new Error("Expected property");
          record(event.actor, "purchaseBookValue", tile.price);
          branches.add("purchase");
        }
        if (event.kind === "upgraded") record(event.actor, "constructionSpent", event.cost);
        if (event.kind === "building_sold" || event.kind === "liquidated") {
          record(event.actor, "constructionSoldCost", event.kind === "building_sold" ? event.cost : event.constructionCost);
          record(event.actor, "constructionRefunds", event.kind === "building_sold" ? event.refund : event.constructionRefund);
          branches.add("sale");
        }
        if (event.kind === "mortgaged") record(event.actor, "mortgageIncome", event.principal);
        if (event.kind === "redeemed") {
          record(event.actor, "mortgagePrincipalRepaid", event.principal);
          record(event.actor, "mortgageFeesPaid", event.fee);
        }
        if (event.kind === "liquidated") {
          record(event.actor, "mortgageIncome", event.mortgageIncome);
          record(event.actor, "mortgagePrincipalReleased", event.principalReleased);
          branches.add("liquidation");
        }
        if (event.kind === "paid") {
          record(event.actor, "debtWrittenOff", event.writtenOff);
          const source = event.debt.source;
          if (source.kind === "rent") {
            record(event.actor, "rentPaid", event.amount);
            record(source.ownerId, "rentReceived", event.amount);
            record(source.ownerId, "rentLost", event.writtenOff);
            branches.add("rent");
          } else record(event.actor, source.kind === "tax" ? "taxesPaid" : "chanceExpense", event.amount);
        }
        if (event.kind === "rolled" || event.kind === "card_moved") {
          const action = event.result;
          record(action.playerId, "startBonus", action.startBonus);
          if (action.startBonus > 0) branches.add("bonus");
          const landing = action.landing;
          if (landing.kind === "tax") branches.add("tax");
          if (landing.kind === "chance") {
            if (landing.amount >= 0) record(action.playerId, "chanceIncome", landing.amount);
            branches.add(landing.amount >= 0 ? "chance_income" : "chance_expense");
          }
        }
        eventText("en", event, result.snapshot);
        eventText("zh-CN", event, result.snapshot);
        eventText("en", event, result.snapshot);
      }
      for (const player of result.snapshot.players) {
        const totals = expected.get(player.id)!;
        expect(player.statistics).toEqual(totals);
        expect(player.cash).toBe(result.snapshot.rules.startingCash + totals.startBonus + totals.rentReceived + totals.chanceIncome + totals.constructionRefunds + totals.mortgageIncome + totals.tradeCashReceived - totals.tradeCashPaid
          - totals.rentPaid - totals.taxesPaid - totals.chanceExpense - totals.purchases - totals.constructionSpent - totals.mortgagePrincipalRepaid - totals.mortgageFeesPaid);
        expect(netAssets(result.snapshot, player.id)).toBe(player.cash + propertyValue(result.snapshot, player.id));
      }
      expect(game.snapshot).toBe(result.snapshot);
      expect(game.apply(command).ok).toBe(false);
      expect(game.snapshot).toBe(result.snapshot);
      expect(before.players[0]!.statistics).not.toBe(result.snapshot.players[0]!.statistics);
    }
    expect(game.snapshot.decision.kind).toBe("game_over");
  }
  expect([...branches].sort()).toEqual(["bonus", "chance_expense", "chance_income", "liquidation", "purchase", "rent", "sale", "tax", "trade"]);
});

it("failed candidate money calculation cannot commit any statistic", () => {
  const game = new Game(createMatchConfig(17981), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER - 198 });
  for (const kind of ["roll", "skip", "auction_pass", "auction_pass", "roll"] as const) expect(game.apply({ kind, actor: game.snapshot.decision.kind === "game_over" ? game.snapshot.turnPlayerId : game.snapshot.decision.actorId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const before = game.snapshot;
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision })).toEqual({ ok: false, reason: "calculation_failed" });
  expect(game.snapshot).toBe(before);
  expect(game.snapshot.players[0]?.statistics.startBonus).toBe(0);
});
