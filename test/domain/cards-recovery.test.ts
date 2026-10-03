import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { cardInstances, cardType } from "../../src/domain/cards";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import { RuleRandom } from "../../src/domain/random";
import { QUICK_RULES, STANDARD_RULES } from "../../src/domain/rules";
import { makeSave, readSave } from "../../src/storage/snapshot";
import type { Command, GameSnapshot, MatchConfig } from "../../src/domain/types";
import { fullHandCheckpoint, itemLandingCheckpoint } from "../fixtures/items";
import { propertyMatchId } from "../fixtures/property-match";

function execute(game: Game, command: Command) {
  const result = game.apply(command);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function checkpoint(config: MatchConfig, revision: number): Game {
  const game = new Game(config);
  while (game.snapshot.revision < revision) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") throw new Error("Match ended before checkpoint");
    const kind = snapshot.decision.kind === "awaiting_purchase" ? "skip" : snapshot.decision.kind === "awaiting_auction" ? "auction_pass"
      : snapshot.decision.kind === "awaiting_discard" ? "discard_item" : snapshot.decision.kind === "awaiting_debt" ? "bankrupt" : "roll";
    execute(game, legalCommands(snapshot, snapshot.decision.actorId).find((command) => command.kind === kind)!);
  }
  return game;
}

function recover(snapshot: GameSnapshot): Game {
  const ids = [...snapshot.deck.drawPile, ...snapshot.deck.discardPile, ...(snapshot.deck.pending ? [snapshot.deck.pending] : []),
    ...snapshot.players.flatMap((player) => player.hand), ...(snapshot.activeItem ? [snapshot.activeItem.instanceId] : [])];
  expect(ids).toHaveLength(24);
  expect(new Set(ids)).toEqual(new Set(cardInstances(snapshot.rules)));
  const saved = makeSave(snapshot, propertyMatchId);
  const game = Game.restore(readSave(saved).record.state);
  expect(game.snapshot).toEqual(snapshot);
  return game;
}

function withFine(game: Game): Game {
  const snapshot = game.snapshot;
  const state = makeSave(snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  return Game.restore({ ...state, players: state.players.map((player) => player.id === state.turnPlayerId ? { ...player,
    position: (11 - steps + snapshot.map.tiles.length) % snapshot.map.tiles.length, cash: 30,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - 30 },
  } : player) });
}

it.each(["human", "bot"] as const)("cleans pending, active and private hands once after a %s bankruptcy with complete history", (controller) => {
  const original = checkpoint(createMatchConfig(10), 44);
  const state = makeSave(original.snapshot, propertyMatchId).state;
  let game = withFine(Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? controller : "human" })) } }));
  const command = legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item" && cardType(command.instanceId) === "rent-waiver")!;
  execute(game, command);
  game = recover(game.snapshot);
  execute(game, { kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  const before = game.snapshot;
  expect(before.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 90 } });
  expect(before.deck.pending).toBe("maintenance-cost:1");
  expect(before.activeItem?.instanceId).toBe("rent-waiver:1");
  expect(before.history.length).toBeLessThan(100);
  game = recover(before);
  const bankruptcy = controller === "bot" ? chooseBotCommand(game.snapshot)! : legalCommands(game.snapshot, "p1").find((command) => command.kind === "bankrupt")!;
  expect(bankruptcy.kind).toBe("bankrupt");
  const result = execute(game, bankruptcy);
  expect(result.events.map((event) => event.kind)).toEqual(["liquidated", "paid", "ended"]);
  expect(game.snapshot.players[0]).toMatchObject({ bankrupt: true, cash: 0, hand: [], statistics: { chanceExpense: 120, debtWrittenOff: 60 } });
  expect(game.snapshot.deck.discardPile.slice(before.deck.discardPile.length)).toEqual([before.deck.pending, ...before.players[0]!.hand, before.activeItem!.instanceId, ...before.players[1]!.hand]);
  expect(game.snapshot.activeItem).toBeNull();
  expect(game.snapshot.itemUsed).toBe(false);
  expect(game.snapshot.random).toEqual(before.random);
  const after = game.snapshot;
  expect(game.apply(bankruptcy)).toEqual({ ok: false, reason: "stale_revision" });
  expect(game.snapshot).toBe(after);
  recover(after);
});

