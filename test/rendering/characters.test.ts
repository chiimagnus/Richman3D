import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createCharacterModel } from "../../src/rendering/CharacterModel";
import { PlayerView } from "../../src/rendering/PlayerView";
import { MotionClock } from "../../src/rendering/MotionClock";
import { boardDirection, boardPosition } from "../../src/rendering/boardGeometry";
import { CITY } from "../../src/domain/maps/city";
import { HARBOR } from "../../src/domain/maps/harbor";
import { disposeObject } from "../../src/rendering/disposeObject";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("builds four distinct sculpted silhouettes even with the same seat color, without textures or excessive draw calls", () => {
  const characters = [0, 1, 2, 3].map(seat => createCharacterModel("#57d4ff", seat));
  try {
    expect(characters.map(character => character.name)).toEqual(["character-king", "character-queen", "character-knight", "character-bishop"]);
    const silhouettes = characters.map(character => {
      expect(character.children.length).toBeLessThanOrEqual(8);
      const bounds = new THREE.Box3().setFromObject(character);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeGreaterThan(2);
      expect(bounds.max.y).toBeLessThan(2.6);
      expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(1.6);
      let triangles = 0;
      for (const object of character.children) {
        const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
        const position = mesh.geometry.getAttribute("position");
        const normal = mesh.geometry.getAttribute("normal");
        expect(normal.count).toBe(position.count);
        expect([...position.array, ...normal.array].every(Number.isFinite)).toBe(true);
        expect(mesh.material.map).toBeNull();
        expect(mesh.castShadow).toBe(true);
        expect(mesh.receiveShadow).toBe(true);
        triangles += position.count / 3;
      }
      expect(triangles).toBeLessThan(26000);
      expect((character.getObjectByName("character-seat") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe("57d4ff");
      return character.children.map(object => Array.from((object as THREE.Mesh).geometry.getAttribute("position").array).join(",")).join(";");
    });
    expect(new Set(silhouettes).size).toBe(4);
  } finally { characters.forEach(disposeObject); }
});

it.each([CITY, HARBOR])("$id keeps all four production characters separated below the eye at every path orientation", async (map) => {
  const scene = new THREE.Scene();
  const clock = new MotionClock();
  const players = [0, 1, 2, 3].map(seat => new PlayerView(scene, "#57d4ff", clock, map, seat));
  const assertBounds = () => {
    const bounds = scene.children.map(object => new THREE.Box3().setFromObject(object));
    for (const [index, box] of bounds.entries()) {
      expect(box.max.y).toBeLessThan(1.72);
      for (const other of bounds.slice(index + 1)) expect(box.intersectsBox(other)).toBe(false);
    }
  };
  try {
    for (let index = 0; index < map.path.length; index += 1) {
      players.forEach(player => player.setPosition(index));
      assertBounds();
      const moving = Promise.all(players.map(player => player.moveAlong([(index + 1) % map.path.length])));
      clock.update(110);
      assertBounds();
      clock.update(110);
      await moving;
      assertBounds();
    }
  } finally { clock.cancel(); players.forEach(player => player.dispose()); }
});

it("faces committed forward, reverse and corner movements without changing logical positions or allocating frame resources", async () => {
  const scene = new THREE.Scene();
  const clock = new MotionClock();
  const player = new PlayerView(scene, "#57d4ff", clock, CITY, 0);
  try {
    player.setPosition(11);
    const object = scene.children[0]!;
    const resources = object.children.slice();
    const direction = boardDirection(CITY, 11);
    expect(object.rotation.y).toBeCloseTo(Math.atan2(direction.x, direction.z));
    const path = [10, 9, 8, 9, 10];
    const onStep = vi.fn();
    const moving = player.moveAlong(path, onStep);
    let previous = 11;
    for (const destination of path) {
      const from = boardPosition(CITY, previous);
      const to = boardPosition(CITY, destination);
      clock.update(110);
      expect(object.rotation.y).toBeCloseTo(Math.atan2(to.x - from.x, to.z - from.z));
      clock.update(110);
      expect(player.position.distanceTo(to)).toBeLessThan(1e-9);
      previous = destination;
    }
    await moving;
    expect(onStep).toHaveBeenCalledTimes(path.length);
    expect(object.children).toEqual(resources);
    expect(clock.activeCount).toBe(0);
  } finally { player.dispose(); }
});

it.each(["abort", "skip", "reduced"] as const)("%s preserves the existing animation lifecycle and releases every merged character resource exactly once", async (mode) => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: mode === "reduced" }) });
  const scene = new THREE.Scene();
  const clock = new MotionClock();
  const players = [0, 1, 2, 3].map(seat => new PlayerView(scene, "#57d4ff", clock, CITY, seat));
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    resources.add(object.material as THREE.Material);
  });
  const released = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  const controller = new AbortController();
  try {
    players.forEach(player => player.setPosition(0));
    const moving = Promise.all(players.map(player => player.moveAlong([1, 2], undefined, controller.signal)));
    if (mode === "abort") { clock.update(110); controller.abort(); }
    if (mode === "skip") clock.finish();
    await moving;
    expect(clock.activeCount).toBe(0);
    if (mode === "abort") players.forEach(player => player.setPosition(2));
    for (const player of players) expect(player.position.distanceTo(boardPosition(CITY, 2))).toBeLessThan(1e-9);
    players.forEach(player => player.dispose());
    players.forEach(player => player.dispose());
    released.forEach(release => expect(release).toHaveBeenCalledTimes(1));
    expect(scene.children).toHaveLength(0);
  } finally { clock.cancel(); players.forEach(player => player.dispose()); }
});
