import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { RuleRandom } from "../../src/domain/random";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import type { Command } from "../../src/domain/types";

afterEach(() => vi.restoreAllMocks());

describe("atomic commands", () => {
  it.each([
    { kind: "roll", actor: "bot", expectedRevision: 0 },
    { kind: "roll", actor: "human", expectedRevision: 1 },
    { kind: "roll", actor: "human", expectedRevision: NaN },
    { kind: "roll", actor: "human", expectedRevision: Infinity },
    { kind: "roll", actor: "other", expectedRevision: 0 },
    { kind: "unknown", actor: "human", expectedRevision: 0 },
    { kind: "buy", actor: "human", expectedRevision: 0 },
  ])("rejects invalid/stale input without state or notifications: %o", (input) => {
    const game = new Game({ seed: 341 });
    const before = game.snapshot;
    const listener = vi.fn();
    game.subscribe(listener);
    expect(game.apply(input as Command).ok).toBe(false);
    expect(game.snapshot).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not consume candidate RNG or position when chance calculation fails", () => {
    const game = new Game({ seed: 101 });
    const before = game.snapshot;
    const original = RuleRandom.prototype.integer;
    vi.spyOn(RuleRandom.prototype, "integer").mockImplementation(function (this: RuleRandom, bound) {
      if (bound === 4) throw new Error("failed chance calculation");
      return original.call(this, bound);
    });
    const command = legalCommands(before, "human")[0]!;
    expect(game.apply(command)).toEqual({ ok: false, reason: "calculation_failed" });
    expect(game.snapshot).toBe(before);
    vi.restoreAllMocks();
    expect(game.apply(command).ok).toBe(true);
    expect(game.snapshot.players[0]?.cash).toBe(1620);
    expect(game.snapshot.players[0]?.position).toBe(2);
    expect(game.snapshot.random.draws).toBe(3);
  });

  it("rolls back pass-start money, landing and RNG on integer overflow", () => {
    const game = new Game({ seed: 2210, startingCash: Number.MAX_SAFE_INTEGER });
    for (const kind of ["roll", "skip", "roll"] as const) {
      expect(game.apply({ kind, actor: game.snapshot.activePlayerId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
    }
    const before = game.snapshot;
    expect(game.apply(legalCommands(before, "human")[0]!).ok).toBe(false);
    expect(game.snapshot).toBe(before);
  });

  it("rejects repeated purchase and preserves one transfer even if a listener throws", () => {
    const game = new Game({ seed: 341 });
    game.apply(legalCommands(game.snapshot, "human")[0]!);
    game.subscribe(() => { throw new Error("view failed"); });
    const command = legalCommands(game.snapshot, "human").find((action) => action.kind === "buy")!;
    expect(game.apply(command).ok).toBe(true);
    const committed = game.snapshot;
    expect(committed.players[0]?.cash).toBe(1320);
    expect(committed.owners["neon-avenue"]).toBe("human");
    expect(game.apply(command)).toEqual({ ok: false, reason: "stale_revision" });
    expect(game.snapshot).toBe(committed);
  });

  it("rejects a transient pass-start overflow even when tax would bring final cash back in range", () => {
    const game = new Game({ seed: 2210, startingCash: Number.MAX_SAFE_INTEGER - 198 });
    for (const kind of ["roll", "skip", "roll"] as const) {
      expect(game.apply({ kind, actor: game.snapshot.activePlayerId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
    }
    const before = game.snapshot;
    const listener = vi.fn();
    game.subscribe(listener);
    expect(game.apply(legalCommands(before, "human")[0]!)).toEqual({ ok: false, reason: "calculation_failed" });
    expect(game.snapshot).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("queries and bot actions go through real apply, including unaffordable skip", () => {
    const game = new Game({ seed: 341, startingCash: 200 });
    expect(game.apply(legalCommands(game.snapshot, "human")[0]!).ok).toBe(true);
    expect(game.apply(legalCommands(game.snapshot, "human").find((action) => action.kind === "skip")!).ok).toBe(true);
    expect(game.apply(chooseBotCommand(game.snapshot)!).ok).toBe(true);
    const command = chooseBotCommand(game.snapshot)!;
    expect(command.kind).toBe("skip");
    expect(game.apply(command).ok).toBe(true);
    expect(game.snapshot.activePlayerId).toBe("human");
    expect(game.snapshot.owners).toEqual({});
  });

  it("reproduces the same snapshots and semantic events for a seed and commands", () => {
    const first = new Game({ seed: 0 });
    const second = new Game({ seed: 0 });
    for (let index = 0; index < 100; index += 1) {
      const command = legalCommands(first.snapshot, first.snapshot.activePlayerId)[0];
      if (!command) break;
      expect(first.apply(command)).toEqual(second.apply(command));
    }
    expect(first.snapshot.revision).toBeGreaterThan(10);
  });
});
