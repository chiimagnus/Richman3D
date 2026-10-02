import type { MapDefinition } from "./board";
import type { RuleSet } from "./rules";

export type PlayerId = "p1" | "p2" | "p3" | "p4";
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
};
export type ChanceCardId = "innovation-bonus" | "maintenance-cost" | "community-event" | "traffic-fine";

export type PlayerState = {
  readonly id: PlayerId;
  readonly cash: number;
  readonly position: number;
  readonly bankrupt: boolean;
  readonly statistics: FinancialStats;
};

export type Decision =
  | { readonly kind: "awaiting_roll" }
  | { readonly kind: "awaiting_purchase"; readonly propertyId: string }
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
  readonly players: readonly PlayerState[];
  readonly activePlayerId: PlayerId;
  readonly decision: Decision;
  readonly owners: Readonly<Record<string, PlayerId>>;
  readonly lastRoll: readonly [number, number] | null;
  readonly random: RandomState;
};

export type SavedGameState = Omit<GameSnapshot, "rules" | "map">;

export type LandingResult =
  | { readonly kind: "start" }
  | { readonly kind: "property_available"; readonly propertyId: string; readonly price: number }
  | { readonly kind: "property_owned"; readonly propertyId: string }
  | { readonly kind: "rent"; readonly propertyId: string; readonly ownerId: PlayerId; readonly amount: number }
  | { readonly kind: "tax"; readonly amount: number }
  | { readonly kind: "chance"; readonly amount: number; readonly cardId: ChanceCardId };

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
  readonly kind: "roll" | "buy" | "skip";
};

export type GameEvent =
  | { readonly kind: "rolled"; readonly result: RollResult }
  | { readonly kind: "purchased"; readonly actor: PlayerId; readonly propertyId: string; readonly price: number }
  | { readonly kind: "skipped"; readonly actor: PlayerId; readonly propertyId: string }
  | { readonly kind: "turn"; readonly actor: PlayerId }
  | { readonly kind: "ended"; readonly result: MatchResult };

export type ApplyResult =
  | { readonly ok: true; readonly snapshot: GameSnapshot; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: "invalid_command" | "stale_revision" | "illegal_action" | "calculation_failed" };
