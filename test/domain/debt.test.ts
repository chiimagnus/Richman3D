import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { RuleRandom } from "../../src/domain/random";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { canDeclareBankruptcy, liquidationValue, propertyValue } from "../../src/domain/economy";
import type { Command } from "../../src/domain/types";
import { debtCheckpoint, debtMatch, rentDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";
import { propertyMatch } from "../fixtures/property-match";

it("keeps cash nonnegative and debt fixed through restored balanced sales, then pays and advances only once", () => {
  let game = debtMatch(30, 3);
  const before = game.snapshot;
  expect(before.players[0]!.cash).toBe(30);
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 120, creditorId: null, continuation: "finish_turn" } });
  expect(canDeclareBankruptcy(before, "p1")).toBe(false);
  for (const [propertyId, cash] of [["neon-avenue", 75], ["harbor-walk", 110], ["neon-avenue", 35]] as const) {
    const command: Command = { kind: "sell_building", propertyId, actor: "p1", expectedRevision: game.snapshot.revision };
    const result = game.apply(command);
    expect(result.ok).toBe(true);
    expect(game.snapshot.players[0]!.cash).toBe(cash);
    expect(game.snapshot.random).toEqual(before.random);
    expect(game.snapshot.completedRounds).toBe(before.completedRounds);
    const committed = game.snapshot;
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.snapshot).toBe(committed);
    game = Game.restore(readSave(makeSave(committed, propertyMatchId)).record.state);
    expect(game.snapshot).toEqual(committed);
  }
  expect(game.snapshot.turnPlayerId).toBe("p2");
  expect(game.snapshot.decision.kind).toBe("awaiting_roll");
  expect(game.snapshot.players[0]!.statistics.taxesPaid).toBe(before.players[0]!.statistics.taxesPaid + 120);
  expect(game.snapshot.history.slice(-3).map((entry) => entry.event.kind)).toEqual(["building_sold", "paid", "turn"]);
});

