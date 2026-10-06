import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { constructionRefund, saleOption, netAssets, rentFor } from "../../src/domain/economy";
import { QUICK_RULES } from "../../src/domain/rules";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { eventText } from "../../src/ui/eventText";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";

it("sells three balanced levels at actual cost, refunds once, keeps the land and restores every operation", () => {
  let game = propertyMatch();
  const before = game.snapshot;
  for (let level = 0; level < 3; level += 1) for (const propertyId of ["neon-avenue", "harbor-walk"]) {
    expect(game.apply({ kind: "upgrade", propertyId, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  }
  for (const level of [2, 1, 0] as const) for (const propertyId of ["neon-avenue", "harbor-walk"]) {
    const initial = game.snapshot;
    const option = saleOption(initial, "p1", propertyId);
    expect(option.reason).toBeNull();
    const command = { kind: "sell_building" as const, propertyId, actor: "p1" as const, expectedRevision: initial.revision };
    const result = game.apply(command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(game.snapshot.properties[propertyId]).toMatchObject({ ownerId: "p1", level });
    expect(game.snapshot.players[0]!.cash).toBe(option.remainingCash);
    expect(rentFor(game.snapshot, propertyId)).toBe(option.nextRent);
    expect(game.snapshot.turnPlayerId).toBe(initial.turnPlayerId);
    expect(game.snapshot.random).toEqual(before.random);
    expect(game.snapshot.completedRounds).toBe(before.completedRounds);
    for (const language of ["en", "zh-CN"] as const) expect(eventText(language, result.events[0]!, game.snapshot)).toBeTruthy();
    const committed = game.snapshot;
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.snapshot).toBe(committed);
    game = Game.restore(readSave(makeSave(committed, propertyMatchId)).record.state);
    expect(game.snapshot).toEqual(committed);
  }
  expect(game.snapshot.players[0]).toMatchObject({ cash: before.players[0]!.cash - 240,
    statistics: { constructionSpent: 480, constructionSoldCost: 480, constructionRefunds: 240 } });
  expect(netAssets(game.snapshot, "p1")).toBe(netAssets(before, "p1") - 240);
});

it("rejects uneven, empty, non-owner and unknown sales without partial refunds", () => {
  const game = propertyMatch();
  for (const propertyId of ["neon-avenue", "harbor-walk", "neon-avenue"]) {
    expect(game.apply({ kind: "upgrade", propertyId, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  }
  const before = game.snapshot;
  expect(saleOption(before, "p1", "harbor-walk").reason).toBe("unbalanced_sale");
  for (const propertyId of ["harbor-walk", "skyline-road", "unknown", "city-tax"]) {
    expect(game.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: before.revision })).toEqual({ ok: false, reason: "illegal_action" });
    expect(game.snapshot).toBe(before);
  }
  expect(constructionRefund(71, QUICK_RULES)).toBe(35);
});

it("rejects extra command fields and removed financing commands at the boundary", () => {
  const game = propertyMatch();
  const before = game.snapshot;
  for (const command of [
    { kind: "roll", propertyId: "neon-avenue" },
    { kind: "mortgage", propertyId: "neon-avenue" },
    { kind: "redeem", propertyId: "neon-avenue" },
    { kind: "auction_bid", amount: 10 }, { kind: "auction_pass" },
  ]) {
    expect(game.apply({ ...command, actor: "p1", expectedRevision: before.revision } as any)).toEqual({ ok: false, reason: "invalid_command" });
    expect(game.snapshot).toBe(before);
  }
});
