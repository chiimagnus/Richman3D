import { createMatchConfig } from "../../src/domain/config";
import { expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";

it("caches a deeply immutable snapshot until a successful commit", () => {
  const game = new Game(createMatchConfig(341));
  const before = game.snapshot;
  const serialized = JSON.stringify(before);
  expect(game.snapshot).toBe(before);
  expect(Object.isFrozen(before.players[0])).toBe(true);
  expect(() => Object.assign(before.players[0]!, { cash: 0 })).toThrow();
  const listener = vi.fn();
  const unsubscribe = game.subscribe(listener);
  const result = game.apply(legalCommands(before, "p1")[0]!);
  expect(result.ok).toBe(true);
  expect(game.snapshot).not.toBe(before);
  expect(game.snapshot).toBe(game.snapshot);
  expect(JSON.stringify(before)).toBe(serialized);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  expect(listener).toHaveBeenCalledTimes(1);
});
