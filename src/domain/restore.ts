import { validateConfig } from "./config";
import { mapFor } from "./maps";
import { RuleRandom } from "./random";
import { rulesFor } from "./rules";
import { initialTurnOrder } from "./turns";
import { matchResult, netAssets } from "./selectors";
import type { GameSnapshot, MatchConfig, SavedGameState } from "./types";

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
  const state = record(value, ["revision", "config", "completedRounds", "turnOrder", "players", "turnPlayerId", "decision", "owners", "lastRoll", "random"]);
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
  const statsKeys = ["startBonus", "rentReceived", "rentPaid", "taxesPaid", "chanceIncome", "chanceExpense", "purchases"] as const;
  for (const [index, raw] of state.players.entries()) {
    const player = record(raw, ["id", "cash", "position", "bankrupt", "statistics"]);
    if (player.id !== config.players[index]!.id || typeof player.bankrupt !== "boolean") throw new Error("玩家身份无效");
    const cash = integer(player.cash, Number.MIN_SAFE_INTEGER);
    integer(player.position, 0, map.tiles.length - 1);
    if (player.bankrupt !== (cash < 0)) throw new Error("破产状态无效");
    const stats = record(player.statistics, statsKeys);
    for (const field of statsKeys) integer(stats[field]);
    const balance = BigInt(rules.startingCash) + BigInt(stats.startBonus as number) + BigInt(stats.rentReceived as number) + BigInt(stats.chanceIncome as number)
      - BigInt(stats.rentPaid as number) - BigInt(stats.taxesPaid as number) - BigInt(stats.chanceExpense as number) - BigInt(stats.purchases as number);
    if (balance !== BigInt(cash)) throw new Error("财务统计不平");
  }
  const owners = record(state.owners);
  for (const [propertyId, owner] of Object.entries(owners)) {
    if (!map.tiles.some((tile) => tile.type === "property" && tile.id === propertyId) || !(state.players as SavedGameState["players"]).some((player) => player.id === owner && !player.bankrupt)) throw new Error("产权引用无效");
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
      if (!snapshot.lastRoll || tile.type !== "property" || tile.id !== snapshot.decision.propertyId || Object.hasOwn(owners, tile.id)) throw new Error("待购地产无效");
    }
  }
  for (const player of snapshot.players) {
    netAssets(snapshot, player.id);
    const purchased = map.tiles.reduce((total, tile) => total + (tile.type === "property" && owners[tile.id] === player.id ? BigInt(tile.price) : 0n), 0n);
    if (!player.bankrupt && purchased !== BigInt(player.statistics.purchases)) throw new Error("购地统计不平");
  }
  if (snapshot.players.reduce((total, player) => total + BigInt(player.statistics.rentReceived) - BigInt(player.statistics.rentPaid), 0n) !== 0n) throw new Error("租金统计不平");
  if (snapshot.revision === 0 && (snapshot.completedRounds !== 0 || snapshot.turnPlayerId !== snapshot.turnOrder[0] || decision.kind !== "awaiting_roll" || Object.keys(owners).length !== 0 ||
      !sameData(random, initialRandom.snapshot) || snapshot.players.some((player) => player.position !== 0 || player.cash !== rules.startingCash || Object.values(player.statistics).some((amount) => amount !== 0)))) throw new Error("初始状态无效");
  return {
    ...snapshot, config: { ...config, players: config.players.map((player) => ({ ...player })) },
    players: snapshot.players.map((player) => ({ ...player, statistics: { ...player.statistics } })),
    turnOrder: [...snapshot.turnOrder],
    owners: { ...snapshot.owners }, random: { ...snapshot.random }, lastRoll: snapshot.lastRoll ? [...snapshot.lastRoll] : null,
    decision: snapshot.decision.kind === "game_over" ? { kind: "game_over", result: matchResult(snapshot, snapshot.decision.result.reason) } : { ...snapshot.decision },
    rules: { ...rules, chanceCards: rules.chanceCards.map((card) => ({ ...card })) },
    map: { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), path: map.path.map((point) => ({ ...point })) },
  };
}
