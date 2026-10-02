import type { ChanceCardId } from "./types";

export type RuleSet = {
  readonly version: string;
  readonly startingCash: number;
  readonly passStartBonus: number;
  readonly roundLimit: number;
  readonly chanceCards: readonly { readonly id: ChanceCardId; readonly amount: number }[];
};

export const QUICK_RULES: RuleSet = {
  version: "city-v2-quick", startingCash: 1500, passStartBonus: 200, roundLimit: 20,
  chanceCards: [
    { id: "innovation-bonus", amount: 120 }, { id: "maintenance-cost", amount: -90 },
    { id: "community-event", amount: 60 }, { id: "traffic-fine", amount: -50 },
  ],
};
export const STANDARD_RULES: RuleSet = { ...QUICK_RULES, version: "city-v2-standard", roundLimit: 40 };

export function rulesFor(version: string): RuleSet {
  if (version === QUICK_RULES.version) return QUICK_RULES;
  if (version === STANDARD_RULES.version) return STANDARD_RULES;
  throw new Error("规则版本未知");
}

export function validateRules(rules: RuleSet): void {
  if (!rules.version || !Number.isSafeInteger(rules.startingCash) || rules.startingCash < 0 || !Number.isSafeInteger(rules.passStartBonus) || rules.passStartBonus < 0 || !Number.isSafeInteger(rules.roundLimit) || rules.roundLimit < 1) throw new RangeError("规则金额或轮数无效");
  if (rules.chanceCards.length !== 4 || new Set(rules.chanceCards.map((card) => card.id)).size !== 4 || rules.chanceCards.some((card) => !["innovation-bonus", "maintenance-cost", "community-event", "traffic-fine"].includes(card.id) || !Number.isSafeInteger(card.amount))) throw new Error("机会规则无效");
}
