import { ACHIEVEMENTS, type AchievementId } from "../domain/achievements";
import { MATCH_RECORD_LIMIT, matchSummary, type MatchSummary } from "../domain/records";
import { integer, record } from "../domain/restore";
import { mapFor } from "../domain/maps";
import { BOT_DIFFICULTIES, type FinancialStats, type GameSnapshot } from "../domain/types";
import { SEAT_IDS } from "../domain/config";
import { SaveError, type SaveRecord } from "./snapshot";
import type { ChallengeProfile } from "./challenges";

export type RecordProfile = {
  readonly recent: readonly MatchSummary[]; readonly achievements: readonly AchievementId[]; readonly completedMaps: readonly string[];
  readonly milestones: { readonly matchId: string; readonly earned: readonly AchievementId[] } | null;
};
export const EMPTY_RECORDS: RecordProfile = { recent: [], achievements: [], completedMaps: [], milestones: null };

function identity(value: unknown): string {
  if (typeof value !== "string" || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) throw new Error("对局标识无效");
  return value;
}

function achievementIds(value: unknown): readonly AchievementId[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((id) => !ACHIEVEMENTS.includes(id))) throw new Error("成就记录无效");
  return [...value];
}

const STAT_FIELDS: readonly (keyof FinancialStats)[] = ["startBonus", "rentReceived", "rentPaid", "taxesPaid", "chanceIncome", "chanceExpense", "purchases", "purchaseBookValue", "tradeCashReceived", "tradeCashPaid", "tradeBookValueReceived", "tradeBookValueGiven", "constructionSpent", "constructionRefunds", "constructionSoldCost", "debtWrittenOff", "rentLost"];

function summary(value: unknown): MatchSummary {
  const raw = record(value, ["matchId", "endedAt", "mode", "mapId", "mapVersion", "rulesVersion", "seed", "rounds", "roundLimit", "reason", "players"]);
  identity(raw.matchId); integer(raw.endedAt, 0, 8_640_000_000_000_000); integer(raw.mapVersion, 1); integer(raw.seed, 0, 0xffff_ffff);
  integer(raw.rounds, 0, integer(raw.roundLimit, 1));
  if (typeof raw.mapId !== "string" || typeof raw.rulesVersion !== "string" || !raw.rulesVersion || !["free", "challenge"].includes(raw.mode as string) || !["last_survivor", "round_limit"].includes(raw.reason as string)) throw new Error("对局摘要无效");
  mapFor(raw.mapId, raw.mapVersion as number);
  if (!Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 4) throw new Error("摘要席位无效");
  for (const [index, value] of raw.players.entries()) {
    const player = record(value, ["id", "controller", "difficulty", "rank", "cash", "netAssets", "statistics"]);
    if (player.id !== SEAT_IDS[index] || !["human", "bot"].includes(player.controller as string) || !BOT_DIFFICULTIES.includes(player.difficulty as typeof BOT_DIFFICULTIES[number])) throw new Error("摘要玩家无效");
    integer(player.rank, 1, raw.players.length); integer(player.cash); integer(player.netAssets, player.cash as number);
    const statistics = record(player.statistics, STAT_FIELDS); STAT_FIELDS.forEach((field) => integer(statistics[field]));
  }
  return raw as unknown as MatchSummary;
}

export function readRecordProfile(value: unknown): RecordProfile {
  if (value === undefined) return EMPTY_RECORDS;
  try {
    const raw = record(value, ["recent", "achievements", "completedMaps", "milestones"]);
    if (!Array.isArray(raw.recent) || raw.recent.length > MATCH_RECORD_LIMIT) throw new Error("战绩超限");
    const recent = raw.recent.map(summary);
    if (new Set(recent.map((entry) => entry.matchId)).size !== recent.length || !Array.isArray(raw.completedMaps) || new Set(raw.completedMaps).size !== raw.completedMaps.length || raw.completedMaps.some((id) => id !== "city" && id !== "harbor")) throw new Error("战绩或地图记录无效");
    const milestones = raw.milestones === null ? null : record(raw.milestones, ["matchId", "earned"]);
    return { recent, achievements: achievementIds(raw.achievements), completedMaps: [...raw.completedMaps],
      milestones: milestones ? { matchId: identity(milestones.matchId), earned: achievementIds(milestones.earned) } : null };
  } catch (cause) { throw new SaveError("invalid", { cause }); }
}

export function advanceRecords(profile: RecordProfile, before: ChallengeProfile, after: ChallengeProfile, save: SaveRecord, snapshot: GameSnapshot, earned: readonly AchievementId[]): RecordProfile {
  if (save.source !== "local" || after.active?.matchId !== save.matchId) return profile;
  const baseline = profile.milestones?.matchId === save.matchId ? profile.milestones.earned : [];
  const additions = earned.filter((id) => !baseline.includes(id));
  const achievements = new Set([...profile.achievements, ...additions]);
  const milestones = { matchId: save.matchId, earned: ACHIEVEMENTS.filter((id) => baseline.includes(id) || earned.includes(id)) };
  let recent = profile.recent; let completedMaps = profile.completedMaps;
  if (snapshot.decision.kind === "game_over" && before.active?.matchId === save.matchId && !before.active.completed) {
    const result = matchSummary(snapshot, save.matchId, after.active.challenge ? "challenge" : "free", save.savedAt);
    recent = [result, ...recent.filter((entry) => entry.matchId !== save.matchId)].slice(0, MATCH_RECORD_LIMIT);
    completedMaps = [...new Set([...completedMaps, result.mapId])];
    achievements.add("first-match");
    if (completedMaps.includes("city") && completedMaps.includes("harbor")) achievements.add("both-maps");
  }
  return { recent, completedMaps, milestones, achievements: ACHIEVEMENTS.filter((id) => achievements.has(id)) };
}
