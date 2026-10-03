import { validateConfig } from "./config";
import { mapFor } from "./maps";
import { RuleRandom } from "./random";
import { rulesFor } from "./rules";
import { initialTurnOrder } from "./turns";
import { matchResult } from "./selectors";
import { completeGroup, constructionCost, constructionRefund, mortgageValue, netAssets, obligation, redemptionCost, rentAmount, rentFor } from "./economy";
import { HISTORY_LIMIT, type GameEvent, type GameSnapshot, type LandingResult, type MatchConfig, type PendingDebt, type PlayerId, type RollResult, type SavedGameState, type TradeProposal, type TradeTerms } from "./types";
import { advanceAuction, AUCTION_STEP, canBid, minimumBid, nextBidder, startAuction, tradeOption } from "./market";
import { cardInstances, cardType, initialDeck } from "./cards";
import type { CardInstanceId, DeckState } from "./types";

export function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error("对象格式无效");
  const result = value as Record<string, unknown>;
  if (keys && (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))) throw new Error("字段无效");
  return result;
}

export function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("整数范围无效");
  return value;
}

export function sameData(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) && Array.isArray(second)) return first.length === second.length && first.every((value, index) => sameData(value, second[index]));
  if (!first || !second || typeof first !== "object" || typeof second !== "object" || Array.isArray(first) || Array.isArray(second)) return false;
  const left = record(first);
  const right = record(second);
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every((key) => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

export function restoreTradeTerms(value: unknown, snapshot: Pick<GameSnapshot, "config" | "map">): TradeTerms {
  const terms = record(value, ["recipientId", "givePropertyIds", "receivePropertyIds", "cash"]);
  if (!snapshot.config.players.some((player) => player.id === terms.recipientId)) throw new Error("交易接收者无效");
  for (const ids of [terms.givePropertyIds, terms.receivePropertyIds]) {
    if (!Array.isArray(ids) || ids.length > 3 || ids.some((id) => typeof id !== "string" || !snapshot.map.tiles.some((tile) => tile.type === "property" && tile.id === id))) throw new Error("交易地产无效");
  }
  const given = terms.givePropertyIds as string[];
  const received = terms.receivePropertyIds as string[];
  if (new Set([...given, ...received]).size !== given.length + received.length || given.length + received.length === 0 && terms.cash === null) throw new Error("重复或空交易无效");
  const cash = terms.cash === null ? null : record(terms.cash, ["payerId", "amount"]);
  if (cash && !snapshot.config.players.some((player) => player.id === cash.payerId)) throw new Error("交易付款者无效");
  return { recipientId: terms.recipientId as PlayerId, givePropertyIds: [...given], receivePropertyIds: [...received], cash: cash ? { payerId: cash.payerId as PlayerId, amount: integer(cash.amount, 1) } : null };
}

function restoreTradeProposal(value: unknown, snapshot: GameSnapshot): TradeProposal {
  const proposal = record(value, ["recipientId", "givePropertyIds", "receivePropertyIds", "cash", "proposerId", "revision"]);
  const { proposerId, revision, ...raw } = proposal;
  const terms = restoreTradeTerms(raw, snapshot);
  if (!snapshot.config.players.some((player) => player.id === proposerId) || proposerId === terms.recipientId || terms.cash && terms.cash.payerId !== proposerId && terms.cash.payerId !== terms.recipientId) throw new Error("交易参与者无效");
  return { ...terms, proposerId: proposerId as PlayerId, revision: integer(revision, 1, snapshot.revision) };
}

export function restoreSnapshot(value: unknown): GameSnapshot {
  const state = record(value, ["revision", "config", "completedRounds", "turnOrder", "players", "turnPlayerId", "tradeUsed", "deck", "decision", "properties", "lastRoll", "random", "history"]);
  if (typeof state.tradeUsed !== "boolean") throw new Error("交易机会状态无效");
  const configValue = record(state.config, ["players", "seed", "rulesVersion", "mapId", "mapVersion"]);
  if (!Array.isArray(configValue.players) || configValue.players.length < 2 || configValue.players.length > 4) throw new Error("席位数量无效");
  for (const player of configValue.players) record(player, ["id", "controller", "name", "defaultNameKey", "color"]);
  const config = configValue as MatchConfig;
  validateConfig(config);
  if (typeof config.rulesVersion !== "string" || typeof config.mapId !== "string") throw new Error("版本无效");
  integer(config.mapVersion, 1);
  const rules = rulesFor(config.rulesVersion);
  const deck = record(state.deck, ["drawPile", "discardPile", "pending"]);
  const instances = cardInstances(rules);
  if (!Array.isArray(deck.drawPile) || !Array.isArray(deck.discardPile)) throw new Error("牌堆无效");
  const zones = [...deck.drawPile, ...deck.discardPile, ...(deck.pending === null ? [] : [deck.pending])];
  if (zones.length !== instances.length || new Set(zones).size !== instances.length || zones.some((id) => !instances.includes(id))) throw new Error("实体卡区域不守恒");
  const restoredDeck: DeckState = { drawPile: deck.drawPile as CardInstanceId[], discardPile: deck.discardPile as CardInstanceId[], pending: deck.pending as CardInstanceId | null };
  const map = mapFor(config.mapId, config.mapVersion);
  integer(state.revision);
  integer(state.completedRounds, 0, rules.roundLimit);
  const initialRandom = new RuleRandom(config.seed);
  if (!sameData(state.turnOrder, initialTurnOrder(config, initialRandom))) throw new Error("固定轮序无效");
  if (!Array.isArray(state.players) || state.players.length !== config.players.length) throw new Error("玩家数量无效");
  const statsKeys = ["startBonus", "rentReceived", "rentPaid", "taxesPaid", "chanceIncome", "chanceExpense", "purchases", "purchaseBookValue", "tradeCashReceived", "tradeCashPaid", "tradeBookValueReceived", "tradeBookValueGiven", "constructionSpent", "constructionRefunds", "constructionSoldCost", "mortgageIncome", "mortgagePrincipalRepaid", "mortgageFeesPaid", "mortgagePrincipalReleased", "debtWrittenOff", "rentLost"] as const;
  for (const [index, raw] of state.players.entries()) {
    const player = record(raw, ["id", "cash", "position", "bankrupt", "statistics"]);
    if (player.id !== config.players[index]!.id || typeof player.bankrupt !== "boolean") throw new Error("玩家身份无效");
    const cash = integer(player.cash);
    integer(player.position, 0, map.tiles.length - 1);
    const stats = record(player.statistics, statsKeys);
    for (const field of statsKeys) integer(stats[field]);
    if (player.bankrupt ? cash !== 0 || stats.debtWrittenOff === 0 : stats.debtWrittenOff !== 0 || stats.mortgagePrincipalReleased !== 0) throw new Error("破产状态无效");
    const balance = BigInt(rules.startingCash) + BigInt(stats.startBonus as number) + BigInt(stats.rentReceived as number) + BigInt(stats.chanceIncome as number)
      + BigInt(stats.constructionRefunds as number) + BigInt(stats.mortgageIncome as number) + BigInt(stats.tradeCashReceived as number) - BigInt(stats.tradeCashPaid as number)
      - BigInt(stats.rentPaid as number) - BigInt(stats.taxesPaid as number) - BigInt(stats.chanceExpense as number) - BigInt(stats.purchases as number) - BigInt(stats.constructionSpent as number)
      - BigInt(stats.mortgagePrincipalRepaid as number) - BigInt(stats.mortgageFeesPaid as number);
    if (balance !== BigInt(cash)) throw new Error("财务统计不平");
    if ((stats.constructionSoldCost as number) > (stats.constructionSpent as number) || BigInt(stats.constructionRefunds as number) * 100n > BigInt(stats.constructionSoldCost as number) * BigInt(rules.constructionSalePercent) ||
        BigInt(stats.mortgagePrincipalRepaid as number) + BigInt(stats.mortgagePrincipalReleased as number) > BigInt(stats.mortgageIncome as number) ||
        BigInt(stats.mortgageFeesPaid as number) * 100n < BigInt(stats.mortgagePrincipalRepaid as number) * BigInt(rules.mortgageRedemptionPercent) ||
        (rules.mortgageRedemptionPercent === 0 ? stats.mortgageFeesPaid !== 0 : (stats.mortgageFeesPaid as number) > (stats.mortgagePrincipalRepaid as number))) throw new Error("变现统计无效");
  }
  const propertyTiles = map.tiles.filter((tile) => tile.type === "property");
  const properties = record(state.properties, propertyTiles.map((tile) => tile.id));
  for (const tile of propertyTiles) {
    const property = record(properties[tile.id], ["ownerId", "level", "mortgagePrincipal", "constructionCosts"]);
    const level = integer(property.level, 0, 3);
    const principal = integer(property.mortgagePrincipal);
    if (principal !== 0 && principal !== mortgageValue(tile, rules)) throw new Error("抵押本金无效");
    if (!Array.isArray(property.constructionCosts) || property.constructionCosts.length !== level) throw new Error("建筑成本与等级不一致");
    for (const cost of property.constructionCosts) integer(cost, 0, constructionCost(tile, rules));
    if (property.ownerId === null ? level !== 0 || principal !== 0 : !(state.players as SavedGameState["players"]).some((player) => player.id === property.ownerId && !player.bankrupt)) throw new Error("产权引用无效");
  }
  const random = record(state.random, ["version", "inputSeed", "state", "draws"]);
  new RuleRandom(random as SavedGameState["random"]);
  if (random.inputSeed !== config.seed) throw new Error("随机种子不匹配");
  if (state.lastRoll !== null && (!Array.isArray(state.lastRoll) || state.lastRoll.length !== 2)) throw new Error("骰子无效");
  if (Array.isArray(state.lastRoll)) {
    state.lastRoll.forEach((face) => integer(face, 1, 6));
    if (integer(random.draws) < initialRandom.snapshot.draws + 2 || state.revision === 0) throw new Error("随机游标无效");
  } else if (!sameData(random, initialRandom.snapshot) || !sameData(deck, initialDeck(rules)) || (state.players as SavedGameState["players"]).some((player) => player.position !== 0)) throw new Error("缺少骰子");
  const decision = record(state.decision);
  if (!["awaiting_roll", "awaiting_purchase", "awaiting_debt", "awaiting_auction", "awaiting_trade", "game_over"].includes(decision.kind as string)) throw new Error("决策无效");
  record(decision, decision.kind === "awaiting_auction" ? ["kind", "actorId", "propertyId", "landingPlayerId", "highestBid", "highestBidderId", "withdrawnIds", "continuation"]
    : decision.kind === "awaiting_trade" ? ["kind", "actorId", "proposal"] : decision.kind === "awaiting_purchase" ? ["kind", "actorId", "propertyId"] : decision.kind === "awaiting_debt" ? ["kind", "actorId", "debt"] : decision.kind === "game_over" ? ["kind", "result"] : ["kind", "actorId"]);
  const snapshot = { ...state, config, rules, map, deck: restoredDeck } as GameSnapshot;
  for (const tile of propertyTiles) {
    if (snapshot.properties[tile.id]!.level === 0) continue;
    const group = propertyTiles.filter((candidate) => candidate.group === tile.group);
    const levels = group.map((candidate) => snapshot.properties[candidate.id]!.level);
    if (!completeGroup(snapshot, tile) || Math.max(...levels) - Math.min(...levels) > 1) throw new Error("建筑组状态无效");
  }
  const active = snapshot.players.find((player) => player.id === snapshot.turnPlayerId);
  if (!active) throw new Error("当前玩家不存在");
  const living = snapshot.players.filter((player) => !player.bankrupt).length;
  if (living === 0) throw new Error("无存活玩家");
  if (snapshot.decision.kind === "game_over") {
    const result = record(snapshot.decision.result, ["reason", "rankings", "winnerIds"]);
    const reason = living === 1 ? "last_survivor" : "round_limit";
    if (result.reason !== reason || (reason === "round_limit" && snapshot.completedRounds !== rules.roundLimit) || !sameData(result, matchResult(snapshot, reason))) throw new Error("终局结果无效");
  } else {
    if (living < 2 || active.bankrupt || snapshot.completedRounds >= rules.roundLimit || snapshot.decision.kind !== "awaiting_auction" && snapshot.decision.kind !== "awaiting_trade" && snapshot.decision.actorId !== snapshot.turnPlayerId) throw new Error("决策阶段无效");
    if (snapshot.decision.kind === "awaiting_trade") {
      const proposal = restoreTradeProposal(snapshot.decision.proposal, snapshot);
      if (!snapshot.tradeUsed || proposal.proposerId !== snapshot.turnPlayerId || proposal.recipientId !== snapshot.decision.actorId || proposal.revision !== snapshot.revision || tradeOption(snapshot, proposal.proposerId, proposal).reason !== null) throw new Error("待响应交易无效");
    }
    if (snapshot.decision.kind === "awaiting_auction") {
      const auction = snapshot.decision;
      const tile = map.tiles[active.position]!;
      const bidder = snapshot.players.find((player) => player.id === auction.actorId);
      const highest = integer(auction.highestBid);
      if (!snapshot.lastRoll || tile.type !== "property" || tile.id !== auction.propertyId || snapshot.properties[tile.id]!.ownerId !== null || auction.landingPlayerId !== active.id || auction.continuation !== "finish_turn" ||
          !Array.isArray(auction.withdrawnIds) || new Set(auction.withdrawnIds).size !== auction.withdrawnIds.length || auction.withdrawnIds.some((id) => !snapshot.players.some((player) => player.id === id && !player.bankrupt)) ||
          !bidder || bidder.bankrupt || auction.withdrawnIds.includes(bidder.id) || auction.highestBidderId === bidder.id || highest % AUCTION_STEP !== 0 ||
          (auction.highestBidderId === null ? highest !== 0 : highest < AUCTION_STEP || auction.withdrawnIds.includes(auction.highestBidderId) || !snapshot.players.some((player) => player.id === auction.highestBidderId && !player.bankrupt && player.cash >= highest))) throw new Error("拍卖状态无效");
      if (auction.highestBidderId !== null) {
        const minimum = minimumBid(snapshot, { ...auction, actorId: auction.highestBidderId, highestBid: 0 });
        if (minimum === null || highest < minimum) throw new Error("最高报价无法安全成交");
      }
    }
    if (snapshot.decision.kind === "awaiting_purchase") {
      const tile = map.tiles[active.position]!;
      if (!snapshot.lastRoll || tile.type !== "property" || tile.id !== snapshot.decision.propertyId || snapshot.properties[tile.id]!.ownerId !== null) throw new Error("待购地产无效");
    }
    if (snapshot.decision.kind === "awaiting_debt") {
      const debt = restoreDebt(snapshot.decision.debt, snapshot, active.id);
      const tile = map.tiles[active.position]!;
      if (!snapshot.lastRoll || active.cash >= debt.amount || (debt.source.kind === "rent" ? tile.type !== "property" || tile.id !== debt.source.propertyId || snapshot.properties[tile.id]!.ownerId !== debt.creditorId || rentFor(snapshot, tile.id) !== debt.amount
        : debt.source.kind === "tax" ? tile.type !== "tax" || tile.amount !== debt.amount : tile.type !== "chance")) throw new Error("待偿债务无效");
    }
  }
  for (const player of snapshot.players) {
    netAssets(snapshot, player.id);
    const purchased = map.tiles.reduce((total, tile) => total + (tile.type === "property" && snapshot.properties[tile.id]!.ownerId === player.id ? BigInt(tile.price) : 0n), 0n);
    const acquired = BigInt(player.statistics.purchaseBookValue) + BigInt(player.statistics.tradeBookValueReceived) - BigInt(player.statistics.tradeBookValueGiven);
    if (acquired < 0n || !player.bankrupt && purchased !== acquired) throw new Error("产权账面统计不平");
    const construction = Object.values(snapshot.properties).reduce((total, property) => property.ownerId === player.id ? total + property.constructionCosts.reduce((sum, cost) => sum + BigInt(cost), 0n) : total, 0n);
    if (construction !== BigInt(player.statistics.constructionSpent) - BigInt(player.statistics.constructionSoldCost)) throw new Error("建设统计不平");
    const principal = Object.values(snapshot.properties).reduce((total, property) => property.ownerId === player.id ? total + BigInt(property.mortgagePrincipal) : total, 0n);
    if (principal !== BigInt(player.statistics.mortgageIncome) - BigInt(player.statistics.mortgagePrincipalRepaid) - BigInt(player.statistics.mortgagePrincipalReleased)) throw new Error("抵押统计不平");
  }
  if (snapshot.players.reduce((total, player) => total + BigInt(player.statistics.rentReceived) - BigInt(player.statistics.rentPaid), 0n) !== 0n) throw new Error("租金统计不平");
  for (const [received, given] of [["tradeCashReceived", "tradeCashPaid"], ["tradeBookValueReceived", "tradeBookValueGiven"]] as const) {
    if (snapshot.players.reduce((total, player) => total + BigInt(player.statistics[received]) - BigInt(player.statistics[given]), 0n) !== 0n) throw new Error("交易统计不平");
  }
  if (snapshot.players.reduce((total, player) => total + BigInt(player.statistics.rentLost) - BigInt(player.statistics.debtWrittenOff), 0n) > 0n) throw new Error("冲销统计不平");
  if (snapshot.revision === 0 && (snapshot.tradeUsed || snapshot.completedRounds !== 0 || snapshot.turnPlayerId !== snapshot.turnOrder[0] || decision.kind !== "awaiting_roll" || Object.values(snapshot.properties).some((property) => property.ownerId !== null) ||
      !sameData(random, initialRandom.snapshot) || snapshot.players.some((player) => player.position !== 0 || player.cash !== rules.startingCash || Object.values(player.statistics).some((amount) => amount !== 0)))) throw new Error("初始状态无效");
  const history = restoreHistory(state.history, snapshot);
  const pending = snapshot.decision.kind === "awaiting_debt" && snapshot.decision.debt.source.kind === "chance" ? snapshot.decision.debt.source.instanceId : null;
  if (deck.pending !== pending) throw new Error("待结算卡与决策不一致");
  const draws = history.flatMap(({ event }) => event.kind === "rolled" && event.result.landing.kind === "chance" ? [event.result.landing.instanceId] : []);
  if (history.length < HISTORY_LIMIT && draws.length === 0 && !sameData(deck, initialDeck(rules))) throw new Error("未抽牌状态无效");
  if (draws.length > 0) {
    if (deck.drawPile.length === instances.length || (pending === null ? deck.discardPile.at(-1) : pending) !== draws.at(-1)) throw new Error("牌堆与最新抽牌不一致");
    const consumed = instances.length - deck.drawPile.length;
    if (deck.discardPile.length !== consumed - (pending === null ? 0 : 1) || history.length < HISTORY_LIMIT && consumed !== (draws.length - 1) % instances.length + 1) throw new Error("本轮牌堆数量无效");
    const recentDraws = draws.slice(-consumed);
    if (new Set(recentDraws).size !== recentDraws.length || recentDraws.some((id) => restoredDeck.drawPile.includes(id))) throw new Error("本轮抽牌重复");
    const settled = pending === null ? recentDraws : recentDraws.slice(0, -1);
    if (settled.length > 0 && !sameData(deck.discardPile.slice(-settled.length), settled)) throw new Error("弃牌顺序与历史不一致");
  }
  if ((history.at(-1)?.event.kind === "trade_proposed") !== (snapshot.decision.kind === "awaiting_trade")) throw new Error("交易响应阶段与历史不一致");
  const recent = history.at(-1)?.event;
  if ((recent?.kind === "trade_accepted" || recent?.kind === "trade_rejected") && (snapshot.decision.kind !== "awaiting_roll" || snapshot.turnPlayerId !== recent.proposal.proposerId)) throw new Error("响应后没有返回原回合");
  if (snapshot.lastRoll === null && (snapshot.completedRounds !== 0 || snapshot.turnPlayerId !== snapshot.turnOrder[0] || Object.values(snapshot.properties).some((property) => property.ownerId !== null) || history.some(({ event }) => !["trade_proposed", "trade_accepted", "trade_rejected"].includes(event.kind)))) throw new Error("未掷骰状态无效");
  if (snapshot.decision.kind === "awaiting_trade" && (history.at(-1)!.event.kind !== "trade_proposed" || !sameData((history.at(-1)!.event as Extract<GameEvent, { proposal: TradeProposal }>).proposal, snapshot.decision.proposal))) throw new Error("交易与历史不一致");
  let lastTurn = -1;
  history.forEach(({ event }, index) => { if (event.kind === "turn" || event.kind === "ended") lastTurn = index; });
  const proposals = history.slice(lastTurn + 1).filter(({ event }) => event.kind === "trade_proposed");
  if (proposals.length > 1 || proposals.length === 1 && !snapshot.tradeUsed || snapshot.tradeUsed && proposals.length === 0 && (lastTurn >= 0 || history.length < HISTORY_LIMIT)) throw new Error("交易机会与当前回合不一致");
  if (snapshot.decision.kind === "awaiting_auction") {
    const auction = snapshot.decision;
    const recent = history.at(-1)!.event;
    if ((recent.kind !== "auction_started" && recent.kind !== "auction_bid" && recent.kind !== "auction_passed") || recent.propertyId !== auction.propertyId ||
        (recent.kind === "auction_started" ? recent.actor !== auction.actorId || auction.highestBid !== 0 : nextBidder(snapshot, auction, recent.actor) !== auction.actorId) ||
        recent.kind === "auction_passed" && !auction.withdrawnIds.includes(recent.actor)) throw new Error("拍卖轮序与历史不一致");
    if (recent.kind === "auction_started" && !sameData(startAuction(snapshot, auction.propertyId), auction)) throw new Error("初始竞买顺序无效");
    const bid = [...history].reverse().find((entry) => entry.event.kind === "auction_bid" && entry.event.propertyId === auction.propertyId)?.event;
    if (auction.highestBidderId !== null && (bid?.kind !== "auction_bid" || bid.actor !== auction.highestBidderId || bid.amount !== auction.highestBid)) throw new Error("最高报价与历史不一致");
    let opening = -1;
    history.forEach(({ event }, index) => { if (event.kind === "auction_started") opening = index; });
    if (opening >= 0) {
      let expected = startAuction(snapshot, auction.propertyId);
      const started = history[opening]!.event;
      if (!expected || started.kind !== "auction_started" || started.propertyId !== auction.propertyId || started.actor !== expected.actorId) throw new Error("拍卖开场不一致");
      for (const { event } of history.slice(opening + 1)) {
        if ((event.kind !== "auction_bid" && event.kind !== "auction_passed") || event.propertyId !== expected.propertyId || event.actor !== expected.actorId ||
            event.kind === "auction_bid" && !canBid(snapshot, expected, event.actor, event.amount)) throw new Error("拍卖历史响应无效");
        const next = advanceAuction(snapshot, expected, event.kind === "auction_bid" ? event.amount : null);
        if (next.actorId === null) throw new Error("拍卖已经结束");
        expected = { ...next.auction, actorId: next.actorId };
      }
      if (!sameData(expected, auction)) throw new Error("拍卖参与者与历史不一致");
    }
  }
  if (snapshot.decision.kind === "awaiting_debt") {
    const entry = [...history].reverse().find((candidate) => candidate.event.kind === "rolled");
    const roll = entry?.event;
    if (roll?.kind !== "rolled" || roll.result.playerId !== snapshot.decision.actorId || roll.result.to !== active.position || !sameData(roll.result.dice, snapshot.lastRoll) || !sameData(obligation(roll.result.landing), snapshot.decision.debt)) throw new Error("债务来源与落点不一致");
    if (history.slice(history.indexOf(entry!) + 1).some(({ event }) => (event.kind !== "building_sold" && event.kind !== "mortgaged") || event.actor !== active.id)) throw new Error("债务已经结清或回合已结束");
  }
  return {
    ...snapshot, config: { ...config, players: config.players.map((player) => ({ ...player })) },
    history,
    players: snapshot.players.map((player) => ({ ...player, statistics: { ...player.statistics } })),
    turnOrder: [...snapshot.turnOrder],
    properties: Object.fromEntries(Object.entries(snapshot.properties).map(([id, property]) => [id, { ...property, constructionCosts: [...property.constructionCosts] }])),
    random: { ...snapshot.random }, lastRoll: snapshot.lastRoll ? [...snapshot.lastRoll] : null,
    deck: { drawPile: [...snapshot.deck.drawPile], discardPile: [...snapshot.deck.discardPile], pending: snapshot.deck.pending },
    decision: snapshot.decision.kind === "game_over" ? { kind: "game_over", result: matchResult(snapshot, snapshot.decision.result.reason) } : snapshot.decision.kind === "awaiting_debt" ? { ...snapshot.decision, debt: restoreDebt(snapshot.decision.debt, snapshot, snapshot.decision.actorId) }
      : snapshot.decision.kind === "awaiting_auction" ? { ...snapshot.decision, withdrawnIds: [...snapshot.decision.withdrawnIds] } : snapshot.decision.kind === "awaiting_trade" ? { ...snapshot.decision, proposal: restoreTradeProposal(snapshot.decision.proposal, snapshot) } : { ...snapshot.decision },
    rules: { ...rules, rentMultipliers: [...rules.rentMultipliers], chanceCards: rules.chanceCards.map((card) => ({ ...card })) },
    map: { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), path: map.path.map((point) => ({ ...point })) },
  };
}

