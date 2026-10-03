import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { constructionRefund, liquidityOption, netAssets, redemptionCost, rentFor } from "../../src/domain/economy";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import { QUICK_RULES } from "../../src/domain/rules";
import { CITY } from "../../src/domain/maps/city";
import { createMatchConfig } from "../../src/domain/config";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { eventText } from "../../src/ui/eventText";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import type { Command } from "../../src/domain/types";

type PropertyKind = Extract<Command, { propertyId: string }>["kind"];

function operate(game: Game, kind: PropertyKind, propertyId = "neon-avenue") {
  const before = game.snapshot;
  const result = game.apply({ kind, propertyId, actor: "p1", expectedRevision: before.revision });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(game.snapshot.turnPlayerId).toBe(before.turnPlayerId);
  expect(game.snapshot.completedRounds).toBe(before.completedRounds);
  expect(game.snapshot.random).toEqual(before.random);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  for (const language of ["en", "zh-CN"] as const) expect(eventText(language, result.events[0]!, game.snapshot)).toBeTruthy();
  return result;
}

it("builds, sells actual costs, mortgages, redeems and re-borrows with distinct cash, book value and fee loss", () => {
  const game = propertyMatch();
  const initialAssets = netAssets(game.snapshot, "p1");
  operate(game, "upgrade");
  operate(game, "upgrade", "harbor-walk");
  expect(liquidityOption(game.snapshot, "p1", "neon-avenue", "sell_building")).toMatchObject({ originalCost: 90, proceeds: 45, loss: 45, remainingCash: 1113, nextRent: 48 });
  operate(game, "sell_building");
  operate(game, "sell_building", "harbor-walk");
  expect(game.snapshot.players[0]!.cash).toBe(1148);
  expect(netAssets(game.snapshot, "p1")).toBe(initialAssets - 80);
  operate(game, "mortgage");
  expect(game.snapshot.players[0]!.cash).toBe(1238);
  expect(game.snapshot.properties["neon-avenue"]!.mortgagePrincipal).toBe(90);
  expect(rentFor(game.snapshot, "neon-avenue")).toBe(0);
  expect(rentFor(game.snapshot, "harbor-walk")).toBe(24);
  expect(netAssets(game.snapshot, "p1")).toBe(initialAssets - 80);
  expect(liquidityOption(game.snapshot, "p1", "neon-avenue", "redeem")).toMatchObject({ cost: 99, loss: 9, remainingCash: 1139, nextRent: 48 });
  operate(game, "redeem");
  expect(rentFor(game.snapshot, "harbor-walk")).toBe(36);
  expect(netAssets(game.snapshot, "p1")).toBe(initialAssets - 89);
  operate(game, "mortgage");
  expect(game.snapshot.players[0]).toMatchObject({ cash: 1229, statistics: { constructionSpent: 160, constructionSoldCost: 160, constructionRefunds: 80, mortgageIncome: 180, mortgagePrincipalRepaid: 90, mortgageFeesPaid: 9 } });
  expect(netAssets(game.snapshot, "p1")).toBe(initialAssets - 89);
});

it("charges zero on real mortgaged land without crediting or replaying rent, then restores group rent on redemption", () => {
  const game = propertyMatch();
  operate(game, "mortgage");
  let visited = false;
  for (let index = 0; index < 80 && game.snapshot.decision.kind !== "game_over"; index += 1) {
    const before = game.snapshot;
    const command = chooseBotCommand(before) ?? legalCommands(before, before.decision.kind === "game_over" ? before.turnPlayerId : before.decision.actorId).find((candidate) => candidate.kind === (before.decision.kind === "awaiting_purchase" ? "skip" : before.decision.kind === "awaiting_auction" ? "auction_pass" : "roll"))!;
    const result = game.apply(command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const event = result.events.find((candidate) => candidate.kind === "rolled");
    if (event?.kind === "rolled" && event.result.landing.kind === "rent" && event.result.landing.propertyId === "neon-avenue") {
      expect(event.result.landing.amount).toBe(0);
      expect(game.snapshot.players[0]!.cash).toBe(before.players[0]!.cash);
      expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + event.result.startBonus);
      expect(game.snapshot.players.map((player) => player.statistics.rentPaid)).toEqual(before.players.map((player) => player.statistics.rentPaid));
      expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
      visited = true;
      break;
    }
  }
  expect(visited).toBe(true);
  operate(game, "redeem");
  expect(rentFor(game.snapshot, "neon-avenue")).toBe(48);
});

it("sells three levels one at a time and rejects a captured sale after its single refund", () => {
  const game = propertyMatch();
  for (let level = 0; level < 3; level += 1) {
    operate(game, "upgrade");
    operate(game, "upgrade", "harbor-walk");
  }
  const command = { kind: "sell_building" as const, propertyId: "neon-avenue", actor: "p1" as const, expectedRevision: game.snapshot.revision };
  for (const level of [2, 1, 0] as const) {
    operate(game, "sell_building");
    expect(game.snapshot.properties["neon-avenue"]!.level).toBe(level);
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    operate(game, "sell_building", "harbor-walk");
  }
  expect(game.snapshot.players[0]).toMatchObject({ cash: 988, statistics: { constructionSpent: 480, constructionSoldCost: 480, constructionRefunds: 240 } });
  expect(game.snapshot.properties["neon-avenue"]!.constructionCosts).toEqual([]);
  expect(game.snapshot.properties["harbor-walk"]!.constructionCosts).toEqual([]);
  expect(netAssets(game.snapshot, "p1")).toBe(1308);
});

