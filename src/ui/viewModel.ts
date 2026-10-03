import type { GameView } from "../app/GameSession";
import { legalCommands, pendingProperty, currentTile } from "../domain/selectors";
import { formatMessage, messages, playerName, resultTitle, tileName } from "../i18n";
import { playerConfig } from "../domain/config";
import type { Language } from "../i18n/language";
import { liquidityOption, rentFor, upgradeOption } from "../domain/economy";

function availableCommands(view: GameView) {
  const snapshot = view.displayed;
  const actor = snapshot.decision.kind === "game_over" ? null : snapshot.decision.actorId;
  const ready = !view.presenting && view.save.kind !== "saving" && view.mode === "running" && view.attached && view.error !== "presentation_failed";
  return ready && actor !== null && actor === view.viewPlayerId && playerConfig(snapshot.config, actor).controller === "human" ? legalCommands(snapshot, actor) : [];
}

export function assetManagementView(view: GameView) {
  const snapshot = view.displayed;
  const actor = view.viewPlayerId;
  if (actor === null || playerConfig(snapshot.config, actor).controller !== "human") return null;
  const commands = availableCommands(view);
  return { actor, properties: Object.fromEntries(snapshot.map.tiles.filter((tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === actor).map((tile) => {
    const commandFor = (kind: "upgrade" | "sell_building" | "mortgage" | "redeem") => commands.find((candidate) => candidate.kind === kind && "propertyId" in candidate && candidate.propertyId === tile.id) ?? null;
    const liquidity = (kind: "sell_building" | "mortgage" | "redeem") => {
      const { nextProperty: _next, originalCost: _original, ...option } = liquidityOption(snapshot, actor, tile.id, kind);
      return { ...option, command: commandFor(kind) };
    };
    return [tile.id, { upgrade: { ...upgradeOption(snapshot, actor, tile.id), proceeds: 0, loss: 0, command: commandFor("upgrade") },
      sell_building: liquidity("sell_building"), mortgage: liquidity("mortgage"), redeem: liquidity("redeem") }];
  })) };
}

export function actionView(view: GameView, language: Language) {
  const snapshot = view.displayed;
  const property = pendingProperty(snapshot);
  const copy = messages(language).runtime;
  const action = view.presenting ? view.events.find((event) => event.kind !== "turn" && event.kind !== "ended") : null;
  const decisionActor = snapshot.decision.kind === "game_over" ? null : snapshot.decision.actorId;
  const actor = action?.kind === "rolled" ? action.result.playerId : action && "actor" in action ? action.actor : decisionActor ?? snapshot.turnPlayerId;
  const choices = decisionActor === null ? [] : legalCommands(snapshot, decisionActor);
  const commands = availableCommands(view);
  const insufficientFunds = property !== null && choices.some((command) => command.kind === "skip") && !choices.some((command) => command.kind === "buy");
  const status = view.error ? copy[view.error] : view.mode === "paused" ? copy.paused : view.presenting
    ? formatMessage(view.displayed === view.committed ? copy.settling : copy.presenting, { actor: playerName(language, actor, snapshot.config) })
    : property ? formatMessage(copy.purchaseDecision, { propertyName: tileName(language, property), price: property.price, rent: rentFor(snapshot, property.id) })
    : snapshot.decision.kind === "game_over" ? resultTitle(language, snapshot.decision.result, snapshot.config)
    : formatMessage(playerConfig(snapshot.config, actor).controller === "human" ? messages(language).status.yourTurn : messages(language).status.botActing, { actor: playerName(language, actor, snapshot.config) });
  return { commands, property, tile: currentTile(snapshot, actor), status, insufficientFunds };
}
