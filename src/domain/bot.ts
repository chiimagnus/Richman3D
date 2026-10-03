import { legalCommands, pendingProperty } from "./selectors";
import type { Command, GameSnapshot } from "./types";
import { playerConfig } from "./config";

export function chooseBotCommand(snapshot: GameSnapshot): Command | null {
  if (snapshot.decision.kind === "game_over") return null;
  const actor = snapshot.decision.actorId;
  if (playerConfig(snapshot.config, actor).controller !== "bot") return null;
  const commands = legalCommands(snapshot, actor);
  const property = pendingProperty(snapshot);
  const bot = snapshot.players.find((player) => player.id === actor);
  const kind = property ? (bot && bot.cash - property.price >= 260 ? "buy" : "skip") : "roll";
  return commands.find((command) => command.kind === kind) ?? null;
}
