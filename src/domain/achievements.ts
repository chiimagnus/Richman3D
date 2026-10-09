import { completeGroup } from "./economy";
import type { GameEvent, GameSnapshot, PlayerId } from "./types";

export const ACHIEVEMENTS = ["first-match", "first-purchase", "complete-group", "level-three", "debt-rescued", "building-sale", "first-trade", "both-maps"] as const;
export type AchievementId = typeof ACHIEVEMENTS[number];

export function matchAchievements(before: GameSnapshot, after: GameSnapshot, events: readonly GameEvent[]): readonly AchievementId[] {
  const earned = new Set<AchievementId>();
  const human = (id: PlayerId) => after.config.players.some((player) => player.id === id && player.controller === "human");
  for (const event of events) {
    if (event.kind === "ended") earned.add("first-match");
    if (event.kind === "purchased" && human(event.actor)) earned.add("first-purchase");
    if (event.kind === "building_sold" && human(event.actor)) earned.add("building-sale");
    if (event.kind === "paid" && before.decision.kind === "awaiting_debt" && event.writtenOff === 0 && human(event.actor)) earned.add("debt-rescued");
    if (event.kind === "trade_accepted" && (human(event.proposal.proposerId) || human(event.proposal.recipientId))) earned.add("first-trade");
  }
  for (const tile of after.map.tiles) {
    if (tile.type !== "property") continue;
    const property = after.properties[tile.id]!;
    if (property.ownerId !== null && human(property.ownerId)) {
      if (completeGroup(after, tile)) earned.add("complete-group");
      if (property.level === 3) earned.add("level-three");
    }
  }
  return ACHIEVEMENTS.filter((id) => earned.has(id));
}
