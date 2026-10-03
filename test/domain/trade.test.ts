import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { canProposeTrade, tradeOption, tradeResponseReason } from "../../src/domain/market";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { rentFor } from "../../src/domain/economy";
import { netAssets } from "../../src/domain/economy";
import { QUICK_RULES } from "../../src/domain/rules";
import { makeSave, readSave } from "../../src/storage/snapshot";
import type { Command, TradeTerms } from "../../src/domain/types";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import { eventText } from "../../src/ui/eventText";
import { builtRentDebtMatch } from "../fixtures/debt-match";

const terms: TradeTerms = { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 180 } };

function submit(game: Game, offer: TradeTerms = terms) {
  const before = game.snapshot;
  expect(game.apply({ kind: "trade_propose", actor: before.turnPlayerId, expectedRevision: before.revision, terms: offer }).ok).toBe(true);
  expect(game.snapshot.players).toEqual(before.players);
  expect(game.snapshot.properties).toEqual(before.properties);
  expect(game.snapshot.turnPlayerId).toBe(before.turnPlayerId);
  expect(game.snapshot.completedRounds).toBe(before.completedRounds);
  expect(game.snapshot.random).toEqual(before.random);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
}

function respond(game: Game, kind: "trade_accept" | "trade_reject") {
  const before = game.snapshot;
  if (before.decision.kind !== "awaiting_trade") throw new Error("Missing proposal");
  const command: Command = { kind, actor: before.decision.actorId, expectedRevision: before.revision, proposalRevision: before.decision.proposal.revision };
  const result = game.apply(command);
  expect(result.ok).toBe(true);
  expect(game.snapshot.turnPlayerId).toBe(before.turnPlayerId);
  expect(game.snapshot.completedRounds).toBe(before.completedRounds);
  expect(game.snapshot.random).toEqual(before.random);
  expect(game.snapshot.tradeUsed).toBe(true);
  expect(game.snapshot.decision).toEqual({ kind: "awaiting_roll", actorId: before.turnPlayerId });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  for (const event of result.ok ? result.events : []) {
    expect(eventText("en", event, game.snapshot)).not.toContain("undefined");
    expect(eventText("zh-CN", event, game.snapshot)).not.toContain("undefined");
  }
  const committed = game.snapshot;
  expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
  expect(game.snapshot).toBe(committed);
}

it("atomically transfers land and cash, recomputes both group rents and records two-sided conserved ledgers", () => {
  const game = propertyMatch();
  const before = game.snapshot;
  const quote = tradeOption(before, "p1", terms);
  expect(quote.sides?.[0]).toMatchObject({ groupsBefore: ["cyan"], groupsAfter: [], cashBefore: 1780, cashAfter: 1960 });
  submit(game);
  const pending = game.snapshot;
  expect(pending.decision).toMatchObject({ actorId: "p2", proposal: { proposerId: "p1", recipientId: "p2", revision: before.revision + 1 } });
  expect(legalCommands(pending, "p1")).toEqual([]);
  respond(game, "trade_accept");
  const final = game.snapshot;
  expect(final.properties["neon-avenue"]!.ownerId).toBe("p2");
  expect(final.players.map((player) => player.cash)).toEqual([before.players[0]!.cash + 180, before.players[1]!.cash - 180]);
  expect(final.players[0]!.statistics).toMatchObject({ purchases: 320, purchaseBookValue: 320, tradeCashReceived: 180, tradeBookValueGiven: 180 });
  expect(final.players[1]!.statistics).toMatchObject({ tradeCashPaid: 180, tradeBookValueReceived: 180 });
  expect(rentFor(before, "harbor-walk")).toBe(36);
  expect(rentFor(final, "harbor-walk")).toBe(24);
  expect(rentFor(final, "neon-avenue")).toBe(32);
  expect(canProposeTrade(final, "p1")).toBe(false);
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: final.revision, terms }).ok).toBe(false);
  expect(game.snapshot).toBe(final);
});

