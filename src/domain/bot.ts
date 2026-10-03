import { legalCommands, pendingProperty } from "./selectors";
import type { Command, GameSnapshot } from "./types";
import { playerConfig } from "./config";
import { liquidityOption, propertyTile, rentFor } from "./economy";

export function chooseBotCommand(snapshot: GameSnapshot): Command | null {
  if (snapshot.decision.kind === "game_over") return null;
  const actor = snapshot.decision.actorId;
  if (playerConfig(snapshot.config, actor).controller !== "bot") return null;
  const commands = legalCommands(snapshot, actor);
  if (snapshot.decision.kind === "awaiting_auction") {
    const bid = commands.find((command) => command.kind === "auction_bid");
    const player = snapshot.players.find((candidate) => candidate.id === actor)!;
    return bid?.kind === "auction_bid" && bid.amount <= propertyTile(snapshot.map, snapshot.decision.propertyId).price && player.cash - bid.amount >= 260 ? bid
      : commands.find((command) => command.kind === "auction_pass")!;
  }
  if (snapshot.decision.kind === "awaiting_debt") {
    const bankrupt = commands.find((command) => command.kind === "bankrupt");
    if (bankrupt) return bankrupt;
    return commands.filter((command): command is Extract<Command, { propertyId: string }> & { kind: "sell_building" | "mortgage" } => "propertyId" in command && (command.kind === "sell_building" || command.kind === "mortgage"))
      .map((command) => {
        const option = liquidityOption(snapshot, actor, command.propertyId, command.kind);
        const tile = snapshot.map.tiles.find((candidate) => candidate.id === command.propertyId)!;
        const groupLoss = command.kind === "mortgage" && tile.type === "property" ? snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group && candidate.id !== tile.id)
          .reduce((loss, candidate) => loss + Math.max(0, rentFor(snapshot, candidate.id) - rentFor({ ...snapshot, properties: { ...snapshot.properties, [tile.id]: option.nextProperty } }, candidate.id)), 0) : 0;
        return { command, loss: option.currentRent - option.nextRent + groupLoss };
      }).sort((first, second) => first.loss - second.loss)[0]?.command ?? null;
  }
  const property = pendingProperty(snapshot);
  const bot = snapshot.players.find((player) => player.id === actor);
  const kind = property ? (bot && bot.cash - property.price >= 260 ? "buy" : "skip") : "roll";
  return commands.find((command) => command.kind === kind) ?? null;
}
