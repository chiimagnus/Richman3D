import type { GameEvent, PlayerId, RollResult } from "../domain/types";
import { BOARD } from "../domain/board";
import { chanceCardText, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../settings/preferences";

export function eventText(language: Language, event: GameEvent): string {
  const copy = messages(language).status;
  switch (event.kind) {
    case "rolled": return rollStatus(language, event.result.playerId, event.result);
    case "purchased":
    case "skipped": {
      const tile = BOARD.find((candidate) => candidate.id === event.propertyId);
      if (!tile) throw new Error("事件地块不存在");
      return formatMessage(event.kind === "purchased" ? copy.purchased : copy.skipped, { propertyName: tileName(language, tile) });
    }
    case "turn": return event.actor === "human" ? copy.yourTurn : copy.botActing;
    case "ended": return formatMessage(copy.winner, { playerName: playerName(language, event.winnerId) });
  }
}

function rollStatus(
  language: Language,
  actorId: PlayerId,
  result: RollResult,
): string {
  const copy = messages(language).status;
  const actor = playerName(language, actorId);
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
        message: chanceCardText(language, landing.cardId),
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
