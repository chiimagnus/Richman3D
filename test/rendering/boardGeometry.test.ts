import { describe, expect, it } from "vitest";

import { CITY } from "../../src/domain/maps/city";
import { boardDirection, boardPosition } from "../../src/rendering/boardGeometry";

describe("boardGeometry", () => {
  it("把 20 个地块映射为 20 个不重复的方形外围坐标", () => {
    const positions = CITY.tiles.map((_, index) => boardPosition(CITY, index));
    const unique = new Set(
      positions.map((position) => `${position.x.toFixed(2)},${position.z.toFixed(2)}`),
    );

    expect(unique.size).toBe(CITY.tiles.length);
  });

  it("索引首尾闭环，并给出单位前进方向", () => {
    expect(boardPosition(CITY, CITY.tiles.length).equals(boardPosition(CITY, 0))).toBe(true);
    expect(boardPosition(CITY, -1).equals(boardPosition(CITY, CITY.tiles.length - 1))).toBe(true);
    expect(boardDirection(CITY, 19).length()).toBeCloseTo(1);
  });
});
