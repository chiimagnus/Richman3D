import type { MapDefinition, PropertyTile } from "./board";
import type { RuleSet } from "./rules";
import type { GameSnapshot, LandingResult, PendingDebt, PlayerId, PropertyState } from "./types";

function money(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("金额超出整数范围");
  return Number(value);
}

export function initialProperties(map: MapDefinition): Record<string, PropertyState> {
  return Object.fromEntries(map.tiles.filter((tile) => tile.type === "property").map((tile) => [tile.id, { ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] }]));
}

export function propertyTile(map: MapDefinition, propertyId: string): PropertyTile {
  const tile = map.tiles.find((candidate) => candidate.id === propertyId);
  if (!tile || tile.type !== "property") throw new Error("地产不存在");
  return tile;
}

export function completeGroup(snapshot: GameSnapshot, tile: PropertyTile): boolean {
  const owner = snapshot.properties[tile.id]!.ownerId;
  return owner !== null && snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group)
    .every((candidate) => snapshot.properties[candidate.id]!.ownerId === owner && snapshot.properties[candidate.id]!.mortgagePrincipal === 0);
}

export function rentFor(snapshot: GameSnapshot, propertyId: string): number {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  return rentAmount(tile, property, snapshot.rules, completeGroup(snapshot, tile));
}

export function rentAmount(tile: PropertyTile, property: Pick<PropertyState, "level" | "mortgagePrincipal">, rules: RuleSet, groupComplete: boolean): number {
  if (property.mortgagePrincipal > 0) return 0;
  const percent = groupComplete ? rules.groupRentPercent : 100;
  return money(BigInt(tile.rent) * BigInt(rules.rentMultipliers[property.level]) * BigInt(percent) / 100n);
}

export function constructionCost(tile: PropertyTile, rules: RuleSet): number {
  return money((BigInt(tile.price) * BigInt(rules.constructionCostPercent) + 99n) / 100n);
}

export function upgradeOption(snapshot: GameSnapshot, actor: PlayerId, propertyId: string) {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  const player = snapshot.players.find((candidate) => candidate.id === actor)!;
  const cost = constructionCost(tile, snapshot.rules);
  const group = snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group);
  let reason: "not_owner" | "not_turn" | "incomplete_group" | "mortgaged" | "max_level" | "unbalanced" | "insufficient_cash" | null = null;
  if (property.ownerId !== actor) reason = "not_owner";
  else if (snapshot.decision.kind !== "awaiting_roll" || snapshot.decision.actorId !== actor || player.bankrupt) reason = "not_turn";
  else if (group.some((candidate) => snapshot.properties[candidate.id]!.ownerId !== actor)) reason = "incomplete_group";
  else if (group.some((candidate) => snapshot.properties[candidate.id]!.mortgagePrincipal > 0)) reason = "mortgaged";
  else if (property.level === 3) reason = "max_level";
  else if (group.some((candidate) => property.level + 1 - snapshot.properties[candidate.id]!.level > 1)) reason = "unbalanced";
  else if (player.cash < cost) reason = "insufficient_cash";
  return { reason, cost, currentRent: rentFor(snapshot, propertyId),
    nextRent: property.level === 3 ? null : rentAmount(tile, { ...property, level: (property.level + 1) as PropertyState["level"] }, snapshot.rules, completeGroup(snapshot, tile)),
    remainingCash: player.cash - cost };
}

export function mortgageValue(tile: PropertyTile, rules: RuleSet): number {
  return money(BigInt(tile.price) * BigInt(rules.mortgagePercent) / 100n);
}

export function constructionRefund(cost: number, rules: RuleSet): number {
  return money(BigInt(cost) * BigInt(rules.constructionSalePercent) / 100n);
}

export function redemptionCost(principal: number, rules: RuleSet): number {
  return money((BigInt(principal) * BigInt(100 + rules.mortgageRedemptionPercent) + 99n) / 100n);
}

