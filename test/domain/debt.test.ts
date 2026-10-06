import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { canDeclareBankruptcy, propertyValue } from "../../src/domain/economy";
import { legalCommands } from "../../src/domain/selectors";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { debtCheckpoint, debtMatch, rentDebtMatch, chanceDebtMatch, builtRentDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

it("keeps the fixed payment through partial sales and restore, then pays and advances exactly once", () => {
  let game = debtMatch(30, 3);
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 120 } });
  for (const [propertyId, cash] of [["neon-avenue", 75], ["harbor-walk", 110], ["neon-avenue", 35]] as const) {
    const command = { kind: "sell_building" as const, propertyId, actor: "p1" as const, expectedRevision: game.snapshot.revision };
    expect(game.apply(command).ok).toBe(true);
    expect(game.snapshot.players[0]!.cash).toBe(cash);
    expect(game.snapshot.random).toEqual(before.random);
    const committed = game.snapshot;
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.snapshot).toBe(committed);
    game = Game.restore(readSave(makeSave(committed, propertyMatchId)).record.state);
    expect(game.snapshot).toEqual(committed);
  }
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p2" });
  expect(game.snapshot.history.slice(-3).map((entry) => entry.event.kind)).toEqual(["building_sold", "paid", "turn"]);
});

it("requires selling every building before bankruptcy even when their refunds cannot cover the payment", () => {
  const game = debtMatch(0, 1);
  const before = game.snapshot;
  expect(canDeclareBankruptcy(before, "p1")).toBe(false);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
  for (const propertyId of ["neon-avenue", "harbor-walk"]) {
    expect(legalCommands(game.snapshot, "p1").every((command) => command.kind === "sell_building")).toBe(true);
    expect(game.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
    expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  }
  expect(game.snapshot.players[0]!.cash).toBe(80);
  expect(legalCommands(game.snapshot, "p1").map((command) => command.kind)).toEqual(["bankrupt"]);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]).toMatchObject({ cash: 0, bankrupt: true, statistics: { debtWrittenOff: 40 } });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("requires selling zero-refund buildings too and restores the actual costs without inventing money", () => {
  const state = makeSave(debtMatch(0, 1).snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, properties: { ...state.properties,
    "neon-avenue": { ...state.properties["neon-avenue"]!, constructionCosts: [1] },
    "harbor-walk": { ...state.properties["harbor-walk"]!, constructionCosts: [1] } },
    players: state.players.map((player) => player.id === "p1" ? { ...player, statistics: { ...player.statistics,
      constructionSpent: player.statistics.constructionSpent - 158, taxesPaid: player.statistics.taxesPaid + 158 } } : player) });
  for (const propertyId of ["neon-avenue", "harbor-walk"]) {
    expect(canDeclareBankruptcy(game.snapshot, "p1")).toBe(false);
    expect(game.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
    expect(game.snapshot.players[0]!.cash).toBe(0);
    expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  }
  expect(canDeclareBankruptcy(game.snapshot, "p1")).toBe(true);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]!.statistics).toMatchObject({ constructionSoldCost: 2, constructionRefunds: 0, debtWrittenOff: 120 });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("finishes the final round only after enough buildings are sold and the fixed payment completes", () => {
  const state = makeSave(builtRentDebtMatch(3).snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, completedRounds: 19,
    deck: { ...state.deck, discardPile: [...state.deck.discardPile, ...state.players[2]!.hand] },
    players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 500,
      statistics: { ...player.statistics, chanceIncome: player.statistics.chanceIncome + 500 - player.cash } }
      : player.id === "p3" ? { ...player, bankrupt: true, cash: 0, hand: [], statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash, debtWrittenOff: 1 } } : player) });
  const before = game.snapshot;
  expect(before.turnOrder.filter((id) => !before.players.find((player) => player.id === id)!.bankrupt).at(-1)).toBe("p1");
  expect(game.apply({ kind: "sell_building", propertyId: "neon-avenue", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit" } });
  expect(game.snapshot.completedRounds).toBe(20);
  expect(game.snapshot.history.slice(-3).map((entry) => entry.event.kind)).toEqual(["building_sold", "paid", "ended"]);
  expect(game.snapshot.players[0]!.cash).toBe(29);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it.each([0, 30])("a debt bot with %s cash sells legally until payment or bankruptcy without looping or consuming RNG", (cash) => {
  const state = makeSave(debtMatch(cash, 3).snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human" })) } });
  const random = game.snapshot.random;
  for (let count = 0; count < 10 && game.snapshot.decision.kind === "awaiting_debt"; count += 1) {
    const command = chooseBotAction(observeBot(game.snapshot))!.command;
    expect(command.kind).toBe("sell_building");
    expect(game.apply(command).ok).toBe(true);
    expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  }
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p2" });
  expect(game.snapshot.random).toEqual(random);
});

it("credits real rent only after a building sale and rolls back the entire sale if the creditor overflows", () => {
  const base = rentDebtMatch(30, 1);
  const state = makeSave(base.snapshot, propertyMatchId).state;
  const before = base.snapshot;
  if (before.decision.kind !== "awaiting_debt") throw new Error("Missing rent");
  expect(base.apply({ kind: "sell_building", propertyId: "neon-avenue", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(base.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + before.decision.debt.amount);
  expect(base.snapshot.players[0]!.cash).toBe(75 - before.decision.debt.amount);
  expect(readSave(makeSave(base.snapshot, propertyMatchId)).snapshot).toEqual(base.snapshot);
  const cash = Number.MAX_SAFE_INTEGER - propertyValue(before, "p2");
  const rich = Game.restore({ ...state, players: state.players.map((player) => player.id === "p2" ? { ...player, cash,
    statistics: { ...player.statistics, chanceIncome: Number(BigInt(player.statistics.chanceIncome) + BigInt(cash) - BigInt(player.cash)) } } : player) });
  const initial = rich.snapshot;
  expect(rich.apply({ kind: "sell_building", propertyId: "neon-avenue", actor: "p1", expectedRevision: initial.revision })).toEqual({ ok: false, reason: "calculation_failed" });
  expect(rich.snapshot).toBe(initial);
});

it("bare land cannot raise payment cash; bankruptcy transfers only the real remaining cash", () => {
  const game = rentDebtMatch();
  const before = game.snapshot;
  expect(canDeclareBankruptcy(before, "p1")).toBe(true);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash + 30);
  expect(game.snapshot.players[0]).toMatchObject({ cash: 0, bankrupt: true });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("settles an unpaid cash card on bankruptcy without drawing or discarding it twice", () => {
  const game = chanceDebtMatch();
  const before = game.snapshot;
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]).toMatchObject({ cash: 0, bankrupt: true, statistics: { chanceExpense: 30, debtWrittenOff: 60 } });
  expect(game.snapshot.deck.pending).toBeNull();
  expect(game.snapshot.deck.discardPile.filter((id) => id === before.deck.pending)).toHaveLength(1);
  expect(game.snapshot.random).toEqual(before.random);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it.each([119, 120])("charges a tax only when %s cash is sufficient", (cash) => {
  const game = debtCheckpoint(cash);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]!.cash).toBe(cash < 120 ? cash : 0);
  expect(game.snapshot.decision.kind).toBe(cash < 120 ? "awaiting_debt" : "awaiting_roll");
});

it.each([
  (raw: any) => { raw.decision.debt.amount += 1; },
  (raw: any) => { raw.decision.debt.creditorId = "p1"; },
  (raw: any) => { raw.decision.debt.continuation = "roll"; },
  (raw: any) => { raw.players[0].cash = -1; },
  (raw: any) => { raw.decision.actorId = "p2"; },
  (raw: any) => { raw.players[0].position = 9; },
])("rejects malformed fixed payment checkpoints %#", (mutate) => {
  const game = debtMatch();
  const before = game.snapshot;
  const raw = JSON.parse(JSON.stringify(makeSave(before, propertyMatchId).state));
  mutate(raw);
  expect(() => Game.restore(raw)).toThrow();
  expect(game.snapshot).toBe(before);
});

it("cannot escape or resurrect a fixed payment by another action or restoring the paid decision", () => {
  const game = debtMatch(100, 1);
  const before = game.snapshot;
  for (const kind of ["roll", "buy", "skip"] as const) expect(game.apply({ kind, actor: "p1", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.apply({ kind: "sell_building", propertyId: "neon-avenue", actor: "p2", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
  expect(game.apply({ kind: "sell_building", propertyId: "neon-avenue", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  const state = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...state, turnPlayerId: "p1", decision: before.decision })).toThrow();
});