function restoreHistory(value: unknown, snapshot: GameSnapshot): GameSnapshot["history"] {
  if (!Array.isArray(value) || value.length > HISTORY_LIMIT || (snapshot.revision === 0 ? value.length !== 0 : value.length === 0)) throw new Error("历史数量无效");
  let previous = 0;
  const history = value.map((raw) => {
    const entry = record(raw, ["revision", "event"]);
    const revision = integer(entry.revision, 1, snapshot.revision);
    if (previous && (revision < previous || revision > previous + 1)) throw new Error("历史顺序无效");
    previous = revision;
    const event = restoreEvent(entry.event, snapshot);
    if (event.kind === "trade_proposed" && event.proposal.revision !== revision || (event.kind === "trade_accepted" || event.kind === "trade_rejected") && event.proposal.revision + 1 !== revision) throw new Error("交易历史版本无效");
    return { revision, event };
  });
  if (previous !== snapshot.revision) throw new Error("历史缺少最新提交");
  let turnActor = history.length < HISTORY_LIMIT ? snapshot.turnOrder[0]! : null;
  let rolledThisTurn = false;
  let proposedThisTurn = false;
  for (const [index, entry] of history.entries()) {
    const event = entry.event;
    if (event.kind === "turn") { turnActor = event.actor; rolledThisTurn = false; proposedThisTurn = false; }
    if (event.kind === "rolled") rolledThisTurn = true;
    if (event.kind === "trade_proposed") {
      if (rolledThisTurn || proposedThisTurn || turnActor !== null && event.proposal.proposerId !== turnActor) throw new Error("历史交易不在掷骰前或重复提案");
      proposedThisTurn = true;
    }
    if (entry.event.kind === "trade_proposed" && index < history.length - 1) {
      const next = history[index + 1]!.event;
      if ((next.kind !== "trade_accepted" && next.kind !== "trade_rejected") || !sameData(next.proposal, entry.event.proposal)) throw new Error("交易提案缺少唯一响应");
    }
    if (entry.event.kind === "trade_accepted" || entry.event.kind === "trade_rejected") {
      const prior = history[index - 1]?.event;
      if (index === 0 ? history.length !== HISTORY_LIMIT : prior?.kind !== "trade_proposed" || !sameData(prior.proposal, entry.event.proposal)) throw new Error("交易响应不匹配");
    }
  }
  const signatures = ["rolled", "rolled,turn", "rolled,ended", "rolled,paid,turn", "rolled,paid,ended", "purchased,turn", "purchased,ended", "skipped,auction_started", "upgraded", "building_sold", "building_sold,paid,turn", "building_sold,paid,ended", "mortgaged", "mortgaged,paid,turn", "mortgaged,paid,ended", "redeemed", "liquidated,paid,turn", "liquidated,paid,ended",
    "trade_proposed", "trade_accepted", "trade_rejected", "auction_bid", "auction_passed", ...["turn", "ended"].flatMap((end) => ["skipped,auction_ended," + end, "auction_bid,auction_ended,purchased," + end, "auction_passed,auction_ended,purchased," + end, "auction_passed,auction_ended," + end])];
  for (let start = 0; start < history.length;) {
    let end = start + 1;
    while (end < history.length && history[end]!.revision === history[start]!.revision) end += 1;
    const events = history.slice(start, end).map((entry) => entry.event);
    const signature = events.map((event) => event.kind).join(",");
    const truncated = start === 0 && history.length === HISTORY_LIMIT;
    if (!signatures.some((candidate) => candidate === signature || truncated && candidate.endsWith("," + signature))) throw new Error("历史提交事件无效");
    const first = events[0]!;
    const purchased = events.find((event) => event.kind === "purchased");
    const ended = events.find((event) => event.kind === "auction_ended");
    if (ended && (ended.winnerId !== null) !== !!purchased) throw new Error("拍卖结果缺少成交");
    if (purchased && (ended ? ended.propertyId !== purchased.propertyId || ended.winnerId !== purchased.actor || ended.price !== purchased.price
      : !(truncated && first.kind === "purchased") && snapshot.map.tiles.filter((tile) => tile.type === "property").find((tile) => tile.id === purchased.propertyId)?.price !== purchased.price)) throw new Error("成交价与历史不一致");
    const paid = events.find((event) => event.kind === "paid");
    if (paid && (!truncated || first.kind !== "paid") && (paid.actor !== (first.kind === "rolled" ? first.result.playerId : "actor" in first ? first.actor : null) ||
      (first.kind === "liquidated" ? paid.writtenOff === 0 : paid.writtenOff !== 0) || first.kind === "rolled" && !sameData(obligation(first.result.landing), paid.debt))) throw new Error("历史支付不一致");
    start = end;
  }
  return history;
}

