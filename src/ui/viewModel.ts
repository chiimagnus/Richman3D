import type { GameView } from "../app/GameSession";
import { legalCommands, pendingProperty, currentTile } from "../domain/selectors";
import { formatMessage, messages, playerName, resultTitle, tileName } from "../i18n";
import { playerConfig } from "../domain/config";
import type { Language } from "../i18n/language";
import { rentFor } from "../domain/economy";

export function actionView(view: GameView, language: Language) {
  const snapshot = view.displayed;
  const property = pendingProperty(snapshot);
  const copy = messages(language).runtime;
  const action = view.presenting ? view.events.find((event) => event.kind !== "turn" && event.kind !== "ended") : null;
  const decisionActor = snapshot.decision.kind === "game_over" ? null : snapshot.decision.actorId;
  const actor = action?.kind === "rolled" ? action.result.playerId : action && "actor" in action ? action.actor : decisionActor ?? snapshot.turnPlayerId;
  const ready = !view.presenting && view.save.kind !== "saving" && view.mode === "running" && view.attached && view.error !== "presentation_failed";
  const choices = decisionActor === null ? [] : legalCommands(snapshot, decisionActor);
  const commands = ready && decisionActor === view.viewPlayerId && decisionActor !== null && playerConfig(snapshot.config, decisionActor).controller === "human" ? choices : [];
  const insufficientFunds = property !== null && choices.some((command) => command.kind === "skip") && !choices.some((command) => command.kind === "buy");
  const status = view.error ? copy[view.error] : view.mode === "paused" ? copy.paused : view.presenting
    ? formatMessage(view.displayed === view.committed ? copy.settling : copy.presenting, { actor: playerName(language, actor, snapshot.config) })
    : property ? formatMessage(copy.purchaseDecision, { propertyName: tileName(language, property), price: property.price, rent: rentFor(snapshot, property.id) })
    : snapshot.decision.kind === "game_over" ? resultTitle(language, snapshot.decision.result, snapshot.config)
    : formatMessage(playerConfig(snapshot.config, actor).controller === "human" ? messages(language).status.yourTurn : messages(language).status.botActing, { actor: playerName(language, actor, snapshot.config) });
  return { commands, property, tile: currentTile(snapshot, actor), status, insufficientFunds };
}