it("does not create a zero-principal mortgage state for a zero-value property", () => {
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.id === "neon-avenue" && tile.type === "property" ? { ...tile, price: 0 } : tile) };
  const game = new Game(createMatchConfig(940), QUICK_RULES, map);
  for (const kind of ["roll", "buy", "roll"] as const) expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((command) => command.kind === kind)!).ok).toBe(true);
  const before = game.snapshot;
  expect(liquidityOption(before, "p1", "neon-avenue", "mortgage").reason).toBe("no_mortgage_value");
  expect(game.apply({ kind: "mortgage", propertyId: "neon-avenue", actor: "p1", expectedRevision: before.revision })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
});

it("rejects uneven sales and mortgages until every building in the group is gone, without partial refunds", () => {
  const game = propertyMatch();
  operate(game, "upgrade");
  operate(game, "upgrade", "harbor-walk");
  operate(game, "upgrade");
  const before = game.snapshot;
  expect(liquidityOption(before, "p1", "harbor-walk", "sell_building").reason).toBe("unbalanced_sale");
  for (const [kind, id] of [["sell_building", "harbor-walk"], ["mortgage", "harbor-walk"], ["mortgage", "neon-avenue"]] as const) {
    expect(game.apply({ kind, propertyId: id, actor: "p1", expectedRevision: before.revision })).toEqual({ ok: false, reason: "illegal_action" });
    expect(game.snapshot).toBe(before);
  }
});

it("rejects duplicate mortgage, stale sale, non-owner and missing-property operations without advancing a turn", () => {
  const game = propertyMatch();
  const command = { kind: "mortgage" as const, propertyId: "neon-avenue", actor: "p1" as const, expectedRevision: game.snapshot.revision };
  expect(game.apply(command).ok).toBe(true);
  const before = game.snapshot;
  expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
  for (const command of [
    { kind: "mortgage" as const, propertyId: "neon-avenue", actor: "p1" as const, expectedRevision: before.revision },
    { kind: "sell_building" as const, propertyId: "neon-avenue", actor: "p1" as const, expectedRevision: before.revision },
    { kind: "redeem" as const, propertyId: "harbor-walk", actor: "p1" as const, expectedRevision: before.revision },
    { kind: "mortgage" as const, propertyId: "skyline-road", actor: "p1" as const, expectedRevision: before.revision },
    { kind: "mortgage" as const, propertyId: "unknown", actor: "p1" as const, expectedRevision: before.revision },
    { kind: "redeem" as const, propertyId: "neon-avenue", actor: "p2" as const, expectedRevision: before.revision },
  ]) expect(game.apply(command)).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
});

it.each([98, 99])("requires the full principal and rounded fee with %i cash", (cash) => {
  const original = propertyMatch();
  operate(original, "mortgage");
  const state = makeSave(original.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? {
    ...player, cash, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash },
  } : player) });
  const before = game.snapshot;
  expect(game.apply({ kind: "redeem", propertyId: "neon-avenue", actor: "p1", expectedRevision: before.revision }).ok).toBe(cash === 99);
  if (cash === 98) expect(game.snapshot).toBe(before);
  else expect(game.snapshot.players[0]!.cash).toBe(0);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("rounds each sold actual cost and one redemption charge with integer arithmetic", () => {
  expect(constructionRefund(71, QUICK_RULES)).toBe(35);
  expect(redemptionCost(71, QUICK_RULES)).toBe(79);
  expect(redemptionCost(0, QUICK_RULES)).toBe(0);
  expect(() => redemptionCost(Number.MAX_SAFE_INTEGER, QUICK_RULES)).toThrow(RangeError);
});

it.each([
  (raw: any) => { raw.state.players[0].statistics.mortgageIncome += 1; raw.state.players[0].cash += 1; },
  (raw: any) => { raw.state.players[0].statistics.mortgagePrincipalRepaid += 91; raw.state.players[0].cash -= 91; },
  (raw: any) => { raw.state.players[0].statistics.constructionRefunds += 1; raw.state.players[0].cash += 1; },
  (raw: any) => { raw.state.properties["neon-avenue"].mortgagePrincipal = 0; },
  (raw: any) => { raw.state.history.at(-1).event.principal = 89; },
])("rejects corrupted financing state/statistics/history %#", (mutate) => {
  const game = propertyMatch();
  operate(game, "mortgage");
  const raw = JSON.parse(JSON.stringify(makeSave(game.snapshot, propertyMatchId)));
  mutate(raw);
  expect(() => readSave(raw)).toThrow();
});

it("cannot omit or invent redemption fees while retaining an otherwise balanced cash ledger", () => {
  const game = propertyMatch();
  operate(game, "mortgage");
  operate(game, "redeem");
  for (const fee of [0, 91]) {
    const raw = JSON.parse(JSON.stringify(makeSave(game.snapshot, propertyMatchId)));
    raw.state.players[0].cash += 9 - fee;
    raw.state.players[0].statistics.mortgageFeesPaid = fee;
    expect(() => readSave(raw)).toThrow();
  }
});

it("rejects extra command fields rather than allowing payload shape to change turn progression", () => {
  const game = propertyMatch();
  const before = game.snapshot;
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision, propertyId: "neon-avenue" } as any)).toEqual({ ok: false, reason: "invalid_command" });
  expect(game.snapshot).toBe(before);
});
