import { BOARD, tileAt, type PropertyTile } from "./board";
import type { Command, GameSnapshot, PlayerId } from "./types";

export function pendingProperty(snapshot: GameSnapshot): PropertyTile | null {
  const decision = snapshot.decision;
  if (decision.kind !== "awaiting_purchase") return null;
  const tile = BOARD.find((candidate) => candidate.id === decision.propertyId);
  return tile?.type === "property" ? tile : null;
}

export function currentTile(snapshot: GameSnapshot) {
  const player = snapshot.players.find((candidate) => candidate.id === snapshot.activePlayerId);
  if (!player) throw new Error("当前玩家不存在");
  return tileAt(player.position);
}

export function legalCommands(snapshot: GameSnapshot, actor: PlayerId): readonly Command[] {
  if (actor !== snapshot.activePlayerId || snapshot.decision.kind === "game_over") return [];
  const base = { actor, expectedRevision: snapshot.revision };
  if (snapshot.decision.kind === "awaiting_roll") return [{ ...base, kind: "roll" }];
  const property = pendingProperty(snapshot);
  const player = snapshot.players.find((candidate) => candidate.id === actor);
  if (!property || !player || property.id !== currentTile(snapshot).id || snapshot.owners[property.id]) return [];
  return [
    ...(player.cash >= property.price ? [{ ...base, kind: "buy" as const }] : []),
    { ...base, kind: "skip" },
  ];
}
