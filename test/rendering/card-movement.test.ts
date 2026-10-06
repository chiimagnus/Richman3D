import { expect, it } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import { MotionClock } from "../../src/rendering/MotionClock";
import { PlayerView } from "../../src/rendering/PlayerView";
import { FirstPersonRig } from "../../src/rendering/FirstPersonRig";
import { CITY } from "../../src/domain/maps/city";
import { boardPosition } from "../../src/rendering/boardGeometry";

it.each([{ path: [10, 9, 8] }, { path: [19, 0, 1] }])("the real pawn and first-person camera visit every committed path coordinate $path", async ({ path }) => {
  const clock = new MotionClock();
  const scene = new Scene();
  const pawn = new PlayerView(scene, "#57d4ff", clock, CITY, 0);
  const camera = new PerspectiveCamera();
  const canvas = { ownerDocument: Object.assign(new EventTarget(), { pointerLockElement: null }) } as unknown as HTMLCanvasElement;
  const rig = new FirstPersonRig(camera, canvas, clock, CITY);
  pawn.setPosition(11);
  rig.setPosition(11);
  const offset = scene.children[0]!.position.clone().sub(boardPosition(CITY, 11));
  const moving = Promise.all([pawn.moveAlong(path), rig.moveAlong(path)]);
  for (const index of path) {
    clock.update(220);
    const point = boardPosition(CITY, index);
    expect(scene.children[0]!.position.clone().sub(offset).distanceTo(point)).toBeLessThan(1e-9);
    expect(camera.position.x).toBeCloseTo(point.x);
    expect(camera.position.z).toBeCloseTo(point.z);
  }
  await moving;
  expect(clock.activeCount).toBe(0);
  pawn.dispose();
  rig.dispose();
  expect(scene.children).toHaveLength(0);
});
