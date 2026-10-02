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

export function createMatchConfig(seed = 1): MatchConfig {
  return { seed, rulesVersion: QUICK_RULES.version, mapId: CITY.id, mapVersion: CITY.version,
    players: [
      { id: "p1", controller: "human", name: null, defaultNameKey: "p1", color: SEAT_COLORS[0] },
      { id: "p2", controller: "bot", name: null, defaultNameKey: "p2", color: SEAT_COLORS[1] },
    ],
  };
}

export function validateConfig(config: MatchConfig): void {
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffff_ffff || config.players.length < 2 || config.players.length > 4 || !config.players.some((player) => player.controller === "human")) throw new Error("对局配置无效");
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