function restoreDebt(value: unknown, snapshot: GameSnapshot, payer: PlayerId): PendingDebt {
  const debt = record(value, ["creditorId", "amount", "source", "continuation"]);
  const source = record(debt.source);
  if (source.kind === "rent") {
    record(source, ["kind", "propertyId", "ownerId", "amount"]);
    const tile = snapshot.map.tiles.find((candidate) => candidate.id === source.propertyId);
    if (!tile || tile.type !== "property" || !snapshot.config.players.some((player) => player.id === source.ownerId) || source.ownerId === payer ||
      ![0, ...([0, 1, 2, 3] as const).flatMap((level) => [false, true].map((group) => rentAmount(tile, { level, mortgagePrincipal: 0 }, snapshot.rules, group)))].includes(integer(source.amount))) throw new Error("债务租金无效");
  } else if (source.kind === "tax") {
    record(source, ["kind", "amount"]);
    if (!snapshot.map.tiles.some((tile) => tile.type === "tax" && tile.amount === integer(source.amount))) throw new Error("债务税费无效");
  } else if (source.kind === "chance") {
    restoreChance(source, snapshot);
    integer(source.amount, Number.MIN_SAFE_INTEGER, -1);
  } else throw new Error("债务来源无效");
  const expected = obligation(source as PendingDebt["source"]);
  if (!sameData(debt, expected)) throw new Error("债务金额或后继无效");
  return expected!;
}