it("rejecting consumes the opportunity without changing assets, and the next ordinary turn restores the opportunity", () => {
  const game = propertyMatch();
  const before = game.snapshot;
  submit(game);
  respond(game, "trade_reject");
  expect(game.snapshot.players).toEqual(before.players);
  expect(game.snapshot.properties).toEqual(before.properties);
  for (let count = 0; game.snapshot.turnPlayerId === "p1" && count < 10; count += 1) {
    const actor = game.snapshot.decision.kind === "game_over" ? game.snapshot.turnPlayerId : game.snapshot.decision.actorId;
    const commands = legalCommands(game.snapshot, actor);
    const command = commands.find((entry) => entry.kind === "roll" || entry.kind === "buy" || entry.kind === "auction_pass")!;
    expect(game.apply(command).ok).toBe(true);
  }
  expect(game.snapshot.tradeUsed).toBe(false);
  expect(canProposeTrade(game.snapshot, game.snapshot.turnPlayerId)).toBe(true);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it.each(["p1", "p2"] as const)("supports cash-only trades paid by %s before the first dice roll and restores them", (payerId) => {
  const game = new Game(createMatchConfig(940));
  submit(game, { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId, amount: 50 } });
  expect(game.snapshot.lastRoll).toBeNull();
  respond(game, "trade_accept");
  expect(game.snapshot.players.map((player) => player.cash)).toEqual(payerId === "p1" ? [1450, 1550] : [1550, 1450]);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("exchanges property bundles and recomputes complete-group rent for its new owner", () => {
  const game = propertyMatch();
  const ids = game.snapshot.map.tiles.filter((tile) => tile.type === "property" && game.snapshot.properties[tile.id]!.ownerId === "p2").map((tile) => tile.id);
  expect(ids.length).toBeGreaterThan(0);
  submit(game, { ...terms, givePropertyIds: ["neon-avenue", "harbor-walk"], receivePropertyIds: ids.slice(0, 1), cash: null });
  respond(game, "trade_accept");
  expect(rentFor(game.snapshot, "neon-avenue")).toBe(48);
  expect(rentFor(game.snapshot, "harbor-walk")).toBe(36);
  expect(game.snapshot.properties[ids[0]!]!.ownerId).toBe("p1");
});

it.each([
  { ...terms, recipientId: "p1" },
  { ...terms, givePropertyIds: ["neon-avenue", "neon-avenue"] },
  { ...terms, receivePropertyIds: ["neon-avenue"] },
  { ...terms, givePropertyIds: [], receivePropertyIds: [], cash: null },
  { ...terms, cash: { payerId: "p2", amount: -10 } },
  { ...terms, cash: { payerId: "p2", amount: 0 } },
  { ...terms, cash: { payerId: "p2", amount: 1.5 } },
  { ...terms, cash: { payerId: "p2", amount: 9999 } },
  { ...terms, cash: { payerId: "p3", amount: 10 } },
  { ...terms, cash: { payerId: "p2", amount: 10, otherAmount: 10 } },
  { ...terms, givePropertyIds: ["neon-avenue", "harbor-walk", "metro-plaza", "skyline-road"] },
  { ...terms, givePropertyIds: ["missing"] },
  { ...terms, givePropertyIds: null },
  { ...terms, receivePropertyIds: "harbor-walk" },
  { ...terms, extra: true },
])("rejects malformed or illegal terms atomically: %j", (offer) => {
  const game = propertyMatch();
  const before = game.snapshot;
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision, terms: offer as TradeTerms }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it.each(["upgrade", "mortgage"] as const)("checks the entire color group, not only the selected empty property (%s)", (kind) => {
  const game = propertyMatch();
  expect(game.apply({ kind, actor: "p1", expectedRevision: game.snapshot.revision, propertyId: kind === "upgrade" ? "harbor-walk" : "neon-avenue" }).ok).toBe(true);
  const before = game.snapshot;
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision, terms }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
  expect(tradeOption(before, "p1", terms).reason).toBe(kind === "upgrade" ? "group_has_buildings" : "mortgaged");
});

it("only the recipient can respond to the immutable, matching proposal, without a submitted cancel route", () => {
  const game = propertyMatch();
  submit(game);
  const before = game.snapshot;
  for (const command of [
    { kind: "trade_accept", actor: "p1", proposalRevision: before.revision },
    { kind: "trade_accept", actor: "p2", proposalRevision: before.revision - 1 },
    { kind: "trade_reject", actor: "p1", proposalRevision: before.revision },
    { kind: "roll", actor: "p2" }, { kind: "trade_cancel", actor: "p1" },
    { kind: "trade_accept", actor: "p2", proposalRevision: before.revision, terms },
  ]) {
    expect(game.apply({ ...command, expectedRevision: before.revision } as Command).ok).toBe(false);
    expect(game.snapshot).toBe(before);
  }
  expect(Object.isFrozen(before.decision)).toBe(true);
});

it("restores a proposal without replaying its economic effects and rejects forged ownership, cash, actors and usage", () => {
  const game = propertyMatch();
  submit(game);
  const saved = makeSave(game.snapshot, propertyMatchId).state;
  const restored = Game.restore(saved);
  expect(restored.snapshot).toEqual(game.snapshot);
  respond(game, "trade_accept");
  respond(restored, "trade_accept");
  expect(restored.snapshot).toEqual(game.snapshot);
  if (saved.decision.kind !== "awaiting_trade") throw new Error("Missing proposal");
  for (const mutation of [
    { tradeUsed: false },
    { decision: { kind: "awaiting_roll", actorId: "p1" } },
    { decision: { ...saved.decision, actorId: "p1" } },
    { decision: { ...saved.decision, proposal: { ...saved.decision.proposal, revision: saved.revision - 1 } } },
    { decision: { ...saved.decision, proposal: { ...saved.decision.proposal, cash: { payerId: "p2", amount: 99999 } } } },
    { properties: { ...saved.properties, "neon-avenue": { ...saved.properties["neon-avenue"], ownerId: "p2" } } },
    { history: saved.history.slice(0, -1) },
    { players: saved.players.map((player) => ({ ...player, statistics: { ...player.statistics, tradeCashReceived: 1 } })) },
  ]) expect(() => Game.restore({ ...saved, ...mutation })).toThrow();
  const finished = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...finished, decision: saved.decision })).toThrow();
  expect(() => Game.restore({ ...finished, tradeUsed: false })).toThrow();
  expect(() => Game.restore({ ...finished, history: finished.history.slice(-1) })).toThrow();
});