it.each([119, 120])("with cash %s, charges a due fee only when sufficient and does not rank a final unresolved turn", (cash) => {
  const checkpoint = debtCheckpoint(cash);
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, completedRounds: 19, turnPlayerId: "p1", turnOrder: state.turnOrder });
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: state.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]!.cash).toBe(cash < 120 ? cash : 0);
  expect(game.snapshot.decision.kind).toBe(cash < 120 ? "awaiting_debt" : "awaiting_roll");
  expect(game.snapshot.completedRounds).toBe(19);
  if (cash < 120) {
    expect(game.apply({ kind: "mortgage", propertyId: "harbor-walk", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
    expect(game.snapshot.players[0]!.cash).toBe(69);
  }
});

it("pays a creditor only after a real mortgage rescues the debtor, then saves the actual transfer", () => {
  const game = rentDebtMatch();
  const before = game.snapshot;
  if (before.decision.kind !== "awaiting_debt") throw new Error("Missing debt");
  expect(before.decision.debt.source.kind).toBe("rent");
  expect(game.apply({ kind: "mortgage", actor: "p1", propertyId: "neon-avenue", expectedRevision: before.revision }).ok).toBe(true);
  const paid = game.snapshot.history.find((entry) => entry.revision === game.snapshot.revision && entry.event.kind === "paid")?.event;
  expect(paid).toMatchObject({ kind: "paid", amount: before.decision.debt.amount, writtenOff: 0 });
  expect(game.snapshot.players[0]!.cash).toBe(120 - before.decision.debt.amount);
  expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + before.decision.debt.amount);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("bankruptcy converts only available assets and credits actual cash, never the uncollectible balance", () => {
  const game = rentDebtMatch(30, true);
  const before = game.snapshot;
  expect(before.decision.kind).toBe("awaiting_debt");
  const bankrupt = legalCommands(before, before.turnPlayerId).find((command) => command.kind === "bankrupt");
  expect(bankrupt).toBeDefined();
  expect(game.apply(bankrupt!).ok).toBe(true);
  const payer = before.players.find((player) => player.id === before.turnPlayerId)!;
  const available = payer.cash + liquidationValue(before, payer.id);
  const payment = game.snapshot.history.find((entry) => entry.revision === game.snapshot.revision && entry.event.kind === "paid")?.event;
  expect(payment).toMatchObject({ kind: "paid", amount: available, writtenOff: before.decision.kind === "awaiting_debt" ? before.decision.debt.amount - available : 0 });
  expect(game.snapshot.players.find((player) => player.id === payer.id)).toMatchObject({ cash: 0, bankrupt: true });
  expect(available).toBe(30);
  expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + 30);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it.each(["roll", "buy", "skip", "upgrade", "redeem"] as const)("debt rejects %s, other actors and premature bankruptcy without state/RNG changes", (kind) => {
  const game = debtMatch();
  const before = game.snapshot;
  const command = { kind, actor: "p1", expectedRevision: before.revision, ...(["upgrade", "redeem"].includes(kind) ? { propertyId: "neon-avenue" } : {}) } as Command;
  expect(game.apply(command).ok).toBe(false);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.apply({ kind: "mortgage", propertyId: "neon-avenue", actor: "p2", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it("a debt bot chooses legal higher levels and finishes rescue instead of selling an illegal low level", () => {
  const base = debtMatch(0, 3);
  const state = makeSave(base.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human" })) } });
  for (let count = 0; count < 20 && game.snapshot.decision.kind === "awaiting_debt"; count += 1) {
    const before = game.snapshot;
    const command = chooseBotCommand(before);
    expect(command).not.toBeNull();
    expect(legalCommands(before, "p1")).toContainEqual(command);
    expect(game.apply(command!).ok).toBe(true);
    expect(game.snapshot.random).toEqual(before.random);
    expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  }
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p2" });
  expect(game.snapshot.players[0]!.cash).toBe(40);
});

it("a computer with no recoverable assets confirms a complete, saved liquidation", () => {
  const checkpoint = debtCheckpoint();
  for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(checkpoint.apply({ kind: "mortgage", propertyId, actor: "p1", expectedRevision: checkpoint.snapshot.revision }).ok).toBe(true);
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human" })) },
    players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 30, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + 160 } } : player) });
  expect(game.apply(chooseBotCommand(game.snapshot)!).ok).toBe(true);
  const command = chooseBotCommand(game.snapshot)!;
  expect(command.kind).toBe("bankrupt");
  expect(game.apply(command).ok).toBe(true);
  expect(game.snapshot.players[0]).toMatchObject({ cash: 0, bankrupt: true, statistics: { mortgagePrincipalReleased: 160, debtWrittenOff: 90 } });
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { winnerIds: ["p2"] } });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("a fixed rent bankruptcy liquidates an unmortgaged estate and credits only actual available cash", () => {
  const checkpoint = propertyMatch();
  for (let level = 0; level < 3; level += 1) for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(checkpoint.apply({ kind: "upgrade", propertyId, actor: "p1", expectedRevision: checkpoint.snapshot.revision }).ok).toBe(true);
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  const game = Game.restore({ ...state, turnPlayerId: "p2", decision: { kind: "awaiting_roll", actorId: "p2" }, players: state.players.map((player) => player.id === "p2" ? { ...player, cash: 0, position: (23 - steps) % 20,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash } } : player) });
  expect(game.apply({ kind: "roll", actor: "p2", expectedRevision: state.revision }).ok).toBe(true);
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 336, creditorId: "p1" } });
  expect(before.players[1]!.cash).toBe(200);
  expect(game.apply({ kind: "bankrupt", actor: "p2", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]!.cash).toBe(before.players[0]!.cash + 320);
  expect(game.snapshot.players[0]!.statistics.rentLost).toBe(16);
  expect(game.snapshot.players[1]).toMatchObject({ cash: 0, bankrupt: true, statistics: { mortgageIncome: 120, mortgagePrincipalReleased: 120, rentPaid: before.players[1]!.statistics.rentPaid + 320, debtWrittenOff: 16 } });
  expect(game.snapshot.properties["skyline-road"]).toEqual({ ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("the last fixed seat's pending debt blocks round-limit ranking until one atomic rescue settles it", () => {
  const checkpoint = propertyMatch();
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  const game = Game.restore({ ...state, completedRounds: 19, turnPlayerId: "p2", decision: { kind: "awaiting_roll", actorId: "p2" }, players: state.players.map((player) => player.id === "p2" ? { ...player, cash: 30, position: 14 - steps,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - 30 } } : player) });
  expect(game.apply({ kind: "roll", actor: "p2", expectedRevision: state.revision }).ok).toBe(true);
  expect(game.snapshot.completedRounds).toBe(19);
  expect(game.snapshot.decision.kind).toBe("awaiting_debt");
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  expect(game.apply({ kind: "mortgage", propertyId: "skyline-road", actor: "p2", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.completedRounds).toBe(20);
  expect(game.snapshot.players[1]!.cash).toBe(30);
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit" } });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("negative chance expenses use the same fixed debt and rescue payment without drawing another card", () => {
  const checkpoint = new Game(createMatchConfig(36, 3));
  for (const kind of ["roll", "buy"] as const) expect(checkpoint.apply({ kind, actor: "p1", expectedRevision: checkpoint.snapshot.revision }).ok).toBe(true);
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, turnPlayerId: "p1", decision: { kind: "awaiting_roll", actorId: "p1" }, players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 30,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - 30 } } : player) });
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: state.revision }).ok).toBe(true);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 50, source: { kind: "chance", cardId: "traffic-fine" } } });
  const before = game.snapshot;
  expect(game.apply({ kind: "mortgage", propertyId: "river-market", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]!.cash).toBe(80);
  expect(game.snapshot.players[0]!.statistics.chanceExpense).toBe(before.players[0]!.statistics.chanceExpense + 50);
  expect(game.snapshot.random).toEqual(before.random);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it.each([
  (raw: any) => { raw.decision.debt.amount += 1; },
  (raw: any) => { raw.decision.debt.creditorId = "p1"; },
  (raw: any) => { raw.decision.debt.source.amount = 80; raw.decision.debt.amount = 80; },
  (raw: any) => { raw.decision.debt.continuation = "roll"; },
  (raw: any) => { raw.decision.debt.source.kind = "chance"; },
  (raw: any) => { raw.players[0].cash = -1; },
  (raw: any) => { raw.decision.actorId = "p2"; },
  (raw: any) => { raw.players[0].position = 9; },
  (raw: any) => { raw.players[0].cash = 120; raw.players[0].statistics.taxesPaid -= 90; },
  (raw: any) => { raw.history.push(raw.history.at(-1)); },
  (raw: any) => { raw.players[1].statistics.rentLost = 1; },
])("rejects malformed debt checkpoints %# without altering a live match", (mutate) => {
  const game = debtMatch();
  const before = game.snapshot;
  const raw = JSON.parse(JSON.stringify(makeSave(before, propertyMatchId).state));
  mutate(raw);
  expect(() => Game.restore(raw)).toThrow();
  expect(game.snapshot).toBe(before);
});

it("restore cannot resurrect a previously paid obligation by switching the actor back to the former debtor", () => {
  const game = debtMatch();
  const debt = game.snapshot.decision;
  expect(game.apply({ kind: "mortgage", propertyId: "neon-avenue", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const state = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...state, turnPlayerId: "p1", decision: debt })).toThrow("债务已经结清");
});

it("a failing creditor credit atomically rolls back rescue, transfer, property and every statistic", () => {
  const game = rentDebtMatch();
  const debtState = makeSave(game.snapshot, propertyMatchId).state;
  const cash = Number.MAX_SAFE_INTEGER - propertyValue(game.snapshot, "p2");
  const rich = Game.restore({ ...debtState, players: debtState.players.map((player) => player.id === "p2" ? { ...player, cash,
    statistics: { ...player.statistics, chanceIncome: player.statistics.chanceIncome + cash - player.cash } } : player) });
  const before = rich.snapshot;
  const command: Command = { kind: "mortgage", propertyId: "neon-avenue", actor: "p1", expectedRevision: before.revision };
  expect(rich.apply(command)).toEqual({ ok: false, reason: "calculation_failed" });
  expect(rich.snapshot).toBe(before);
});
