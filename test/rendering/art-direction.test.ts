import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { createBoardScenery } from "../../src/rendering/BoardScenery";
import { createMatchConfig } from "../../src/domain/config";
import { MAPS } from "../../src/domain/maps";
import { QUICK_RULES } from "../../src/domain/rules";
import { boardBounds, TILE_SIZE } from "../../src/rendering/boardGeometry";
import { disposeObject } from "../../src/rendering/disposeObject";
import { stubCanvas } from "../fixtures/canvas";

afterEach(() => vi.unstubAllGlobals());

it.each(MAPS)("$id models stay inside translated interiors below the eye with fixed silhouettes", (map) => {
  const translated = { ...map, path: map.path.map(point => ({ x: point.x + 40, z: point.z - 30 })) };
  const original = createBoardScenery(map);
  const moved = createBoardScenery(translated);
  try {
    const bounds = new THREE.Box3().setFromObject(moved);
    const board = boardBounds(translated);
    expect(bounds.max.y).toBeLessThan(1.7);
    expect(bounds.min.x).toBeGreaterThanOrEqual(board.min.x + TILE_SIZE - 1e-6);
    expect(bounds.max.x).toBeLessThanOrEqual(board.max.x - TILE_SIZE + 1e-6);
    expect(bounds.min.z).toBeGreaterThanOrEqual(board.min.z + TILE_SIZE - 1e-6);
    expect(bounds.max.z).toBeLessThanOrEqual(board.max.z - TILE_SIZE + 1e-6);
    expect(moved.children.map(object => object.name)).toEqual(original.children.map(object => object.name));
    moved.children.forEach((object, index) => {
      expect(object.position.toArray()).toEqual(original.children[index]!.position.toArray());
      object.scale.toArray().forEach((scale, axis) => expect(scale).toBeCloseTo(original.children[index]!.scale.toArray()[axis]!, 10));
    });
    const asset = moved.getObjectByName(map.id === "harbor" ? "model-sailboat" : "model-houseA") as THREE.Mesh;
    expect(asset).toBeDefined();
    expect(asset.geometry.getAttribute("position").count).toBeGreaterThan(400);
    expect(asset.geometry.getAttribute("normal").count).toBe(asset.geometry.getAttribute("position").count);
    expect(asset.geometry.getAttribute("color").count).toBe(asset.geometry.getAttribute("position").count);
    expect(new Set(asset.geometry.getAttribute("color").array).size).toBeGreaterThan(20);
    expect((asset.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect(asset.geometry.getAttribute("uv")).toBeUndefined();
    expect((asset.material as THREE.MeshStandardMaterial).map).toBeNull();
    moved.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith("model-")) return;
      const worldScale = object.getWorldScale(new THREE.Vector3());
      expect(worldScale.x).toBeCloseTo(worldScale.y, 6);
      expect(worldScale.z).toBeCloseTo(worldScale.y, 6);
      const source = new THREE.Box3().setFromObject(object);
      expect(source.max.y).toBeLessThan(1.7);
      expect(source.max.y).toBeGreaterThan(0.8);
    });
    expect(moved.children.length).toBeLessThan(100);
  } finally { disposeObject(original); disposeObject(moved); }
});

it.each(MAPS)("$id shares its rounded tile resources, shows real groups and releases them once", (map) => {
  stubCanvas();
  const scene = new THREE.Scene();
  const board = new BoardView(scene, "en", map, createMatchConfig(), QUICK_RULES);
  const root = scene.getObjectByName("board")!;
  const first = root.children[0]!.children[0] as THREE.Mesh;
  const second = root.children[1]!.children[0] as THREE.Mesh;
  expect(first.geometry.type).toBe("RoundedBoxGeometry");
  expect(first.geometry).toBe(second.geometry);
  expect((first.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("e4d1ac");
  expect(scene.getObjectByName("board-tray")).toBeDefined();
  const bands = map.tiles.map(tile => scene.getObjectByName(`tile-band-${tile.id}`) as THREE.Mesh);
  expect(bands.every(Boolean)).toBe(true);
  const propertyBands = map.tiles.flatMap((tile, index) => tile.type === "property" ? [[tile.group, (bands[index]!.material as THREE.MeshStandardMaterial).color.getHexString()]] : []);
  expect(new Set(propertyBands.map(([group]) => group)).size).toBe(new Set(propertyBands.map(([, color]) => color)).size);
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  board.dispose(); board.dispose();
  expect(scene.children).toHaveLength(0);
  spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
});
