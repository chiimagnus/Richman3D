import { expect, it } from "vitest";
import { CITY } from "../../src/domain/maps/city";
import { tileAt, validateMap } from "../../src/domain/board";
import { boardPosition, boardDirection, worldPath } from "../../src/rendering/boardGeometry";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { QUICK_RULES } from "../../src/domain/rules";
import { currentTile } from "../../src/domain/selectors";
import { MAPS, mapFor, validateMaps } from "../../src/domain/maps";
import { messages, tileName } from "../../src/i18n";
import { makeSave, readSave } from "../../src/storage/snapshot";

it("registered maps have unique versions, translated content and round-trip without falling back", () => {
  validateMaps(MAPS);
  expect(() => validateMaps([CITY, CITY])).toThrow("地图版本重复");
  for (const map of MAPS) {
    expect(mapFor(map.id, map.version)).toBe(map);
    for (const language of ["zh-CN", "en"] as const) {
      const definitions = messages(language).maps.definitions;
      expect(definitions[map.id as keyof typeof definitions]).toBeDefined();
      for (const tile of map.tiles) expect(tileName(language, tile)).toBeTruthy();
    }
    const game = new Game({ ...createMatchConfig(6), mapId: map.id, mapVersion: map.version });
    const save = makeSave(game.snapshot, "00000000-0000-4000-8000-000000000001", "local", 1);
    expect(readSave(save).snapshot).toEqual(game.snapshot);
    const unknown = { ...save, mapVersion: 999, state: { ...save.state, config: { ...save.state.config, mapVersion: 999 } } };
    expect(() => readSave(unknown)).toThrow("incompatible");
    expect(() => mapFor("missing", map.version)).toThrow();
  }
});

it("rejects invalid coordinates, broken loops, extra starts, invalid groups and unsafe money", () => {
  const invalid = [
    { ...CITY, path: CITY.path.map((point, index) => index === 1 ? { x: NaN, z: point.z } : point) },
    { ...CITY, path: CITY.path.map((point, index) => index === 1 ? CITY.path[0]! : point) },
    { ...CITY, path: CITY.path.map((point, index) => index === 1 ? { x: point.x + 1, z: point.z } : point) },
    { ...CITY, tiles: CITY.tiles.map((tile, index) => index === 1 ? { type: "start" as const, id: tile.id } : tile) },
    { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "property" ? { ...tile, price: -1 } : tile) },
    { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "property" ? { ...tile, rent: Number.MAX_SAFE_INTEGER + 1 } : tile) },
  ];
  for (const map of invalid) expect(() => validateMap(map)).toThrow();
});

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
  const game = new Game({ ...createMatchConfig(6), mapId: map.id, mapVersion: map.version }, QUICK_RULES, map);
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  expect(game.snapshot.players[0]?.cash).toBe(1493);
  expect(currentTile(game.snapshot, "p1")).toMatchObject({ amount: 7 });
  expect(boardPosition(game.snapshot.map, 4).toArray()).toEqual([43.7, 0, -19.5]);
  expect(worldPath(map, [4], 2)[0]?.toArray()).toEqual([43.7, 2, -19.5]);
  expect(tileAt(map, -1)).toBe(map.tiles[19]);
  expect(boardDirection(map, 19).length()).toBeCloseTo(1);
  expect(() => validateMap({ ...map, path: map.path.slice(1) })).toThrow();
});
