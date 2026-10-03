import type { CashCardId, MovementCardId, ItemCardId } from "./types";

export type CardDefinition = { readonly kind: "cash"; readonly id: CashCardId; readonly amount: number }
  | { readonly kind: "move"; readonly id: MovementCardId; readonly direction: "forward" | "backward" | "teleport"; readonly steps: number }
  | { readonly kind: "item"; readonly id: ItemCardId };

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
  readonly taxDiscountPercent: number;
  readonly constructionDiscountPercent: number;
  readonly chanceCards: readonly CardDefinition[];
};

export const QUICK_RULES: RuleSet = {
  version: "city-v12-quick", startingCash: 1500, passStartBonus: 200, roundLimit: 20,
  rentMultipliers: [1, 2, 4, 7], groupRentPercent: 150,
  constructionCostPercent: 50, constructionSalePercent: 50, mortgagePercent: 50, mortgageRedemptionPercent: 10,
  taxDiscountPercent: 50, constructionDiscountPercent: 80,
  chanceCards: [
    { kind: "cash", id: "innovation-bonus", amount: 120 }, { kind: "cash", id: "maintenance-cost", amount: -90 },
    { kind: "cash", id: "community-event", amount: 60 }, { kind: "cash", id: "traffic-fine", amount: -50 },
    { kind: "move", id: "advance-three", direction: "forward", steps: 3 },
    { kind: "move", id: "retreat-three", direction: "backward", steps: 3 },
    { kind: "move", id: "return-start", direction: "teleport", steps: 1 },
    { kind: "item", id: "rent-waiver" }, { kind: "item", id: "controlled-dice" },
    { kind: "item", id: "tax-discount" }, { kind: "item", id: "construction-discount" }, { kind: "item", id: "swap-positions" },
  ],
};
export const STANDARD_RULES: RuleSet = { ...QUICK_RULES, version: "city-v12-standard", roundLimit: 40 };

export function rulesFor(version: string): RuleSet {
  if (version === QUICK_RULES.version) return QUICK_RULES;
  if (version === STANDARD_RULES.version) return STANDARD_RULES;
  throw new Error("规则版本未知");
}

export function validateRules(rules: RuleSet): void {
  if (!rules.version || !Number.isSafeInteger(rules.startingCash) || rules.startingCash < 0 || !Number.isSafeInteger(rules.passStartBonus) || rules.passStartBonus < 0 || !Number.isSafeInteger(rules.roundLimit) || rules.roundLimit < 1) throw new RangeError("规则金额或轮数无效");
  if (rules.chanceCards.length !== 12 || new Set(rules.chanceCards.map((card) => card.id)).size !== 12 || rules.chanceCards.some((card) =>
    card.kind === "cash" ? !["innovation-bonus", "maintenance-cost", "community-event", "traffic-fine"].includes(card.id) || !Number.isSafeInteger(card.amount)
      : card.kind === "item" ? !["rent-waiver", "controlled-dice", "tax-discount", "construction-discount", "swap-positions"].includes(card.id)
        : card.kind !== "move" || !["advance-three", "retreat-three", "return-start"].includes(card.id) ||
          card.direction !== (card.id === "advance-three" ? "forward" : card.id === "retreat-three" ? "backward" : "teleport") || card.steps !== (card.id === "return-start" ? 1 : 3))) throw new Error("机会规则无效");
  if (rules.rentMultipliers.length !== 4 || rules.rentMultipliers.some((value) => !Number.isSafeInteger(value) || value < 1) || !Number.isSafeInteger(rules.groupRentPercent) || rules.groupRentPercent < 100 ||
      [rules.constructionCostPercent, rules.constructionSalePercent, rules.mortgagePercent, rules.mortgageRedemptionPercent, rules.taxDiscountPercent, rules.constructionDiscountPercent].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 100)) throw new Error("地产规则无效");
}
