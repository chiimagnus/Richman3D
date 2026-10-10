import type { GameView } from "../app/GameSession";
import { legalCommands, pendingProperty, currentTile, playerAssets } from "../domain/selectors";
import { formatMessage, messages, playerName, resultTitle, tileName } from "../i18n";
import { playerConfig } from "../domain/config";
import type { Language } from "../i18n/language";
import { canDeclareBankruptcy, saleOption, rentFor, upgradeOption } from "../domain/economy";
import { canProposeTrade } from "../domain/market";

export function availableCommands(view: GameView) {
  const snapshot = view.displayed;
  const actor = snapshot.decision.kind === "game_over" ? null : snapshot.decision.actorId;
  const ready = !view.presenting && view.save.kind !== "saving" && view.mode === "running" && view.attached && view.error !== "presentation_failed" && (!view.network || view.network.connected && !view.network.pending);
  return ready && actor !== null && actor === view.viewPlayerId && playerConfig(snapshot.config, actor).controller === "human" ? legalCommands(snapshot, actor) : [];
}

export function assetManagementView(view: GameView) {
  const snapshot = view.displayed;
  const actor = view.viewPlayerId;
  if (actor === null || playerConfig(snapshot.config, actor).controller !== "human") return null;
  const commands = availableCommands(view);
  return { actor, properties: Object.fromEntries(snapshot.map.tiles.filter((tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === actor).map((tile) => {
    const commandFor = (kind: "upgrade" | "sell_building") => commands.find((candidate) => candidate.kind === kind && "propertyId" in candidate && candidate.propertyId === tile.id) ?? null;
    const sale = () => {
      const { nextProperty: _next, originalCost: _original, ...option } = saleOption(snapshot, actor, tile.id);
      const payment = snapshot.decision.kind === "awaiting_debt" && snapshot.decision.actorId === actor && option.reason === null && option.remainingCash >= snapshot.decision.debt.amount ? snapshot.decision.debt.amount : 0;
      return { ...option, remainingCash: option.remainingCash - payment, payment, command: commandFor("sell_building") };
    };
    return [tile.id, { upgrade: { ...upgradeOption(snapshot, actor, tile.id), proceeds: 0, loss: 0, payment: 0, command: commandFor("upgrade") },
      sell_building: sale() }];
  })) };
}

export function debtView(view: GameView) {
  const snapshot = view.displayed;
  if (snapshot.decision.kind !== "awaiting_debt") return null;
  const { actorId: actor, debt } = snapshot.decision;
  const assets = playerAssets(snapshot, actor);
  return { actor, debt, assets, shortfall: debt.amount - assets.cash, management: assetManagementView(view),
    insolvent: canDeclareBankruptcy(snapshot, actor),
    bankruptcy: availableCommands(view).find((command) => command.kind === "bankrupt") ?? null };
}

export function tradeView(view: GameView) {
  const snapshot = view.displayed;
  return { canPropose: view.viewPlayerId !== null && canProposeTrade(snapshot, view.viewPlayerId) && availableCommands(view).some((command) => command.kind === "roll"),
    commands: snapshot.decision.kind === "awaiting_trade" ? availableCommands(view) : [] };
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
  const botDecision = view.presenting && view.botDecision?.revision === view.committed.revision ? view.botDecision : null;
  const status = view.network && !view.network.connected ? messages(language).network.errors[view.network.error ?? "unavailable"] : view.network?.pending ? messages(language).network.pending : view.network?.error ? messages(language).network.errors[view.network.error] : view.error ? copy[view.error] : view.mode === "paused" ? copy.paused : view.presenting
    ? botDecision ? formatMessage(messages(language).ai.action, { actor: playerName(language, botDecision.actorId, snapshot.config), difficulty: messages(language).ai.difficulties[botDecision.difficulty], reason: messages(language).ai.reasons[botDecision.reason] })
      : formatMessage(view.displayed === view.committed ? copy.settling : copy.presenting, { actor: playerName(language, actor, snapshot.config) })
    : property ? formatMessage(copy.purchaseDecision, { propertyName: tileName(language, property), price: property.price, rent: rentFor(snapshot, property.id) })
    : snapshot.decision.kind === "game_over" ? resultTitle(language, snapshot.decision.result, snapshot.config)
    : snapshot.decision.kind === "awaiting_debt" ? messages(language).debt.pending
    : snapshot.decision.kind === "awaiting_trade" ? messages(language).trade.pending
    : snapshot.decision.kind === "awaiting_discard" ? messages(language).items.pending
    : formatMessage(view.network && actor !== view.viewPlayerId ? messages(language).network.waiting : playerConfig(snapshot.config, actor).controller === "human" ? messages(language).status.yourTurn : messages(language).status.botActing, { actor: playerName(language, actor, snapshot.config) });
  return { commands, property, tile: currentTile(snapshot, actor), status, insufficientFunds };
}

export function handCommands(view: GameView) { return availableCommands(view).filter((command) => command.kind === "use_item" || command.kind === "discard_item"); }
