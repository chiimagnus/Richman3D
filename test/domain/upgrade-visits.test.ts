import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { netAssets, upgradeOption } from "../../src/domain/economy";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { propertyMatch, propertyMatchId, visitOwnedProperty } from "../fixtures/property-match";
import { movementCheckpoint } from "../fixtures/card-movement";
import { itemCheckpoint } from "../fixtures/items";

it("rejects upgrades before rolling even when a complete group is owned", () => {
  const game = propertyMatch(); const before = game.snapshot;
  expect(legalCommands(before, "p1").some((command) => command.kind === "upgrade")).toBe(false);
  expect(game.apply({ kind: "upgrade", actor: "p1", propertyId: "neon-avenue", expectedRevision: before.revision })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
});

it("offers only the visited property, upgrades once, ends the turn and preserves a restored decision", () => {
  const arriving = visitOwnedProperty(propertyMatch(), "neon-avenue");
  expect(arriving.snapshot.decision).toEqual({ kind: "awaiting_upgrade", actorId: "p1", propertyId: "neon-avenue" });
  const game = Game.restore(readSave(makeSave(arriving.snapshot, propertyMatchId)).record.state);
  const before = game.snapshot;
  const choices = legalCommands(before, "p1");
  expect(choices.map((command) => command.kind)).toEqual(["upgrade", "skip"]);
  expect(game.apply({ kind: "upgrade", actor: "p1", propertyId: "harbor-walk", expectedRevision: before.revision })).toEqual({ ok: false, reason: "illegal_action" });
  expect(game.snapshot).toBe(before);
  const command = choices.find((choice) => choice.kind === "upgrade")!;
  expect(game.apply(command).ok).toBe(true);
  expect(game.snapshot.properties["neon-avenue"]!.level).toBe(1);
  expect(game.snapshot.players[0]!.cash).toBe(before.players[0]!.cash - 90);
  expect(game.snapshot.turnPlayerId).toBe("p2");
  expect(game.snapshot.random).toEqual(before.random);
  expect(netAssets(game.snapshot, "p1")).toBe(netAssets(before, "p1"));
  expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
  expect(game.apply({ ...command, expectedRevision: game.snapshot.revision })).toEqual({ ok: false, reason: "illegal_action" });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("requires separate visits for all three balanced levels and never offers a fourth level", () => {
  let game = propertyMatch();
  for (const level of [1, 2, 3]) for (const propertyId of ["harbor-walk", "neon-avenue"]) {
    game = visitOwnedProperty(game, propertyId);
    const command = legalCommands(game.snapshot, "p1").find((choice) => choice.kind === "upgrade")!;
    expect(command).toMatchObject({ propertyId });
    expect(game.apply(command).ok).toBe(true);
    expect(game.snapshot.properties[propertyId]!.level).toBe(level);
    expect(game.snapshot.turnPlayerId).toBe("p2");
  }
  game = visitOwnedProperty(game, "neon-avenue");
  expect(game.snapshot.decision).toEqual({ kind: "awaiting_roll", actorId: "p2" });
  expect(game.snapshot.properties["neon-avenue"]!.level).toBe(3);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("skips only this visit without charging cash, then offers an upgrade on a later visit", () => {
  let game = visitOwnedProperty(propertyMatch(), "neon-avenue");
  const before = game.snapshot;
  const result = game.apply(legalCommands(before, "p1").find((command) => command.kind === "skip")!);
  expect(result).toMatchObject({ ok: true, events: [{ kind: "upgrade_skipped", actor: "p1", propertyId: "neon-avenue" }, { kind: "turn", actor: "p2" }] });
  expect(game.snapshot.players).toEqual(before.players);
  expect(game.snapshot.properties).toEqual(before.properties);
  expect(game.snapshot.random).toEqual(before.random);
  game = visitOwnedProperty(game, "neon-avenue");
  expect(legalCommands(game.snapshot, "p1").map((command) => command.kind)).toEqual(["upgrade", "skip"]);
});

it.each([89, 90])("checks construction cash %s at arrival without weakening the ledger", (cash) => {
  const record = makeSave(visitOwnedProperty(propertyMatch(), "neon-avenue").snapshot, propertyMatchId);
  const game = Game.restore({ ...record.state, players: record.state.players.map((player) => player.id === "p1" ? { ...player, cash,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash } } : player) });
  const before = game.snapshot;
  expect(upgradeOption(before, "p1", "neon-avenue").reason).toBe(cash === 90 ? null : "insufficient_cash");
  expect(game.apply({ kind: "upgrade", actor: "p1", propertyId: "neon-avenue", expectedRevision: before.revision }).ok).toBe(cash === 90);
  if (cash === 89) expect(game.snapshot).toBe(before);
  else expect(game.snapshot.players[0]!.cash).toBe(0);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("rejects fabricated or reopened upgrade opportunities on restore", () => {
  const game = visitOwnedProperty(propertyMatch(), "neon-avenue");
  const state = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...state, decision: { ...state.decision, propertyId: "harbor-walk" } })).toThrow();
  expect(game.apply(legalCommands(game.snapshot, "p1")[0]!).ok).toBe(true);
  const finished = makeSave(game.snapshot, propertyMatchId).state;
  expect(() => Game.restore({ ...finished, turnPlayerId: "p1", decision: { kind: "awaiting_upgrade", actorId: "p1", propertyId: "neon-avenue" } })).toThrow();
});

it("buying a property finishes the turn rather than granting an immediate upgrade", () => {
  const game = new Game();
  for (let step = 0; step < 40; step += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") throw new Error("No purchase reached");
    const commands = legalCommands(snapshot, snapshot.decision.actorId);
    const buy = commands.find((command) => command.kind === "buy");
    if (buy) {
      expect(game.apply(buy).ok).toBe(true);
      expect(game.snapshot.turnPlayerId).not.toBe(buy.actor);
      expect(legalCommands(game.snapshot, buy.actor)).toEqual([]);
      return;
    }
    expect(game.apply(commands[0]!).ok).toBe(true);
  }
  throw new Error("No purchase reached");
});

it("resolves a movement-card arrival through the same owned-property decision and saved history", () => {
  const checkpoint = movementCheckpoint(65, "p2");
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const group = checkpoint.snapshot.map.tiles.filter((tile) => tile.type === "property" && tile.group === "amber" && state.properties[tile.id]!.ownerId === null);
  const price = group.reduce((sum, tile) => sum + (tile.type === "property" ? tile.price : 0), 0);
  const game = Game.restore({ ...state, properties: { ...state.properties, ...Object.fromEntries(group.map((tile) => [tile.id, { ...state.properties[tile.id]!, ownerId: "p2" }])) },
    players: state.players.map((player) => player.id === "p2" ? { ...player, cash: player.cash - price,
      statistics: { ...player.statistics, purchases: player.statistics.purchases + price, purchaseBookValue: player.statistics.purchaseBookValue + price } } : player) });
  const rolled = game.apply({ kind: "roll", actor: "p2", expectedRevision: game.snapshot.revision });
  expect(rolled).toMatchObject({ ok: true, events: [{ kind: "rolled" }, { kind: "card_moved", result: { landing: { kind: "property_owned", propertyId: "river-market" } } }] });
  expect(game.snapshot.decision).toEqual({ kind: "awaiting_upgrade", actorId: "p2", propertyId: "river-market" });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  const choices = legalCommands(game.snapshot, "p2");
  expect(choices.map((command) => command.kind)).toEqual(["upgrade", "skip"]);
  expect(game.apply(choices[0]!).ok).toBe(true);
  expect(game.snapshot.properties["river-market"]!.level).toBe(1);
  expect(game.snapshot.turnPlayerId).toBe("p1");
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("expires an activated construction coupon when this visit is skipped, not on arrival or the next visit", () => {
  let game = itemCheckpoint("construction-discount", true);
  const coupon = legalCommands(game.snapshot, "p1").find((command) => command.kind === "use_item" && command.instanceId.startsWith("construction-discount:"))!;
  expect(game.apply(coupon).ok).toBe(true);
  game = visitOwnedProperty(game, "neon-avenue");
  expect(upgradeOption(game.snapshot, "p1", "neon-avenue")).toMatchObject({ reason: null, cost: 72 });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
  const before = game.snapshot;
  expect(game.apply(legalCommands(before, "p1").find((command) => command.kind === "skip")!).ok).toBe(true);
  expect(game.snapshot.players).toEqual(before.players);
  expect(game.snapshot.activeItem).toBeNull();
  game = visitOwnedProperty(game, "neon-avenue");
  expect(upgradeOption(game.snapshot, "p1", "neon-avenue")).toMatchObject({ reason: null, cost: 90 });
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("finishes the final round only after the last player's visit decision is consumed", () => {
  const ownership = propertyMatch();
  expect(ownership.apply({ kind: "trade_propose", actor: "p1", expectedRevision: ownership.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: ["neon-avenue", "harbor-walk"], receivePropertyIds: [], cash: null } }).ok).toBe(true);
  expect(ownership.apply({ kind: "trade_accept", actor: "p2", expectedRevision: ownership.snapshot.revision, proposalRevision: ownership.snapshot.revision }).ok).toBe(true);
  while (ownership.snapshot.turnPlayerId !== "p2") {
    const commands = legalCommands(ownership.snapshot, "p1");
    expect(ownership.apply(commands.find((command) => command.kind === "roll" || command.kind === "skip" || command.kind === "discard_item")!).ok).toBe(true);
  }
  const arriving = visitOwnedProperty(ownership, "neon-avenue");
  const state = makeSave(arriving.snapshot, propertyMatchId).state;
  expect(state.turnOrder.at(-1)).toBe("p2");
  const game = Game.restore({ ...state, completedRounds: arriving.snapshot.rules.roundLimit - 1 });
  const result = game.apply(legalCommands(game.snapshot, "p2")[0]!);
  expect(result).toMatchObject({ ok: true, events: [{ kind: "upgraded", level: 1 }, { kind: "ended", result: { reason: "round_limit" } }] });
  expect(game.snapshot.completedRounds).toBe(game.snapshot.rules.roundLimit);
  expect(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot).toEqual(game.snapshot);
});

it("reads already published standalone construction history without reopening the old pre-roll upgrade path", () => {
  const game = visitOwnedProperty(propertyMatch(), "neon-avenue");
  expect(game.apply(legalCommands(game.snapshot, "p1")[0]!).ok).toBe(true);
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const legacy = Game.restore({ ...state, turnPlayerId: "p1", decision: { kind: "awaiting_roll", actorId: "p1" }, history: state.history.slice(0, -1) });
  expect(legacy.snapshot.properties["neon-avenue"]!.level).toBe(1);
  expect(legalCommands(legacy.snapshot, "p1").some((command) => command.kind === "upgrade")).toBe(false);
});
