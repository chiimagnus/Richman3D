import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { legalCommands, playerAssets } from "../../src/domain/selectors";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { builtRentDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

it.each([2, 3, 4] as const)("liquidates real built groups in a %s-seat game, transfers actual cash and restores every subsequent turn", (seats) => {
  let game = builtRentDebtMatch(seats);
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 516, creditorId: "p2" } });
  expect(playerAssets(before, "p1")).toMatchObject({ cash: 30, liquidationValue: 240 });
  const command = legalCommands(before, "p1").find((candidate) => candidate.kind === "bankrupt")!;
  expect(game.apply(command).ok).toBe(true);
  const after = game.snapshot;
  expect(after.players[0]).toMatchObject({ cash: 0, bankrupt: true, statistics: {
    constructionSoldCost: 160, constructionRefunds: 80, mortgageIncome: 160, mortgagePrincipalReleased: 160,
    rentPaid: before.players[0]!.statistics.rentPaid + 270, debtWrittenOff: 246,
  } });
  expect(after.players[1]).toMatchObject({ cash: before.players[1]!.cash + 270, statistics: { rentLost: 246 } });
  expect(after.players.reduce((sum, player) => sum + player.cash, 0)).toBe(before.players.reduce((sum, player) => sum + player.cash, 0) + 240);
  expect(after.random).toEqual(before.random);
  expect(playerAssets(after, "p1")).toMatchObject({ cash: 0, propertyValue: 0, netAssets: 0, liquidationValue: 0, properties: [] });
  for (const id of ["neon-avenue", "harbor-walk"]) expect(after.properties[id]).toEqual({ ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] });
  expect(after.properties["financial-center"]).toEqual(before.properties["financial-center"]);
  expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
  expect(game.snapshot).toBe(after);
  game = Game.restore(readSave(makeSave(after, propertyMatchId)).record.state);
  expect(game.snapshot).toEqual(after);
  if (seats === 2) {
    expect(after.decision).toMatchObject({ kind: "game_over", result: { reason: "last_survivor", winnerIds: ["p2"], rankings: [{ playerId: "p2", rank: 1 }, { playerId: "p1", rank: 2, netAssets: 0 }] } });
  } else {
    expect(after.decision.kind).toBe("awaiting_roll");
    const previousIndex = before.turnOrder.indexOf("p1");
    expect(after.turnPlayerId).toBe(before.turnOrder[(previousIndex + 1) % seats]);
    expect(after.completedRounds).toBe(before.completedRounds + (previousIndex === seats - 1 ? 1 : 0));
    for (let count = 0; count < 200 && game.snapshot.decision.kind !== "game_over"; count += 1) {
      const snapshot = game.snapshot;
      expect(snapshot.turnPlayerId).not.toBe("p1");
      expect(legalCommands(snapshot, "p1")).toEqual([]);
      expect(game.apply((chooseBotAction(observeBot(snapshot), "normal")?.command ?? null)!).ok).toBe(true);
      const committed = game.snapshot;
      game = Game.restore(readSave(makeSave(committed, propertyMatchId)).record.state);
      expect(game.snapshot).toEqual(committed);
    }
    expect(game.snapshot.decision.kind).toBe("game_over");
    if (game.snapshot.decision.kind !== "game_over") throw new Error("Expected completed match");
    expect(game.snapshot.decision.result.winnerIds).not.toContain("p1");
    expect(game.snapshot.decision.result.rankings.at(-1)).toMatchObject({ playerId: "p1", netAssets: 0, cash: 0, propertyValue: 0 });
  }
  const terminal = game.snapshot;
  expect(terminal.history.filter((entry) => entry.event.kind === "ended")).toHaveLength(1);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: terminal.revision })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(terminal);
  expect(Game.restore(makeSave(terminal, propertyMatchId).state).snapshot).toEqual(terminal);
});

it("refunds individual discounted actual costs, not catalog costs or a rounded aggregate", () => {
  const game = builtRentDebtMatch(3, true);
  const before = game.snapshot;
  expect(playerAssets(before, "p1").liquidationValue).toBe(212);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]).toMatchObject({ cash: 0, statistics: { constructionSpent: 106, constructionSoldCost: 106,
    constructionRefunds: 52, mortgageIncome: 160, mortgagePrincipalReleased: 160, debtWrittenOff: 274 } });
  expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + 242);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});
