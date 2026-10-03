import { afterEach, expect, it, vi } from "vitest";
import { cardInstances, cardType, discardCard, drawCard, initialDeck } from "../../src/domain/cards";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { chooseBotCommand } from "../../src/domain/bot";
import { RuleRandom } from "../../src/domain/random";
import { QUICK_RULES, STANDARD_RULES } from "../../src/domain/rules";
import { initialTurnOrder } from "../../src/domain/turns";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { chanceCardText } from "../../src/i18n";
import { eventText } from "../../src/ui/eventText";
import type { CardInstanceId, DeckState, GameSnapshot } from "../../src/domain/types";
import { chanceDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

afterEach(() => vi.restoreAllMocks());

function expectConserved(deck: DeckState, snapshot?: GameSnapshot) {
  const cards = [...deck.drawPile, ...deck.discardPile, ...(deck.pending === null ? [] : [deck.pending]), ...(snapshot?.players.flatMap((player) => player.hand) ?? []), ...(snapshot?.activeItem ? [snapshot.activeItem.instanceId] : [])];
  expect(cards).toHaveLength(cardInstances(QUICK_RULES).length);
  expect(new Set(cards)).toEqual(new Set(cardInstances(QUICK_RULES)));
}

function botCommand(snapshot: GameSnapshot) {
  return chooseBotCommand({ ...snapshot, config: { ...snapshot.config, players: snapshot.config.players.map((player) => ({ ...player, controller: "bot" })) } })!;
}

it("owns twenty-four unique immutable instances without consuming random numbers before the first chance landing", () => {
  const config = createMatchConfig(768);
  const game = new Game(config);
  const random = new RuleRandom(config.seed);
  initialTurnOrder(config, random);
  expect(game.snapshot.deck).toEqual(initialDeck(QUICK_RULES));
  expect(game.snapshot.random).toEqual(random.snapshot);
  expectConserved(game.snapshot.deck);
  expect(Object.isFrozen(game.snapshot.deck.drawPile)).toBe(true);
  expectConserved(Game.restore(makeSave(game.snapshot, propertyMatchId).state).snapshot.deck);
});

it("draws each entity once per full deck, and only shuffles the discarded pile for subsequent cycles", () => {
  let deck = initialDeck(QUICK_RULES);
  const random = new RuleRandom(768);
  const uninterrupted = new RuleRandom(768);
  let other = initialDeck(QUICK_RULES);
  for (let cycle = 0; cycle < 4; cycle += 1) {
    const drawn: CardInstanceId[] = [];
    for (let index = 0; index < cardInstances(QUICK_RULES).length; index += 1) {
      const before = random.snapshot.draws;
      deck = drawCard(deck, QUICK_RULES, random);
      other = drawCard(other, QUICK_RULES, uninterrupted);
      expect(deck).toEqual(other);
      expect(random.snapshot.draws - before).toBe(index === 0 ? cardInstances(QUICK_RULES).length - 1 : 0);
      expectConserved(deck);
      drawn.push(deck.pending!);
      expect(() => drawCard(deck, QUICK_RULES, random)).toThrow("尚未结算");
      deck = discardCard(deck, deck.pending!);
      other = discardCard(other, other.pending!);
      deck = JSON.parse(JSON.stringify(deck));
      expectConserved(deck);
    }
    expect(new Set(drawn)).toEqual(new Set(cardInstances(QUICK_RULES)));
    for (const rule of QUICK_RULES.chanceCards) expect(drawn.filter((id) => cardType(id) === rule.id)).toHaveLength(2);
    expect(deck.drawPile).toEqual([]);
    expect(deck.discardPile).toEqual(drawn);
  }
  expect(random.snapshot).toEqual(uninterrupted.snapshot);
});

it.each([2, 3, 4])("replays and restores every production command of a %s-seat game across multiple deck cycles", (seats) => {
  const config = { ...createMatchConfig(31, seats), rulesVersion: STANDARD_RULES.version };
  let game = new Game(config);
  const uninterrupted = new Game(config);
  const drawn: CardInstanceId[] = [];
  for (let count = 0; count < 1200 && game.snapshot.decision.kind !== "game_over"; count += 1) {
    const result = game.apply(botCommand(game.snapshot));
    expect(result).toEqual(uninterrupted.apply(botCommand(uninterrupted.snapshot)));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    for (const event of result.events) {
      if (event.kind === "rolled" && (event.result.landing.kind === "chance" || event.result.landing.kind === "movement_card")) {
        const landing = event.result.landing;
        drawn.push(landing.instanceId);
        const card = QUICK_RULES.chanceCards.find((card) => card.id === landing.cardId)!;
        for (const language of ["en", "zh-CN"] as const) expect(eventText(language, event, result.snapshot)).toContain(chanceCardText(language, landing.cardId, card.kind === "cash" ? card.amount : QUICK_RULES.passStartBonus, card.kind === "move" ? card.steps : 0));
      }
    }
    expectConserved(game.snapshot.deck, game.snapshot);
    const saved = makeSave(game.snapshot, propertyMatchId);
    game = Game.restore(readSave(saved).record.state);
    expect(game.snapshot).toEqual(uninterrupted.snapshot);
  }
  expect(game.snapshot.decision.kind).toBe("game_over");
  expect(drawn.length).toBeGreaterThan(0);
  expect(game.snapshot.players.every((player) => player.hand.length === 0)).toBe(true);
  expect(game.snapshot.activeItem).toBeNull();
});

it("keeps an unpaid cash card pending through save, rejects another draw and discards only after one actual rescue payment", () => {
  const game = chanceDebtMatch();
  const pending = game.snapshot;
  expect(pending.deck.pending).toBe("maintenance-cost:2");
  expect(pending.deck.discardPile).toEqual([]);
  expect(pending.players[0]!.statistics.chanceExpense).toBe(0);
  expectConserved(pending.deck);
  const restored = Game.restore(makeSave(pending, propertyMatchId).state);
  expect(restored.snapshot).toEqual(pending);
  expect(restored.apply({ kind: "roll", actor: "p1", expectedRevision: pending.revision }).ok).toBe(false);
  expect(restored.snapshot.deck).toEqual(pending.deck);
  const command = { kind: "mortgage" as const, propertyId: "river-market", actor: "p1" as const, expectedRevision: pending.revision };
  expect(game.apply(command)).toEqual(restored.apply(command));
  const paid = restored.snapshot;
  expect(paid.players[0]).toMatchObject({ cash: 40, statistics: { chanceExpense: 90 } });
  expect(paid.deck).toEqual({ drawPile: pending.deck.drawPile, discardPile: [pending.deck.pending], pending: null });
  expect(paid.random).toEqual(pending.random);
  expect(paid.history.slice(-3).map(({ event }) => event.kind)).toEqual(["mortgaged", "paid", "turn"]);
  expect(restored.apply(command).ok).toBe(false);
  expect(restored.snapshot).toBe(paid);
  expect(Game.restore(makeSave(paid, propertyMatchId).state).snapshot).toEqual(paid);
});

it("a bankrupt computer writes off the unpayable card once, discards its entity and never draws another card during liquidation", () => {
  const state = makeSave(chanceDebtMatch(0).snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state,
    config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human" })) },
    properties: { ...state.properties, "river-market": { ...state.properties["river-market"]!, mortgagePrincipal: 100 } },
    players: state.players.map((player) => player.id === "p1" ? { ...player, statistics: { ...player.statistics, mortgageIncome: 100, taxesPaid: player.statistics.taxesPaid + 100 } } : player),
  });
  const before = game.snapshot;
  const command = chooseBotCommand(before)!;
  expect(command.kind).toBe("bankrupt");
  expect(game.apply(command).ok).toBe(true);
  expect(game.snapshot.players[0]).toMatchObject({ bankrupt: true, cash: 0, statistics: { chanceExpense: 0, debtWrittenOff: 90 } });
  expect(game.snapshot.deck.pending).toBeNull();
  expect(game.snapshot.deck.discardPile).toEqual([before.deck.pending]);
  expect(game.snapshot.random).toEqual(before.random);
  expectConserved(game.snapshot.deck);
  expect(Game.restore(makeSave(game.snapshot, propertyMatchId).state).snapshot).toEqual(game.snapshot);
});

