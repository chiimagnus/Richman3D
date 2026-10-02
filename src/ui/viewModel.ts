import type { GameView } from "../app/GameSession";
import { legalCommands, pendingProperty, currentTile } from "../domain/selectors";
import { formatMessage, messages, playerName, resultTitle, tileName } from "../i18n";
import { playerConfig } from "../domain/config";
import type { Language } from "../i18n/language";

export function actionView(view: GameView, language: Language) {
  const snapshot = view.displayed;
  const property = pendingProperty(snapshot);
  const copy = messages(language).runtime;
  const action = view.presenting ? view.events.find((event) => event.kind !== "turn" && event.kind !== "ended") : null;
  const actor = action?.kind === "rolled" ? action.result.playerId : action && "actor" in action ? action.actor : snapshot.activePlayerId;
  const ready = !view.presenting && view.mode === "running" && view.attached && view.error !== "presentation_failed";
  const commands = ready && playerConfig(snapshot.config, snapshot.activePlayerId).controller === "human" ? legalCommands(snapshot, snapshot.activePlayerId) : [];
  const status = view.error ? copy[view.error] : view.mode === "paused" ? copy.paused : view.presenting
    ? formatMessage(view.displayed === view.committed ? copy.settling : copy.presenting, { actor: playerName(language, actor, snapshot.config) })
    : property ? formatMessage(copy.purchaseDecision, { propertyName: tileName(language, property), price: property.price, rent: property.rent })
    : snapshot.decision.kind === "game_over" ? resultTitle(language, snapshot.decision.result, snapshot.config)
    : formatMessage(playerConfig(snapshot.config, snapshot.activePlayerId).controller === "human" ? messages(language).status.yourTurn : messages(language).status.botActing, { actor: playerName(language, snapshot.activePlayerId, snapshot.config) });
  return { commands, property, tile: currentTile(snapshot, actor), status };
}
