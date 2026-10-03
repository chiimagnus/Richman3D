import { expect, it } from "vitest";
import { botReserve, chooseBotAction, observeBot } from "../../src/domain/bot";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { BOT_DIFFICULTIES, type BotDifficulty, type Command, type PlayerId } from "../../src/domain/types";
import { legalCommands } from "../../src/domain/selectors";
import { completeGroup, netAssets, rentFor } from "../../src/domain/economy";
import { STANDARD_RULES } from "../../src/domain/rules";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import { builtRentDebtMatch, debtMatch } from "../fixtures/debt-match";
import { fullHandCheckpoint, itemCheckpoint } from "../fixtures/items";

function asBot(game: Game, difficulty: BotDifficulty = "normal"): Game {
  const state = makeSave(game.snapshot, propertyMatchId).state;
  if (state.decision.kind === "game_over") throw new Error("Missing decision");
  const actor = state.decision.actorId;
  return Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player,
    controller: player.id === actor ? "bot" : "human", difficulty })) } });
}

function relocate(game: Game, position: number, cash?: number): Game {
  const state = makeSave(game.snapshot, propertyMatchId).state;
  if (state.decision.kind === "game_over") throw new Error("Missing decision");
  const actor = state.decision.actorId;
  return Game.restore({ ...state, players: state.players.map((player) => player.id === actor ? { ...player, position,
    cash: cash ?? player.cash, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - (cash ?? player.cash) } } : player) });
}

function applyChoice(game: Game, difficulty?: BotDifficulty) {
  const before = game.snapshot;
  const action = chooseBotAction(observeBot(before), difficulty)!;
  expect(action).not.toBeNull();
  expect(game.apply(action.command).ok).toBe(true);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  return action;
}

function advanceTo(game: Game, actor: PlayerId): void {
  for (let count = 0; count < 50; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.decision.actorId === actor) return;
    if (snapshot.decision.kind === "game_over") break;
    const command = legalCommands(snapshot, snapshot.decision.actorId).find((command) => ["roll", "skip", "auction_pass", "discard_item"].includes(command.kind));
    if (!command || !game.apply(command).ok) throw new Error("Could not advance checkpoint");
  }
  throw new Error("Missing ordinary turn");
}

