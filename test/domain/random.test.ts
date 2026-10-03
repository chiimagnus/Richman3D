import { expect, it, vi } from "vitest";
import { RuleRandom } from "../../src/domain/random";

it("has fixed xorshift32 vectors and an exact resumable cursor", () => {
  const random = new RuleRandom(1);
  expect(Array.from({ length: 5 }, () => random.next())).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
  const restored = new RuleRandom(random.snapshot);
  expect(restored.integer(6)).toBe(random.integer(6));
  expect(restored.snapshot).toEqual(random.snapshot);
  expect(new RuleRandom(0).snapshot).toEqual({ version: "xorshift32-v1", inputSeed: 0, state: 0x6d2b79f5, draws: 0 });
});

it("samples the nonzero domain and rejects the non-divisible tail", () => {
  const random = new RuleRandom(1);
  const next = vi.spyOn(random, "next").mockReturnValueOnce(0xffff_ffff).mockReturnValueOnce(1);
  expect(random.integer(6)).toBe(0);
  expect(next).toHaveBeenCalledTimes(2);
  next.mockRestore();
  const bounds = [1, 4, 6, 0xffff_ffff];
  for (const bound of bounds) {
    for (let index = 0; index < 100; index += 1) {
      const value = random.integer(bound);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(bound);
    }
  }
});

it.each([NaN, Infinity, -1, 1.5, 0x1_0000_0000])("rejects invalid seeds and bounds: %s", (value) => {
  expect(() => new RuleRandom(value)).toThrow();
  expect(() => new RuleRandom(1).integer(value)).toThrow();
});
