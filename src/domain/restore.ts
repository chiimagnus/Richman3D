import { validateConfig } from "./config";
import { mapFor } from "./maps";
import { RuleRandom } from "./random";
import { rulesFor } from "./rules";
import { initialTurnOrder } from "./turns";
import { matchResult } from "./selectors";
import { completeGroup, constructionCost, mortgageValue, netAssets, rentAmount } from "./economy";
import { HISTORY_LIMIT, type GameEvent, type GameSnapshot, type LandingResult, type MatchConfig, type PlayerId, type RollResult, type SavedGameState } from "./types";

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

export function restoreSnapshot(value: unknown): GameSnapshot {
  const state = record(value, ["revision", "config", "completedRounds", "turnOrder", "players", "turnPlayerId", "decision", "properties", "lastRoll", "random", "history"]);
  const configValue = record(state.config, ["players", "seed", "rulesVersion", "mapId", "mapVersion"]);
  if (!Array.isArray(configValue.players) || configValue.players.length < 2 || configValue.players.length > 4) throw new Error("席位数量无效");
  for (const player of configValue.players) record(player, ["id", "controller", "name", "defaultNameKey", "color"]);
  const config = configValue as MatchConfig;
  validateConfig(config);
  if (typeof config.rulesVersion !== "string" || typeof config.mapId !== "string") throw new Error("版本无效");
  integer(config.mapVersion, 1);
  const rules = rulesFor(config.rulesVersion);
  const map = mapFor(config.mapId, config.mapVersion);
  integer(state.revision);
  integer(state.completedRounds, 0, rules.roundLimit);
  const initialRandom = new RuleRandom(config.seed);
  if (!sameData(state.turnOrder, initialTurnOrder(config, initialRandom))) throw new Error("固定轮序无效");
  if (!Array.isArray(state.players) || state.players.length !== config.players.length) throw new Error("玩家数量无效");
  const statsKeys = ["startBonus", "rentReceived", "rentPaid", "taxesPaid", "chanceIncome", "chanceExpense", "purchases", "constructionSpent"] as const;
  for (const [index, raw] of state.players.entries()) {
    const player = record(raw, ["id", "cash", "position", "bankrupt", "statistics"]);
    if (player.id !== config.players[index]!.id || typeof player.bankrupt !== "boolean") throw new Error("玩家身份无效");
    const cash = integer(player.cash, Number.MIN_SAFE_INTEGER);
    integer(player.position, 0, map.tiles.length - 1);
    if (player.bankrupt !== (cash < 0)) throw new Error("破产状态无效");
    const stats = record(player.statistics, statsKeys);
    for (const field of statsKeys) integer(stats[field]);
    const balance = BigInt(rules.startingCash) + BigInt(stats.startBonus as number) + BigInt(stats.rentReceived as number) + BigInt(stats.chanceIncome as number)
      - BigInt(stats.rentPaid as number) - BigInt(stats.taxesPaid as number) - BigInt(stats.chanceExpense as number) - BigInt(stats.purchases as number) - BigInt(stats.constructionSpent as number);
    if (balance !== BigInt(cash)) throw new Error("财务统计不平");
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
  } else if (!sameData(random, initialRandom.snapshot) || state.revision !== 0) throw new Error("缺少骰子");
  const decision = record(state.decision);
  if (!["awaiting_roll", "awaiting_purchase", "game_over"].includes(decision.kind as string)) throw new Error("决策无效");
  record(decision, decision.kind === "awaiting_purchase" ? ["kind", "actorId", "propertyId"] : decision.kind === "game_over" ? ["kind", "result"] : ["kind", "actorId"]);
  const snapshot = { ...state, config, rules, map } as GameSnapshot;
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
    if (living < 2 || active.bankrupt || snapshot.completedRounds >= rules.roundLimit || snapshot.decision.actorId !== snapshot.turnPlayerId) throw new Error("决策阶段无效");
    if (snapshot.decision.kind === "awaiting_purchase") {
      const tile = map.tiles[active.position]!;
      if (!snapshot.lastRoll || tile.type !== "property" || tile.id !== snapshot.decision.propertyId || snapshot.properties[tile.id]!.ownerId !== null) throw new Error("待购地产无效");
    }
  }
  for (const player of snapshot.players) {
    netAssets(snapshot, player.id);
    const purchased = map.tiles.reduce((total, tile) => total + (tile.type === "property" && snapshot.properties[tile.id]!.ownerId === player.id ? BigInt(tile.price) : 0n), 0n);
    if (!player.bankrupt && purchased !== BigInt(player.statistics.purchases)) throw new Error("购地统计不平");
    const construction = Object.values(snapshot.properties).reduce((total, property) => property.ownerId === player.id ? total + property.constructionCosts.reduce((sum, cost) => sum + BigInt(cost), 0n) : total, 0n);
    if (!player.bankrupt && construction !== BigInt(player.statistics.constructionSpent)) throw new Error("建设统计不平");
  }
  if (snapshot.players.reduce((total, player) => total + BigInt(player.statistics.rentReceived) - BigInt(player.statistics.rentPaid), 0n) !== 0n) throw new Error("租金统计不平");
  if (snapshot.revision === 0 && (snapshot.completedRounds !== 0 || snapshot.turnPlayerId !== snapshot.turnOrder[0] || decision.kind !== "awaiting_roll" || Object.values(snapshot.properties).some((property) => property.ownerId !== null) ||
      !sameData(random, initialRandom.snapshot) || snapshot.players.some((player) => player.position !== 0 || player.cash !== rules.startingCash || Object.values(player.statistics).some((amount) => amount !== 0)))) throw new Error("初始状态无效");
  return {
    ...snapshot, config: { ...config, players: config.players.map((player) => ({ ...player })) },
    history: restoreHistory(state.history, snapshot),
    players: snapshot.players.map((player) => ({ ...player, statistics: { ...player.statistics } })),
    turnOrder: [...snapshot.turnOrder],
    properties: Object.fromEntries(Object.entries(snapshot.properties).map(([id, property]) => [id, { ...property, constructionCosts: [...property.constructionCosts] }])),
    random: { ...snapshot.random }, lastRoll: snapshot.lastRoll ? [...snapshot.lastRoll] : null,
    decision: snapshot.decision.kind === "game_over" ? { kind: "game_over", result: matchResult(snapshot, snapshot.decision.result.reason) } : { ...snapshot.decision },
    rules: { ...rules, rentMultipliers: [...rules.rentMultipliers], chanceCards: rules.chanceCards.map((card) => ({ ...card })) },
    map: { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), path: map.path.map((point) => ({ ...point })) },
  };
}

