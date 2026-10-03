import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { cardInstances, cardType } from "../../src/domain/cards";
import { legalCommands } from "../../src/domain/selectors";
import { constructionRefund, discountedCost, netAssets, upgradeOption } from "../../src/domain/economy";
import { makeSave } from "../../src/storage/snapshot";
import { eventText } from "../../src/ui/eventText";
import { messages } from "../../src/i18n";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import type { Command, ItemCardId } from "../../src/domain/types";
import { fullHandCheckpoint, itemCheckpoint, itemFineCheckpoint, itemLandingCheckpoint } from "../fixtures/items";
import { builtRentDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

function use(game: Game, type: ItemCardId, total: number | null = null, targetId: "p2" | null = null) {
  const command = legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item" && cardType(command.instanceId) === type && command.total === total && command.targetId === targetId)!;
  expect(command).toBeDefined();
  const result = game.apply(command);
  expect(result.ok).toBe(true);
  return command;
}

function restored(game: Game) {
  const snapshot = game.snapshot;
  const ids = [...snapshot.deck.drawPile, ...snapshot.deck.discardPile, ...(snapshot.deck.pending ? [snapshot.deck.pending] : []), ...snapshot.players.flatMap((player) => player.hand), ...(snapshot.activeItem ? [snapshot.activeItem.instanceId] : [])];
  expect(ids).toHaveLength(24);
  expect(new Set(ids)).toEqual(new Set(cardInstances(snapshot.rules)));
  expect(Game.restore(makeSave(snapshot, propertyMatchId).state).snapshot).toEqual(snapshot);
}

it.each([2, 7, 12])("chooses total %s deterministically, consumes no dice RNG and rejects a duplicate use", (total) => {
  const game = itemCheckpoint("controlled-dice");
  const before = game.snapshot;
  const command = use(game, "controlled-dice", total);
  expect(game.snapshot.random).toEqual(before.random);
  expect(game.snapshot.itemUsed).toBe(true);
  expect(game.snapshot.players[0]!.hand).toHaveLength(before.players[0]!.hand.length - 1);
  restored(game);
  expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
  expect(game.apply({ ...command, expectedRevision: game.snapshot.revision })).toEqual({ ok: false, reason: "illegal_action" });
  const beforeRoll = game.snapshot;
  const result = game.apply({ kind: "roll", actor: "p1", expectedRevision: beforeRoll.revision });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  const event = result.events.find((event) => event.kind === "rolled");
  expect(event?.kind === "rolled" && event.result).toMatchObject({ dice: [Math.max(1, total - 6), total - Math.max(1, total - 6)], steps: total, controlledBy: "instanceId" in command ? command.instanceId : "" });
  expect(game.snapshot.random).toEqual(beforeRoll.random);
  expect(game.snapshot.activeItem).toBeNull();
  restored(game);
});

it.each([
  { total: 1, targetId: null }, { total: 13, targetId: null }, { total: 2.5, targetId: null }, { total: null, targetId: null }, { total: 7, targetId: "p2" },
])("rejects invalid controlled choices atomically: %j", (draft) => {
  const game = itemCheckpoint("controlled-dice");
  const before = game.snapshot;
  const instanceId = before.players[0]!.hand.find((id) => cardType(id) === "controlled-dice")!;
  expect(game.apply({ kind: "use_item", actor: "p1", expectedRevision: before.revision, instanceId, ...draft } as Command).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it("swaps two living positions atomically, without rent, Start rewards or random draws, then still allows a roll", () => {
  const game = itemCheckpoint("swap-positions");
  const before = game.snapshot;
  use(game, "swap-positions", null, "p2");
  expect(game.snapshot.players.map((player) => player.position)).toEqual([before.players[1]!.position, before.players[0]!.position]);
  expect(game.snapshot.players.map((player) => [player.cash, player.statistics])).toEqual(before.players.map((player) => [player.cash, player.statistics]));
  expect(game.snapshot.random).toEqual(before.random);
  expect(game.snapshot.activeItem).toBeNull();
  expect(legalCommands(game.snapshot, "p1").some((command) => command.kind === "roll")).toBe(true);
  restored(game);
});

it.each(["p1", "p3", null])("rejects a swap target %s without losing the card", (targetId) => {
  const game = itemCheckpoint("swap-positions");
  const before = game.snapshot;
  const instanceId = before.players[0]!.hand.find((id) => cardType(id) === "swap-positions")!;
  expect(game.apply({ kind: "use_item", actor: "p1", expectedRevision: before.revision, instanceId, total: null, targetId } as Command).ok).toBe(false);
  expect(game.snapshot).toBe(before);
});

it("waives actual opponent rent and credits neither landlord nor renter", () => {
  const game = itemLandingCheckpoint("rent-waiver", 6);
  expect(game.snapshot.properties["skyline-road"]!.ownerId).toBe("p2");
  use(game, "rent-waiver");
  restored(game);
  const before = game.snapshot;
  const result = game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.events.some((event) => event.kind === "paid")).toBe(false);
  expect(result.events.find((event) => event.kind === "rolled")).toMatchObject({ result: { landing: { kind: "rent_waived" } } });
  expect(game.snapshot.players[1]!.cash).toBe(before.players[1]!.cash);
  expect(game.snapshot.players[0]!.statistics.rentPaid).toBe(before.players[0]!.statistics.rentPaid);
  expect(game.snapshot.activeItem).toBeNull();
  restored(game);
});

it("a rent waiver does not waive tax and expires at this ordinary turn’s end", () => {
  const game = itemLandingCheckpoint("rent-waiver", 14);
  use(game, "rent-waiver");
  const before = game.snapshot;
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.players[0]!.statistics.taxesPaid - before.players[0]!.statistics.taxesPaid).toBe(120);
  expect(game.snapshot.itemUsed).toBe(false);
  expect(game.snapshot.activeItem).toBeNull();
  restored(game);
});

it("saves a consumed half-tax item with its fixed debt, then pays only the discounted amount after rescue", () => {
  const game = itemLandingCheckpoint("tax-discount", 14, 30);
  use(game, "tax-discount");
  const before = game.snapshot;
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_debt", debt: { amount: 60, source: { discountedBy: expect.stringContaining("tax-discount:") } } });
  expect(game.snapshot.activeItem).toBeNull();
  restored(game);
  const command = legalCommands(game.snapshot, "p1").find((command) => command.kind === "mortgage")!;
  expect(game.apply(command).ok).toBe(true);
  expect(game.snapshot.players[0]!.statistics.taxesPaid - before.players[0]!.statistics.taxesPaid).toBe(60);
  restored(game);
});

it.each(["tax-discount", "rent-waiver"] as const)("%s does not reduce a real Chance fine or change the expense ledger", (type) => {
  const game = itemFineCheckpoint(type);
  use(game, type);
  const before = game.snapshot;
  const result = game.apply({ kind: "roll", actor: "p1", expectedRevision: before.revision });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.events[0]).toMatchObject({ kind: "rolled", result: { landing: { kind: "chance", amount: -90 } } });
  expect(game.snapshot.players[0]!.statistics.chanceExpense - before.players[0]!.statistics.chanceExpense).toBe(90);
  expect(game.snapshot.activeItem).toBeNull();
  expect(game.snapshot.itemUsed).toBe(false);
  restored(game);
});

it("rejects a restored controlled roll whose chosen total was rewritten after confirmation", () => {
  const game = itemCheckpoint("controlled-dice");
  use(game, "controlled-dice", 12);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const state = JSON.parse(JSON.stringify(makeSave(game.snapshot, propertyMatchId).state));
  state.history.findLast((entry: any) => entry.event.kind === "item_used").event.total = 2;
  expect(() => Game.restore(state)).toThrow();
});

it("discounts only the next legal construction, records actual cost, and bases sale proceeds and net assets on it", () => {
  const game = itemCheckpoint("construction-discount", true);
  expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe("p1");
  expect(game.snapshot.properties["harbor-walk"]!.ownerId).toBe("p1");
  const original = upgradeOption(game.snapshot, "p1", "neon-avenue").cost;
  use(game, "construction-discount");
  const option = upgradeOption(game.snapshot, "p1", "neon-avenue");
  expect(option.cost).toBe(discountedCost(original, game.snapshot.rules.constructionDiscountPercent));
  expect(option.reason).toBeNull();
  const beforeAssets = netAssets(game.snapshot, "p1");
  const beforeStats = game.snapshot.players[0]!.statistics;
  expect(game.apply({ kind: "upgrade", actor: "p1", expectedRevision: game.snapshot.revision, propertyId: "neon-avenue" }).ok).toBe(true);
  expect(game.snapshot.properties["neon-avenue"]!.constructionCosts).toEqual([option.cost]);
  expect(netAssets(game.snapshot, "p1")).toBe(beforeAssets);
  expect(game.snapshot.players[0]!.statistics.constructionSpent - beforeStats.constructionSpent).toBe(option.cost);
  expect(game.snapshot.activeItem).toBeNull();
  expect(upgradeOption(game.snapshot, "p1", "harbor-walk").cost).toBe(70);
  restored(game);
  const beforeSale = game.snapshot.players[0]!.cash;
  expect(game.apply({ kind: "sell_building", actor: "p1", expectedRevision: game.snapshot.revision, propertyId: "neon-avenue" }).ok).toBe(true);
  const refund = constructionRefund(option.cost, game.snapshot.rules);
  expect(game.snapshot.players[0]!.cash - beforeSale).toBe(refund);
  expect(netAssets(game.snapshot, "p1")).toBe(beforeAssets - option.cost + refund);
  restored(game);
});

it.each(["en", "zh-CN"] as const)("%s public history contains no unplayed item type", (language) => {
  const game = itemCheckpoint("controlled-dice");
  const receipts = game.snapshot.history.filter(({ event }) => event.kind === "rolled" && event.result.landing.kind === "item_received");
  expect(receipts.length).toBeGreaterThan(0);
  for (const { event } of receipts) {
    const text = eventText(language, event, game.snapshot);
    for (const name of Object.values(messages(language).items.names)) expect(text).not.toContain(name);
    expect(JSON.stringify(event)).not.toContain("instanceId");
  }
});

it.each([0, 1, 2, 3])("owns all four cards while awaiting a choice, restores it, then discards choice %s and finishes exactly one turn", (index) => {
  const game = fullHandCheckpoint();
  const before = game.snapshot;
  expect(before.players[0]!.hand).toHaveLength(4);
  expect(before.deck.pending).toBeNull();
  restored(game);
  const commands = legalCommands(before, "p1");
  expect(commands).toHaveLength(4);
  expect(commands.every((command) => command.kind === "discard_item")).toBe(true);
  const command = commands[index]!;
  const result = game.apply(command);
  expect(result.ok).toBe(true);
  if (!result.ok || command.kind !== "discard_item") throw new Error("Missing discard result");
  expect(result.events.map((event) => event.kind)).toEqual(["item_discarded", "turn"]);
  expect(game.snapshot.players[0]!.hand).toEqual(before.players[0]!.hand.filter((id) => id !== command.instanceId));
  expect(game.snapshot.deck.discardPile.at(-1)).toBe(command.instanceId);
  expect(game.snapshot.random).toEqual(before.random);
  expect(game.snapshot.turnPlayerId).toBe("p2");
  expect(game.apply(command).ok).toBe(false);
  restored(game);
});

it("computers use a beneficial held item and retain the valuable fourth card without inspecting future RNG", () => {
  for (const game of [itemCheckpoint("controlled-dice"), fullHandCheckpoint()]) {
    const before = game.snapshot;
    const botView = { ...before, config: { ...before.config, players: before.config.players.map((player) => ({ ...player, controller: "bot" as const })) } };
    const command = (chooseBotAction(observeBot(botView), "normal")?.command ?? null)!;
    expect(command.kind).toBe(before.decision.kind === "awaiting_discard" ? "discard_item" : "use_item");
    if (command.kind === "discard_item") {
      expect(command.instanceId).toBe("swap-positions:2");
      expect(command.instanceId).not.toBe(before.players[0]!.hand.at(-1));
    }
    expect(game.apply(command).ok).toBe(true);
    restored(game);
  }
});

it("rejects the wrong actor, an absent card and every item use after a fourth-card landing, leaving all zones untouched", () => {
  const game = itemCheckpoint("controlled-dice");
  const command = legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item")!;
  const before = game.snapshot;
  expect(game.apply({ ...command, actor: "p2" }).ok).toBe(false);
  expect(game.apply({ ...command, instanceId: "rent-waiver:1" } as Command).ok).toBe(false);
  expect(game.snapshot).toBe(before);
  const full = fullHandCheckpoint();
  const snapshot = full.snapshot;
  for (const instanceId of snapshot.players[0]!.hand) expect(full.apply({ kind: "use_item", actor: "p1", expectedRevision: snapshot.revision, instanceId, total: cardType(instanceId) === "controlled-dice" ? 7 : null, targetId: cardType(instanceId) === "swap-positions" ? "p2" : null }).ok).toBe(false);
  expect(full.snapshot).toBe(snapshot);
});

it("rejects an eliminated swap target in a real three-seat game without consuming the surviving player's card", () => {
  const game = builtRentDebtMatch(3);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  for (let count = 0; game.snapshot.turnPlayerId !== "p2" && count < 10; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") throw new Error("Match ended");
    const commands = legalCommands(snapshot, snapshot.decision.actorId);
    const command = commands.find((command) => ["roll", "buy", "auction_pass", "discard_item", "mortgage", "sell_building", "bankrupt"].includes(command.kind))!;
    expect(game.apply(command).ok).toBe(true);
  }
  const before = game.snapshot;
  const instanceId = before.players[1]!.hand.find((id) => cardType(id) === "swap-positions")!;
  expect(instanceId).toBeDefined();
  expect(legalCommands(before, "p2").some((command) => command.kind === "use_item" && command.targetId === "p1")).toBe(false);
  expect(game.apply({ kind: "use_item", actor: "p2", expectedRevision: before.revision, instanceId, total: null, targetId: "p1" })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
  restored(game);
});

it("uses integer ceiling at discount boundaries instead of floating point pricing", () => {
  expect(discountedCost(81, 50)).toBe(41);
  expect(discountedCost(71, 80)).toBe(57);
  expect(discountedCost(Number.MAX_SAFE_INTEGER, 80)).toBe(Number((BigInt(Number.MAX_SAFE_INTEGER) * 80n + 99n) / 100n));
});

it.each([
  (state: any) => { state.itemUsed = false; },
  (state: any) => { state.activeItem.total = 13; },
  (state: any) => { state.activeItem.actorId = "p2"; },
  (state: any) => { state.players[0].hand.push(state.activeItem.instanceId); },
  (state: any) => { state.deck.discardPile.push(state.activeItem.instanceId); },
  (state: any) => { state.activeItem = null; },
  (state: any) => { state.history.at(-1).event.total = 2; },
])("rejects corrupted active effects and card ownership %s without inventing a replacement entity", (change) => {
  const game = itemCheckpoint("controlled-dice");
  use(game, "controlled-dice", 7);
  const state = JSON.parse(JSON.stringify(makeSave(game.snapshot, propertyMatchId).state));
  change(state);
  const bytes = JSON.stringify(state);
  expect(() => Game.restore(state)).toThrow();
  expect(JSON.stringify(state)).toBe(bytes);
});
