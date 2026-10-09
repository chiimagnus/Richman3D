import { challengeConfig, CHALLENGE_DAYS, dailyChallenge, type DailyChallenge } from "../domain/challenges";
import { integer, record, sameData } from "../domain/restore";
import { SaveError, type SaveRecord } from "./snapshot";

export type ChallengeScore = { readonly rank: number; readonly netAssets: number; readonly cash: number };
export type ChallengeRecord = { readonly challenge: DailyChallenge; readonly attempts: number; readonly first: ChallengeScore | null; readonly best: ChallengeScore | null };
export type ChallengeProfile = {
  readonly active: { readonly matchId: string; readonly challenge: DailyChallenge | null; readonly completed: boolean } | null;
  readonly results: readonly ChallengeRecord[];
};

export const EMPTY_CHALLENGES: ChallengeProfile = { active: null, results: [] };

export function readChallenge(value: unknown): DailyChallenge {
  const raw = record(value, ["id", "date", "version", "rulesVersion", "seed", "mapId", "mapVersion"]);
  if (typeof raw.date !== "string" || typeof raw.rulesVersion !== "string") throw new Error("挑战字段无效");
  const challenge = dailyChallenge(raw.date, raw.rulesVersion, integer(raw.version, 1));
  if (!sameData(raw, challenge)) throw new Error("挑战配置无效");
  return challenge;
}

function score(value: unknown): ChallengeScore | null {
  if (value === null) return null;
  const raw = record(value, ["rank", "netAssets", "cash"]);
  const result = { rank: integer(raw.rank, 1, 3), netAssets: integer(raw.netAssets), cash: integer(raw.cash) };
  if (result.cash > result.netAssets) throw new Error("挑战金额无效");
  return result;
}

export function readChallengeProfile(value: unknown): ChallengeProfile {
  if (value === undefined) return EMPTY_CHALLENGES;
  try {
    const raw = record(value, ["active", "results"]);
    const active = raw.active === null ? null : record(raw.active, ["matchId", "challenge", "completed"]);
    if (active && (typeof active.matchId !== "string" || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(active.matchId) || typeof active.completed !== "boolean")) throw new Error("挑战对局无效");
    if (!Array.isArray(raw.results)) throw new Error("挑战记录无效");
    const results = raw.results.map((value) => {
      const entry = record(value, ["challenge", "attempts", "first", "best"]);
      const first = score(entry.first); const best = score(entry.best);
      if ((first === null) !== (best === null) || first && best && better(first, best)) throw new Error("挑战首次与最佳不一致");
      return { challenge: readChallenge(entry.challenge), attempts: integer(entry.attempts, 1), first, best };
    });
    if (new Set(results.map((entry) => entry.challenge.id)).size !== results.length || new Set(results.map((entry) => entry.challenge.date)).size > CHALLENGE_DAYS) throw new Error("挑战记录重复或超限");
    return { active: active ? { matchId: active.matchId as string, challenge: active.challenge === null ? null : readChallenge(active.challenge), completed: active.completed as boolean } : null, results };
  } catch (cause) { throw new SaveError("invalid", { cause }); }
}

function better(candidate: ChallengeScore, current: ChallengeScore): boolean {
  return candidate.netAssets > current.netAssets || candidate.netAssets === current.netAssets && (candidate.cash > current.cash || candidate.cash === current.cash && candidate.rank < current.rank);
}

export function advanceChallenges(profile: ChallengeProfile, save: SaveRecord, requested?: DailyChallenge): ChallengeProfile {
  let active = profile.active;
  let results = [...profile.results];
  if (requested && (!sameData(readChallenge(requested), requested) || !sameData(challengeConfig(requested), save.state.config))) throw new SaveError("invalid");
  if (active?.matchId !== save.matchId) {
    active = save.source === "local" && save.revision === 0 ? { matchId: save.matchId, challenge: requested ?? null, completed: false } : null;
    if (active?.challenge) {
      const challenge = active.challenge;
      const existing = results.find((entry) => entry.challenge.id === challenge.id);
      if (existing) results = results.map((entry) => entry === existing ? { ...entry, attempts: integer(entry.attempts + 1, 1) } : entry);
      else results.push({ challenge, attempts: 1, first: null, best: null });
      const dates = [...new Set(results.map((entry) => entry.challenge.date))].sort().reverse().slice(0, CHALLENGE_DAYS);
      results = results.filter((entry) => dates.includes(entry.challenge.date)).sort((first, second) => second.challenge.id.localeCompare(first.challenge.id));
    }
  } else if (requested && !sameData(requested, active.challenge)) throw new SaveError("conflict");
  if (active && !active.completed && save.source === "local" && save.state.decision.kind === "game_over") {
    if (active.challenge) {
      const ranking = save.state.decision.result.rankings.find((entry) => entry.playerId === "p1")!;
      const candidate: ChallengeScore = { rank: ranking.rank, netAssets: ranking.netAssets, cash: ranking.cash };
      results = results.map((entry) => entry.challenge.id === active!.challenge!.id ? { ...entry, first: entry.first ?? candidate, best: entry.best === null || better(candidate, entry.best) ? candidate : entry.best } : entry);
    }
    active = { ...active, completed: true };
  }
  return { active, results };
}
