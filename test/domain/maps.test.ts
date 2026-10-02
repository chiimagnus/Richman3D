import { expect, it } from "vitest";
import { CITY } from "../../src/domain/maps/city";
import { tileAt, validateMap } from "../../src/domain/board";
import { boardPosition, boardDirection, worldPath } from "../../src/rendering/boardGeometry";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { QUICK_RULES } from "../../src/domain/rules";
import { currentTile } from "../../src/domain/selectors";

it("preserves every city coordinate, price and rent", () => {
  const oldCoordinates = [[10.5,10.5],[6.3,10.5],[2.1,10.5],[-2.1,10.5],[-6.3,10.5],[-10.5,10.5],[-10.5,6.3],[-10.5,2.1],[-10.5,-2.1],[-10.5,-6.3],[-10.5,-10.5],[-6.3,-10.5],[-2.1,-10.5],[2.1,-10.5],[6.3,-10.5],[10.5,-10.5],[10.5,-6.3],[10.5,-2.1],[10.5,2.1],[10.5,6.3]];
  expect(CITY.path.map((point) => [point.x, point.z])).toEqual(oldCoordinates);
  expect(CITY.tiles.filter((tile) => tile.type === "property").map((tile) => [tile.id, tile.price, tile.rent])).toEqual([
    ["harbor-walk",140,24],["neon-avenue",180,32],["metro-plaza",220,40],["skyline-road",240,44],["river-market",200,36],["central-station",260,48],["tech-park",300,56],["lakeside",280,52],["art-district",320,62],["grand-boulevard",360,72],["financial-center",420,86],
  ]);
  expect(CITY.tiles.filter((tile) => tile.type === "tax").map((tile) => tile.amount)).toEqual([80,100,120]);
  validateMap(CITY);
});

it("injected map, rule landing, geometry, path wrapping and selectors share the same definition", () => {
  const map = { ...CITY, id: "test-map", version: 7, path: CITY.path.map((point) => ({ x: point.x + 50, z: point.z - 30 })), tiles: CITY.tiles.map((tile) => tile.type === "tax" ? { ...tile, amount: 7 } : tile) };
  const game = new Game({ ...createMatchConfig(1), mapId: map.id, mapVersion: map.version }, QUICK_RULES, map);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  expect(game.snapshot.players[0]?.cash).toBe(1493);
  expect(currentTile(game.snapshot, "p1")).toMatchObject({ amount: 7 });
  expect(boardPosition(game.snapshot.map, 4).toArray()).toEqual([43.7, 0, -19.5]);
  expect(worldPath(map, [4], 2)[0]?.toArray()).toEqual([43.7, 2, -19.5]);
  expect(tileAt(map, -1)).toBe(map.tiles[19]);
  expect(boardDirection(map, 19).length()).toBeCloseTo(1);
  expect(() => validateMap({ ...map, path: map.path.slice(1) })).toThrow();
});
