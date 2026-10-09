import type { BotDifficulty, FinancialStats, GameSnapshot, PlayerId } from "./types";

export const MATCH_RECORD_LIMIT = 20;
export type MatchSummary = {
  readonly matchId: string; readonly endedAt: number; readonly mode: "free" | "challenge";
  readonly mapId: string; readonly mapVersion: number; readonly rulesVersion: string; readonly seed: number;
  readonly rounds: number; readonly roundLimit: number; readonly reason: "last_survivor" | "round_limit";
  readonly players: readonly {
    readonly id: PlayerId; readonly controller: "human" | "bot"; readonly difficulty: BotDifficulty;
    readonly rank: number; readonly cash: number; readonly netAssets: number; readonly statistics: FinancialStats;
  }[];
};

export function matchSummary(snapshot: GameSnapshot, matchId: string, mode: MatchSummary["mode"], endedAt: number): MatchSummary {
  if (snapshot.decision.kind !== "game_over") throw new Error("对局尚未结束");
  const rankings = snapshot.decision.result.rankings;
  return { matchId, mode, endedAt, mapId: snapshot.config.mapId, mapVersion: snapshot.config.mapVersion, rulesVersion: snapshot.config.rulesVersion,
    seed: snapshot.config.seed, rounds: snapshot.completedRounds, roundLimit: snapshot.rules.roundLimit, reason: snapshot.decision.result.reason,
    players: snapshot.config.players.map((player) => {
      const ranking = rankings.find((entry) => entry.playerId === player.id)!;
      return { id: player.id, controller: player.controller, difficulty: player.difficulty, rank: ranking.rank, cash: ranking.cash,
        netAssets: ranking.netAssets, statistics: { ...snapshot.players.find((entry) => entry.id === player.id)!.statistics } };
    }) };
}
