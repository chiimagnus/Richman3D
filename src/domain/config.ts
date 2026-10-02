import type { MatchConfig, PlayerConfig, PlayerId } from "./types";
import { QUICK_RULES } from "./rules";
import { CITY } from "./maps/city";

export const SEAT_IDS: readonly PlayerId[] = ["p1", "p2", "p3", "p4"];
export const SEAT_COLORS = ["#57d4ff", "#ffb75e", "#b58cff", "#62e2aa"] as const;

export function normalizeName(value: string): string | null {
  const name = value.trim();
  if (!name) return null;
  if ([...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name)].length > 16) throw new RangeError("姓名超出长度");
  return name;
}

export function createMatchConfig(seed = 1, seats = 2): MatchConfig {
  if (!Number.isInteger(seats) || seats < 2 || seats > SEAT_IDS.length) throw new Error("席位数量无效");
  return { seed, rulesVersion: QUICK_RULES.version, mapId: CITY.id, mapVersion: CITY.version,
    players: SEAT_IDS.slice(0, seats).map((id, index) => ({ id, controller: index === 0 ? "human" : "bot", name: null, defaultNameKey: id, color: SEAT_COLORS[index]! })),
  };
}

export function validateConfig(config: MatchConfig): void {
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffff_ffff || config.players.length < 2 || config.players.length > 4) throw new Error("对局配置无效");
  for (const [index, player] of config.players.entries()) {
    if (player.id !== SEAT_IDS[index] || player.defaultNameKey !== player.id || !["human", "bot"].includes(player.controller) || !/^#[\da-f]{6}$/i.test(player.color) || (player.name !== null && (typeof player.name !== "string" || normalizeName(player.name) !== player.name))) throw new Error("席位配置无效");
  }
}

export function playerConfig(config: MatchConfig, id: PlayerId): PlayerConfig {
  const player = config.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("席位不存在");
  return player;
}

export function observerId(config: MatchConfig): PlayerId {
  const player = config.players.find((candidate) => candidate.controller === "human");
  if (!player) throw new Error("缺少本地玩家");
  return player.id;
}
