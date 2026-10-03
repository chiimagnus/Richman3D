import type { MapDefinition } from "./board";
import type { RuleSet } from "./rules";
import type { Movement } from "./movement";

export type PlayerId = "p1" | "p2" | "p3" | "p4";
export const BOT_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type BotDifficulty = typeof BOT_DIFFICULTIES[number];
export const HISTORY_LIMIT = 100;
export type PlayerConfig = {
  readonly id: PlayerId;
  readonly controller: "human" | "bot";
  readonly difficulty: BotDifficulty;
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
  readonly purchaseBookValue: number;
  readonly tradeCashReceived: number;
  readonly tradeCashPaid: number;
  readonly tradeBookValueReceived: number;
  readonly tradeBookValueGiven: number;
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
export type CashCardId = "innovation-bonus" | "maintenance-cost" | "community-event" | "traffic-fine";
export type MovementCardId = "advance-three" | "retreat-three" | "return-start";
export type ItemCardId = "rent-waiver" | "controlled-dice" | "tax-discount" | "construction-discount" | "swap-positions";
export type ChanceCardId = CashCardId | MovementCardId | ItemCardId;
export type CardInstanceId = `${ChanceCardId}:${1 | 2}`;
export type DeckState = {
  readonly drawPile: readonly CardInstanceId[];
  readonly discardPile: readonly CardInstanceId[];
  readonly pending: CardInstanceId | null;
};

export type PlayerState = {
  readonly id: PlayerId;
  readonly cash: number;
  readonly position: number;
  readonly bankrupt: boolean;
  readonly hand: readonly CardInstanceId[];
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
  | { readonly kind: "awaiting_discard"; readonly actorId: PlayerId; readonly continuation: "finish_turn" }
  | { readonly kind: "awaiting_purchase"; readonly actorId: PlayerId; readonly propertyId: string }
  | { readonly kind: "awaiting_debt"; readonly actorId: PlayerId; readonly debt: PendingDebt }
  | AuctionDecision
  | { readonly kind: "awaiting_trade"; readonly actorId: PlayerId; readonly proposal: TradeProposal }
  | { readonly kind: "game_over"; readonly result: MatchResult };

export type AuctionDecision = {
  readonly kind: "awaiting_auction";
  readonly actorId: PlayerId;
  readonly propertyId: string;
  readonly landingPlayerId: PlayerId;
  readonly highestBid: number;
  readonly highestBidderId: PlayerId | null;
  readonly withdrawnIds: readonly PlayerId[];
  readonly continuation: "finish_turn";
};

export type RandomState = {
  readonly version: "xorshift32-v1";
  readonly inputSeed: number;
  readonly state: number;
  readonly draws: number;
};

export type TradeTerms = {
  readonly recipientId: PlayerId;
  readonly givePropertyIds: readonly string[];
  readonly receivePropertyIds: readonly string[];
  readonly cash: { readonly payerId: PlayerId; readonly amount: number } | null;
};
export type TradeProposal = TradeTerms & { readonly proposerId: PlayerId; readonly revision: number };

export type GameSnapshot = {
  readonly revision: number;
  readonly config: MatchConfig;
  readonly rules: RuleSet;
  readonly map: MapDefinition;
  readonly completedRounds: number;
  readonly turnOrder: readonly PlayerId[];
  readonly players: readonly PlayerState[];
  readonly turnPlayerId: PlayerId;
  readonly tradeUsed: boolean;
  readonly itemUsed: boolean;
  readonly activeItem: { readonly actorId: PlayerId; readonly instanceId: CardInstanceId; readonly total: number | null } | null;
  readonly deck: DeckState;
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
  | { readonly kind: "tax"; readonly amount: number; readonly discountedBy?: CardInstanceId }
  | { readonly kind: "rent_waived"; readonly propertyId: string; readonly ownerId: PlayerId; readonly instanceId: CardInstanceId }
  | { readonly kind: "item_received" }
  | { readonly kind: "chance"; readonly amount: number; readonly cardId: CashCardId; readonly instanceId: CardInstanceId }
  | { readonly kind: "movement_card"; readonly cardId: MovementCardId; readonly instanceId: CardInstanceId }
  | { readonly kind: "chance_ignored" };

export type PaymentSource = Extract<LandingResult, { kind: "rent" | "tax" | "chance" }>;
export type PendingDebt = {
  readonly creditorId: PlayerId | null;
  readonly amount: number;
  readonly source: PaymentSource;
  readonly continuation: "finish_turn";
};

export type RollResult = Movement & {
  readonly playerId: PlayerId;
  readonly dice: readonly [number, number];
  readonly steps: number;
  readonly controlledBy?: CardInstanceId;
  readonly landing: LandingResult;
};

export type CardMovementResult = Movement & {
  readonly playerId: PlayerId;
  readonly cardId: MovementCardId;
  readonly instanceId: CardInstanceId;
  readonly landing: LandingResult;
};

export type Command = {
  readonly actor: PlayerId;
  readonly expectedRevision: number;
} & ({ readonly kind: "roll" | "buy" | "skip" | "bankrupt" | "auction_pass" } | { readonly kind: "auction_bid"; readonly amount: number }
  | { readonly kind: "trade_propose"; readonly terms: TradeTerms }
  | { readonly kind: "trade_accept" | "trade_reject"; readonly proposalRevision: number }
  | { readonly kind: "discard_item"; readonly instanceId: CardInstanceId }
  | { readonly kind: "use_item"; readonly instanceId: CardInstanceId; readonly total: number | null; readonly targetId: PlayerId | null }
  | { readonly kind: "upgrade" | "sell_building" | "mortgage" | "redeem"; readonly propertyId: string });

export type GameEvent =
  | { readonly kind: "item_used"; readonly actor: PlayerId; readonly instanceId: CardInstanceId; readonly total: number | null; readonly targetId: PlayerId | null }
  | { readonly kind: "item_discarded"; readonly actor: PlayerId }
  | { readonly kind: "trade_proposed"; readonly proposal: TradeProposal }
  | { readonly kind: "trade_accepted" | "trade_rejected"; readonly proposal: TradeProposal }
  | { readonly kind: "rolled"; readonly result: RollResult }
  | { readonly kind: "card_moved"; readonly result: CardMovementResult }
  | { readonly kind: "purchased"; readonly actor: PlayerId; readonly propertyId: string; readonly price: number }
  | { readonly kind: "upgraded"; readonly actor: PlayerId; readonly propertyId: string; readonly level: 1 | 2 | 3; readonly cost: number }
  | { readonly kind: "building_sold"; readonly actor: PlayerId; readonly propertyId: string; readonly level: 0 | 1 | 2; readonly cost: number; readonly refund: number }
  | { readonly kind: "mortgaged"; readonly actor: PlayerId; readonly propertyId: string; readonly principal: number }
  | { readonly kind: "redeemed"; readonly actor: PlayerId; readonly propertyId: string; readonly principal: number; readonly fee: number }
  | { readonly kind: "skipped"; readonly actor: PlayerId; readonly propertyId: string }
  | { readonly kind: "auction_started"; readonly actor: PlayerId; readonly propertyId: string }
  | { readonly kind: "auction_bid"; readonly actor: PlayerId; readonly propertyId: string; readonly amount: number }
  | { readonly kind: "auction_passed"; readonly actor: PlayerId; readonly propertyId: string }
  | { readonly kind: "auction_ended"; readonly propertyId: string; readonly winnerId: PlayerId | null; readonly price: number; readonly reason: "sold" | "all_passed" | "no_bidders" }
  | { readonly kind: "paid"; readonly actor: PlayerId; readonly debt: PendingDebt; readonly amount: number; readonly writtenOff: number }
  | { readonly kind: "liquidated"; readonly actor: PlayerId; readonly constructionCost: number; readonly constructionRefund: number; readonly mortgageIncome: number; readonly principalReleased: number }
  | { readonly kind: "turn"; readonly actor: PlayerId }
  | { readonly kind: "ended"; readonly result: MatchResult };

export type ApplyResult =
  | { readonly ok: true; readonly snapshot: GameSnapshot; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: "invalid_command" | "stale_revision" | "illegal_action" | "calculation_failed" };
