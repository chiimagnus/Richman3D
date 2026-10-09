import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { matchAchievements, type AchievementId } from "../../src/domain/achievements";
import type { MatchConfig } from "../../src/domain/types";

export function finishMatch(game: Game): readonly AchievementId[] {
  const earned = new Set<AchievementId>();
  for (let count = 0; game.snapshot.decision.kind !== "game_over" && count < 400; count += 1) {
    const before = game.snapshot;
    if (before.decision.kind === "game_over") break;
    const choices = legalCommands(before, before.decision.actorId);
    const command = choices.find((choice) => choice.kind === "buy") ?? choices.find((choice) => choice.kind === "roll") ?? choices[0]!;
    const result = game.apply(command);
    if (!result.ok) throw new Error(result.reason);
    matchAchievements(before, result.snapshot, result.events).forEach((id) => earned.add(id));
  }
  if (game.snapshot.decision.kind !== "game_over") throw new Error("Match did not finish");
  return [...earned];
}

export function recordMatch(config: MatchConfig = createMatchConfig()): Game {
  const game = new Game(config);
  finishMatch(game);
  return game;
}
