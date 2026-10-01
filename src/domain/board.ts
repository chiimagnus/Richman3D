export type StartTile = {
  readonly type: "start";
  readonly id: "start";
  readonly name: string;
};

export type PropertyTile = {
  readonly type: "property";
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly rent: number;
  readonly group: "cyan" | "amber" | "violet" | "emerald";
};

export type TaxTile = {
  readonly type: "tax";
  readonly id: string;
  readonly name: string;
  readonly amount: number;
};

export type ChanceTile = {
  readonly type: "chance";
  readonly id: string;
  readonly name: string;
};

export type BoardTile = StartTile | PropertyTile | TaxTile | ChanceTile;

export const BOARD: readonly BoardTile[] = [
  { type: "start", id: "start", name: "中央起点" },
  {
    type: "property",
    id: "harbor-walk",
    name: "海港步道",
    price: 140,
    rent: 24,
    group: "cyan",
  },
  { type: "chance", id: "chance-1", name: "机会" },
  {
    type: "property",
    id: "neon-avenue",
    name: "霓虹大道",
    price: 180,
    rent: 32,
    group: "cyan",
  },
  { type: "tax", id: "city-tax", name: "城市税", amount: 80 },
  {
    type: "property",
    id: "metro-plaza",
    name: "都会广场",
    price: 220,
    rent: 40,
    group: "amber",
  },
  {
    type: "property",
    id: "skyline-road",
    name: "天际路",
    price: 240,
    rent: 44,
    group: "amber",
  },
  { type: "chance", id: "chance-2", name: "机会" },
  {
    type: "property",
    id: "river-market",
    name: "河畔市集",
    price: 200,
    rent: 36,
    group: "amber",
  },
  { type: "tax", id: "service-fee", name: "公共服务费", amount: 100 },
  {
    type: "property",
    id: "central-station",
    name: "中央车站",
    price: 260,
    rent: 48,
    group: "violet",
  },
  { type: "chance", id: "chance-3", name: "机会" },
  {
    type: "property",
    id: "tech-park",
    name: "科技园",
    price: 300,
    rent: 56,
    group: "violet",
  },
  {
    type: "property",
    id: "lakeside",
    name: "湖岸新区",
    price: 280,
    rent: 52,
    group: "violet",
  },
  { type: "tax", id: "luxury-tax", name: "城市维护费", amount: 120 },
  {
    type: "property",
    id: "art-district",
    name: "艺术街区",
    price: 320,
    rent: 62,
    group: "emerald",
  },
  { type: "chance", id: "chance-4", name: "机会" },
  {
    type: "property",
    id: "grand-boulevard",
    name: "中央大道",
    price: 360,
    rent: 72,
    group: "emerald",
  },
  {
    type: "property",
    id: "financial-center",
    name: "金融中心",
    price: 420,
    rent: 86,
    group: "emerald",
  },
  { type: "chance", id: "chance-5", name: "机会" },
];

export function tileAt(index: number): BoardTile {
  const normalized = ((index % BOARD.length) + BOARD.length) % BOARD.length;
  const tile = BOARD[normalized];

  if (!tile) {
    throw new RangeError(`无效棋盘位置: ${index}`);
  }

  return tile;
}
