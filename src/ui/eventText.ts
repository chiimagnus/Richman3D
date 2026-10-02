import type { GameEvent, GameSnapshot, PlayerId, RollResult } from "../domain/types";
import { chanceCardText, formatMessage, messages, playerName, resultTitle, tileName } from "../i18n";
import type { Language } from "../i18n/language";

export function eventText(language: Language, event: GameEvent, snapshot: GameSnapshot): string {
  const copy = messages(language).status;
  switch (event.kind) {
    case "rolled": return rollStatus(language, event.result.playerId, event.result, snapshot) + (event.result.passedStart ? " " + formatMessage(messages(language).runtime.passedStart, { amount: event.result.startBonus }) : "");
    case "purchased":
    case "skipped": {
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId);
      if (!tile) throw new Error("事件地块不存在");
      return formatMessage(event.kind === "purchased" ? copy.purchased : copy.skipped, { actor: playerName(language, event.actor, snapshot.config), propertyName: tileName(language, tile) });
    }
    case "turn": return formatMessage(copy.yourTurn, { actor: playerName(language, event.actor, snapshot.config) });
    case "ended": return resultTitle(language, event.result, snapshot.config);
  }
}

function rollStatus(
  language: Language,
  actorId: PlayerId,
  result: RollResult,
  snapshot: GameSnapshot,
): string {
  const copy = messages(language).status;
  const actor = playerName(language, actorId, snapshot.config);
  const landing = result.landing;

  switch (landing.kind) {
    case "property_available":
      return formatMessage(copy.rollPropertyAvailable, {
        actor,
        steps: result.steps,
      });
    case "rent":
      return formatMessage(copy.rollRent, {
        actor,
        steps: result.steps,
        amount: landing.amount,
      });
    case "tax":
      return formatMessage(copy.rollTax, {
        actor,
        steps: result.steps,
        amount: landing.amount,
      });
    case "chance":
      return formatMessage(copy.rollChance, {
        actor,
        steps: result.steps,
        message: chanceCardText(language, landing.cardId, landing.amount),
      });
    case "property_owned":
      return formatMessage(copy.rollOwned, {
        actor,
        steps: result.steps,
      });
    case "start":
      return formatMessage(copy.rollStart, {
        actor,
        steps: result.steps,
      });
  }
}
