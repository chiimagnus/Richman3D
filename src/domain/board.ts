export const PROPERTY_GROUPS = ["cyan", "amber", "violet", "emerald", "rose"] as const;
export type PropertyTile = { readonly type: "property"; readonly id: string; readonly price: number; readonly rent: number; readonly group: typeof PROPERTY_GROUPS[number] };
export type StartTile = { readonly type: "start"; readonly id: string };
export type TaxTile = { readonly type: "tax"; readonly id: string; readonly amount: number };
export type ChanceTile = { readonly type: "chance"; readonly id: string };
export type BoardTile = PropertyTile | StartTile | TaxTile | ChanceTile;
export type MapDefinition = {
  readonly id: string;
  readonly version: number;
  readonly tiles: readonly BoardTile[];
  readonly path: readonly { readonly x: number; readonly z: number }[];
};

export function tileAt(map: MapDefinition, index: number): BoardTile {
  const normalized = ((index % map.tiles.length) + map.tiles.length) % map.tiles.length;
  const tile = map.tiles[normalized];
  if (!tile) throw new RangeError(`无效棋盘位置: ${index}`);
  return tile;
}

export function validateMap(map: MapDefinition): void {
  if (!map.id || !Number.isSafeInteger(map.version) || map.version < 1 || map.tiles.length < 2 || map.path.length !== map.tiles.length || map.tiles[0]?.type !== "start") throw new Error("地图定义无效");
  if (new Set(map.tiles.map((tile) => tile.id)).size !== map.tiles.length || new Set(map.path.map((point) => `${point.x},${point.z}`)).size !== map.path.length) throw new Error("地图重复地块或坐标");
  for (const [index, tile] of map.tiles.entries()) {
    if (!tile.id || (index > 0 && tile.type === "start")) throw new Error("地图起点无效");
    const values = tile.type === "property" ? [tile.price, tile.rent] : tile.type === "tax" ? [tile.amount] : [];
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("地图金额无效");
    if (tile.type === "property" && !PROPERTY_GROUPS.includes(tile.group)) throw new Error("地产分组无效");
  }
  if (map.path.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) throw new Error("地图坐标无效");
  const first = map.path[0]!;
  const second = map.path[1]!;
  const spacing = Math.hypot(second.x - first.x, second.z - first.z);
  for (const [index, point] of map.path.entries()) {
    const next = map.path[(index + 1) % map.path.length]!;
    if (point.x !== next.x && point.z !== next.z || Math.abs(Math.hypot(next.x - point.x, next.z - point.z) - spacing) > 1e-8) throw new Error("地图环路不连续");
  }
}
