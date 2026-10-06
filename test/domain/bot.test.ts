import { expect, it } from "vitest";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands, publicProperty } from "../../src/domain/selectors";
import { saleOption, upgradeOption } from "../../src/domain/economy";
import { makeSave } from "../../src/storage/snapshot";
import type { GameSnapshot } from "../../src/domain/types";
import { fullHandCheckpoint, itemCheckpoint } from "../fixtures/items";
import { builtRentDebtMatch, chanceDebtMatch, debtMatch } from "../fixtures/debt-match";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";

function observation(snapshot: GameSnapshot) {
  return observeBot({ ...snapshot, config: { ...snapshot.config, players: snapshot.config.players.map((player) => ({ ...player, controller: "bot" })) } })!;
}

it("constructs a real whitelist with only the actor's hand, public property/position data and bounded legal commands", () => {
  const game = fullHandCheckpoint();
  const snapshot = game.snapshot;
  const visible = observation(snapshot);
  expect(visible.hand).toEqual(snapshot.players[0]!.hand);
  expect(visible.players).toEqual(snapshot.players.map((player) => ({ id: player.id, cash: player.cash, position: player.position, bankrupt: player.bankrupt })));
  expect(visible.properties).toEqual(snapshot.map.tiles.filter((tile) => tile.type === "property").map((tile) => publicProperty(snapshot, tile.id)));
  expect(visible.actions).toEqual(legalCommands(snapshot, "p1"));
  expect(visible.actions).toHaveLength(4);
  for (const key of ["config", "random", "deck", "history", "seed", "inputSeed", "drawPile", "discardPile", "pending"]) expect(JSON.stringify(visible)).not.toContain(`"${key}":`);
  for (const player of visible.players) expect(Object.keys(player)).toEqual(["id", "cash", "position", "bankrupt"]);
  const before = JSON.stringify(snapshot);
  (visible.hand as string[]).pop();
  visible.properties[0]!.constructionCosts.push(1);
  expect(JSON.stringify(snapshot)).toBe(before);
});

it("does not change an observation or policy output when hidden RNG, deck order, history or opponent hands change", () => {
  const snapshot = itemCheckpoint("controlled-dice").snapshot;
  const randomBefore = { ...snapshot.random };
  const visible = observation(snapshot);
  const hiddenChanged = { ...snapshot,
    random: { ...snapshot.random, state: snapshot.random.state ^ 0xffff, draws: snapshot.random.draws + 1000 },
    deck: { ...snapshot.deck, drawPile: [...snapshot.deck.drawPile].reverse(), discardPile: [...snapshot.deck.discardPile].reverse() }, history: [],
    config: { ...snapshot.config, seed: snapshot.config.seed + 1 },
    players: snapshot.players.map((player) => player.id === visible.actorId ? player : { ...player, hand: [...player.hand, "rent-waiver:2" as const] }),
  };
  expect(observation(hiddenChanged)).toEqual(visible);
  expect(chooseBotAction(observation(hiddenChanged), "normal")).toEqual(chooseBotAction(visible, "normal"));
  for (let count = 0; count < 10; count += 1) chooseBotAction(observation(snapshot), "normal");
  expect(snapshot.random).toEqual(randomBefore);
});

it("projects real upgrade and rescue economics instead of independently recalculating rule amounts", () => {
  for (const game of [propertyMatch(), debtMatch(30, 3)]) {
    const snapshot = game.snapshot;
    const visible = observation(snapshot);
    for (const option of visible.upgrades) {
      const actual = upgradeOption(snapshot, visible.actorId, option.command.propertyId);
      expect(option).toMatchObject({ cost: actual.cost, currentRent: actual.currentRent, nextRent: actual.nextRent });
    }
    for (const option of visible.liquidity) {
      const actual = saleOption(snapshot, visible.actorId, option.command.propertyId);
      expect(option).toMatchObject({ cost: actual.cost, proceeds: actual.proceeds });
    }
  }
});

it("selects a legal command with a reason in every real nonterminal decision and never bypasses the rule validator", () => {
  const purchase = new Game(createMatchConfig(940));
  expect(purchase.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const trade = propertyMatch();
  expect(trade.apply({ kind: "trade_propose", actor: "p1", expectedRevision: trade.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p1", amount: 10 } } }).ok).toBe(true);
  const games = [new Game(createMatchConfig(940)), purchase, trade, fullHandCheckpoint(), chanceDebtMatch(), builtRentDebtMatch(3)];
  expect(new Set(games.map((game) => game.snapshot.decision.kind))).toEqual(new Set(["awaiting_roll", "awaiting_purchase", "awaiting_trade", "awaiting_discard", "awaiting_debt"]));
  for (const game of games) {
    const before = game.snapshot;
    const visible = observation(before);
    const action = chooseBotAction(visible, "normal")!;
    expect(action.reason).toBeTruthy();
    expect(legalCommands(before, visible.actorId)).toContainEqual(action.command);
    expect(game.apply({ ...action.command, expectedRevision: before.revision + 1 })).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.apply({ ...action.command, actor: before.players.find((player) => player.id !== visible.actorId)!.id }).ok).toBe(false);
    expect(game.snapshot).toBe(before);
    expect(game.apply(action.command).ok).toBe(true);
    expect(game.apply(action.command)).toEqual({ ok: false, reason: "stale_revision" });
  }
});

it("requires a real bot actor and exposes neither terminal commands nor a silent end-turn fallback", () => {
  expect(observeBot(new Game(createMatchConfig(940)).snapshot)).toBeNull();
  expect(chooseBotAction(null)).toBeNull();
  const terminal = builtRentDebtMatch(2);
  for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(terminal.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: terminal.snapshot.revision }).ok).toBe(true);
  expect(terminal.apply({ kind: "bankrupt", actor: "p1", expectedRevision: terminal.snapshot.revision }).ok).toBe(true);
  expect(observation(terminal.snapshot)).toBeNull();
  const visible = observation(chanceDebtMatch().snapshot);
  expect(() => chooseBotAction({ ...visible, actions: [] })).toThrow("合法出口");
});

it("resolves equal liquidation loss by stable property ID, independent of candidate iteration order", () => {
  const visible = observation(debtMatch(30, 3).snapshot);
  const tied = { ...visible, liquidity: visible.liquidity.map((option) => ({ ...option, rentChanges: [] })) };
  const expected = chooseBotAction(tied)!;
  expect(chooseBotAction({ ...tied, liquidity: [...tied.liquidity].reverse() })).toEqual(expected);
  expect(expected.reason).toBe("debt_rescue");
});

it.each([2, 3, 4])("runs a deterministic %s-seat internal all-bot match through the only policy entry without leaking a product mode", (seats) => {
  const config = createMatchConfig(31, seats);
  const first = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: "bot" })) });
  const second = new Game(first.snapshot.config);
  for (let count = 0; count < 1000 && first.snapshot.decision.kind !== "game_over"; count += 1) {
    const before = first.snapshot;
    const action = chooseBotAction(observeBot(before), "normal")!;
    expect(action).toEqual(chooseBotAction(observeBot(second.snapshot), "normal"));
    expect(before.random).toEqual(second.snapshot.random);
    const result = first.apply(action.command);
    expect(result.ok).toBe(true);
    expect(result).toEqual(second.apply(action.command));
    const { rules: _rules, map: _map, ...state } = first.snapshot;
    expect(Game.restore(state).snapshot).toEqual(first.snapshot);
  }
  expect(first.snapshot.decision.kind).toBe("game_over");
});
