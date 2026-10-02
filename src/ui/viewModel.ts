import type { GameView } from "../app/GameSession";
import { legalCommands, pendingProperty, currentTile } from "../domain/selectors";
import { formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";

export function actionView(view: GameView, language: Language) {
  const snapshot = view.displayed;
  const property = pendingProperty(snapshot);
  const copy = messages(language).runtime;
  const ready = !view.presenting && view.mode === "running" && view.attached && view.error !== "presentation_failed";
  const commands = ready ? legalCommands(snapshot, "human") : [];
  const status = view.error ? copy[view.error] : view.mode === "paused" ? copy.paused : view.presenting
    ? formatMessage(copy.presenting, { actor: playerName(language, snapshot.activePlayerId) })
    : property ? formatMessage(copy.purchaseDecision, { propertyName: tileName(language, property), price: property.price, rent: property.rent })
    : snapshot.decision.kind === "game_over" ? formatMessage(messages(language).status.winner, { playerName: playerName(language, snapshot.decision.winnerId) })
    : snapshot.activePlayerId === "human" ? messages(language).status.yourTurn : messages(language).status.botActing;
  return { commands, property, tile: currentTile(snapshot), status };
}