function restoreHistory(value: unknown, snapshot: GameSnapshot): GameSnapshot["history"] {
  if (!Array.isArray(value) || value.length > HISTORY_LIMIT || (snapshot.revision === 0 ? value.length !== 0 : value.length === 0)) throw new Error("历史数量无效");
  let previous = 0;
  let count = 0;
  const history = value.map((raw) => {
    const entry = record(raw, ["revision", "event"]);
    const revision = integer(entry.revision, 1, snapshot.revision);
    if (previous && (revision < previous || revision > previous + 1)) throw new Error("历史顺序无效");
    count = revision === previous ? count + 1 : 1;
    if (count > 2) throw new Error("历史重复事件");
    previous = revision;
    return { revision, event: restoreEvent(entry.event, snapshot) };
  });
  if (previous !== snapshot.revision) throw new Error("历史缺少最新提交");
  return history;
}

function restoreEvent(value: unknown, snapshot: GameSnapshot): GameEvent {
  const event = record(value);
  const actor = (value: unknown): PlayerId => {
    if (!snapshot.config.players.some((player) => player.id === value)) throw new Error("历史玩家无效");
    return value as PlayerId;
  };
  switch (event.kind) {
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
      if (!tile || tile.type !== "property" || event.kind === "purchased" && event.price !== tile.price) throw new Error("历史地产无效");
      return event.kind === "purchased" ? { kind: "purchased", actor: actor(event.actor), propertyId: tile.id, price: tile.price } : { kind: "skipped", actor: actor(event.actor), propertyId: tile.id };
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
          record(landing, ["kind", "amount", "cardId"]);
          if (tile.type !== "chance" || !snapshot.rules.chanceCards.some((card) => card.id === landing.cardId && card.amount === landing.amount)) throw new Error("历史机会无效");
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