function splitGroup(): Game {
  const game = propertyMatch();
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: ["harbor-walk"], receivePropertyIds: [], cash: null } }).ok).toBe(true);
  const response = legalCommands(game.snapshot, "p2").find((command) => command.kind === "trade_accept")!;
  expect(game.apply(response).ok).toBe(true);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  advanceTo(game, "p2");
  expect(game.apply({ kind: "roll", actor: "p2", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  advanceTo(game, "p1");
  return game;
}

it.each(BOT_DIFFICULTIES)("%s uses the same public 36-outcome risk model and preserves the chosen difficulty on restore", (difficulty) => {
  const game = new Game(createMatchConfig(940));
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const bot = asBot(relocate(game, 3, 480), difficulty);
  const observation = observeBot(bot.snapshot)!;
  expect(observation.difficulty).toBe(difficulty);
  expect(botReserve(observation, difficulty)).toBe(difficulty === "easy" ? 400 : difficulty === "normal" ? 281 : 280);
  expect(applyChoice(bot)).toMatchObject({ command: { kind: difficulty === "easy" ? "skip" : "buy" }, reason: difficulty === "easy" ? "reserve_cash" : "buy_property" });
});

it.each(BOT_DIFFICULTIES)("%s refuses an affordable purchase that would leave less than its public cash-risk reserve", (difficulty) => {
  const game = new Game(createMatchConfig(940));
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const bot = asBot(relocate(game, 3, 280), difficulty);
  expect(legalCommands(bot.snapshot, "p1").some((command) => command.kind === "buy")).toBe(true);
  expect(applyChoice(bot)).toMatchObject({ command: { kind: "skip" }, reason: "reserve_cash" });
  expect(bot.snapshot.players[0]!.cash).toBe(280);
});

it.each(BOT_DIFFICULTIES)("%s terminates bidding at its actual price ceiling without consuming RNG or money on a pass", (difficulty) => {
  const game = new Game(createMatchConfig(940));
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  expect(game.apply({ kind: "skip", actor: "p1", expectedRevision: 1 }).ok).toBe(true);
  const bot = asBot(game, difficulty);
  for (let count = 0; count < 40; count += 1) {
    const before = bot.snapshot;
    const observation = observeBot(before);
    if (observation) {
      const action = chooseBotAction(observation)!;
      if (action.command.kind === "auction_bid") expect(action.command.amount).toBeLessThanOrEqual(180 * (difficulty === "easy" ? 0.65 : difficulty === "normal" ? 0.9 : 1));
      expect(bot.apply(action.command).ok).toBe(true);
      expect(bot.snapshot.random).toEqual(before.random);
      if (action.command.kind === "auction_pass") {
        expect(bot.snapshot.players.find((player) => player.id === action.command.actor)!.cash).toBe(before.players.find((player) => player.id === action.command.actor)!.cash);
        expect(action.reason).toBe("reserve_cash");
        return;
      }
    } else {
      if (before.decision.kind !== "awaiting_auction") throw new Error("Bot did not enforce ceiling");
      const bid = legalCommands(before, before.decision.actorId).find((command) => command.kind === "auction_bid")!;
      expect(bot.apply(bid).ok).toBe(true);
    }
  }
  throw new Error("Unbounded auction");
});

it.each(BOT_DIFFICULTIES)("%s uses legal construction, respects its level/reserve budget and never sells or mortgages outside debt", (difficulty) => {
  const initial = propertyMatch();
  const state = makeSave(initial.snapshot, propertyMatchId).state;
  const game = asBot(Game.restore({ ...state, players: state.players.map((player) => player.id === "p2" ? { ...player, position: 17 } : player) }), difficulty);
  for (let count = 0; count < 10; count += 1) {
    const before = game.snapshot;
    const observation = observeBot(before)!;
    const action = chooseBotAction(observation)!;
    expect(["mortgage", "sell_building"]).not.toContain(action.command.kind);
    if (action.command.kind === "roll") {
      expect(before.properties["harbor-walk"]!.level).toBe(difficulty === "easy" ? 1 : 3);
      expect(before.properties["neon-avenue"]!.level).toBe(difficulty === "easy" ? 1 : 3);
      return;
    }
    expect(action.reason).toBe("upgrade_income");
    expect(game.apply(action.command).ok).toBe(true);
    expect(game.snapshot.players[0]!.cash).toBeGreaterThanOrEqual(botReserve(observation, difficulty));
    expect(game.snapshot.random).toEqual(before.random);
  }
  throw new Error("Unbounded construction");
});

it("hard does not invest in a group when no opponent's public next-roll outcomes can reach it", () => {
  const game = asBot(propertyMatch(), "hard");
  expect(chooseBotAction(observeBot(game.snapshot))).toMatchObject({ command: { kind: "roll" }, reason: "roll" });
});

it.each(BOT_DIFFICULTIES)("%s values a trade's completed group rather than relying on the removed flat book-value policy", (difficulty) => {
  const game = splitGroup();
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 190 } } }).ok).toBe(true);
  const bot = asBot(game, difficulty);
  expect(observeBot(bot.snapshot)!.trade).toMatchObject({ gain: -10, groupGain: 320 });
  expect(applyChoice(bot)).toMatchObject({ command: { kind: difficulty === "easy" ? "trade_reject" : "trade_accept" }, reason: difficulty === "easy" ? "unfair_trade" : "fair_trade" });
});

it.each(BOT_DIFFICULTIES)("%s charges the hard strategy's opportunity cost when a profitable sale completes an opponent's group", (difficulty) => {
  const game = splitGroup();
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: [], receivePropertyIds: ["harbor-walk"], cash: { payerId: "p1", amount: 165 } } }).ok).toBe(true);
  const bot = asBot(game, difficulty);
  expect(observeBot(bot.snapshot)!.trade).toMatchObject({ gain: 25, opponentGroupGain: 320 });
  expect(applyChoice(bot)).toMatchObject({ command: { kind: difficulty === "hard" ? "trade_reject" : "trade_accept" }, reason: difficulty === "hard" ? "unfair_trade" : "fair_trade" });
});

