import { QUICK_RULES } from "../../src/domain/rules";
import { createMatchConfig } from "../../src/domain/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { RuleRandom } from "../../src/domain/random";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import type { Command } from "../../src/domain/types";

afterEach(() => vi.restoreAllMocks());

describe("atomic commands", () => {
  it.each([
    { kind: "roll", actor: "p2", expectedRevision: 0 },
    { kind: "roll", actor: "p1", expectedRevision: 1 },
    { kind: "roll", actor: "p1", expectedRevision: NaN },
    { kind: "roll", actor: "p1", expectedRevision: Infinity },
    { kind: "roll", actor: "other", expectedRevision: 0 },
    { kind: "unknown", actor: "p1", expectedRevision: 0 },
    { kind: "buy", actor: "p1", expectedRevision: 0 },
  ])("rejects invalid/stale input without state or notifications: %o", (input) => {
    const game = new Game(createMatchConfig(940));
    const before = game.snapshot;
    const listener = vi.fn();
    game.subscribe(listener);
    expect(game.apply(input as Command).ok).toBe(false);
    expect(game.snapshot).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not consume candidate RNG or position when chance calculation fails", () => {
    const game = new Game(createMatchConfig(21));
    const before = game.snapshot;
    const original = RuleRandom.prototype.integer;
    vi.spyOn(RuleRandom.prototype, "integer").mockImplementation(function (this: RuleRandom, bound) {
      if (bound === 4) throw new Error("failed chance calculation");
      return original.call(this, bound);
    });
    const command = legalCommands(before, before.turnPlayerId)[0]!;
    expect(game.apply(command)).toEqual({ ok: false, reason: "calculation_failed" });
    expect(game.snapshot).toBe(before);
    vi.restoreAllMocks();
    expect(game.apply(command).ok).toBe(true);
    expect(game.snapshot.players.find((player) => player.id === command.actor)?.cash).toBe(1620);
    expect(game.snapshot.players.find((player) => player.id === command.actor)?.position).toBe(7);
    expect(game.snapshot.random.draws).toBe(before.random.draws + 2 + QUICK_RULES.chanceCards.length * 2 - 1);
  });

  it("rolls back pass-start money, landing and RNG on integer overflow", () => {
    const game = new Game(createMatchConfig(17981), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER });
    for (const kind of ["roll", "skip", "roll"] as const) {
      expect(game.apply({ kind, actor: game.snapshot.decision.kind === "game_over" ? game.snapshot.turnPlayerId : game.snapshot.decision.actorId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
    }
    const before = game.snapshot;
    expect(game.apply(legalCommands(before, "p1")[0]!).ok).toBe(false);
    expect(game.snapshot).toBe(before);
  });

  it("rejects repeated purchase and preserves one transfer even if a listener throws", () => {
    const game = new Game(createMatchConfig(940));
    game.apply(legalCommands(game.snapshot, "p1")[0]!);
    game.subscribe(() => { throw new Error("view failed"); });
    const command = legalCommands(game.snapshot, "p1").find((action) => action.kind === "buy")!;
    expect(game.apply(command).ok).toBe(true);
    const committed = game.snapshot;
    expect(committed.players[0]?.cash).toBe(1320);
    expect(committed.properties["neon-avenue"]!.ownerId).toBe("p1");
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.snapshot).toBe(committed);
  });

  it.each([2, 3, 4])("declining a purchase with %s seats advances once without spending cash or RNG", (seats) => {
    const game = new Game(createMatchConfig(940, seats));
    const actor = game.snapshot.turnPlayerId;
    expect(game.apply({ kind: "roll", actor, expectedRevision: 0 }).ok).toBe(true);
    const before = game.snapshot;
    if (before.decision.kind !== "awaiting_purchase") throw new Error("Expected purchase");
    const command = { kind: "skip" as const, actor, expectedRevision: before.revision };
    const result = game.apply(command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.events.map((event) => event.kind)).toEqual(["skipped", "turn"]);
    expect(game.snapshot.properties).toEqual(before.properties);
    expect(game.snapshot.players).toEqual(before.players);
    expect(game.snapshot.random).toEqual(before.random);
    expect(game.snapshot.turnPlayerId).not.toBe(actor);
    const committed = game.snapshot;
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.snapshot).toBe(committed);
  });

  it("rejects a transient pass-start overflow even when tax would bring final cash back in range", () => {
    const game = new Game(createMatchConfig(17981), { ...QUICK_RULES, startingCash: Number.MAX_SAFE_INTEGER - 198 });
    for (const kind of ["roll", "skip", "roll"] as const) {
      expect(game.apply({ kind, actor: game.snapshot.decision.kind === "game_over" ? game.snapshot.turnPlayerId : game.snapshot.decision.actorId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
    }
    const before = game.snapshot;
    const listener = vi.fn();
    game.subscribe(listener);
    expect(game.apply(legalCommands(before, "p1")[0]!)).toEqual({ ok: false, reason: "calculation_failed" });
    expect(game.snapshot).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("queries and bot actions go through real apply, including unaffordable skip", () => {
    const game = new Game(createMatchConfig(940), { ...QUICK_RULES, startingCash: 200 });
    expect(game.apply(legalCommands(game.snapshot, "p1")[0]!).ok).toBe(true);
    expect(game.apply(legalCommands(game.snapshot, "p1").find((action) => action.kind === "skip")!).ok).toBe(true);
    expect((chooseBotAction(observeBot(game.snapshot), "normal")?.command ?? null)?.kind).toBe("roll");
    expect(game.apply((chooseBotAction(observeBot(game.snapshot), "normal")?.command ?? null)!).ok).toBe(true);
    const command = (chooseBotAction(observeBot(game.snapshot), "normal")?.command ?? null)!;
    expect(command.kind).toBe("skip");
    expect(game.apply(command).ok).toBe(true);
    expect(game.snapshot.turnPlayerId).toBe("p1");
    expect(Object.values(game.snapshot.properties).every((property) => property.ownerId === null)).toBe(true);
  });

  it("reproduces the same snapshots and semantic events for a seed and commands", () => {
    const first = new Game(createMatchConfig(0));
    const second = new Game(createMatchConfig(0));
    for (let index = 0; index < 100; index += 1) {
      const command = legalCommands(first.snapshot, first.snapshot.turnPlayerId)[0];
      if (!command) break;
      expect(first.apply(command)).toEqual(second.apply(command));
    }
    expect(first.snapshot.revision).toBeGreaterThan(10);
  });
});