it("restores all ten held entities across four players plus an active item and pending debt, without clearing survivors", () => {
  let game = withFine(checkpoint({ ...createMatchConfig(1, 4), rulesVersion: STANDARD_RULES.version }, 410));
  const before = game.snapshot;
  expect(before.turnPlayerId).toBe("p3");
  expect(before.players.map((player) => player.hand.length)).toEqual([1, 3, 3, 3]);
  execute(game, legalCommands(before, "p3").find((command) => command.kind === "use_item" && cardType(command.instanceId) === "construction-discount")!);
  game = recover(game.snapshot);
  execute(game, { kind: "roll", actor: "p3", expectedRevision: game.snapshot.revision });
  const debt = game.snapshot;
  expect(debt.players.reduce((count, player) => count + player.hand.length, 0)).toBe(9);
  expect(debt.deck.pending).toBe("maintenance-cost:2");
  expect(debt.activeItem?.instanceId).toBe("construction-discount:2");
  expect(debt.decision).toMatchObject({ kind: "awaiting_debt", actorId: "p3", debt: { amount: 90 } });
  game = recover(debt);
  const command = legalCommands(game.snapshot, "p3").find((command) => command.kind === "bankrupt")!;
  const result = execute(game, command);
  expect(result.events.map((event) => event.kind)).toEqual(["liquidated", "paid", "turn"]);
  expect(game.snapshot.turnPlayerId).toBe("p4");
  expect(game.snapshot.players.filter((player) => player.id !== "p3").map((player) => player.hand)).toEqual(before.players.filter((player) => player.id !== "p3").map((player) => player.hand));
  expect(game.snapshot.deck.discardPile.slice(debt.deck.discardPile.length)).toEqual([debt.deck.pending, ...debt.players[2]!.hand, debt.activeItem!.instanceId]);
  expect(game.snapshot.activeItem).toBeNull();
  expect(game.snapshot.itemUsed).toBe(false);
  expect(game.snapshot.random).toEqual(debt.random);
  recover(game.snapshot);
});