it("rolls back the whole shuffled deck, random cursor, position and events on cash overflow", () => {
  const game = new Game(createMatchConfig(21), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER });
  const before = game.snapshot;
  const listener = vi.fn();
  game.subscribe(listener);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 })).toEqual({ ok: false, reason: "calculation_failed" });
  expect(game.snapshot).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

it.each([
  (raw: any) => { raw.deck.drawPile.push(raw.deck.drawPile[0]); },
  (raw: any) => { raw.deck.drawPile.pop(); },
  (raw: any) => { raw.deck.drawPile[0] = "unknown:1"; },
  (raw: any) => { raw.deck.drawPile[0] = raw.deck.pending; },
  (raw: any) => { raw.deck.discardPile.push(raw.deck.pending); },
  (raw: any) => { raw.deck.discardPile.push(raw.deck.drawPile.pop()); },
  (raw: any) => { raw.deck.drawPile.push(raw.deck.pending); raw.deck.pending = null; },
  (raw: any) => { raw.decision.debt.source.instanceId = "maintenance-cost:1"; },
  (raw: any) => { raw.deck.pending = "traffic-fine:1"; },
  (raw: any) => { raw.deck.extra = true; },
  (raw: any) => { raw.history.find((entry: any) => entry.event.kind === "rolled" && entry.event.result.landing.kind === "chance").event.result.landing.instanceId = "unknown:1"; },
])("rejects corrupted card areas, decision references or event entities %# without altering a live match", (mutate) => {
  const game = chanceDebtMatch();
  const before = game.snapshot;
  const raw = JSON.parse(JSON.stringify(makeSave(before, propertyMatchId).state));
  mutate(raw);
  expect(() => Game.restore(raw)).toThrow();
  expect(game.snapshot).toBe(before);
});