it("allows an equal-value land-and-cash exchange with no bank money or duplicate purchase", () => {
  const game = propertyMatch();
  const before = game.snapshot;
  submit(game, { recipientId: "p2", givePropertyIds: ["neon-avenue", "harbor-walk"], receivePropertyIds: ["skyline-road"], cash: { payerId: "p2", amount: 80 } });
  expect(tradeResponseReason(game.snapshot)).toBe("fair_value");
  respond(game, "trade_accept");
  expect(game.snapshot.players.map((player) => netAssets(game.snapshot, player.id))).toEqual(before.players.map((player) => netAssets(before, player.id)));
  expect(game.snapshot.players.reduce((total, player) => total + player.cash, 0)).toBe(before.players.reduce((total, player) => total + player.cash, 0));
  expect(game.snapshot.players.map((player) => player.statistics.purchases)).toEqual(before.players.map((player) => player.statistics.purchases));
});

it("never proposes to an eliminated recipient or accepts a proposal after cash or ownership has changed", () => {
  const game = builtRentDebtMatch();
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const before = game.snapshot;
  const offer: TradeTerms = { recipientId: "p1", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: before.turnPlayerId, amount: 10 } };
  expect(game.apply({ kind: "trade_propose", actor: before.turnPlayerId, expectedRevision: before.revision, terms: offer }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
  const pending = propertyMatch();
  submit(pending);
  const snapshot = pending.snapshot;
  expect(tradeOption({ ...snapshot, players: snapshot.players.map((player) => player.id === "p2" ? { ...player, cash: 0 } : player) }, "p1", terms).reason).toBe("insufficient_cash");
  expect(tradeOption({ ...snapshot, properties: { ...snapshot.properties, "neon-avenue": { ...snapshot.properties["neon-avenue"]!, ownerId: "p2" } } }, "p1", terms).reason).toBe("not_owner");
});

it("rejects unsafe final cash, net assets and cumulative statistics before a proposal can lock the turn", () => {
  const cash = new Game(createMatchConfig(940), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER - 10 });
  const original = cash.snapshot;
  const cashTerms: TradeTerms = { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p1", amount: 50 } };
  expect(tradeOption(original, "p1", cashTerms).reason).toBe("amount_overflow");
  expect(cash.apply({ kind: "trade_propose", actor: "p1", expectedRevision: 0, terms: cashTerms }).ok).toBe(false);
  expect(cash.snapshot).toBe(original);
  const seed = propertyMatch();
  const saved = makeSave(seed.snapshot, propertyMatchId).state;
  const headroom = Number.MAX_SAFE_INTEGER - netAssets(seed.snapshot, "p2");
  const assets = Game.restore({ ...saved, players: saved.players.map((player) => player.id === "p2" ? { ...player, cash: player.cash + headroom, statistics: { ...player.statistics, chanceIncome: player.statistics.chanceIncome + headroom } } : player) });
  const gift = { ...terms, cash: null };
  expect(tradeOption(assets.snapshot, "p1", gift).reason).toBe("amount_overflow");
  const capped = Game.restore({ ...saved, players: saved.players.map((player) => ({ ...player, statistics: { ...player.statistics, tradeCashReceived: Number.MAX_SAFE_INTEGER, tradeCashPaid: Number.MAX_SAFE_INTEGER } })) });
  const before = capped.snapshot;
  expect(capped.apply({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision, terms }).ok).toBe(false);
  expect(capped.snapshot).toBe(before);
});

it.each([3, 4])("%s-seat proposals route only to the recipient and leave every other player unchanged", (seats) => {
  const game = new Game(createMatchConfig(940, seats));
  const before = game.snapshot;
  const recipientId = before.players.find((player) => player.id !== before.turnPlayerId)!.id;
  submit(game, { recipientId, givePropertyIds: [], receivePropertyIds: [], cash: { payerId: before.turnPlayerId, amount: 30 } });
  respond(game, "trade_accept");
  for (const player of before.players.filter((entry) => entry.id !== recipientId && entry.id !== before.turnPlayerId)) expect(game.snapshot.players.find((entry) => entry.id === player.id)).toEqual(player);
});

it("does not migrate or mutate the previous unpublished rule format", () => {
  const saved = makeSave(propertyMatch().snapshot, propertyMatchId);
  const raw = { ...saved, rulesVersion: "city-v7-quick", state: { ...saved.state, config: { ...saved.state.config, rulesVersion: "city-v7-quick" } } };
  const original = JSON.stringify(raw);
  expect(() => readSave(raw)).toThrow("incompatible");
  expect(JSON.stringify(raw)).toBe(original);
});

it("retains the used opportunity and restores when bounded history clips the opening proposal or its response", () => {
  const game = propertyMatch();
  submit(game);
  respond(game, "trade_accept");
  for (let count = 0; count < 100; count += 1) {
    expect(game.apply({ kind: count % 2 === 0 ? "mortgage" : "redeem", actor: "p1", expectedRevision: game.snapshot.revision, propertyId: "harbor-walk" }).ok).toBe(true);
    const restored = Game.restore(makeSave(game.snapshot, propertyMatchId).state);
    expect(restored.snapshot).toEqual(game.snapshot);
    expect(canProposeTrade(restored.snapshot, "p1")).toBe(false);
    if (count === 98) expect(game.snapshot.history[0]!.event.kind).toBe("trade_accepted");
  }
  expect(game.snapshot.history).toHaveLength(100);
  expect(game.snapshot.history.some(({ event }) => event.kind.startsWith("trade"))).toBe(false);
  expect(game.snapshot.players[0]!.cash).toBe(1610);
  expect(game.snapshot.tradeUsed).toBe(true);
});

it("the bot responds conservatively using only current public value and records a stable readable reason", () => {
  for (const amount of [180, 181]) {
    const game = propertyMatch();
    submit(game, { ...terms, cash: { payerId: "p2", amount } });
    expect(tradeResponseReason(game.snapshot)).toBe(amount === 180 ? "fair_value" : "lower_value");
    const command = chooseBotCommand(game.snapshot)!;
    expect(command.kind).toBe(amount === 180 ? "trade_accept" : "trade_reject");
    expect(game.apply(command).ok).toBe(true);
    const event = game.snapshot.history.at(-1)!.event;
    expect(event).toMatchObject({ reason: amount === 180 ? "fair_value" : "lower_value" });
    const english = eventText("en", event, game.snapshot);
    expect(english).toContain(amount === 180 ? "Incoming value covers" : "Incoming value is lower");
    expect(eventText("en", event, readSave(makeSave(game.snapshot, propertyMatchId)).snapshot)).toBe(english);
  }
});