export function liquidityOption(snapshot: GameSnapshot, actor: PlayerId, propertyId: string, kind: "sell_building" | "mortgage" | "redeem") {
  const tile = propertyTile(snapshot.map, propertyId);
  const property = snapshot.properties[propertyId]!;
  const player = snapshot.players.find((candidate) => candidate.id === actor)!;
  const group = snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group);
  const originalCost = property.level > 0 ? property.constructionCosts.at(-1)! : 0;
  const proceeds = kind === "sell_building" ? constructionRefund(originalCost, snapshot.rules) : kind === "mortgage" ? mortgageValue(tile, snapshot.rules) : 0;
  const cost = kind === "redeem" ? redemptionCost(property.mortgagePrincipal, snapshot.rules) : 0;
  let reason: "not_owner" | "not_turn" | "no_building" | "unbalanced_sale" | "group_has_buildings" | "already_mortgaged" | "no_mortgage_value" | "not_mortgaged" | "insufficient_cash" | null = null;
  if (property.ownerId !== actor) reason = "not_owner";
  else if ((snapshot.decision.kind !== "awaiting_roll" && (snapshot.decision.kind !== "awaiting_debt" || kind === "redeem")) || snapshot.decision.actorId !== actor || player.bankrupt) reason = "not_turn";
  else if (kind === "sell_building" && property.level === 0) reason = "no_building";
  else if (kind === "sell_building" && group.some((candidate) => snapshot.properties[candidate.id]!.level - (property.level - 1) > 1)) reason = "unbalanced_sale";
  else if (kind === "mortgage" && group.some((candidate) => snapshot.properties[candidate.id]!.level > 0)) reason = "group_has_buildings";
  else if (kind === "mortgage" && property.mortgagePrincipal > 0) reason = "already_mortgaged";
  else if (kind === "mortgage" && proceeds === 0) reason = "no_mortgage_value";
  else if (kind === "redeem" && property.mortgagePrincipal === 0) reason = "not_mortgaged";
  else if (player.cash < cost) reason = "insufficient_cash";
  const nextProperty: PropertyState = kind === "sell_building" && property.level > 0 ? { ...property, level: (property.level - 1) as 0 | 1 | 2, constructionCosts: property.constructionCosts.slice(0, -1) }
    : kind === "mortgage" ? { ...property, mortgagePrincipal: proceeds } : kind === "redeem" ? { ...property, mortgagePrincipal: 0 } : property;
  return { reason, cost, proceeds, originalCost, loss: kind === "sell_building" ? originalCost - proceeds : kind === "redeem" ? cost - property.mortgagePrincipal : 0,
    currentRent: rentFor(snapshot, propertyId), nextRent: rentFor({ ...snapshot, properties: { ...snapshot.properties, [propertyId]: nextProperty } }, propertyId),
    remainingCash: money(BigInt(player.cash) + BigInt(proceeds) - BigInt(cost)), nextProperty };
}

export function propertyBookValue(tile: PropertyTile, property: PropertyState): number {
  return money(BigInt(tile.price) - BigInt(property.mortgagePrincipal) + property.constructionCosts.reduce((total, cost) => total + BigInt(cost), 0n));
}

export function propertyLiquidationValue(tile: PropertyTile, property: PropertyState, rules: RuleSet): number {
  return money(BigInt(property.mortgagePrincipal > 0 ? 0 : mortgageValue(tile, rules)) + property.constructionCosts.reduce((total, cost) => total + BigInt(constructionRefund(cost, rules)), 0n));
}

export function propertyValue(snapshot: GameSnapshot, id: PlayerId): number {
  return money(snapshot.map.tiles.reduce((total, tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === id ? total + BigInt(propertyBookValue(tile, snapshot.properties[tile.id]!)) : total, 0n));
}

export function liquidationValue(snapshot: GameSnapshot, id: PlayerId): number {
  return money(snapshot.map.tiles.reduce((total, tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === id ? total + BigInt(propertyLiquidationValue(tile, snapshot.properties[tile.id]!, snapshot.rules)) : total, 0n));
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
    BigInt(player.cash) + BigInt(liquidationValue(snapshot, actor)) < BigInt(decision.debt.amount);
}
