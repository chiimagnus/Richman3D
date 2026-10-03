import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands, playerAssets } from "../../src/domain/selectors";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "../fixtures/property-match";
import type { Command } from "../../src/domain/types";
import { builtRentDebtMatch } from "../fixtures/debt-match";
import { RuleRandom } from "../../src/domain/random";

function auctionMatch(seats = 2, cash?: readonly number[]): Game {
  let game = new Game(createMatchConfig(940, seats));
  for (let count = 0; count < 20 && game.snapshot.decision.kind !== "awaiting_purchase"; count += 1) {
    expect(game.apply({ kind: "roll", actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  }
  if (cash) {
    const state = makeSave(game.snapshot, propertyMatchId).state;
    game = Game.restore({ ...state, players: state.players.map((player, index) => ({ ...player, cash: cash[index]!, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash[index]! } })) });
  }
  expect(game.apply({ kind: "skip", actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  return game;
}

function respond(game: Game, kind: "auction_bid" | "auction_pass", amount?: number) {
  const before = game.snapshot;
  if (before.decision.kind !== "awaiting_auction") throw new Error("Missing auction");
  const command: Command = kind === "auction_bid" ? { kind, amount: amount!, actor: before.decision.actorId, expectedRevision: before.revision }
    : { kind, actor: before.decision.actorId, expectedRevision: before.revision };
  expect(game.apply(command).ok).toBe(true);
  expect(game.snapshot.random).toEqual(before.random);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  const committed = game.snapshot;
  expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
  expect(game.snapshot).toBe(committed);
}

it("rejects fabricated withdrawals and out-of-order or non-increasing historical bids in a live three-seat auction", () => {
  const game = auctionMatch(3);
  respond(game, "auction_bid", 10);
  const saved = makeSave(game.snapshot, propertyMatchId).state;
  if (saved.decision.kind !== "awaiting_auction") throw new Error("Missing auction");
  expect(saved.decision).toMatchObject({ actorId: "p1", highestBidderId: "p3", withdrawnIds: [] });
  expect(() => Game.restore({ ...saved, decision: { ...saved.decision, withdrawnIds: ["p2"] } })).toThrow();
  respond(game, "auction_bid", 20);
  const next = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...next, history: next.history.map((entry) => entry.event.kind === "auction_bid" && entry.event.actor === "p3" ? { ...entry, event: { ...entry.event, amount: 30 } } : entry) })).toThrow();
  expect(() => Game.restore({ ...next, history: next.history.map((entry) => entry.event.kind === "auction_bid" && entry.event.actor === "p3" ? { ...entry, event: { ...entry.event, actor: "p2" } } : entry) })).toThrow();
  respond(game, "auction_pass");
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_auction", actorId: "p3", withdrawnIds: ["p2"] });
  respond(game, "auction_pass");
  expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe("p1");
  expect(game.snapshot.players.map((player) => player.cash)).toEqual([1480, 1500, 1500]);
});

it("starts with the next seat, includes the original landing player and charges only the final winner", () => {
  const game = auctionMatch();
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_auction", actorId: "p2", landingPlayerId: "p1", highestBid: 0, highestBidderId: null, withdrawnIds: [] });
  respond(game, "auction_bid", 10);
  expect(game.snapshot.players.map((player) => player.cash)).toEqual(before.players.map((player) => player.cash));
  expect(game.snapshot.turnPlayerId).toBe("p1");
  respond(game, "auction_bid", 20);
  expect(game.snapshot.decision).toMatchObject({ actorId: "p2", highestBidderId: "p1" });
  respond(game, "auction_pass");
  expect(game.snapshot.turnPlayerId).toBe("p2");
  expect(game.snapshot.completedRounds).toBe(before.completedRounds);
  expect(game.snapshot.players[0]!.cash).toBe(before.players[0]!.cash - 20);
  expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash);
  expect(playerAssets(game.snapshot, "p1")).toMatchObject({ propertyValue: 180, netAssets: before.players[0]!.cash + 160 });
  expect(game.snapshot.players[0]!.statistics).toMatchObject({ purchases: 20, purchaseBookValue: 180 });
  expect(game.snapshot.history.slice(-4).map((entry) => entry.event.kind)).toEqual(["auction_passed", "auction_ended", "purchased", "turn"]);
});

it.each([3, 4])("%s bidders skip the highest bidder and cannot rejoin after passing", (seats) => {
  const game = auctionMatch(seats);
  const before = game.snapshot;
  const landing = before.turnPlayerId;
  if (before.decision.kind !== "awaiting_auction") throw new Error("Missing auction");
  const winner = before.decision.actorId;
  respond(game, "auction_bid", 40);
  for (let count = 0; count < seats - 1; count += 1) {
    expect(game.snapshot.decision.kind).toBe("awaiting_auction");
    if (game.snapshot.decision.kind !== "awaiting_auction") throw new Error("Missing auction");
    expect(game.snapshot.decision.actorId).not.toBe(winner);
    const passing = game.snapshot.decision.actorId;
    respond(game, "auction_pass");
    expect(legalCommands(game.snapshot, passing)).not.toContainEqual({ kind: "auction_bid", amount: 50, actor: passing, expectedRevision: game.snapshot.revision });
  }
  const propertyId = before.decision.propertyId;
  expect(game.snapshot.properties[propertyId]!.ownerId).toBe(winner);
  expect(game.snapshot.players.find((player) => player.id === winner)!.cash).toBe(before.players.find((player) => player.id === winner)!.cash - 40);
  expect(game.snapshot.turnPlayerId).not.toBe(landing);
});

it("all-pass auctions preserve cash and bank ownership, and zero eligible bidders finish immediately", () => {
  const game = auctionMatch();
  const before = game.snapshot;
  respond(game, "auction_pass");
  respond(game, "auction_pass");
  expect(game.snapshot.players).toEqual(before.players);
  expect(game.snapshot.properties).toEqual(before.properties);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p2" });
  const empty = auctionMatch(2, [0, 9]);
  expect(empty.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p2" });
  expect(empty.snapshot.history.slice(-2)[0]!.event).toMatchObject({ kind: "auction_ended", winnerId: null, price: 0, reason: "no_bidders" });
  expect(readSave(makeSave(empty.snapshot, propertyMatchId)).snapshot).toEqual(empty.snapshot);
});

it.each(["auction_bid", "auction_pass"] as const)("one eligible bidder must explicitly choose %s, not pay automatically", (kind) => {
  const game = auctionMatch(2, [9, 10]);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_auction", actorId: "p2", withdrawnIds: ["p1"] });
  expect(game.snapshot.players[1]!.cash).toBe(10);
  respond(game, kind, 10);
  expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe(kind === "auction_bid" ? "p2" : null);
  expect(game.snapshot.players[1]!.cash).toBe(kind === "auction_bid" ? 0 : 10);
});

it.each([0, 9, 11, 1501, NaN, Infinity, 10.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid bid %s atomically", (amount) => {
  const game = auctionMatch();
  const before = game.snapshot;
  expect(game.apply({ kind: "auction_bid", amount, actor: "p2", expectedRevision: before.revision }).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it("rejects wrong actors, bids below the new minimum and unrelated actions", () => {
  const game = auctionMatch();
  respond(game, "auction_bid", 30);
  const before = game.snapshot;
  for (const command of [
    { kind: "auction_bid", actor: "p1", amount: 30 },
    { kind: "auction_pass", actor: "p2" },
    { kind: "roll", actor: "p1" },
    { kind: "buy", actor: "p1" },
    { kind: "mortgage", actor: "p1", propertyId: "neon-avenue" },
  ]) expect(game.apply({ ...command, expectedRevision: before.revision } as Command).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it("computer bidders apply the same cash reserve and price ceiling through real commands", () => {
  const game = auctionMatch(2, [10, 269]);
  expect((chooseBotAction(observeBot(game.snapshot), "normal")?.command ?? null)?.kind).toBe("auction_pass");
  respond(game, "auction_pass");
  expect(game.snapshot.decision).toMatchObject({ actorId: "p1" });
  const normal = auctionMatch();
  expect((chooseBotAction(observeBot(normal.snapshot), "normal")?.command ?? null)).toMatchObject({ kind: "auction_bid", amount: 10, actor: "p2" });
  expect(normal.apply((chooseBotAction(observeBot(normal.snapshot), "normal")?.command ?? null)!).ok).toBe(true);
  respond(normal, "auction_bid", 180);
  expect((chooseBotAction(observeBot(normal.snapshot), "normal")?.command ?? null)?.kind).toBe("auction_pass");
});

it("the final ordinary turn waits for auction completion before round-limit ranking", () => {
  const checkpoint = auctionMatch();
  respond(checkpoint, "auction_pass");
  respond(checkpoint, "auction_pass");
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, completedRounds: 19 });
  for (const kind of ["roll", "skip"] as const) expect(game.apply({ kind, actor: "p2", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.completedRounds).toBe(19);
  expect(game.snapshot.decision.kind).toBe("awaiting_auction");
  for (let count = 0; count < 2; count += 1) {
    const command = legalCommands(game.snapshot, game.snapshot.decision.kind !== "game_over" ? game.snapshot.decision.actorId : "p1").find((candidate) => candidate.kind === "auction_pass");
    expect(game.apply(command!).ok).toBe(true);
  }
  expect(game.snapshot.completedRounds).toBe(20);
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit" } });
});

it.each([
  (state: any) => { state.decision.highestBid += 1; },
  (state: any) => { state.decision.highestBidderId = state.decision.actorId; },
  (state: any) => { state.decision.withdrawnIds.push(state.decision.actorId); },
  (state: any) => { state.decision.withdrawnIds = ["p1", "p1"]; },
  (state: any) => { state.decision.landingPlayerId = "p4"; },
  (state: any) => { state.decision.continuation = "roll"; },
  (state: any) => { state.decision.propertyId = "city-tax"; },
  (state: any) => { state.decision.actorId = "p4"; },
  (state: any) => { state.decision.actorId = state.turnPlayerId; state.history.at(-1).event.actor = state.turnPlayerId; },
  (state: any) => { state.players[0].statistics.purchaseBookValue += 1; },
])("rejects malformed auctions %# without changing the live match", (mutate) => {
  const game = auctionMatch(3);
  const before = game.snapshot;
  const state = JSON.parse(JSON.stringify(makeSave(before, propertyMatchId).state));
  mutate(state);
  expect(() => Game.restore(state)).toThrow();
  expect(game.snapshot).toBe(before);
});

it("restores an auction longer than the bounded history, preserving deterministic bids and no prepaid cash", () => {
  let game = auctionMatch();
  const original = Game.restore(makeSave(game.snapshot, propertyMatchId).state);
  const cash = game.snapshot.players.map((player) => player.cash);
  for (let count = 0; count < 110; count += 1) {
    const before = game.snapshot;
    if (before.decision.kind !== "awaiting_auction") throw new Error("Expected open auction");
    const command: Command = { kind: "auction_bid", actor: before.decision.actorId, amount: (count + 1) * 10, expectedRevision: before.revision };
    expect(game.apply(command)).toEqual(original.apply(command));
    game = Game.restore(readSave(makeSave(game.snapshot, propertyMatchId)).record.state);
    expect(game.snapshot.players.map((player) => player.cash)).toEqual(cash);
    expect(game.snapshot.random).toEqual(before.random);
  }
  expect(game.snapshot.history).toHaveLength(100);
  respond(game, "auction_pass");
  expect(game.snapshot.players[0]!.cash).toBe(400);
  expect(game.snapshot.players[0]!.statistics).toMatchObject({ purchases: 1100, purchaseBookValue: 180 });
});

it("does not commit a winning quote that would later make settlement overflow net assets", () => {
  const checkpoint = auctionMatch();
  respond(checkpoint, "auction_bid", 10);
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, cash: Number.MAX_SAFE_INTEGER,
    statistics: { ...player.statistics, chanceIncome: Number.MAX_SAFE_INTEGER - 1500 } } : player) });
  const before = game.snapshot;
  expect(game.apply({ kind: "auction_bid", actor: "p1", expectedRevision: before.revision, amount: 20 })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
  expect(legalCommands(before, "p1")[0]).toMatchObject({ kind: "auction_bid", amount: 180 });
  respond(game, "auction_bid", 180);
  respond(game, "auction_pass");
  expect(playerAssets(game.snapshot, "p1").netAssets).toBe(Number.MAX_SAFE_INTEGER);
});

it("rejects an imported highest quote that is cash-affordable but cannot settle within safe net assets", () => {
  const game = auctionMatch();
  respond(game, "auction_bid", 10);
  const state = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...state, players: state.players.map((player) => player.id === "p2" ? { ...player, cash: Number.MAX_SAFE_INTEGER,
    statistics: { ...player.statistics, chanceIncome: Number.MAX_SAFE_INTEGER - 1500 } } : player) })).toThrow("最高报价无法安全成交");
});

it("a bidder below the new minimum can still pass without borrowing or canceling the winning quote", () => {
  const game = auctionMatch(2, [20, 30]);
  respond(game, "auction_bid", 30);
  expect(legalCommands(game.snapshot, "p1")).toEqual([{ kind: "auction_pass", actor: "p1", expectedRevision: game.snapshot.revision }]);
  respond(game, "auction_pass");
  expect(game.snapshot.players[1]!.cash).toBe(0);
  expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe("p2");
});

it("skips a real eliminated seat during bidding without moving the ordinary-turn boundary", () => {
  const checkpoint = builtRentDebtMatch();
  let game = checkpoint;
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const lastPlayer = game.snapshot.turnOrder.filter((id) => !game.snapshot.players.find((player) => player.id === id)!.bankrupt).at(-1)!;
  for (let count = 0; count < 30 && (game.snapshot.decision.kind !== "awaiting_roll" || game.snapshot.turnPlayerId !== lastPlayer); count += 1) expect(game.apply((chooseBotAction(observeBot(game.snapshot), "normal")?.command ?? null)!).ok).toBe(true);
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  const destination = game.snapshot.map.tiles.findIndex((tile) => tile.type === "property" && game.snapshot.properties[tile.id]!.ownerId === null);
  expect(destination).toBeGreaterThanOrEqual(0);
  game = Game.restore({ ...state, completedRounds: game.snapshot.rules.roundLimit - 1,
    players: state.players.map((player) => player.id === lastPlayer ? { ...player, position: (destination - steps + game.snapshot.map.tiles.length) % game.snapshot.map.tiles.length } : player) });
  expect(game.apply({ kind: "roll", actor: lastPlayer, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
  const before = game.snapshot;
  expect(game.apply({ kind: "skip", actor: before.turnPlayerId, expectedRevision: before.revision }).ok).toBe(true);
  for (let count = 0; count < 2; count += 1) {
    expect(game.snapshot.decision.kind).toBe("awaiting_auction");
    if (game.snapshot.decision.kind !== "awaiting_auction") throw new Error("Expected open auction");
    expect(game.snapshot.decision.actorId).not.toBe("p1");
    expect(game.snapshot.turnPlayerId).toBe(before.turnPlayerId);
    respond(game, "auction_pass");
  }
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit" } });
  expect(game.snapshot.completedRounds).toBe(20);
});

it("preserves unsupported v6 input rather than inventing a compatibility auction or book-value ledger", () => {
  const raw = JSON.parse(JSON.stringify(makeSave(new Game(createMatchConfig()).snapshot, propertyMatchId)));
  raw.rulesVersion = raw.state.config.rulesVersion = "city-v6-quick";
  delete raw.state.players[0].statistics.purchaseBookValue;
  const original = JSON.stringify(raw);
  expect(() => readSave(raw)).toThrow("incompatible");
  expect(JSON.stringify(raw)).toBe(original);
});
