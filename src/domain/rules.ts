import type { ChanceCardId } from "./types";

export type RuleSet = {
  readonly version: string;
  readonly startingCash: number;
  readonly passStartBonus: number;
  readonly roundLimit: number;
  readonly rentMultipliers: readonly [number, number, number, number];
  readonly groupRentPercent: number;
  readonly constructionCostPercent: number;
  readonly constructionSalePercent: number;
  readonly mortgagePercent: number;
  readonly mortgageRedemptionPercent: number;
  readonly chanceCards: readonly { readonly id: ChanceCardId; readonly amount: number }[];
};

export const QUICK_RULES: RuleSet = {
  version: "city-v6-quick", startingCash: 1500, passStartBonus: 200, roundLimit: 20,
  rentMultipliers: [1, 2, 4, 7], groupRentPercent: 150,
  constructionCostPercent: 50, constructionSalePercent: 50, mortgagePercent: 50, mortgageRedemptionPercent: 10,
  chanceCards: [
    { id: "innovation-bonus", amount: 120 }, { id: "maintenance-cost", amount: -90 },
    { id: "community-event", amount: 60 }, { id: "traffic-fine", amount: -50 },
  ],
};
export const STANDARD_RULES: RuleSet = { ...QUICK_RULES, version: "city-v6-standard", roundLimit: 40 };

export function rulesFor(version: string): RuleSet {
  if (version === QUICK_RULES.version) return QUICK_RULES;
  if (version === STANDARD_RULES.version) return STANDARD_RULES;
  throw new Error("规则版本未知");
}

export function validateRules(rules: RuleSet): void {
  if (!rules.version || !Number.isSafeInteger(rules.startingCash) || rules.startingCash < 0 || !Number.isSafeInteger(rules.passStartBonus) || rules.passStartBonus < 0 || !Number.isSafeInteger(rules.roundLimit) || rules.roundLimit < 1) throw new RangeError("规则金额或轮数无效");
  if (rules.chanceCards.length !== 4 || new Set(rules.chanceCards.map((card) => card.id)).size !== 4 || rules.chanceCards.some((card) => !["innovation-bonus", "maintenance-cost", "community-event", "traffic-fine"].includes(card.id) || !Number.isSafeInteger(card.amount))) throw new Error("机会规则无效");
  if (rules.rentMultipliers.length !== 4 || rules.rentMultipliers.some((value) => !Number.isSafeInteger(value) || value < 1) || !Number.isSafeInteger(rules.groupRentPercent) || rules.groupRentPercent < 100 ||
      [rules.constructionCostPercent, rules.constructionSalePercent, rules.mortgagePercent, rules.mortgageRedemptionPercent].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 100)) throw new Error("地产规则无效");
}
