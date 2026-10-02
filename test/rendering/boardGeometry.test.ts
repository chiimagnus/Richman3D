import { describe, expect, it } from "vitest";

import { BOARD } from "../../src/domain/board";
import { boardDirection, boardPosition } from "../../src/rendering/boardGeometry";

describe("boardGeometry", () => {
  it("把 20 个地块映射为 20 个不重复的方形外围坐标", () => {
    const positions = BOARD.map((_, index) => boardPosition(index));
    const unique = new Set(
      positions.map((position) => `${position.x.toFixed(2)},${position.z.toFixed(2)}`),
    );

    expect(unique.size).toBe(BOARD.length);
  });

  it("索引首尾闭环，并给出单位前进方向", () => {
    expect(boardPosition(BOARD.length).equals(boardPosition(0))).toBe(true);
    expect(boardPosition(-1).equals(boardPosition(BOARD.length - 1))).toBe(true);
    expect(boardDirection(19).length()).toBeCloseTo(1);
  });
});
