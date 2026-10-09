import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView, tileDetail } from "../../src/rendering/BoardView";
import { Game } from "../../src/domain/game";
import { disposeObject } from "../../src/rendering/disposeObject";
import { QUICK_RULES } from "../../src/domain/rules";
import { CITY } from "../../src/domain/maps/city";
import { createMatchConfig } from "../../src/domain/config";
import { formatMessage, messages, tileName } from "../../src/i18n";
import { stubCanvas } from "../fixtures/canvas";
import { boardBounds, TILE_SIZE } from "../../src/rendering/boardGeometry";

afterEach(() => vi.unstubAllGlobals());

it("keeps city decoration below the first-person eye, inside the board interior and centered on translated coordinates", () => {
  stubCanvas();
  for (const offset of Array.from({ length: 20 }, (_, index) => index * 5)) {
    const map = { ...CITY, path: CITY.path.map((point) => ({ x: point.x + offset, z: point.z - offset })) };
    const scene = new THREE.Scene(); const board = new BoardView(scene, "en", map, createMatchConfig(), QUICK_RULES);
    try {
      const city = scene.getObjectByName("city-decoration")!;
      expect(city).toBeDefined();
      const bounds = new THREE.Box3().setFromObject(city);
      const boardBox = boardBounds(map);
      expect(bounds.max.y).toBeLessThan(1.1);
      expect(bounds.min.x).toBeGreaterThanOrEqual(boardBox.min.x + TILE_SIZE - 1e-6);
      expect(bounds.max.x).toBeLessThanOrEqual(boardBox.max.x - TILE_SIZE + 1e-6);
      expect(bounds.min.z).toBeGreaterThanOrEqual(boardBox.min.z + TILE_SIZE - 1e-6);
      expect(bounds.max.z).toBeLessThanOrEqual(boardBox.max.z - TILE_SIZE + 1e-6);
      expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(offset);
      expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(-offset);
      const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
      city.traverse((object) => {
        if (object instanceof THREE.Mesh) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); }
      });
      expect(geometries.size).toBeLessThanOrEqual(4);
      expect(materials.size).toBeLessThanOrEqual(12);
      const disposals = [...geometries, ...materials].map((resource) => vi.spyOn(resource, "dispose"));
      board.setLanguage("zh-CN"); board.syncOwnership(new Game(createMatchConfig(), QUICK_RULES, map).snapshot);
      expect(scene.getObjectByName("city-decoration")).toBe(city);
      disposals.forEach((disposed) => expect(disposed).not.toHaveBeenCalled());
      board.dispose();
      disposals.forEach((disposed) => expect(disposed).toHaveBeenCalledTimes(1));
    } finally { board.dispose(); }
  }
});

it.each(["en", "zh-CN"] as const)("%s wraps complete names and large valid amounts without compressing fonts or truncating digits", (language) => {
  const canvases = stubCanvas();
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "property" ? { ...tile, price: Number.MAX_SAFE_INTEGER, rent: Number.MAX_SAFE_INTEGER } : tile) };
  const scene = new THREE.Scene(); const board = new BoardView(scene, language, map, createMatchConfig(), QUICK_RULES);
  try {
    expect(canvases).toHaveLength(map.tiles.length);
    for (const [index, canvas] of canvases.entries()) {
      const name = canvas.draws.filter((draw) => draw.font.startsWith("700"));
      const detail = canvas.draws.filter((draw) => draw.font.startsWith("600"));
      expect(name.map((draw) => draw.text).join(" ").replace(/\s/g, "")).toBe(tileName(language, map.tiles[index]!).replace(/\s/g, ""));
      expect(detail.map((draw) => draw.text).join(" ").replace(/\s/g, "")).toBe(tileDetail(map.tiles[index]!, language, QUICK_RULES).replace(/\s/g, ""));
      for (const draw of canvas.draws) {
        expect(draw.arguments).toHaveLength(3); expect(draw.width).toBeLessThanOrEqual(420);
        expect(draw.arguments[2]).toBeLessThan(canvas.height - 24);
      }
    }
    if (language === "en") expect(canvases[14]!.draws.filter((draw) => draw.font.startsWith("700")).length).toBeGreaterThan(1);
  } finally { board.dispose(); }
});

