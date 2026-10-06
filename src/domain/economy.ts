import type { MapDefinition, PropertyTile } from "./board";
import type { RuleSet } from "./rules";
import type { GameSnapshot, LandingResult, PendingDebt, PlayerId, PropertyState } from "./types";
import { cardType } from "./cards";

function money(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("金额超出整数范围");
  return Number(value);
}

export function initialProperties(map: MapDefinition): Record<string, PropertyState> {
  return Object.fromEntries(map.tiles.filter((tile) => tile.type === "property").map((tile) => [tile.id, { ownerId: null, level: 0, constructionCosts: [] }]));
}

export function propertyTile(map: MapDefinition, propertyId: string): PropertyTile {
  const tile = map.tiles.find((candidate) => candidate.id === propertyId);
  if (!tile || tile.type !== "property") throw new Error("地产不存在");
  return tile;
}

export function completeGroup(snapshot: GameSnapshot, tile: PropertyTile): boolean {
  const owner = snapshot.properties[tile.id]!.ownerId;
  return owner !== null && snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group)
    .every((candidate) => snapshot.properties[candidate.id]!.ownerId === owner);
}

export function rentFor(snapshot: GameSnapshot, propertyId: string): number {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  return rentAmount(tile, property, snapshot.rules, completeGroup(snapshot, tile));
}

export function rentAmount(tile: PropertyTile, property: Pick<PropertyState, "level">, rules: RuleSet, groupComplete: boolean): number {
  const percent = groupComplete ? rules.groupRentPercent : 100;
  return money(BigInt(tile.rent) * BigInt(rules.rentMultipliers[property.level]) * BigInt(percent) / 100n);
}

export function constructionCost(tile: PropertyTile, rules: RuleSet): number {
  return money((BigInt(tile.price) * BigInt(rules.constructionCostPercent) + 99n) / 100n);
}

export function discountedCost(amount: number, percent: number): number {
  return money((BigInt(amount) * BigInt(percent) + 99n) / 100n);
}

export function upgradeOption(snapshot: GameSnapshot, actor: PlayerId, propertyId: string) {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  const player = snapshot.players.find((candidate) => candidate.id === actor)!;
  const baseCost = constructionCost(tile, snapshot.rules);
  const cost = snapshot.activeItem?.actorId === actor && cardType(snapshot.activeItem.instanceId) === "construction-discount"
    ? discountedCost(baseCost, snapshot.rules.constructionDiscountPercent) : baseCost;
  const group = snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group);
  let reason: "not_owner" | "not_turn" | "incomplete_group" | "max_level" | "unbalanced" | "insufficient_cash" | null = null;
  if (property.ownerId !== actor) reason = "not_owner";
  else if (snapshot.decision.kind !== "awaiting_roll" || snapshot.decision.actorId !== actor || player.bankrupt) reason = "not_turn";
  else if (group.some((candidate) => snapshot.properties[candidate.id]!.ownerId !== actor)) reason = "incomplete_group";
  else if (property.level === 3) reason = "max_level";
  else if (group.some((candidate) => property.level + 1 - snapshot.properties[candidate.id]!.level > 1)) reason = "unbalanced";
  else if (player.cash < cost) reason = "insufficient_cash";
  return { reason, cost, currentRent: rentFor(snapshot, propertyId),
    nextRent: property.level === 3 ? null : rentAmount(tile, { ...property, level: (property.level + 1) as PropertyState["level"] }, snapshot.rules, completeGroup(snapshot, tile)),
    remainingCash: player.cash - cost };
}

export function constructionRefund(cost: number, rules: RuleSet): number {
  return money(BigInt(cost) * BigInt(rules.constructionSalePercent) / 100n);
}

export function saleOption(snapshot: GameSnapshot, actor: PlayerId, propertyId: string) {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  const player = snapshot.players.find((candidate) => candidate.id === actor)!;
  const group = snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group);
  const originalCost = property.level > 0 ? property.constructionCosts.at(-1)! : 0;
  const proceeds = constructionRefund(originalCost, snapshot.rules);
  let reason: "not_owner" | "not_turn" | "no_building" | "unbalanced_sale" | null = null;
  if (property.ownerId !== actor) reason = "not_owner";
  else if ((snapshot.decision.kind !== "awaiting_roll" && snapshot.decision.kind !== "awaiting_debt") || snapshot.decision.actorId !== actor || player.bankrupt) reason = "not_turn";
  else if (property.level === 0) reason = "no_building";
  else if (group.some((candidate) => snapshot.properties[candidate.id]!.level - (property.level - 1) > 1)) reason = "unbalanced_sale";
  const nextProperty: PropertyState = property.level > 0 ? { ...property, level: (property.level - 1) as 0 | 1 | 2, constructionCosts: property.constructionCosts.slice(0, -1) } : property;
  return { reason, cost: 0, proceeds, originalCost, loss: originalCost - proceeds,
    currentRent: rentFor(snapshot, propertyId), nextRent: rentFor({ ...snapshot, properties: { ...snapshot.properties, [propertyId]: nextProperty } }, propertyId),
    remainingCash: money(BigInt(player.cash) + BigInt(proceeds)), nextProperty };
}

export function propertyBookValue(tile: PropertyTile, property: PropertyState): number {
  return money(BigInt(tile.price) + property.constructionCosts.reduce((total, cost) => total + BigInt(cost), 0n));
}

export function propertyLiquidationValue(property: PropertyState, rules: RuleSet): number {
  return money(property.constructionCosts.reduce((total, cost) => total + BigInt(constructionRefund(cost, rules)), 0n));
}

export function propertyValue(snapshot: GameSnapshot, id: PlayerId): number {
  return money(snapshot.map.tiles.reduce((total, tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === id ? total + BigInt(propertyBookValue(tile, snapshot.properties[tile.id]!)) : total, 0n));
}

export function liquidationValue(snapshot: GameSnapshot, id: PlayerId): number {
  return money(snapshot.map.tiles.reduce((total, tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === id ? total + BigInt(propertyLiquidationValue(snapshot.properties[tile.id]!, snapshot.rules)) : total, 0n));
}

export function netAssets(snapshot: GameSnapshot, id: PlayerId): number {
  const player = snapshot.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("玩家不存在");
  return money(BigInt(player.cash) + BigInt(propertyValue(snapshot, id)));
}

export function obligation(landing: LandingResult): PendingDebt | null {
  if (landing.kind !== "rent" && landing.kind !== "tax" && (landing.kind !== "chance" || landing.amount >= 0)) return null;
  return { creditorId: landing.kind === "rent" ? landing.ownerId : null, amount: Math.abs(landing.amount), source: { ...landing }, continuation: "finish_turn" };
}

export function canDeclareBankruptcy(snapshot: GameSnapshot, actor: PlayerId): boolean {
  const decision = snapshot.decision;
  const player = snapshot.players.find((candidate) => candidate.id === actor);
  return decision.kind === "awaiting_debt" && decision.actorId === actor && !!player && !player.bankrupt &&
    player.cash < decision.debt.amount && !Object.values(snapshot.properties).some((property) => property.ownerId === actor && property.level > 0);
}
