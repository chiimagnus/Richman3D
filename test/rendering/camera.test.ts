import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { CameraRig } from "../../src/rendering/CameraRig";
import { boardBounds, boardPosition } from "../../src/rendering/boardGeometry";
import { CITY } from "../../src/domain/maps/city";
import { PlayerView } from "../../src/rendering/PlayerView";
import { MotionClock } from "../../src/rendering/MotionClock";

function canvas() {
  const ownerDocument = Object.assign(new EventTarget(), { pointerLockElement: null });
  return { ownerDocument, requestPointerLock: vi.fn(async () => {}) } as unknown as HTMLCanvasElement;
}

it.each([16 / 9, 9 / 16, 0.35, 2.4])("fits all selected map bounds at aspect %s and cannot pointer-lock the overview", (aspect) => {
  const map = { ...CITY, path: CITY.path.map((point) => ({ x: point.x + 75, z: point.z - 40 })) };
  const element = canvas();
  const rig = new CameraRig(map, element, new MotionClock());
  rig.resize(aspect);
  rig.setView("overview");
  rig.firstPerson.lock(() => {});
  expect(element.requestPointerLock).not.toHaveBeenCalled();
  const bounds = boardBounds(map);
  for (const horizontal of [bounds.min.x, bounds.max.x]) for (const depth of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(horizontal, 0, depth).project(rig.camera);
    expect(Math.abs(point.x)).toBeLessThan(1);
    expect(Math.abs(point.y)).toBeLessThan(1);
  }
  rig.firstPerson.setPosition(4);
  rig.setView("first_person");
  expect(rig.camera.position.x).toBe(boardPosition(map, 4).x);
  rig.firstPerson.lock(() => {});
  expect(element.requestPointerLock).toHaveBeenCalledTimes(1);
  rig.dispose();
});

it.each([2, 3, 4])("draws %s real pawns with stable same-tile offsets, visibility and cleanup", (size) => {
  const scene = new THREE.Scene();
  const clock = new MotionClock();
  const pawns = Array.from({ length: size }, (_, index) => new PlayerView(scene, "#57d4ff", clock, CITY, index));
  pawns.forEach((pawn) => pawn.setPosition(0));
  const offsets = scene.children.map((object) => object.position.clone().sub(boardPosition(CITY, 0)));
  expect(new Set(offsets.map((offset) => offset.toArray().join(","))).size).toBe(size);
  for (const [index, offset] of offsets.entries()) {
    expect(offset.x).toBeCloseTo(index % 2 === 0 ? -0.72 : 0.72);
    expect(offset.y).toBeCloseTo(0.18);
    expect(offset.z).toBeCloseTo(index < 2 ? -0.72 : 0.72);
  }
  pawns[0]!.setVisible(false); expect(scene.children[0]!.visible).toBe(false);
  pawns[0]!.setVisible(true); expect(scene.children[0]!.visible).toBe(true);
  pawns[0]!.dispose();
  pawns.slice(1).forEach((pawn) => pawn.setPosition(6));
  scene.children.forEach((object, index) => expect(object.position.clone().sub(boardPosition(CITY, 6)).distanceTo(offsets[index + 1]!)).toBeLessThan(1e-10));
  pawns.slice(1).forEach((pawn) => pawn.dispose());
  expect(scene.children).toHaveLength(0);
});
