import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { upgradeOption, rentFor, netAssets } from "../../src/domain/economy";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { eventText } from "../../src/ui/eventText";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import type { GameSnapshot } from "../../src/domain/types";

function upgrade(game: Game, propertyId: string) {
  return game.apply({ actor: "p1", kind: "upgrade", propertyId, expectedRevision: game.snapshot.revision });
}

it("charges the upgraded rent through real movement, credits exactly once and keeps both saved ledgers balanced", () => {
  const game = propertyMatch();
  expect(upgrade(game, "neon-avenue").ok).toBe(true);
  let charged = false;
  for (let index = 0; index < 80 && game.snapshot.decision.kind !== "game_over"; index += 1) {
    const before = game.snapshot;
    const command = chooseBotCommand(before) ?? legalCommands(before, before.decision.kind === "game_over" ? before.turnPlayerId : before.decision.actorId).find((candidate) => candidate.kind === (before.decision.kind === "awaiting_purchase" ? "skip" : before.decision.kind === "awaiting_auction" ? "auction_pass" : "roll"))!;
    const result = game.apply(command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
    const rolled = result.events.find((event) => event.kind === "rolled");
    if (rolled?.kind === "rolled" && rolled.result.landing.kind === "rent" && rolled.result.landing.propertyId === "neon-avenue") {
      expect(rolled.result.landing.amount).toBe(96);
      expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + rolled.result.startBonus - 96);
      expect(game.snapshot.players[0]!.cash).toBe(before.players[0]!.cash + 96);
      expect(game.snapshot.players[0]!.statistics.rentReceived).toBe(before.players[0]!.statistics.rentReceived + 96);
      charged = true;
      break;
    }
  }
  expect(charged).toBe(true);
});

it("constructs three balanced levels with real cash/statistics, unchanged turn/RNG and replay-safe saved rents", () => {
  const game = propertyMatch();
  const initial = game.snapshot;
  expect(initial.decision).toEqual({ kind: "awaiting_roll", actorId: "p1" });
  for (const level of [1, 2, 3] as const) {
    for (const id of ["harbor-walk", "neon-avenue"]) {
      const before = game.snapshot;
      const option = upgradeOption(before, "p1", id);
      expect(option.reason).toBeNull();
      const command = { kind: "upgrade" as const, actor: "p1" as const, expectedRevision: before.revision, propertyId: id };
      const result = game.apply(command);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.events).toEqual([{ kind: "upgraded", actor: "p1", propertyId: id, level, cost: option.cost }]);
      expect(game.snapshot.properties[id]).toMatchObject({ level, constructionCosts: Array(level).fill(option.cost) });
      expect(game.snapshot.players[0]!.cash).toBe(option.remainingCash);
      expect(rentFor(game.snapshot, id)).toBe(option.nextRent);
      expect(game.snapshot.random).toEqual(initial.random);
      expect(game.snapshot.turnPlayerId).toBe(initial.turnPlayerId);
      expect(game.snapshot.completedRounds).toBe(initial.completedRounds);
      expect(netAssets(game.snapshot, "p1")).toBe(netAssets(initial, "p1"));
      for (const language of ["en", "zh-CN"] as const) expect(eventText(language, result.events[0]!, game.snapshot)).toContain(String(level));
      const restored = Game.restore(readSave(makeSave(game.snapshot, propertyMatchId)).record.state);
      expect(restored.snapshot).toEqual(game.snapshot);
      expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    }
  }
  expect(game.snapshot.players[0]).toMatchObject({ cash: 748, statistics: { constructionSpent: 480 } });
  expect(upgradeOption(game.snapshot, "p1", "neon-avenue").reason).toBe("max_level");
  expect(upgrade(game, "neon-avenue")).toEqual({ ok: false, reason: "illegal_action" });
});

