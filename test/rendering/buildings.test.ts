import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { propertyMatch } from "../fixtures/property-match";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "../fixtures/property-match";
import { builtRentDebtMatch } from "../fixtures/debt-match";
import { stubCanvas } from "../fixtures/canvas";
import { MotionClock } from "../../src/rendering/MotionClock";

afterEach(() => vi.unstubAllGlobals());

function trackResources(root: THREE.Object3D, includeTextures = true) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  return [...resources].filter((resource) => includeTextures || !(resource instanceof THREE.Texture)).map((resource) => vi.spyOn(resource, "dispose"));
}

it("renders the real three levels, replaces their resources once, and restores without replay or reallocation", () => {
  const fillText = vi.fn();
  stubCanvas(fillText);
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
    expect(new THREE.Box3().setFromObject(current).max.y).toBeLessThan(1.72);
    expect(current.getObjectByName("property-building-base")!.scale.toArray()).toEqual([1.1, 0.1, 1.1]);
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

it("grows only an already committed building through the shared clock, then restores its full outline without replay", async () => {
  stubCanvas(); const game = propertyMatch(); const scene = new THREE.Scene(); const before = game.snapshot;
  const board = new BoardView(scene, "en", before.map, before.config, before.rules); const clock = new MotionClock();
  try {
    board.syncOwnership(before);
    for (const level of [1, 2, 3] as const) {
      for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(game.apply({ actor: "p1", kind: "upgrade", propertyId, expectedRevision: game.snapshot.revision }).ok).toBe(true);
      board.syncOwnership(game.snapshot);
      const saved = makeSave(game.snapshot, propertyMatchId);
      const building = scene.getObjectByName("property-building-neon-avenue")!;
      const growth = board.growProperty("neon-avenue", clock, new AbortController().signal);
      expect(building.scale.y).toBe(0.2); expect(clock.activeCount).toBe(1);
      clock.update(140); expect(building.scale.y).toBeGreaterThan(0.2); expect(building.scale.y).toBeLessThan(1);
      expect(game.snapshot.properties["neon-avenue"]!.level).toBe(level);
      clock.update(140); expect(await growth).toBe(true);
      expect(building.scale.y).toBe(1); expect(clock.activeCount).toBe(0);
      expect(makeSave(game.snapshot, propertyMatchId).state).toEqual(saved.state);
      const restored = readSave(saved).snapshot; const restoredScene = new THREE.Scene();
      const restoredBoard = new BoardView(restoredScene, "en", restored.map, restored.config, restored.rules);
      restoredBoard.syncOwnership(restored);
      expect(restoredScene.getObjectByName("property-building-neon-avenue")!.scale.y).toBe(1);
      restoredBoard.dispose();
    }
  } finally { clock.cancel(); board.dispose(); }
});

it.each(["abort", "clock", "dispose", "reduced", "already-aborted"] as const)("%s finishes or cancels growth without stale motion, duplicate disposal or economic replay", async (mode) => {
  stubCanvas(); const game = propertyMatch(); const scene = new THREE.Scene(); const before = game.snapshot;
  expect(game.apply({ actor: "p1", kind: "upgrade", propertyId: "neon-avenue", expectedRevision: before.revision }).ok).toBe(true);
  const snapshot = game.snapshot; const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules);
  board.syncOwnership(snapshot);
  const building = scene.getObjectByName("property-building-neon-avenue")!; const disposals = trackResources(building);
  const clock = new MotionClock(); const controller = new AbortController();
  if (mode === "reduced") vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  if (mode === "already-aborted") controller.abort();
  const growth = board.growProperty("neon-avenue", clock, controller.signal);
  if (mode === "abort") { clock.update(120); controller.abort(); }
  if (mode === "clock" || mode === "dispose") { clock.update(120); clock.cancel(); }
  if (mode === "dispose") board.dispose();
  expect(await growth).toBe(mode === "reduced");
  expect(building.scale.y).toBe(1); expect(clock.activeCount).toBe(0);
  clock.update(1000); expect(building.scale.y).toBe(1);
  expect(game.snapshot).toBe(snapshot);
  board.dispose(); disposals.forEach((disposed) => expect(disposed).toHaveBeenCalledTimes(1));
  expect(scene.children).toHaveLength(0);
});

it("removes sold buildings and updates the mortgage and neighboring rent labels from real operations", () => {
  const fillText = vi.fn();
  stubCanvas(fillText);
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
  stubCanvas(fillText);
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
  const spies = [...buildings, ...removedMarkers].flatMap((object) => trackResources(object));
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

it("updates the traded owner's color and glow without reallocating a marker, and updates both group rent labels", () => {
  const fillText = vi.fn();
  stubCanvas(fillText);
  const game = propertyMatch();
  const scene = new THREE.Scene();
  const before = game.snapshot;
  const board = new BoardView(scene, "en", before.map, before.config, before.rules);
  board.syncOwnership(before);
  const markers = scene.getObjectByName("board")!.children.filter((object): object is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> => object instanceof THREE.Mesh && object.geometry instanceof THREE.CylinderGeometry);
  const original = markers.filter((marker) => marker.material.color.getHexString() === before.config.players[0]!.color.slice(1));
  const textures = original.map((marker) => (marker.getObjectByName("owner-seat") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.map!);
  const textureSpies = textures.map((texture) => vi.spyOn(texture, "dispose"));
  const spies = original.flatMap((marker) => trackResources(marker, false));
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision, terms: { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 180 } } }).ok).toBe(true);
  expect(game.apply({ kind: "trade_accept", actor: "p2", expectedRevision: game.snapshot.revision, proposalRevision: game.snapshot.revision }).ok).toBe(true);
  fillText.mockClear();
  board.syncOwnership(game.snapshot);
  const changed = original.filter((marker) => marker.material.color.getHexString() === before.config.players[1]!.color.slice(1));
  expect(changed).toHaveLength(1);
  const nextTexture = (changed[0]!.getObjectByName("owner-seat") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.map!;
  const nextTextureDisposal = vi.spyOn(nextTexture, "dispose");
  expect(changed[0]!.material.emissive.getHexString()).toBe(before.config.players[1]!.color.slice(1));
  expect(fillText.mock.calls.map((call) => call[0])).toContain("Price 140 · Rent 24");
  expect(fillText.mock.calls.map((call) => call[0])).toContain("Price 180 · Rent 32");
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect(textureSpies.reduce((count, spy) => count + spy.mock.calls.length, 0)).toBe(1);
  board.syncOwnership(readSave(makeSave(game.snapshot, propertyMatchId)).snapshot);
  expect(original.every((marker) => marker.parent !== null)).toBe(true);
  expect(nextTextureDisposal).not.toHaveBeenCalled();
  board.dispose();
  board.dispose();
  for (const spy of [...spies, ...textureSpies]) expect(spy).toHaveBeenCalledTimes(1);
  expect(nextTextureDisposal).toHaveBeenCalledTimes(1);
});
