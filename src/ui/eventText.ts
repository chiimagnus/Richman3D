import type { GameEvent, GameSnapshot, PendingDebt, PlayerId, RollResult, TradeProposal } from "../domain/types";
import { chanceCardText, formatCash, formatMessage, messages, playerName, resultTitle, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { cardType } from "../domain/cards";
import type { ItemCardId } from "../domain/types";

export function eventText(language: Language, event: GameEvent, snapshot: GameSnapshot): string {
  const copy = messages(language).status;
  switch (event.kind) {
    case "item_discarded": return formatMessage(messages(language).items.discarded, { actor: playerName(language, event.actor, snapshot.config) });
    case "item_used": {
      const copy = messages(language).items;
      return formatMessage(copy.activated, { actor: playerName(language, event.actor, snapshot.config), card: copy.names[cardType(event.instanceId) as ItemCardId] }) +
        (event.total !== null ? " " + formatMessage(copy.controlled, { total: event.total }) : event.targetId !== null ? " " + formatMessage(copy.swapped, { target: playerName(language, event.targetId, snapshot.config) }) : "");
    }
    case "card_moved": {
      const result = event.result;
      const card = snapshot.rules.chanceCards.find((card) => card.id === result.cardId)!;
      return formatMessage(copy.cardMoved, { actor: playerName(language, result.playerId, snapshot.config),
        message: chanceCardText(language, result.cardId, snapshot.rules.passStartBonus, card.kind === "move" ? card.steps : 0),
        destination: tileName(language, snapshot.map.tiles[result.to]!) }) + (result.startBonus > 0 ? " " + formatMessage(copy.cardBonus, { amount: formatCash(language, result.startBonus) }) : "");
    }
    case "trade_proposed":
    case "trade_accepted":
    case "trade_rejected": {
      const proposal = event.proposal;
      const copy = messages(language).trade;
      const reason = event.kind === "trade_proposed" ? null : event.reason;
      return formatMessage(copy[event.kind], { proposer: playerName(language, proposal.proposerId, snapshot.config), recipient: playerName(language, proposal.recipientId, snapshot.config), terms: tradeTermsText(language, proposal, snapshot) }) + (reason ? " " + copy.botReasons[reason] : "");
    }
    case "auction_started":
    case "auction_bid":
    case "auction_passed":
    case "auction_ended": {
      const copy = messages(language).auction;
      const property = tileName(language, snapshot.map.tiles.find((tile) => tile.id === event.propertyId)!);
      if (event.kind === "auction_ended") return formatMessage(copy[event.reason], { property, actor: event.winnerId === null ? "" : playerName(language, event.winnerId, snapshot.config), amount: formatCash(language, event.price) });
      return formatMessage(copy[event.kind], { property, actor: playerName(language, event.actor, snapshot.config), amount: formatCash(language, event.kind === "auction_bid" ? event.amount : 0) });
    }
    case "paid": return formatMessage(messages(language).debt.paid, { actor: playerName(language, event.actor, snapshot.config), creditor: event.debt.creditorId === null ? messages(language).assets.bank : playerName(language, event.debt.creditorId, snapshot.config), amount: formatCash(language, event.amount) }) + " " + debtSourceText(language, event.debt, snapshot) + (event.writtenOff > 0 ? " " + formatMessage(messages(language).debt.writtenOff, { writtenOff: formatCash(language, event.writtenOff) }) : "");
    case "liquidated": return formatMessage(messages(language).debt.liquidated, { actor: playerName(language, event.actor, snapshot.config), amount: formatCash(language, event.constructionRefund + event.mortgageIncome) });
    case "building_sold":
    case "mortgaged":
    case "redeemed": {
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId)!;
      return formatMessage(copy[event.kind], { actor: playerName(language, event.actor, snapshot.config), propertyName: tileName(language, tile),
        amount: formatCash(language, event.kind === "building_sold" ? event.refund : event.principal),
        fee: formatCash(language, event.kind === "redeemed" ? event.fee : 0) });
    }
    case "rolled": return (event.result.controlledBy ? formatMessage(messages(language).items.controlled, { total: event.result.steps }) + " " : "") + rollStatus(language, event.result.playerId, event.result, snapshot) + (event.result.passedStart ? " " + formatMessage(messages(language).runtime.passedStart, { amount: event.result.startBonus }) : "");
    case "purchased":
    case "upgraded":
    case "skipped": {
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === event.propertyId);
      if (!tile) throw new Error("事件地块不存在");
      return formatMessage(event.kind === "purchased" ? copy.purchased : event.kind === "upgraded" ? copy.upgraded : copy.skipped, { actor: playerName(language, event.actor, snapshot.config), propertyName: tileName(language, tile), ...(event.kind === "purchased" ? { amount: formatCash(language, event.price) } : event.kind === "upgraded" ? { amount: formatCash(language, event.cost), level: event.level } : {}) });
    }
    case "turn": return formatMessage(copy.yourTurn, { actor: playerName(language, event.actor, snapshot.config) });
    case "ended": return resultTitle(language, event.result, snapshot.config);
  }
}

