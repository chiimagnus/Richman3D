import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";

export const propertyMatchId = "00000000-0000-4000-8000-000000000005";

export function propertyMatch(): Game {
  const game = new Game(createMatchConfig(1407));
  for (let index = 0; index < 11; index += 1) {
    const kind = game.snapshot.decision.kind === "awaiting_purchase" ? "buy" : "roll";
    const command = chooseBotCommand(game.snapshot) ?? legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((candidate) => candidate.kind === kind)!;
    const result = game.apply(command);
    if (!result.ok) throw new Error(result.reason);
  }
  return game;
}