it("BoardView renders injected coordinates, ownership color and RuleSet label amounts in both languages", () => {
  const fillText = vi.fn();
  stubCanvas(fillText);
  const config = createMatchConfig();
  const map = { ...CITY, path: CITY.path.map((point) => ({ x: point.x + 50, z: point.z - 25 })) };
  const rules = { ...QUICK_RULES, passStartBonus: 333 };
  for (const language of ["en", "zh-CN"] as const) {
    const scene = new THREE.Scene();
    const board = new BoardView(scene, language, map, config, rules);
    const root = scene.getObjectByName("board")!;
    expect(root.children[0]!.position.toArray()).toEqual([60.5, 0, -14.5]);
    expect(fillText.mock.calls.some((call) => String(call[0]).includes("333"))).toBe(true);
    const snapshot = new Game(config, rules, map).snapshot;
    board.syncOwnership({ ...snapshot, properties: { ...snapshot.properties, "neon-avenue": { ...snapshot.properties["neon-avenue"]!, ownerId: "p2" } } });
    const marker = root.children.find((child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) as THREE.Mesh;
    expect((marker.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("ffb75e");
    board.dispose();
    fillText.mockClear();
  }
});

it("removed ownership markers are disposed before rebuilding, not just detached", () => {
  stubCanvas();
  const scene = new THREE.Scene();
  const snapshot = new Game().snapshot;
  const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules);
  const owned = { ...snapshot, properties: { ...snapshot.properties, "neon-avenue": { ...snapshot.properties["neon-avenue"]!, ownerId: "p1" as const } } };
  board.syncOwnership(owned);
  const root = scene.getObjectByName("board")!;
  const marker = root.children.find((child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) as THREE.Mesh;
  const geometryDisposed = vi.fn();
  const materialDisposed = vi.fn();
  marker.geometry.addEventListener("dispose", geometryDisposed);
  (marker.material as THREE.Material).addEventListener("dispose", materialDisposed);
  board.syncOwnership(snapshot);
  expect(marker.parent).toBeNull();
  expect(geometryDisposed).toHaveBeenCalledTimes(1);
  expect(materialDisposed).toHaveBeenCalledTimes(1);
  board.syncOwnership(owned);
  expect(root.children).not.toContain(marker);
  board.dispose();
  expect(scene.children).toHaveLength(0);
  expect(geometryDisposed).toHaveBeenCalledTimes(1);
});

it("disposes each shared resource exactly once within its owner", () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const disposed = [geometry, material, texture].map((resource) => vi.spyOn(resource, "dispose"));
  disposeObject(root);
  for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1);
});

it("updates actual group rents and localized labels without reallocating unchanged textures", () => {
  const fillText = vi.fn();
  stubCanvas(fillText);
  const snapshot = new Game(createMatchConfig(940)).snapshot;
  const owned = { ...snapshot, properties: { ...snapshot.properties,
    "harbor-walk": { ...snapshot.properties["harbor-walk"]!, ownerId: "p1" as const },
    "neon-avenue": { ...snapshot.properties["neon-avenue"]!, ownerId: "p1" as const },
  } };
  const scene = new THREE.Scene();
  const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules);
  try {
    fillText.mockClear();
    board.syncOwnership(owned);
    expect(fillText.mock.calls.map((call) => call[0])).toContain("Price 180 · Rent 48");
    fillText.mockClear();
    board.syncOwnership(owned);
    expect(fillText).not.toHaveBeenCalled();
    board.setLanguage("zh-CN");
    expect(fillText.mock.calls.map((call) => call[0])).toContain(formatMessage(messages("zh-CN").board.propertyDetail, { price: 180, rent: 48 }));
    fillText.mockClear();
    board.syncOwnership({ ...owned, properties: { ...owned.properties, "harbor-walk": { ...owned.properties["harbor-walk"]!, ownerId: null } } });
    expect(fillText.mock.calls.map((call) => call[0])).toContain(formatMessage(messages("zh-CN").board.propertyDetail, { price: 180, rent: 32 }));
    expect(fillText.mock.calls.map((call) => call[0])).toContain(formatMessage(messages("zh-CN").board.propertyDetail, { price: 140, rent: 24 }));
  } finally { board.dispose(); }
});
