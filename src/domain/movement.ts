import type { RuleSet } from "./rules";

export type Movement = {
  readonly direction: "forward" | "backward" | "teleport";
  readonly from: number;
  readonly to: number;
  readonly path: readonly number[];
  readonly passedStart: boolean;
  readonly startBonus: number;
  readonly drawChance: boolean;
};

export function movement(from: number, size: number, direction: Movement["direction"], steps: number, rules: RuleSet, drawChance: boolean): Movement {
  if (!Number.isSafeInteger(size) || size < 2 || !Number.isSafeInteger(from) || from < 0 || from >= size ||
      !Number.isSafeInteger(steps) || steps < 1) throw new RangeError("移动范围无效");
  const path = direction === "teleport" ? [0] : Array.from({ length: steps }, (_, offset) =>
    ((from + (direction === "forward" ? offset + 1 : -offset - 1)) % size + size) % size);
  const passedStart = direction === "forward" && path.includes(0);
  return { direction, from, to: path.at(-1)!, path, passedStart,
    startBonus: passedStart || direction === "teleport" ? rules.passStartBonus : 0, drawChance };
}