it.each([
  ["incomplete_group", (snapshot: GameSnapshot) => ({ ...snapshot, properties: { ...snapshot.properties, "harbor-walk": { ...snapshot.properties["harbor-walk"]!, ownerId: null } } })],
  ["mortgaged", (snapshot: GameSnapshot) => ({ ...snapshot, properties: { ...snapshot.properties, "harbor-walk": { ...snapshot.properties["harbor-walk"]!, mortgagePrincipal: 70 } } })],
  ["not_turn", (snapshot: GameSnapshot) => ({ ...snapshot, decision: { kind: "awaiting_roll" as const, actorId: "p2" as const }, turnPlayerId: "p2" as const })],
  ["insufficient_cash", (snapshot: GameSnapshot) => ({ ...snapshot, players: snapshot.players.map((player) => player.id === "p1" ? { ...player, cash: 89 } : player) })],
] as const)("projects and rejects %s without changing the source state", (reason, change) => {
  const snapshot = propertyMatch().snapshot;
  const candidate = change(snapshot);
  expect(upgradeOption(candidate, "p1", "neon-avenue").reason).toBe(reason);
  expect(legalCommands(candidate, "p1").some((command) => command.kind === "upgrade" && command.propertyId === "neon-avenue")).toBe(false);
  expect(snapshot.players[0]!.cash).toBe(1228);
  expect(snapshot.properties["neon-avenue"]!.level).toBe(0);
  const saved = makeSave(snapshot, propertyMatchId).state;
  const players = reason === "incomplete_group" ? candidate.players.map((player) => player.id === "p1" ? {
    ...player, statistics: { ...player.statistics, purchases: player.statistics.purchases - 140, purchaseBookValue: player.statistics.purchaseBookValue - 140, taxesPaid: player.statistics.taxesPaid + 140 },
  } : player) : reason === "insufficient_cash" ? candidate.players.map((player) => player.id === "p1" ? {
    ...player, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + 1228 - 89 },
  } : player) : reason === "mortgaged" ? candidate.players.map((player) => player.id === "p1" ? {
    ...player, cash: player.cash + 70, statistics: { ...player.statistics, mortgageIncome: player.statistics.mortgageIncome + 70 },
  } : player) : candidate.players;
  const game = Game.restore({ ...saved, properties: candidate.properties, players, decision: candidate.decision, turnPlayerId: candidate.turnPlayerId });
  const before = game.snapshot;
  expect(upgrade(game, "neon-avenue")).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
});

it("rejects unbalanced, other-owner, missing/non-property and wrong-actor commands atomically", () => {
  const game = propertyMatch();
  expect(upgrade(game, "neon-avenue").ok).toBe(true);
  expect(upgradeOption(game.snapshot, "p1", "neon-avenue").reason).toBe("unbalanced");
  const before = game.snapshot;
  for (const id of ["neon-avenue", "skyline-road", "city-tax", "unknown"]) expect(upgrade(game, id)).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.apply({ kind: "upgrade", propertyId: "harbor-walk", actor: "p2", expectedRevision: before.revision })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
});

it("allows exact-cost construction but rejects one cash unit less and preserves ledger validity", () => {
  for (const cash of [89, 90]) {
    const record = makeSave(propertyMatch().snapshot, propertyMatchId);
    const game = Game.restore({ ...record.state, players: record.state.players.map((player) => player.id === "p1" ? {
      ...player, cash, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash },
    } : player) });
    const before = game.snapshot;
    expect(upgrade(game, "neon-avenue").ok).toBe(cash === 90);
    if (cash === 89) expect(game.snapshot).toBe(before);
    else expect(game.snapshot.players[0]!.cash).toBe(0);
    expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  }
});

it.each([
  (raw: any) => { raw.state.players[0].statistics.constructionSpent += 1; raw.state.players[0].cash -= 1; },
  (raw: any) => { raw.state.properties["neon-avenue"].constructionCosts[0] += 1; },
  (raw: any) => { raw.state.history.at(-1).event.level = 4; },
  (raw: any) => { raw.state.history.at(-1).event.cost = 91; },
  (raw: any) => { raw.state.history.at(-1).event.propertyId = "city-tax"; },
  (raw: any) => { raw.state.history.at(-1).event.actor = "unknown"; },
])("rejects corrupted construction ledger/state/history %# without mutating the game", (mutate) => {
  const game = propertyMatch();
  expect(upgrade(game, "neon-avenue").ok).toBe(true);
  const before = game.snapshot;
  const raw = JSON.parse(JSON.stringify(makeSave(before, propertyMatchId)));
  mutate(raw);
  expect(() => readSave(raw)).toThrow();
  expect(game.snapshot).toBe(before);
});
