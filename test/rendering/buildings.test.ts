import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { propertyMatch } from "../fixtures/property-match";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "../fixtures/property-match";
import { builtRentDebtMatch } from "../fixtures/debt-match";

afterEach(() => vi.unstubAllGlobals());

function trackResources(root: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  return [...resources].map((resource) => vi.spyOn(resource, "dispose"));
}

it("renders the real three levels, replaces their resources once, and restores without replay or reallocation", () => {
  const fillText = vi.fn();
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillRect() {}, fillText }) }) });
  const game = propertyMatch();
  const scene = new THREE.Scene();
  const snapshot = game.snapshot;
  const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules);
  board.syncOwnership(snapshot);
  expect(scene.getObjectByName("property-building-neon-avenue")).toBeUndefined();
  let previous: THREE.Object3D | undefined;
  let previousSpies: ReturnType<typeof trackResources> = [];
  let previousHeight = 0;
  for (const level of [1, 2, 3] as const) {
    for (const id of ["neon-avenue", "harbor-walk"]) expect(game.apply({ actor: "p1", kind: "upgrade", propertyId: id, expectedRevision: game.snapshot.revision }).ok).toBe(true);
    board.syncOwnership(game.snapshot);
    const current = scene.getObjectByName("property-building-neon-avenue")!;
    expect(current).toBeDefined();
    expect(current).not.toBe(previous);
    if (previous) expect(previous.parent).toBeNull();
    for (const spy of previousSpies) expect(spy).toHaveBeenCalledTimes(1);
    const height = new THREE.Box3().setFromObject(current).getSize(new THREE.Vector3()).y;
    expect(height).toBeGreaterThan(previousHeight);
    expect(fillText.mock.calls.some((call) => call[0] === String(level))).toBe(true);
    const restored = readSave(makeSave(game.snapshot, propertyMatchId)).snapshot;
    fillText.mockClear();
    board.syncOwnership(restored);
    expect(scene.getObjectByName("property-building-neon-avenue")).toBe(current);
    expect(fillText).not.toHaveBeenCalled();
    previous = current;
    previousSpies = trackResources(current);
    previousHeight = height;
  }
  board.syncOwnership({ ...game.snapshot, properties: { ...game.snapshot.properties,
    "neon-avenue": { ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] },
  } });
  expect(scene.getObjectByName("property-building-neon-avenue")).toBeUndefined();
  for (const spy of previousSpies) expect(spy).toHaveBeenCalledTimes(1);
  const remainingSpies = trackResources(scene);
  board.dispose();
  board.dispose();
  for (const spy of [...previousSpies, ...remainingSpies]) expect(spy).toHaveBeenCalledTimes(1);
  expect(scene.children).toHaveLength(0);
});

it("removes sold buildings and updates the mortgage and neighboring rent labels from real operations", () => {
  const fillText = vi.fn();
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillRect() {}, fillText }) }) });
  const game = propertyMatch();
  for (const id of ["neon-avenue", "harbor-walk"]) expect(game.apply({ actor: "p1", kind: "upgrade", propertyId: id, expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const scene = new THREE.Scene();
  const snapshot = game.snapshot;
  const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules);
  board.syncOwnership(snapshot);
  const original = scene.getObjectByName("property-building-neon-avenue")!;
  const spies = trackResources(original);
  for (const [kind, id] of [["sell_building", "neon-avenue"], ["sell_building", "harbor-walk"], ["mortgage", "neon-avenue"]] as const) {
    expect(game.apply({ actor: "p1", kind, propertyId: id, expectedRevision: game.snapshot.revision }).ok).toBe(true);
    fillText.mockClear();
    board.syncOwnership(game.snapshot);
  }
  expect(scene.getObjectByName("property-building-neon-avenue")).toBeUndefined();
  expect(scene.getObjectByName("property-building-harbor-walk")).toBeUndefined();
  expect(fillText.mock.calls.map((call) => call[0])).toContain("Mortgaged ¥90 · Rent 0");
  expect(fillText.mock.calls.map((call) => call[0])).toContain("Price 140 · Rent 24");
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  board.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(scene.children).toHaveLength(0);
});

it("removes bankrupt ownership and buildings once, preserves survivors and restores without ghost assets", () => {
  const fillText = vi.fn();
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillRect() {}, fillText }) }) });
  const game = builtRentDebtMatch();
  const scene = new THREE.Scene();
  const before = game.snapshot;
  const board = new BoardView(scene, "en", before.map, before.config, before.rules);
  board.syncOwnership(before);
  const buildings = ["neon-avenue", "harbor-walk"].map((id) => scene.getObjectByName(`property-building-${id}`)!);
  const markers = scene.getObjectByName("board")!.children.filter((object) => object instanceof THREE.Mesh && object.geometry instanceof THREE.CylinderGeometry);
  expect(markers).toHaveLength(5);
  const removedMarkers = markers.filter((object) => (object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHexString() === before.config.players[0]!.color.slice(1));
  expect(removedMarkers).toHaveLength(2);
  const spies = [...buildings, ...removedMarkers].flatMap(trackResources);
  const survivor = scene.getObjectByName("property-building-financial-center");
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: before.revision }).ok).toBe(true);
  board.syncOwnership(game.snapshot);
  for (const object of [...buildings, ...removedMarkers]) expect(object.parent).toBeNull();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(scene.getObjectByName("property-building-financial-center")).toBe(survivor);
  fillText.mockClear();
  board.syncOwnership(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot);
  expect(fillText).not.toHaveBeenCalled();
  expect(scene.getObjectByName("property-building-neon-avenue")).toBeUndefined();
  const remainingSpies = trackResources(scene);
  board.dispose();
  board.dispose();
  for (const spy of [...spies, ...remainingSpies]) expect(spy).toHaveBeenCalledTimes(1);
  expect(scene.children).toHaveLength(0);
});