it("proposes one legal cash offer to complete its group, then the recipient evaluates the real opponent opportunity cost", () => {
  const game = asBot(splitGroup(), "hard");
  const before = game.snapshot;
  const action = applyChoice(game);
  expect(action).toMatchObject({ reason: "complete_group", command: { kind: "trade_propose", terms: { receivePropertyIds: ["harbor-walk"], cash: { payerId: "p1", amount: 188 } } } });
  expect(game.snapshot.players).toEqual(before.players);
  expect(game.snapshot.properties).toEqual(before.properties);
  const response = asBot(game, "hard");
  expect(applyChoice(response)).toMatchObject({ command: { kind: "trade_accept" }, reason: "fair_trade" });
  expect(completeGroup(response.snapshot, response.snapshot.map.tiles[1] as Extract<typeof response.snapshot.map.tiles[number], { type: "property" }>)).toBe(true);
  expect(response.snapshot.players.reduce((sum, player) => sum + player.cash, 0)).toBe(before.players.reduce((sum, player) => sum + player.cash, 0));
  expect(response.snapshot.players.reduce((sum, player) => sum + netAssets(response.snapshot, player.id), 0)).toBe(before.players.reduce((sum, player) => sum + netAssets(before, player.id), 0));
  expect(observeBot(response.snapshot)).toBeNull();
});

it.each(BOT_DIFFICULTIES)("%s rejects an unfavorable pure-cash request rather than allowing a cash transfer", (difficulty) => {
  const game = propertyMatch();
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p2", amount: 1 } } }).ok).toBe(true);
  const bot = asBot(game, difficulty);
  const before = bot.snapshot;
  expect(applyChoice(bot)).toMatchObject({ command: { kind: "trade_reject" }, reason: "unfair_trade" });
  expect(bot.snapshot.players).toEqual(before.players);
  expect(bot.snapshot.properties).toEqual(before.properties);
});

it("redemption scores include the income recovered on the other member of a mortgaged group", () => {
  const game = propertyMatch();
  expect(game.apply({ kind: "mortgage", propertyId: "neon-avenue", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const bot = asBot(game);
  expect(rentFor(bot.snapshot, "neon-avenue")).toBe(0);
  expect(rentFor(bot.snapshot, "harbor-walk")).toBe(24);
  const option = observeBot(bot.snapshot)!.liquidity.find((option) => option.command.kind === "redeem")!;
  expect(option).toMatchObject({ rentLoss: -60, valueLoss: 9, cost: 99 });
  expect(option.rentChanges).toEqual([{ propertyId: "harbor-walk", currentRent: 24, nextRent: 36 }, { propertyId: "neon-avenue", currentRent: 0, nextRent: 48 }]);
  expect(applyChoice(bot)).toMatchObject({ command: { kind: "redeem", propertyId: "neon-avenue" }, reason: "redeem_income" });
  expect(rentFor(bot.snapshot, "neon-avenue")).toBe(48);
  expect(rentFor(bot.snapshot, "harbor-walk")).toBe(36);
});

it("hard redeems for the other group member's reachable income even when its own property cannot be reached next roll", () => {
  const game = new Game({ ...createMatchConfig(13, 4), rulesVersion: STANDARD_RULES.version });
  for (let count = 0; count < 400; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.decision.actorId === "p1" && ["neon-avenue", "harbor-walk"].every((id) => snapshot.properties[id]!.ownerId === "p1")) break;
    if (snapshot.decision.kind === "game_over") throw new Error("No complete group");
    const kind = snapshot.decision.kind === "awaiting_purchase" ? snapshot.decision.actorId === "p1" && ["neon-avenue", "harbor-walk"].includes(snapshot.decision.propertyId) ? "buy" : "skip"
      : snapshot.decision.kind === "awaiting_auction" ? "auction_pass" : snapshot.decision.kind === "awaiting_discard" ? "discard_item" : "roll";
    const command = legalCommands(snapshot, snapshot.decision.actorId).find((command) => command.kind === kind)!;
    expect(game.apply(command).ok).toBe(true);
  }
  expect(game.apply({ kind: "mortgage", propertyId: "harbor-walk", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const bot = asBot(Game.restore({ ...state, players: state.players.map((player) => player.id !== "p1" ? { ...player, position: 0 } : player) }), "hard");
  const observation = observeBot(bot.snapshot)!;
  expect(observation.players.filter((player) => player.id !== "p1").every((player) => player.position === 0)).toBe(true);
  expect(observation.liquidity.find((option) => option.command.kind === "redeem")!.rentChanges).toEqual([
    { propertyId: "harbor-walk", currentRent: 0, nextRent: 36 }, { propertyId: "neon-avenue", currentRent: 32, nextRent: 48 },
  ]);
  expect(applyChoice(bot)).toMatchObject({ command: { kind: "redeem", propertyId: "harbor-walk" }, reason: "redeem_income" });
});

it("combines multiple mortgages without counting the same group bonus twice, preserving the cheaper sufficient rental income", () => {
  const initial = builtRentDebtMatch(3, false, true);
  const state = makeSave(initial.snapshot, propertyMatchId).state;
  const game = asBot(Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 276,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid - 246 } } : player) }));
  for (const propertyId of ["harbor-walk", "neon-avenue"]) expect(game.apply({ kind: "sell_building", actor: "p1", expectedRevision: game.snapshot.revision, propertyId }).ok).toBe(true);
  expect(game.snapshot.players[0]!.cash).toBe(356);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 516 } });
  expect(applyChoice(game)).toMatchObject({ command: { kind: "mortgage", propertyId: "harbor-walk" }, reason: "debt_rescue" });
  expect(applyChoice(game)).toMatchObject({ command: { kind: "mortgage", propertyId: "neon-avenue" }, reason: "debt_rescue" });
  expect(game.snapshot.players[0]!.cash).toBe(0);
  expect(game.snapshot.properties["central-station"]!.mortgagePrincipal).toBe(0);
  expect(rentFor(game.snapshot, "central-station")).toBe(48);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p3" });
});