export function tradeTermsText(language: Language, proposal: TradeProposal, snapshot: GameSnapshot): string {
  const copy = messages(language).trade;
  const names = (ids: readonly string[]) => ids.map((id) => tileName(language, snapshot.map.tiles.find((tile) => tile.id === id)!)).join(messages(language).setup.nameSeparator) || copy.none;
  const cash = proposal.cash;
  return formatMessage(copy.terms, { proposer: playerName(language, proposal.proposerId, snapshot.config), given: names(proposal.givePropertyIds), received: names(proposal.receivePropertyIds),
    cash: cash ? formatMessage(copy.cashTransfer, { payer: playerName(language, cash.payerId, snapshot.config), receiver: playerName(language, cash.payerId === proposal.proposerId ? proposal.recipientId : proposal.proposerId, snapshot.config), amount: formatCash(language, cash.amount) }) : copy.noCash });
}

export function debtSourceText(language: Language, debt: PendingDebt, snapshot: GameSnapshot): string {
  const source = debt.source;
  const copy = messages(language).debt;
  return source.kind === "rent" ? formatMessage(copy.rentSource, { propertyName: tileName(language, snapshot.map.tiles.find((tile) => tile.id === source.propertyId)!) })
    : source.kind === "tax" ? copy.taxSource : chanceCardText(language, source.cardId, source.amount);
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
  const propertyName = "propertyId" in landing ? tileName(language, snapshot.map.tiles.find((tile) => tile.id === landing.propertyId)!) : "";

  switch (landing.kind) {
    case "item_received": return formatMessage(messages(language).items.received, { actor });
    case "rent_waived": return formatMessage(messages(language).items.waived, { actor, owner: playerName(language, landing.ownerId, snapshot.config), property: propertyName });
    case "movement_card": {
      const card = snapshot.rules.chanceCards.find((card) => card.id === landing.cardId)!;
      return formatMessage(copy.rollChance, { actor, steps: result.steps,
        message: chanceCardText(language, landing.cardId, snapshot.rules.passStartBonus, card.kind === "move" ? card.steps : 0) });
    }
    case "chance_ignored": return copy.chanceIgnored;
    case "property_available":
      return formatMessage(copy.rollPropertyAvailable, {
        actor,
        steps: result.steps,
        propertyName,
      });
    case "rent":
      return formatMessage(copy.rollRent, {
        actor,
        steps: result.steps,
        amount: formatCash(language, landing.amount),
        owner: playerName(language, landing.ownerId, snapshot.config),
        propertyName,
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
        propertyName,
      });
    case "start":
      return formatMessage(copy.rollStart, {
        actor,
        steps: result.steps,
      });
  }
}
