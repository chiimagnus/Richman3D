import { legalCommands, pendingProperty } from "./selectors";
import type { Command, GameSnapshot } from "./types";
import { playerConfig } from "./config";

export function chooseBotCommand(snapshot: GameSnapshot): Command | null {
  if (playerConfig(snapshot.config, snapshot.activePlayerId).controller !== "bot") return null;
  const commands = legalCommands(snapshot, snapshot.activePlayerId);
  const property = pendingProperty(snapshot);
  const bot = snapshot.players.find((player) => player.id === snapshot.activePlayerId);
  const kind = property ? (bot && bot.cash - property.price >= 260 ? "buy" : "skip") : "roll";
  return commands.find((command) => command.kind === kind) ?? null;
}