it.each([0, 30])("rescues a real built-group debt with %s cash using minimal sufficient current liquidity and legal balanced sales", (cash) => {
  const game = asBot(debtMatch(cash, 3));
  const random = game.snapshot.random;
  const commands: Command[] = [];
  for (let count = 0; count < 10 && game.snapshot.decision.kind === "awaiting_debt"; count += 1) commands.push(applyChoice(game).command);
  expect(commands.map((command) => "propertyId" in command ? command.propertyId : command.kind)).toEqual(cash === 0 ? ["harbor-walk", "neon-avenue", "neon-avenue"] : ["harbor-walk", "neon-avenue", "harbor-walk"]);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_roll", actorId: "p2" });
  expect(game.snapshot.random).toEqual(random);
  expect(game.snapshot.players[0]!.cash).toBe(cash === 0 ? 5 : 25);
});

it("holds a low-benefit tax coupon instead of consuming it before a roll", () => {
  const game = asBot(relocate(itemCheckpoint("tax-discount"), 12));
  const before = game.snapshot;
  expect(applyChoice(game)).toMatchObject({ command: { kind: "roll" }, reason: "roll" });
  expect(game.snapshot.history.filter((entry) => entry.revision > before.revision).some((entry) => entry.event.kind === "item_used")).toBe(false);
});

it("uses a construction coupon for a real immediate upgrade and pays the shared query's discounted amount once", () => {
  const game = itemCheckpoint("construction-discount", true);
  const controlled = legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item" && command.total === 2)!;
  expect(game.apply(controlled).ok).toBe(true);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  advanceTo(game, "p1");
  const bot = asBot(game);
  const before = bot.snapshot;
  expect(applyChoice(bot)).toMatchObject({ command: { kind: "use_item", instanceId: "construction-discount:1" }, reason: "use_item" });
  expect(bot.snapshot.players[0]!.cash).toBe(before.players[0]!.cash);
  expect(applyChoice(bot)).toMatchObject({ command: { kind: "upgrade", propertyId: "neon-avenue" }, reason: "upgrade_income" });
  expect(bot.snapshot.players[0]!.cash).toBe(before.players[0]!.cash - 72);
  expect(bot.snapshot.properties["neon-avenue"]!.constructionCosts).toEqual([72]);
  expect(bot.snapshot.activeItem).toBeNull();
  expect(bot.snapshot.deck.discardPile.filter((id) => id === "construction-discount:1")).toHaveLength(1);
  expect(bot.snapshot.random).toEqual(before.random);
});

