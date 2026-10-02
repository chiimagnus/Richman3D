export const BOARD = [
  { type: "start", id: "start" },
  {
    type: "property",
    id: "harbor-walk",
    price: 140,
    rent: 24,
    group: "cyan",
  },
  { type: "chance", id: "chance-1" },
  {
    type: "property",
    id: "neon-avenue",
    price: 180,
    rent: 32,
    group: "cyan",
  },
  { type: "tax", id: "city-tax", amount: 80 },
  {
    type: "property",
    id: "metro-plaza",
    price: 220,
    rent: 40,
    group: "amber",
  },
  {
    type: "property",
    id: "skyline-road",
    price: 240,
    rent: 44,
    group: "amber",
  },
  { type: "chance", id: "chance-2" },
  {
    type: "property",
    id: "river-market",
    price: 200,
    rent: 36,
    group: "amber",
  },
  { type: "tax", id: "service-fee", amount: 100 },
  {
    type: "property",
    id: "central-station",
    price: 260,
    rent: 48,
    group: "violet",
  },
  { type: "chance", id: "chance-3" },
  {
    type: "property",
    id: "tech-park",
    price: 300,
    rent: 56,
    group: "violet",
  },
  {
    type: "property",
    id: "lakeside",
    price: 280,
    rent: 52,
    group: "violet",
  },
  { type: "tax", id: "luxury-tax", amount: 120 },
  {
    type: "property",
    id: "art-district",
    price: 320,
    rent: 62,
    group: "emerald",
  },
  { type: "chance", id: "chance-4" },
  {
    type: "property",
    id: "grand-boulevard",
    price: 360,
    rent: 72,
    group: "emerald",
  },
  {
    type: "property",
    id: "financial-center",
    price: 420,
    rent: 86,
    group: "emerald",
  },
  { type: "chance", id: "chance-5" },
] as const;

export type BoardTile = (typeof BOARD)[number];
export type StartTile = Extract<BoardTile, { readonly type: "start" }>;
export type PropertyTile = Extract<BoardTile, { readonly type: "property" }>;
export type TaxTile = Extract<BoardTile, { readonly type: "tax" }>;
export type ChanceTile = Extract<BoardTile, { readonly type: "chance" }>;

export function tileAt(index: number): BoardTile {
  const normalized = ((index % BOARD.length) + BOARD.length) % BOARD.length;
  const tile = BOARD[normalized];

  if (!tile) {
    throw new RangeError(`无效棋盘位置: ${index}`);
  }

  return tile;
}
