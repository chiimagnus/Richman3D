import type { MapDefinition } from "./board";
import type { RuleSet } from "./rules";

export type PlayerId = "p1" | "p2" | "p3" | "p4";
export const HISTORY_LIMIT = 100;
export type PlayerConfig = {
  readonly id: PlayerId;
  readonly controller: "human" | "bot";
  readonly name: string | null;
  readonly defaultNameKey: PlayerId;
  readonly color: string;
};
export type MatchConfig = {
  readonly players: readonly PlayerConfig[];
  readonly seed: number;
  readonly rulesVersion: string;
  readonly mapId: string;
  readonly mapVersion: number;
};
export type Ranking = { readonly playerId: PlayerId; readonly rank: number; readonly netAssets: number; readonly cash: number; readonly propertyValue: number };
export type MatchResult = { readonly reason: "last_survivor" | "round_limit"; readonly winnerIds: readonly PlayerId[]; readonly rankings: readonly Ranking[] };
export type FinancialStats = {
  readonly startBonus: number;
  readonly rentReceived: number;
  readonly rentPaid: number;
  readonly taxesPaid: number;
  readonly chanceIncome: number;
  readonly chanceExpense: number;
  readonly purchases: number;
  readonly constructionSpent: number;
  readonly constructionRefunds: number;
  readonly constructionSoldCost: number;
  readonly mortgageIncome: number;
  readonly mortgagePrincipalRepaid: number;
  readonly mortgageFeesPaid: number;
  readonly mortgagePrincipalReleased: number;
  readonly debtWrittenOff: number;
  readonly rentLost: number;
};
export type ChanceCardId = "innovation-bonus" | "maintenance-cost" | "community-event" | "traffic-fine";

export type PlayerState = {
  readonly id: PlayerId;
  readonly cash: number;
  readonly position: number;
  readonly bankrupt: boolean;
  readonly statistics: FinancialStats;
};

export type PropertyState = {
  readonly ownerId: PlayerId | null;
  readonly level: 0 | 1 | 2 | 3;
  readonly mortgagePrincipal: number;
  readonly constructionCosts: readonly number[];
};

export type Decision =
  | { readonly kind: "awaiting_roll"; readonly actorId: PlayerId }
  | { readonly kind: "awaiting_purchase"; readonly actorId: PlayerId; readonly propertyId: string }
  | { readonly kind: "awaiting_debt"; readonly actorId: PlayerId; readonly debt: PendingDebt }
  | { readonly kind: "game_over"; readonly result: MatchResult };

export type RandomState = {
  readonly version: "xorshift32-v1";
  readonly inputSeed: number;
  readonly state: number;
  readonly draws: number;
};

export type GameSnapshot = {
  readonly revision: number;
  readonly config: MatchConfig;
  readonly rules: RuleSet;
  readonly map: MapDefinition;
  readonly completedRounds: number;
  readonly turnOrder: readonly PlayerId[];
  readonly players: readonly PlayerState[];
  readonly turnPlayerId: PlayerId;
  readonly decision: Decision;
  readonly properties: Readonly<Record<string, PropertyState>>;
  readonly lastRoll: readonly [number, number] | null;
  readonly random: RandomState;
  readonly history: readonly { readonly revision: number; readonly event: GameEvent }[];
};

export type SavedGameState = Omit<GameSnapshot, "rules" | "map">;

export type LandingResult =
  | { readonly kind: "start" }
  | { readonly kind: "property_available"; readonly propertyId: string; readonly price: number }
  | { readonly kind: "property_owned"; readonly propertyId: string }
  | { readonly kind: "rent"; readonly propertyId: string; readonly ownerId: PlayerId; readonly amount: number }
  | { readonly kind: "tax"; readonly amount: number }
  | { readonly kind: "chance"; readonly amount: number; readonly cardId: ChanceCardId };

export type PaymentSource = Extract<LandingResult, { kind: "rent" | "tax" | "chance" }>;
export type PendingDebt = {
  readonly creditorId: PlayerId | null;
  readonly amount: number;
  readonly source: PaymentSource;
  readonly continuation: "finish_turn";
};

export type RollResult = {
  readonly playerId: PlayerId;
  readonly dice: readonly [number, number];
  readonly steps: number;
  readonly from: number;
  readonly to: number;
  readonly path: readonly number[];
  readonly passedStart: boolean;
  readonly startBonus: number;
  readonly landing: LandingResult;
};

export type Command = {
  readonly actor: PlayerId;
  readonly expectedRevision: number;
} & ({ readonly kind: "roll" | "buy" | "skip" | "bankrupt" } | { readonly kind: "upgrade" | "sell_building" | "mortgage" | "redeem"; readonly propertyId: string });

export type GameEvent =
  | { readonly kind: "rolled"; readonly result: RollResult }
  | { readonly kind: "purchased"; readonly actor: PlayerId; readonly propertyId: string; readonly price: number }
  | { readonly kind: "upgraded"; readonly actor: PlayerId; readonly propertyId: string; readonly level: 1 | 2 | 3; readonly cost: number }
  | { readonly kind: "building_sold"; readonly actor: PlayerId; readonly propertyId: string; readonly level: 0 | 1 | 2; readonly cost: number; readonly refund: number }
  | { readonly kind: "mortgaged"; readonly actor: PlayerId; readonly propertyId: string; readonly principal: number }
  | { readonly kind: "redeemed"; readonly actor: PlayerId; readonly propertyId: string; readonly principal: number; readonly fee: number }
  | { readonly kind: "skipped"; readonly actor: PlayerId; readonly propertyId: string }
  | { readonly kind: "paid"; readonly actor: PlayerId; readonly debt: PendingDebt; readonly amount: number; readonly writtenOff: number }
  | { readonly kind: "liquidated"; readonly actor: PlayerId; readonly constructionCost: number; readonly constructionRefund: number; readonly mortgageIncome: number; readonly principalReleased: number }
  | { readonly kind: "turn"; readonly actor: PlayerId }
  | { readonly kind: "ended"; readonly result: MatchResult };

export type ApplyResult =
  | { readonly ok: true; readonly snapshot: GameSnapshot; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: "invalid_command" | "stale_revision" | "illegal_action" | "calculation_failed" };