it("uses a waiver for public rental risk but keeps it when the opponent's actual mortgage makes rent zero", () => {
  const initial = itemCheckpoint("rent-waiver", true);
  const useful = asBot(relocate(initial, 0), "hard");
  expect(applyChoice(useful)).toMatchObject({ command: { kind: "use_item", instanceId: "rent-waiver:2" }, reason: "use_item" });
  expect(initial.apply({ kind: "roll", actor: "p1", expectedRevision: initial.snapshot.revision }).ok).toBe(true);
  advanceTo(initial, "p2");
  expect(initial.apply({ kind: "mortgage", actor: "p2", expectedRevision: initial.snapshot.revision, propertyId: "skyline-road" }).ok).toBe(true);
  expect(initial.apply({ kind: "roll", actor: "p2", expectedRevision: initial.snapshot.revision }).ok).toBe(true);
  advanceTo(initial, "p1");
  const mortgaged = asBot(relocate(initial, 0), "hard");
  expect(observeBot(mortgaged.snapshot)!.properties.find((property) => property.tile.id === "skyline-road")!.rent).toBe(0);
  expect(chooseBotAction(observeBot(mortgaged.snapshot))).toMatchObject({ command: { kind: "roll" }, reason: "roll" });
});

it("uses a position swap only when public landing prospects improve, with the real positions swapped once", () => {
  const base = itemCheckpoint("swap-positions");
  const state = makeSave(base.snapshot, propertyMatchId).state;
  const helpful = asBot(Game.restore({ ...state, players: state.players.map((player) => ({ ...player, position: player.id === "p1" ? 3 : 15 })) }));
  const random = helpful.snapshot.random;
  expect(applyChoice(helpful)).toMatchObject({ command: { kind: "use_item", instanceId: "swap-positions:2", targetId: "p2" }, reason: "use_item" });
  expect(helpful.snapshot.players.map((player) => player.position)).toEqual([15, 3]);
  expect(helpful.snapshot.random).toEqual(random);
  const unhelpful = asBot(Game.restore({ ...state, players: state.players.map((player) => ({ ...player, position: 3 })) }));
  expect(chooseBotAction(observeBot(unhelpful.snapshot))!.command.kind).toBe("roll");
});

it("discards deterministically by value, not the just-drawn order or a hidden random number", () => {
  const game = asBot(fullHandCheckpoint(), "hard");
  const before = game.snapshot;
  expect(applyChoice(game)).toMatchObject({ command: { kind: "discard_item", instanceId: "swap-positions:2" }, reason: "keep_valuable" });
  expect(game.snapshot.players[0]!.hand).toContain(before.players[0]!.hand.at(-1)!);
  expect(game.snapshot.random).toEqual(before.random);
});

it.each(BOT_DIFFICULTIES)("%s finishes deterministic 2/3/4-seat quick and standard games with the same rules and no private-information advantage", (difficulty) => {
  for (const seats of [2, 3, 4]) for (const rulesVersion of [createMatchConfig().rulesVersion, STANDARD_RULES.version]) {
    const config = createMatchConfig(31, seats);
    const game = new Game({ ...config, rulesVersion, players: config.players.map((player) => ({ ...player, controller: "bot", difficulty })) });
    for (let count = 0; count < 1500 && game.snapshot.decision.kind !== "game_over"; count += 1) {
      const action = chooseBotAction(observeBot(game.snapshot))!;
      expect(game.apply(action.command).ok).toBe(true);
      const { rules: _rules, map: _map, ...state } = game.snapshot;
      expect(Game.restore(state).snapshot).toEqual(game.snapshot);
    }
    expect(game.snapshot.decision.kind).toBe("game_over");
  }
});
