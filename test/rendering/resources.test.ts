import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { Game } from "../../src/domain/game";
import { disposeObject } from "../../src/rendering/disposeObject";

afterEach(() => vi.unstubAllGlobals());

it("removed ownership markers are disposed before rebuilding, not just detached", () => {
  vi.stubGlobal("document", { createElement: () => ({
    width: 512, height: 256,
    getContext: () => ({ clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillText() {} }),
  }) });
  const scene = new THREE.Scene();
  const board = new BoardView(scene, "en");
  const snapshot = new Game().snapshot;
  const owned = { ...snapshot, owners: { "neon-avenue": "human" as const } };
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