it("rejects an initial shuffled or pending card state and clones restored arrays rather than retaining input aliases", () => {
  const state = makeSave(new Game(createMatchConfig(768)).snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...state, deck: { ...state.deck, drawPile: [...state.deck.drawPile].reverse() } })).toThrow();
  const raw = JSON.parse(JSON.stringify(makeSave(chanceDebtMatch().snapshot, propertyMatchId).state));
  const game = Game.restore(raw);
  const before = game.snapshot;
  raw.deck.drawPile.pop();
  raw.deck.pending = null;
  expectConserved(before.deck);
  expect(before.deck.pending).toBe("maintenance-cost:2");
  expect(Object.isFrozen(before.deck.drawPile)).toBe(true);
});

it.each(["en", "zh-CN"] as const)("%s cash-card text uses the rule amount rather than a translated business constant", (language) => {
  for (const card of QUICK_RULES.chanceCards) {
    if (card.kind !== "cash") continue;
    const amount = card.amount >= 0 ? 174 : -174;
    expect(chanceCardText(language, card.id, amount)).toContain(String(amount));
    expect(chanceCardText(language, card.id, amount)).not.toContain(String(card.amount));
  }
});

it("preserves incompatible v8 bytes without adding a development save migration", () => {
  const raw = JSON.parse(JSON.stringify(makeSave(new Game().snapshot, propertyMatchId)));
  raw.rulesVersion = raw.state.config.rulesVersion = "city-v8-quick";
  delete raw.state.deck;
  const bytes = JSON.stringify(raw);
  expect(() => readSave(raw)).toThrow("incompatible");
  expect(JSON.stringify(raw)).toBe(bytes);
});
