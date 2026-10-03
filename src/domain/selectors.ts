import { tileAt, type PropertyTile } from "./board";
import type { Command, GameSnapshot, PlayerId, MatchResult } from "./types";
import { playerConfig } from "./config";
import { liquidationValue, netAssets, propertyBookValue, propertyLiquidationValue, propertyTile, propertyValue, rentFor, upgradeOption } from "./economy";

export function pendingProperty(snapshot: GameSnapshot): PropertyTile | null {
  const decision = snapshot.decision;
  if (decision.kind !== "awaiting_purchase") return null;
  const tile = snapshot.map.tiles.find((candidate) => candidate.id === decision.propertyId);
  return tile?.type === "property" ? tile : null;
}

export function currentTile(snapshot: GameSnapshot, actor: PlayerId = snapshot.turnPlayerId) {
  const player = snapshot.players.find((candidate) => candidate.id === actor);
  if (!player) throw new Error("当前玩家不存在");
  return tileAt(snapshot.map, player.position);
}

export function legalCommands(snapshot: GameSnapshot, actor: PlayerId): readonly Command[] {
  if (snapshot.decision.kind === "game_over" || actor !== snapshot.decision.actorId || !snapshot.players.some((player) => player.id === actor && !player.bankrupt)) return [];
  const base = { actor, expectedRevision: snapshot.revision };
  if (snapshot.decision.kind === "awaiting_roll") return [{ ...base, kind: "roll" },
    ...snapshot.map.tiles.filter((tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === actor && upgradeOption(snapshot, actor, tile.id).reason === null)
      .map((tile) => ({ ...base, kind: "upgrade" as const, propertyId: tile.id })),
  ];
  const property = pendingProperty(snapshot);
  const player = snapshot.players.find((candidate) => candidate.id === actor);
  if (!property || !player || property.id !== currentTile(snapshot, actor).id || snapshot.properties[property.id]!.ownerId !== null) return [];
  return [
    ...(player.cash >= property.price ? [{ ...base, kind: "buy" as const }] : []),
    { ...base, kind: "skip" },
  ];
}

export function publicProperty(snapshot: GameSnapshot, propertyId: string) {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  return { tile: { type: tile.type, id: tile.id, price: tile.price, rent: tile.rent, group: tile.group },
    ...property, constructionCosts: [...property.constructionCosts], rent: rentFor(snapshot, tile.id),
    bookValue: propertyBookValue(tile, property), liquidationValue: propertyLiquidationValue(tile, property, snapshot.rules) };
}

export function playerAssets(snapshot: GameSnapshot, id: PlayerId) {
  const player = snapshot.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("玩家不存在");
  const config = playerConfig(snapshot.config, id);
  return {
    player: { id: config.id, controller: config.controller, name: config.name, defaultNameKey: config.defaultNameKey, color: config.color },
    cash: player.cash, propertyValue: propertyValue(snapshot, id), netAssets: netAssets(snapshot, id), liquidationValue: liquidationValue(snapshot, id), bankrupt: player.bankrupt,
    properties: snapshot.map.tiles.filter((tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === id).map((tile) => publicProperty(snapshot, tile.id)),
  };
}

export function matchResult(snapshot: GameSnapshot, reason: MatchResult["reason"]): MatchResult {
  const ordered = snapshot.players.map((player) => ({ playerId: player.id, bankrupt: player.bankrupt, cash: player.cash, propertyValue: propertyValue(snapshot, player.id), netAssets: netAssets(snapshot, player.id) }))
    .sort((first, second) => Number(first.bankrupt) - Number(second.bankrupt) || second.netAssets - first.netAssets || second.cash - first.cash);
  let rank = 1;
  const rankings = ordered.map((player, index) => {
    const previous = ordered[index - 1];
    if (previous && (previous.bankrupt !== player.bankrupt || previous.netAssets !== player.netAssets || previous.cash !== player.cash)) rank = index + 1;
    return { playerId: player.playerId, rank, netAssets: player.netAssets, cash: player.cash, propertyValue: player.propertyValue };
  });
  return { reason, rankings, winnerIds: rankings.filter((player) => player.rank === 1).map((player) => player.playerId) };
}
