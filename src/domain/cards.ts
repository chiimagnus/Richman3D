import type { RuleRandom } from "./random";
import type { RuleSet } from "./rules";
import type { CardInstanceId, ChanceCardId, DeckState } from "./types";

export function cardInstances(rules: RuleSet): CardInstanceId[] {
  return rules.chanceCards.flatMap((card) => [`${card.id}:1`, `${card.id}:2`] as CardInstanceId[]);
}

export function cardType(instanceId: CardInstanceId): ChanceCardId {
  return instanceId.slice(0, -2) as ChanceCardId;
}

export function initialDeck(rules: RuleSet): DeckState {
  return { drawPile: cardInstances(rules), discardPile: [], pending: null };
}

export function drawCard(deck: DeckState, rules: RuleSet, random: RuleRandom): DeckState {
  if (deck.pending !== null) throw new Error("上一张卡尚未结算");
  const drawPile = [...(deck.drawPile.length === 0 ? deck.discardPile : deck.drawPile)];
  const shuffle = deck.drawPile.length === 0 || deck.drawPile.length === rules.chanceCards.length * 2 && deck.discardPile.length === 0;
  if (shuffle) {
    for (let remaining = drawPile.length; remaining > 1; remaining -= 1) {
      const selected = random.integer(remaining);
      [drawPile[remaining - 1], drawPile[selected]] = [drawPile[selected]!, drawPile[remaining - 1]!];
    }
  }
  const pending = drawPile.pop();
  if (!pending) throw new Error("无可抽取实体卡");
  return { drawPile, discardPile: deck.drawPile.length === 0 ? [] : deck.discardPile, pending };
}

export function discardCard(deck: DeckState, instanceId: CardInstanceId): DeckState {
  if (deck.pending !== instanceId) throw new Error("待结算实体卡不匹配");
  return { ...deck, pending: null, discardPile: [...deck.discardPile, instanceId] };
}
