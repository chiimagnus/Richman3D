import { createMatchConfig } from "./config";
import { mapFor } from "./maps";
import { QUICK_RULES, rulesFor } from "./rules";
import type { MatchConfig } from "./types";

export const CHALLENGE_VERSION = 1;
export const CHALLENGE_DAYS = 30;
export type DailyChallenge = {
  readonly id: string; readonly date: string; readonly version: number; readonly rulesVersion: string;
  readonly seed: number; readonly mapId: string; readonly mapVersion: number;
};

export function dailyChallenge(date: string, rulesVersion = QUICK_RULES.version, version = CHALLENGE_VERSION): DailyChallenge {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || version !== CHALLENGE_VERSION || rulesFor(rulesVersion).roundLimit !== QUICK_RULES.roundLimit) throw new Error("挑战版本或日期无效");
  const id = `${date}|${rulesVersion}|daily-v${version}`;
  let seed = 0x811c9dc5;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 0x01000193) >>> 0;
  const map = mapFor(Number(date.slice(-2)) % 2 === 0 ? "city" : "harbor", 1);
  return { id, date, version, rulesVersion, seed, mapId: map.id, mapVersion: map.version };
}

export function challengeConfig(challenge: DailyChallenge): MatchConfig {
  return { ...createMatchConfig(challenge.seed, 3), rulesVersion: challenge.rulesVersion, mapId: challenge.mapId, mapVersion: challenge.mapVersion };
}