it.each(["buy", "auction"] as const)("keeps an unused effect through a purchase decision and expires it only after %s completes", (choice) => {
  let game = itemLandingCheckpoint("construction-discount", 5);
  execute(game, legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item")!);
  const instanceId = game.snapshot.activeItem!.instanceId;
  execute(game, { kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
  expect(game.snapshot.activeItem?.instanceId).toBe(instanceId);
  game = recover(game.snapshot);
  execute(game, { kind: choice === "buy" ? "buy" : "skip", actor: "p1", expectedRevision: game.snapshot.revision });
  if (choice === "auction") {
    for (const actor of ["p2", "p1"] as const) {
      expect(game.snapshot.activeItem?.instanceId).toBe(instanceId);
      game = recover(game.snapshot);
      execute(game, legalCommands(game.snapshot, actor).find((command) => command.kind === "auction_bid")!);
    }
    game = recover(game.snapshot);
    execute(game, { kind: "auction_pass", actor: "p2", expectedRevision: game.snapshot.revision });
  }
  expect(game.snapshot.turnPlayerId).toBe("p2");
  expect(game.snapshot.activeItem).toBeNull();
  expect(game.snapshot.itemUsed).toBe(false);
  expect(game.snapshot.deck.discardPile.filter((id) => id === instanceId)).toHaveLength(1);
  recover(game.snapshot);
});

it.each(["trade_accept", "trade_reject"] as const)("preserves an active item and the once-per-turn quota while another player chooses %s", (kind) => {
  let game = itemLandingCheckpoint("construction-discount", 5);
  execute(game, legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item")!);
  const before = game.snapshot;
  execute(game, { kind: "trade_propose", actor: "p1", expectedRevision: before.revision,
    terms: { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p1", amount: 10 } } });
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_trade", actorId: "p2" });
  game = recover(game.snapshot);
  execute(game, legalCommands(game.snapshot, "p2").find((command) => command.kind === kind)!);
  expect(game.snapshot.activeItem).toEqual(before.activeItem);
  expect(game.snapshot.itemUsed).toBe(true);
  expect(game.snapshot.turnPlayerId).toBe("p1");
  expect(legalCommands(game.snapshot, "p1").some((command) => command.kind === "use_item")).toBe(false);
  recover(game.snapshot);
});

it.each([
  [13, "innovation-bonus"], [10, "maintenance-cost"], [79, "community-event"], [42, "traffic-fine"],
  [8, "advance-three"], [55, "retreat-three"], [9, "return-start"], [145, "rent-waiver"], [119, "controlled-dice"],
  [11, "tax-discount"], [7, "construction-discount"], [14, "swap-positions"],
] as const)("seed %s draws %s through the production command and restores the same committed outcome", (seed, type) => {
  const game = new Game(createMatchConfig(seed));
  const result = execute(game, { kind: "roll", actor: game.snapshot.turnPlayerId, expectedRevision: 0 });
  const rolled = result.events[0]!;
  if (rolled.kind !== "rolled") throw new Error("Missing production roll");
  const landing = rolled.result.landing;
  const definition = QUICK_RULES.chanceCards.find((card) => card.id === type)!;
  if (definition.kind === "item") {
    expect(landing).toEqual({ kind: "item_received" });
    expect(cardType(game.snapshot.players.find((player) => player.id === rolled.result.playerId)!.hand[0]!)).toBe(type);
  } else expect(landing).toMatchObject({ cardId: type });
  recover(game.snapshot);
});

it("rejects a four-card decision claiming an item was already used this turn, even when earlier hand history is clipped", () => {
  const game = fullHandCheckpoint();
  const state = JSON.parse(JSON.stringify(makeSave(game.snapshot, propertyMatchId).state));
  state.itemUsed = true;
  state.revision += 1;
  state.history.pop();
  state.history.push({ revision: state.revision - 1, event: { kind: "item_used", actor: "p1", instanceId: "swap-positions:1", total: null, targetId: "p2" } },
    { revision: state.revision, event: game.snapshot.history.at(-1)!.event });
  state.history = state.history.slice(-100);
  const bytes = JSON.stringify(state);
  expect(() => Game.restore(state)).toThrow();
  expect(JSON.stringify(state)).toBe(bytes);
});

it("expires the last ordinary turn's unused effect before round-limit settlement and returns every remaining hand", () => {
  let game = checkpoint({ ...createMatchConfig(1, 4), rulesVersion: STANDARD_RULES.version }, 410);
  while (!(game.snapshot.completedRounds === STANDARD_RULES.roundLimit - 1 && game.snapshot.turnPlayerId === game.snapshot.turnOrder.at(-1) && game.snapshot.decision.kind === "awaiting_roll")) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") throw new Error("Ended before last ordinary turn");
    const kind = snapshot.decision.kind === "awaiting_purchase" ? "skip" : snapshot.decision.kind === "awaiting_auction" ? "auction_pass" : "roll";
    execute(game, legalCommands(snapshot, snapshot.decision.actorId).find((command) => command.kind === kind)!);
  }
  const actor = game.snapshot.turnPlayerId;
  const command = legalCommands(game.snapshot, actor).find((command) => command.kind === "use_item" && cardType(command.instanceId) === "construction-discount")!;
  expect(command).toBeDefined();
  execute(game, command);
  const instanceId = game.snapshot.activeItem!.instanceId;
  game = recover(game.snapshot);
  const before = game.snapshot;
  let ended = 0;
  for (;;) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") break;
    const kind = snapshot.decision.kind === "awaiting_purchase" ? "skip" : snapshot.decision.kind === "awaiting_auction" ? "auction_pass" : "roll";
    const result = execute(game, legalCommands(snapshot, snapshot.decision.actorId).find((command) => command.kind === kind)!);
    expect(result.events.filter((event) => event.kind === "turn")).toEqual([]);
    ended += result.events.filter((event) => event.kind === "ended").length;
    game = recover(game.snapshot);
  }
  expect(ended).toBe(1);
  expect(game.snapshot.deck.discardPile.filter((id) => id === instanceId)).toHaveLength(1);
  expect(game.snapshot.players.every((player) => player.hand.length === 0)).toBe(true);
  expect(game.snapshot.activeItem).toBeNull();
  expect(game.snapshot.itemUsed).toBe(false);
  expect(game.snapshot.completedRounds).toBe(before.completedRounds + 1);
});

it("recycles only discarded entities while ten items stay in their actual owners' hands, including the last draw and final-round cleanup", () => {
  let game = checkpoint({ ...createMatchConfig(1, 4), rulesVersion: STANDARD_RULES.version }, 410);
  const held = game.snapshot.players.flatMap((player) => player.hand);
  expect(held).toHaveLength(10);
  let recycled = 0;
  let lastDraws = 0;
  for (;;) {
    if (game.snapshot.decision.kind === "awaiting_roll") {
      const state = makeSave(game.snapshot, propertyMatchId).state;
      const random = new RuleRandom(state.random);
      const steps = random.integer(6) + random.integer(6) + 2;
      game = Game.restore({ ...state, players: state.players.map((player) => player.id === state.turnPlayerId ? { ...player, position: (11 - steps + game.snapshot.map.tiles.length) % game.snapshot.map.tiles.length } : player) });
    }
    const before = game.snapshot;
    if (before.decision.kind === "game_over") break;
    const kind = before.decision.kind === "awaiting_purchase" ? "skip" : before.decision.kind === "awaiting_auction" ? "auction_pass"
      : before.decision.kind === "awaiting_discard" ? "discard_item" : before.decision.kind === "awaiting_debt" ? "bankrupt" : "roll";
    const result = execute(game, legalCommands(before, before.decision.actorId).find((command) => command.kind === kind)!);
    const drew = result.events.some((event) => event.kind === "rolled" && ["chance", "movement_card", "item_received"].includes(event.result.landing.kind));
    if (drew && before.deck.drawPile.length === 0) recycled += 1;
    if (drew && before.deck.drawPile.length === 1) lastDraws += 1;
    if (game.snapshot.decision.kind !== "game_over") {
      expect(game.snapshot.players.flatMap((player) => player.hand)).toEqual(held);
      expect(game.snapshot.deck.drawPile.every((id) => !held.includes(id))).toBe(true);
      expect(game.snapshot.deck.discardPile.every((id) => !held.includes(id))).toBe(true);
    }
    game = recover(game.snapshot);
  }
  expect(recycled).toBeGreaterThan(1);
  expect(lastDraws).toBeGreaterThan(1);
  expect(game.snapshot.players.every((player) => player.hand.length === 0)).toBe(true);
  expect(game.snapshot.deck.pending).toBeNull();
  expect(game.snapshot.activeItem).toBeNull();
  expect(game.snapshot.itemUsed).toBe(false);
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit" } });
});