function restoreChance(value: unknown, snapshot: GameSnapshot): void {
  const card = record(value, ["kind", "amount", "cardId", "instanceId"]);
  if (!cardInstances(snapshot.rules).includes(card.instanceId as CardInstanceId) || cardType(card.instanceId as CardInstanceId) !== card.cardId ||
      !snapshot.rules.chanceCards.some((rule) => rule.id === card.cardId && rule.amount === card.amount)) throw new Error("实体现金牌无效");
}

function restoreEvent(value: unknown, snapshot: GameSnapshot): GameEvent {
  const event = record(value);
  const actor = (value: unknown): PlayerId => {
    if (!snapshot.config.players.some((player) => player.id === value)) throw new Error("历史玩家无效");
    return value as PlayerId;
  };
  switch (event.kind) {
    case "trade_proposed":
    case "trade_accepted":
    case "trade_rejected": {
      record(event, event.kind === "trade_proposed" ? ["kind", "proposal"] : ["kind", "proposal", "reason"]);
      const proposal = restoreTradeProposal(event.proposal, snapshot);
      if (event.kind === "trade_proposed") return { kind: "trade_proposed", proposal };
      const bot = snapshot.config.players.find((player) => player.id === proposal.recipientId)!.controller === "bot";
      if (bot ? !["fair_value", "lower_value", "invalid_trade"].includes(event.reason as string) : event.reason !== null) throw new Error("交易响应原因无效");
      return { kind: event.kind, proposal, reason: event.reason as "fair_value" | "lower_value" | "invalid_trade" | null };
    }
    case "auction_started":
    case "auction_passed":
    case "auction_bid": {
      record(event, event.kind === "auction_bid" ? ["kind", "actor", "propertyId", "amount"] : ["kind", "actor", "propertyId"]);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId && candidate.type === "property");
      if (!tile) throw new Error("历史拍卖地产无效");
      if (event.kind !== "auction_bid") return { kind: event.kind, actor: actor(event.actor), propertyId: tile.id };
      const amount = integer(event.amount, AUCTION_STEP);
      if (amount % AUCTION_STEP !== 0) throw new Error("历史报价无效");
      return { kind: "auction_bid", actor: actor(event.actor), propertyId: tile.id, amount };
    }
    case "auction_ended": {
      record(event, ["kind", "propertyId", "winnerId", "price", "reason"]);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId && candidate.type === "property");
      const price = integer(event.price);
      if (!tile || !["sold", "all_passed", "no_bidders"].includes(event.reason as string) || (event.winnerId === null ? price !== 0 || event.reason === "sold" : price < AUCTION_STEP || price % AUCTION_STEP !== 0 || event.reason !== "sold")) throw new Error("历史拍卖结果无效");
      return { kind: "auction_ended", propertyId: tile.id, winnerId: event.winnerId === null ? null : actor(event.winnerId), price, reason: event.reason as "sold" | "all_passed" | "no_bidders" };
    }
    case "paid": {
      record(event, ["kind", "actor", "debt", "amount", "writtenOff"]);
      const payer = actor(event.actor);
      const debt = restoreDebt(event.debt, snapshot, payer);
      const amount = integer(event.amount, 0, debt.amount);
      if (event.writtenOff !== debt.amount - amount) throw new Error("历史冲销无效");
      return { kind: "paid", actor: payer, debt, amount, writtenOff: event.writtenOff as number };
    }
    case "liquidated": {
      record(event, ["kind", "actor", "constructionCost", "constructionRefund", "mortgageIncome", "principalReleased"]);
      const payer = actor(event.actor);
      const cost = integer(event.constructionCost);
      const refund = integer(event.constructionRefund);
      const mortgage = integer(event.mortgageIncome);
      const released = integer(event.principalReleased);
      if (!snapshot.players.find((player) => player.id === payer)!.bankrupt || BigInt(refund) * 100n > BigInt(cost) * BigInt(snapshot.rules.constructionSalePercent) || released < mortgage) throw new Error("历史清算无效");
      return { kind: "liquidated", actor: payer, constructionCost: cost, constructionRefund: refund, mortgageIncome: mortgage, principalReleased: released };
    }
    case "building_sold": {
      record(event, ["kind", "actor", "propertyId", "level", "cost", "refund"]);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId);
      if (!tile || tile.type !== "property") throw new Error("历史出售地产无效");
      const cost = integer(event.cost, 0, constructionCost(tile, snapshot.rules));
      if (event.refund !== constructionRefund(cost, snapshot.rules)) throw new Error("历史建筑退款无效");
      return { kind: "building_sold", actor: actor(event.actor), propertyId: tile.id, level: integer(event.level, 0, 2) as 0 | 1 | 2, cost, refund: event.refund as number };
    }
    case "mortgaged":
    case "redeemed": {
      record(event, event.kind === "mortgaged" ? ["kind", "actor", "propertyId", "principal"] : ["kind", "actor", "propertyId", "principal", "fee"]);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId);
      if (!tile || tile.type !== "property" || event.principal !== mortgageValue(tile, snapshot.rules) || event.principal === 0) throw new Error("历史抵押本金无效");
      const principal = event.principal as number;
      if (event.kind === "mortgaged") return { kind: "mortgaged", actor: actor(event.actor), propertyId: tile.id, principal };
      const fee = redemptionCost(principal, snapshot.rules) - principal;
      if (event.fee !== fee) throw new Error("历史赎回费用无效");
      return { kind: "redeemed", actor: actor(event.actor), propertyId: tile.id, principal, fee };
    }
    case "upgraded": {
      record(event, ["kind", "actor", "propertyId", "level", "cost"]);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId);
      if (!tile || tile.type !== "property") throw new Error("历史建筑地产无效");
      return { kind: "upgraded", actor: actor(event.actor), propertyId: tile.id,
        level: integer(event.level, 1, 3) as 1 | 2 | 3, cost: integer(event.cost, 0, constructionCost(tile, snapshot.rules)) };
    }
    case "turn":
      record(event, ["kind", "actor"]);
      return { kind: "turn", actor: actor(event.actor) };
    case "ended":
      record(event, ["kind", "result"]);
      if (snapshot.decision.kind !== "game_over" || !sameData(event.result, snapshot.decision.result)) throw new Error("历史终局无效");
      return { kind: "ended", result: matchResult(snapshot, snapshot.decision.result.reason) };
    case "purchased":
    case "skipped": {
      record(event, event.kind === "purchased" ? ["kind", "actor", "propertyId", "price"] : ["kind", "actor", "propertyId"]);
      const tile = snapshot.map.tiles.find((tile) => tile.id === event.propertyId);
      if (!tile || tile.type !== "property") throw new Error("历史地产无效");
      return event.kind === "purchased" ? { kind: "purchased", actor: actor(event.actor), propertyId: tile.id, price: integer(event.price) } : { kind: "skipped", actor: actor(event.actor), propertyId: tile.id };
    }
    case "rolled": {
      record(event, ["kind", "result"]);
      const result = record(event.result, ["playerId", "dice", "steps", "from", "to", "path", "passedStart", "startBonus", "landing"]);
      const playerId = actor(result.playerId);
      if (!Array.isArray(result.dice) || result.dice.length !== 2) throw new Error("历史骰子无效");
      const dice = [integer(result.dice[0], 1, 6), integer(result.dice[1], 1, 6)] as const;
      const steps = dice[0] + dice[1];
      const from = integer(result.from, 0, snapshot.map.tiles.length - 1);
      const path = Array.from({ length: steps }, (_, offset) => (from + offset + 1) % snapshot.map.tiles.length);
      const to = path.at(-1)!;
      const passedStart = path.includes(0);
      const startBonus = passedStart ? snapshot.rules.passStartBonus : 0;
      if (result.steps !== steps || result.to !== to || !sameData(result.path, path) || result.passedStart !== passedStart || result.startBonus !== startBonus) throw new Error("历史移动无效");
      const tile = snapshot.map.tiles[to]!;
      const landing = record(result.landing);
      switch (landing.kind) {
        case "start":
          record(landing, ["kind"]);
          if (tile.type !== "start") throw new Error("历史起点无效");
          break;
        case "tax":
          record(landing, ["kind", "amount"]);
          if (tile.type !== "tax" || landing.amount !== tile.amount) throw new Error("历史税费无效");
          break;
        case "chance":
          restoreChance(landing, snapshot);
          if (tile.type !== "chance") throw new Error("历史机会无效");
          break;
        case "property_available":
        case "property_owned":
        case "rent":
          record(landing, landing.kind === "rent" ? ["kind", "propertyId", "ownerId", "amount"] : landing.kind === "property_available" ? ["kind", "propertyId", "price"] : ["kind", "propertyId"]);
          if (tile.type !== "property" || landing.propertyId !== tile.id || landing.kind === "property_available" && landing.price !== tile.price) throw new Error("历史落点地产无效");
          if (landing.kind === "rent") {
            const amount = integer(landing.amount);
            const possible = [0, ...([0, 1, 2, 3] as const).flatMap((level) => [false, true].map((group) => rentAmount(tile, { level, mortgagePrincipal: 0 }, snapshot.rules, group)))];
            if (!possible.includes(amount) || actor(landing.ownerId) === playerId) throw new Error("历史租金无效");
          }
          break;
        default: throw new Error("历史落点无效");
      }
      const action: RollResult = { playerId, dice, steps, from, to, path, passedStart, startBonus, landing: { ...landing } as LandingResult };
      return { kind: "rolled", result: action };
    }
    default: throw new Error("历史事件无效");
  }
}
