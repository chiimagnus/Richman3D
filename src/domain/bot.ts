import { legalCommands, pendingProperty } from "./selectors";
import type { Command, GameSnapshot } from "./types";

export function chooseBotCommand(snapshot: GameSnapshot): Command | null {
  const commands = legalCommands(snapshot, "bot");
  const property = pendingProperty(snapshot);
  const bot = snapshot.players.find((player) => player.id === "bot");
  const kind = property ? (bot && bot.cash - property.price >= 260 ? "buy" : "skip") : "roll";
  return commands.find((command) => command.kind === kind) ?? null;
}
