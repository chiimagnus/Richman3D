import { tileAt, validateMap, type MapDefinition } from "./board";
import { mapFor } from "./maps";
import { rulesFor, validateRules, type RuleSet } from "./rules";
import { createMatchConfig, playerConfig, validateConfig } from "./config";
import { initialTurnOrder, nextTurn } from "./turns";
import { RuleRandom } from "./random";
import { legalCommands, matchResult, pendingProperty } from "./selectors";
import { restoreSnapshot, restoreTradeTerms } from "./restore";
import { constructionCost, constructionRefund, initialProperties, liquidityOption, mortgageValue, netAssets, obligation, propertyTile, rentFor } from "./economy";
import type { ApplyResult, Command, Decision, FinancialStats, GameEvent, GameSnapshot, LandingResult, MatchConfig, PendingDebt, PlayerId } from "./types";
import { HISTORY_LIMIT } from "./types";
import { advanceAuction, canBid, canProposeTrade, startAuction, tradeOption, tradeResponseReason } from "./market";

function cashAfterChange(cash: number, amount: number): number {
  const next = cash + amount;
  if (!Number.isSafeInteger(next) || next < 0) throw new RangeError("资金超出整数范围");
  return next;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export class Game {
  private state: GameSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(config: MatchConfig = createMatchConfig(), rules: RuleSet = rulesFor(config.rulesVersion), map: MapDefinition = mapFor(config.mapId, config.mapVersion)) {
    validateConfig(config);
    validateRules(rules);
    validateMap(map);
    if (config.rulesVersion !== rules.version || config.mapId !== map.id || config.mapVersion !== map.version) throw new Error("配置版本不匹配");
    const random = new RuleRandom(config.seed);
    const turnOrder = initialTurnOrder(config, random);
    this.state = freeze({
      revision: 0,
      config: { ...config, players: config.players.map((player) => ({ ...player })) },
      rules: { ...rules, rentMultipliers: [...rules.rentMultipliers], chanceCards: rules.chanceCards.map((card) => ({ ...card })) },
      map: { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), path: map.path.map((point) => ({ ...point })) },
      completedRounds: 0, tradeUsed: false,
      turnOrder,
      players: config.players.map((player) => ({ id: player.id, cash: rules.startingCash, position: 0, bankrupt: false,
        statistics: { startBonus: 0, rentReceived: 0, rentPaid: 0, taxesPaid: 0, chanceIncome: 0, chanceExpense: 0, purchases: 0, purchaseBookValue: 0,
          tradeCashReceived: 0, tradeCashPaid: 0, tradeBookValueReceived: 0, tradeBookValueGiven: 0, constructionSpent: 0,
          constructionRefunds: 0, constructionSoldCost: 0, mortgageIncome: 0, mortgagePrincipalRepaid: 0, mortgageFeesPaid: 0,
          mortgagePrincipalReleased: 0, debtWrittenOff: 0, rentLost: 0 },
      })),
      turnPlayerId: turnOrder[0]!,
      decision: { kind: "awaiting_roll", actorId: turnOrder[0]! },
      properties: initialProperties(map), lastRoll: null,
      random: random.snapshot,
      history: [],
    });
  }

  get snapshot(): GameSnapshot { return this.state; }

  static restore(value: unknown): Game {
    const snapshot = restoreSnapshot(value);
    const game = new Game(snapshot.config);
    game.state = freeze(snapshot);
    return game;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(command: Command): ApplyResult {
    if (!command || !this.state.config.players.some((player) => player.id === command.actor) ||
        !["roll", "buy", "skip", "bankrupt", "upgrade", "sell_building", "mortgage", "redeem", "auction_bid", "auction_pass", "trade_propose", "trade_accept", "trade_reject"].includes(command.kind) ||
        ["upgrade", "sell_building", "mortgage", "redeem"].includes(command.kind) && (!("propertyId" in command) || typeof command.propertyId !== "string") ||
        command.kind === "auction_bid" && (!Number.isSafeInteger(command.amount) || command.amount < 0) ||
        (command.kind === "trade_accept" || command.kind === "trade_reject") && (!Number.isSafeInteger(command.proposalRevision) || command.proposalRevision < 1) ||
        !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
      return { ok: false, reason: "invalid_command" };
    }
    const keys = ["actor", "kind", "expectedRevision", ...(command.kind === "trade_propose" ? ["terms"] : command.kind === "trade_accept" || command.kind === "trade_reject" ? ["proposalRevision"] : command.kind === "auction_bid" ? ["amount"] : ["upgrade", "sell_building", "mortgage", "redeem"].includes(command.kind) ? ["propertyId"] : [])];
    if (Object.keys(command).length !== keys.length || keys.some((key) => !Object.hasOwn(command, key))) return { ok: false, reason: "invalid_command" };
    const before = this.state;
    if (command.expectedRevision !== before.revision) return { ok: false, reason: "stale_revision" };
    let result: Extract<ApplyResult, { ok: true }>;
    try {
      if (command.kind === "trade_propose" ? !canProposeTrade(before, command.actor) : !legalCommands(before, command.actor).some((action) => action.kind === command.kind && (!("propertyId" in action) || "propertyId" in command && action.propertyId === command.propertyId))) return { ok: false, reason: "illegal_action" };
      const players = before.players.map((player) => ({ ...player, statistics: { ...player.statistics } }));
      const properties = { ...before.properties };
      const random = new RuleRandom(before.random);
      const player = players.find((candidate) => candidate.id === command.actor);
      if (!player) throw new Error("玩家不存在");
      let decision: Decision = { kind: "awaiting_roll", actorId: player.id };
      let turnPlayerId = before.turnPlayerId;
      let completedRounds = before.completedRounds;
      let tradeUsed = before.tradeUsed;
      let lastRoll = before.lastRoll;
      const events: GameEvent[] = [];
      let finishTurn = command.kind === "roll" || command.kind === "buy" || command.kind === "skip";
      const settleAuction = (auction: { propertyId: string; highestBid: number; highestBidderId: PlayerId | null }, reason: "sold" | "all_passed" | "no_bidders") => {
        events.push({ kind: "auction_ended", propertyId: auction.propertyId, winnerId: auction.highestBidderId, price: auction.highestBid, reason });
        if (auction.highestBidderId !== null) {
          const winner = players.find((candidate) => candidate.id === auction.highestBidderId)!;
          winner.cash = cashAfterChange(winner.cash, -auction.highestBid);
          properties[auction.propertyId] = { ...properties[auction.propertyId]!, ownerId: winner.id };
          events.push({ kind: "purchased", actor: winner.id, propertyId: auction.propertyId, price: auction.highestBid });
        }
        decision = { kind: "awaiting_roll", actorId: before.turnPlayerId };
        finishTurn = true;
      };
      const pay = (debt: PendingDebt, amount: number) => {
        player.cash = cashAfterChange(player.cash, -amount);
        if (debt.creditorId !== null) {
          const creditor = players.find((candidate) => candidate.id === debt.creditorId);
          if (!creditor || creditor.bankrupt || creditor.id === player.id) throw new Error("债权人无效");
          creditor.cash = cashAfterChange(creditor.cash, amount);
        }
        events.push({ kind: "paid", actor: player.id, debt, amount, writtenOff: debt.amount - amount });
      };

      if (command.kind === "trade_propose") {
        let terms;
        try { terms = restoreTradeTerms(command.terms, before); } catch { return { ok: false, reason: "invalid_command" }; }
        if (tradeOption(before, player.id, terms).reason !== null) return { ok: false, reason: "illegal_action" };
        const proposal = { ...terms, proposerId: player.id, revision: before.revision + 1 };
        decision = { kind: "awaiting_trade", actorId: terms.recipientId, proposal };
        tradeUsed = true;
        events.push({ kind: "trade_proposed", proposal });
      } else if (command.kind === "trade_accept" || command.kind === "trade_reject") {
        if (before.decision.kind !== "awaiting_trade" || command.proposalRevision !== before.decision.proposal.revision) return { ok: false, reason: "illegal_action" };
        const proposal = before.decision.proposal;
        if (command.kind === "trade_accept") {
          const option = tradeOption(before, proposal.proposerId, proposal);
          if (option.candidate === null) return { ok: false, reason: "illegal_action" };
          for (const next of option.candidate.players) {
            const target = players.find((entry) => entry.id === next.id)!;
            target.cash = next.cash;
            target.statistics = { ...next.statistics };
          }
          Object.assign(properties, option.candidate.properties);
        }
        decision = { kind: "awaiting_roll", actorId: proposal.proposerId };
        events.push({ kind: command.kind === "trade_accept" ? "trade_accepted" : "trade_rejected", proposal,
          reason: playerConfig(before.config, player.id).controller === "bot" ? tradeResponseReason(before) : null });
      } else if (command.kind === "auction_bid" || command.kind === "auction_pass") {
        if (before.decision.kind !== "awaiting_auction") throw new Error("没有拍卖");
        const auction = before.decision;
        if (command.kind === "auction_bid" && !canBid(before, auction, player.id, command.amount)) return { ok: false, reason: "illegal_action" };
        const { auction: next, actorId } = advanceAuction(before, auction, command.kind === "auction_bid" ? command.amount : null);
        events.push(command.kind === "auction_bid" ? { kind: "auction_bid", actor: player.id, propertyId: auction.propertyId, amount: command.amount }
          : { kind: "auction_passed", actor: player.id, propertyId: auction.propertyId });
        if (actorId === null) settleAuction(next, next.highestBidderId === null ? "all_passed" : "sold");
        else decision = { ...next, actorId };
      } else if (command.kind === "roll") {
        const dice = [random.integer(6) + 1, random.integer(6) + 1] as const;
        const steps = dice[0] + dice[1];
        const from = player.position;
        const path = Array.from({ length: steps }, (_, offset) => (from + offset + 1) % before.map.tiles.length);
        const to = path.at(-1);
        if (to === undefined) throw new Error("移动路径为空");
        const passedStart = path.includes(0);
        const startBonus = passedStart ? before.rules.passStartBonus : 0;
        if (passedStart) player.cash = cashAfterChange(player.cash, startBonus);
        player.position = to;
        lastRoll = dice;
        const tile = tileAt(before.map, to);
        let landing: LandingResult;
        switch (tile.type) {
          case "start": landing = { kind: "start" }; break;
          case "tax":
            landing = { kind: "tax", amount: tile.amount };
            break;
          case "chance": {
            const card = before.rules.chanceCards[random.integer(before.rules.chanceCards.length)];
            if (!card) throw new Error("机会卡无效");
            if (card.amount >= 0) player.cash = cashAfterChange(player.cash, card.amount);
            landing = { kind: "chance", amount: card.amount, cardId: card.id };
            break;
          }
          case "property": {
            const ownerId = properties[tile.id]!.ownerId;
            if (!ownerId) {
              decision = { kind: "awaiting_purchase", actorId: player.id, propertyId: tile.id };
              landing = { kind: "property_available", propertyId: tile.id, price: tile.price };
            } else if (ownerId === player.id) {
              landing = { kind: "property_owned", propertyId: tile.id };
            } else {
              const owner = players.find((candidate) => candidate.id === ownerId);
              if (!owner) throw new Error("产权玩家不存在");
              const amount = rentFor(before, tile.id);
              landing = { kind: "rent", propertyId: tile.id, ownerId, amount };
            }
            break;
          }
        }
        events.push({ kind: "rolled", result: { playerId: player.id, dice, steps, from, to, path, passedStart, startBonus, landing } });
        const debt = obligation(landing);
        if (debt) {
          if (player.cash >= debt.amount) pay(debt, debt.amount);
          else decision = { kind: "awaiting_debt", actorId: player.id, debt };
        }
      } else if (command.kind === "bankrupt") {
        if (before.decision.kind !== "awaiting_debt") throw new Error("没有待处理债务");
        let construction = 0;
        let refund = 0;
        let mortgage = 0;
        let released = 0;
        for (const tile of before.map.tiles) {
          if (tile.type !== "property" || properties[tile.id]!.ownerId !== player.id) continue;
          const property = properties[tile.id]!;
          for (const cost of property.constructionCosts) {
            construction = cashAfterChange(construction, cost);
            refund = cashAfterChange(refund, constructionRefund(cost, before.rules));
          }
          const income = property.mortgagePrincipal === 0 ? mortgageValue(tile, before.rules) : 0;
          mortgage = cashAfterChange(mortgage, income);
          released = cashAfterChange(released, property.mortgagePrincipal || income);
          properties[tile.id] = { ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] };
        }
        player.cash = cashAfterChange(cashAfterChange(player.cash, refund), mortgage);
        events.push({ kind: "liquidated", actor: player.id, constructionCost: construction, constructionRefund: refund, mortgageIncome: mortgage, principalReleased: released });
        pay(before.decision.debt, player.cash);
        player.bankrupt = true;
        finishTurn = true;
      } else if (command.kind === "upgrade") {
        const tile = propertyTile(before.map, command.propertyId);
        const property = properties[tile.id]!;
        const cost = constructionCost(tile, before.rules);
        const level = (property.level + 1) as 1 | 2 | 3;
        player.cash = cashAfterChange(player.cash, -cost);
        properties[tile.id] = { ...property, level, constructionCosts: [...property.constructionCosts, cost] };
        events.push({ kind: "upgraded", actor: player.id, propertyId: tile.id, level, cost });
      } else if ("propertyId" in command) {
        const option = liquidityOption(before, player.id, command.propertyId, command.kind);
        const property = properties[command.propertyId]!;
        player.cash = cashAfterChange(player.cash, option.proceeds - option.cost);
        properties[command.propertyId] = option.nextProperty;
        if (command.kind === "sell_building") events.push({ kind: "building_sold", actor: player.id, propertyId: command.propertyId, level: option.nextProperty.level as 0 | 1 | 2, cost: option.originalCost, refund: option.proceeds });
        else if (command.kind === "mortgage") events.push({ kind: "mortgaged", actor: player.id, propertyId: command.propertyId, principal: option.proceeds });
        else events.push({ kind: "redeemed", actor: player.id, propertyId: command.propertyId, principal: property.mortgagePrincipal, fee: option.loss });
        if (before.decision.kind === "awaiting_debt") {
          if (player.cash >= before.decision.debt.amount) { pay(before.decision.debt, before.decision.debt.amount); finishTurn = true; }
          else decision = before.decision;
        }
      } else {
        const property = pendingProperty(before);
        if (!property) throw new Error("待购地产不存在");
        if (command.kind === "buy") {
          player.cash = cashAfterChange(player.cash, -property.price);
          properties[property.id] = { ...properties[property.id]!, ownerId: player.id };
          events.push({ kind: "purchased", actor: player.id, propertyId: property.id, price: property.price });
        } else {
          events.push({ kind: "skipped", actor: player.id, propertyId: property.id });
          const auction = startAuction(before, property.id);
          if (auction) { decision = auction; finishTurn = false; events.push({ kind: "auction_started", actor: auction.actorId, propertyId: property.id }); }
          else settleAuction({ propertyId: property.id, highestBid: 0, highestBidderId: null }, "no_bidders");
        }
      }

      const record = (id: PlayerId, field: keyof FinancialStats, amount: number) => {
        const target = players.find((entry) => entry.id === id);
        if (!target) throw new Error("财务玩家不存在");
        target.statistics[field] = cashAfterChange(target.statistics[field], amount);
      };
      for (const event of events) {
        if (event.kind === "purchased") {
          record(event.actor, "purchases", event.price);
          record(event.actor, "purchaseBookValue", propertyTile(before.map, event.propertyId).price);
        }
        if (event.kind === "upgraded") record(event.actor, "constructionSpent", event.cost);
        if (event.kind === "building_sold") {
          record(event.actor, "constructionSoldCost", event.cost);
          record(event.actor, "constructionRefunds", event.refund);
        }
        if (event.kind === "mortgaged") record(event.actor, "mortgageIncome", event.principal);
        if (event.kind === "redeemed") {
          record(event.actor, "mortgagePrincipalRepaid", event.principal);
          record(event.actor, "mortgageFeesPaid", event.fee);
        }
        if (event.kind === "liquidated") {
          record(event.actor, "constructionSoldCost", event.constructionCost);
          record(event.actor, "constructionRefunds", event.constructionRefund);
          record(event.actor, "mortgageIncome", event.mortgageIncome);
          record(event.actor, "mortgagePrincipalReleased", event.principalReleased);
        }
        if (event.kind === "paid") {
          const source = event.debt.source;
          record(event.actor, "debtWrittenOff", event.writtenOff);
          if (source.kind === "rent") {
            record(event.actor, "rentPaid", event.amount);
            record(source.ownerId, "rentReceived", event.amount);
            record(source.ownerId, "rentLost", event.writtenOff);
          } else record(event.actor, source.kind === "tax" ? "taxesPaid" : "chanceExpense", event.amount);
        }
        if (event.kind === "rolled") {
          const action = event.result;
          record(action.playerId, "startBonus", action.startBonus);
          const landing = action.landing;
          if (landing.kind === "chance" && landing.amount >= 0) record(action.playerId, "chanceIncome", landing.amount);
        }
      }
      const candidate = { ...before, players, properties, decision, lastRoll, random: random.snapshot };
      for (const entry of players) netAssets(candidate, entry.id);
      if (players.filter((entry) => !entry.bankrupt).length === 1) {
        tradeUsed = false;
        const result = matchResult(candidate, "last_survivor");
        decision = { kind: "game_over", result };
        events.push({ kind: "ended", result });
      } else if (decision.kind === "awaiting_roll" && finishTurn) {
        tradeUsed = false;
        ({ turnPlayerId, completedRounds } = nextTurn(candidate));
        if (completedRounds >= before.rules.roundLimit) {
          const result = matchResult(candidate, "round_limit");
          decision = { kind: "game_over", result };
          events.push({ kind: "ended", result });
        } else {
          decision = { kind: "awaiting_roll", actorId: turnPlayerId };
          events.push({ kind: "turn", actor: turnPlayerId });
        }
      }
      if (!Number.isSafeInteger(before.revision + 1) || !Number.isSafeInteger(random.snapshot.draws)) throw new RangeError("版本超出整数范围");
      const revision = before.revision + 1;
      const history = [...before.history, ...events.map((event) => ({ revision, event }))].slice(-HISTORY_LIMIT);
      const snapshot = freeze({ ...before, revision, players, properties, turnPlayerId, completedRounds, tradeUsed, decision, lastRoll, random: random.snapshot, history });
      result = freeze({ ok: true, snapshot, events });
    } catch {
      return { ok: false, reason: "calculation_failed" };
    }
    this.state = result.snapshot;
    for (const listener of this.listeners) {
      try { listener(); } catch { }
    }
    return result;
  }
}
