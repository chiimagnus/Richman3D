import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { Game } from "../../src/domain/game";
import { disposeObject } from "../../src/rendering/disposeObject";
import { QUICK_RULES } from "../../src/domain/rules";
import { CITY } from "../../src/domain/maps/city";
import { createMatchConfig } from "../../src/domain/config";
import { formatMessage, messages } from "../../src/i18n";

afterEach(() => vi.unstubAllGlobals());

it("BoardView renders injected coordinates, ownership color and RuleSet label amounts in both languages", () => {
  const fillText = vi.fn();
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillText }) }) });
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
  vi.stubGlobal("document", { createElement: () => ({
    width: 512, height: 256,
    getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillText() {} }),
  }) });
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
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillText }) }) });
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
    board.syncOwnership({ ...owned, properties: { ...owned.properties, "harbor-walk": { ...owned.properties["harbor-walk"]!, mortgagePrincipal: 70 } } });
    expect(fillText.mock.calls.map((call) => call[0])).toContain(formatMessage(messages("zh-CN").board.propertyDetail, { price: 180, rent: 32 }));
    expect(fillText.mock.calls.map((call) => call[0])).toContain(formatMessage(messages("zh-CN").board.propertyDetail, { price: 140, rent: 0 }));
  } finally { board.dispose(); }
});
