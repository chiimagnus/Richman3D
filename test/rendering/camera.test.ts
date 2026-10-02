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

it("draws both real pawns with stable same-tile offsets and toggles self visibility", () => {
  const scene = new THREE.Scene();
  const clock = new MotionClock();
  const first = new PlayerView(scene, "#57d4ff", clock, CITY, 0);
  const second = new PlayerView(scene, "#ffb75e", clock, CITY, 1);
  first.setPosition(0); second.setPosition(0);
  expect(scene.children[0]!.position.equals(scene.children[1]!.position)).toBe(false);
  first.setVisible(false); expect(scene.children[0]!.visible).toBe(false);
  first.setVisible(true); expect(scene.children[0]!.visible).toBe(true);
  first.dispose(); second.dispose();
  expect(scene.children).toHaveLength(0);
});
