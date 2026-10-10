import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { CameraRig } from "../../src/rendering/CameraRig";
import { boardBounds, boardPosition } from "../../src/rendering/boardGeometry";
import { CITY } from "../../src/domain/maps/city";
import { HARBOR } from "../../src/domain/maps/harbor";
import { PlayerView } from "../../src/rendering/PlayerView";
import { MotionClock } from "../../src/rendering/MotionClock";

function canvas() {
  const ownerDocument = Object.assign(new EventTarget(), { pointerLockElement: null, exitPointerLock: vi.fn() });
  return Object.assign(new EventTarget(), { ownerDocument, style: { touchAction: "auto" }, clientHeight: 800, clientWidth: 1200,
    getRootNode: () => ownerDocument, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), requestPointerLock: vi.fn(async () => {}) }) as unknown as HTMLCanvasElement;
}

function pointer(element: HTMLCanvasElement, type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  element.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0,
    clientX: x, clientY: y, pageX: x, pageY: y, ...extra }));
}

function projected(rig: CameraRig, index: number) {
  const point = boardPosition(CITY, index); point.y = 0.205;
  rig.camera.updateMatrixWorld();
  point.project(rig.camera);
  return { x: (point.x + 1) * 600, y: (1 - point.y) * 400 };
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

it.each([true, false])("first-person head bob %s changes only the camera's intermediate height", async (enabled) => {
  const clock = new MotionClock(); const rig = new CameraRig(CITY, canvas(), clock);
  try {
    rig.firstPerson.setPosition(0); rig.firstPerson.setHeadBobEnabled(enabled);
    const moving = rig.firstPerson.moveAlong([1]);
    clock.update(110);
    expect(rig.firstPersonCamera.position.y).toBeCloseTo(enabled ? 1.8 : 1.72);
    const target = boardPosition(CITY, 1);
    clock.update(110); await moving;
    expect(rig.firstPersonCamera.position.x).toBeCloseTo(target.x);
    expect(rig.firstPersonCamera.position.z).toBeCloseTo(target.z);
    expect(rig.firstPersonCamera.position.y).toBeCloseTo(1.72); expect(clock.activeCount).toBe(0);
  } finally { rig.dispose(); }
});

it.each([2, 3, 4])("draws %s real pawns with stable same-tile offsets, visibility and cleanup", (size) => {
  const scene = new THREE.Scene();
  const clock = new MotionClock();
  const pawns = Array.from({ length: size }, (_, index) => new PlayerView(scene, "#57d4ff", clock, CITY, index));
  pawns.forEach((pawn) => pawn.setPosition(0));
  const offsets = scene.children.map((object) => object.position.clone().sub(boardPosition(CITY, 0)));
  expect(new Set(offsets.map((offset) => offset.toArray().join(","))).size).toBe(size);
  for (const [index, offset] of offsets.entries()) {
    expect(offset.x).toBeCloseTo(index % 2 === 0 ? -0.45 : 0.45);
    expect(offset.y).toBeCloseTo(0.18);
    expect(offset.z).toBeCloseTo(index < 2 ? -0.45 : 0.45);
  }
  pawns[0]!.setVisible(false); expect(scene.children[0]!.visible).toBe(false);
  pawns[0]!.setVisible(true); expect(scene.children[0]!.visible).toBe(true);
  for (const [actor, pawn] of pawns.entries()) {
    pawns.forEach((candidate, index) => candidate.setActing(index === actor));
    expect(scene.children.filter((object) => object.getObjectByName("acting-player-ring")!.visible)).toHaveLength(1);
    expect(scene.children[actor]!.getObjectByName("acting-player-ring")!.visible).toBe(true);
    expect(pawn.position).toEqual(boardPosition(CITY, 0));
  }
  pawns[0]!.dispose();
  pawns.slice(1).forEach((pawn) => pawn.setPosition(6));
  scene.children.forEach((object, index) => expect(object.position.clone().sub(boardPosition(CITY, 6)).distanceTo(offsets[index + 1]!)).toBeLessThan(1e-10));
  pawns.slice(1).forEach((pawn) => pawn.dispose());
  expect(scene.children).toHaveLength(0);
});

it("uses native bounded overview rotation/zoom, keeps pose on resize and never enables first-person input at the same time", () => {
  const element = canvas();
  const rig = new CameraRig(CITY, element, new MotionClock());
  try {
    rig.setView("overview"); rig.resize(1.5);
    const original = rig.camera.position.clone();
    pointer(element, "pointerdown", 600, 400);
    pointer(element, "pointermove", 850, 650);
    pointer(element, "pointerup", 850, 650);
    expect(rig.camera.position.distanceTo(original)).toBeGreaterThan(1);
    const rotated = rig.camera.quaternion.clone();
    rig.resize(1.5);
    expect(rig.camera.quaternion.angleTo(rotated)).toBeLessThan(1e-7);
    const initialDistance = rig.camera.position.length();
    for (let count = 0; count < 60; count += 1) element.dispatchEvent(Object.assign(new Event("wheel", { cancelable: true }), { deltaY: -100, deltaMode: 0, clientX: 600, clientY: 400 }));
    expect(rig.camera.position.length()).toBeCloseTo(initialDistance * 0.6);
    rig.setInteractive(false);
    const blocked = rig.camera.position.clone();
    pointer(element, "pointerdown", 600, 400); pointer(element, "pointermove", 800, 600); pointer(element, "pointerup", 800, 600);
    expect(rig.camera.position).toEqual(blocked);
    rig.firstPerson.lock(() => {}); expect(element.requestPointerLock).not.toHaveBeenCalled();
    rig.setView("first_person");
    rig.firstPerson.lock(() => {}); expect(element.requestPointerLock).not.toHaveBeenCalled();
    rig.setInteractive(true);
    rig.firstPerson.lock(() => {}); expect(element.requestPointerLock).toHaveBeenCalledTimes(1);
  } finally { rig.dispose(); }
});

it.each([CITY, HARBOR])("$id four same-tile pawns stay below the real eye, including their movement bounce", async (map) => {
  const scene = new THREE.Scene(); const clock = new MotionClock();
  const rig = new CameraRig(map, canvas(), clock);
  const pawns = Array.from({ length: 4 }, (_, seat) => new PlayerView(scene, "#57d4ff", clock, map, seat));
  try {
    rig.firstPerson.setPosition(0);
    pawns.forEach(pawn => pawn.setPosition(0));
    const resources = scene.children.flatMap(root => root.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh)
      .flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material])).map(resource => vi.spyOn(resource, "dispose"));
    const assertBelowEye = () => {
      const bounds = scene.children.map(object => new THREE.Box3().setFromObject(object));
      bounds.forEach(box => expect(box.max.y).toBeLessThan(rig.firstPersonCamera.position.y));
      for (const [index, box] of bounds.entries()) for (const other of bounds.slice(index + 1)) expect(box.intersectsBox(other)).toBe(false);
    };
    assertBelowEye();
    const movement = Promise.all(pawns.map(pawn => pawn.moveAlong([1])));
    clock.update(110); assertBelowEye();
    clock.update(110); await movement;
    for (const pawn of pawns) expect(pawn.position.distanceTo(boardPosition(map, 1))).toBeLessThan(1e-9);
    pawns.forEach(pawn => pawn.dispose()); pawns.forEach(pawn => pawn.dispose());
    resources.forEach(disposed => expect(disposed).toHaveBeenCalledTimes(1));
    expect(scene.children).toHaveLength(0);
  } finally { clock.cancel(); pawns.forEach(pawn => pawn.dispose()); rig.dispose(); }
});

it("inspects a real tile only on a short primary tap, never after dragging back, cancellation, pinch or first-person input", () => {
  const element = canvas(); const inspect = vi.fn();
  const rig = new CameraRig(CITY, element, new MotionClock(), inspect);
  try {
    rig.setView("overview"); rig.resize(1.5);
    const tap = () => { const point = projected(rig, 3); pointer(element, "pointerdown", point.x, point.y); pointer(element, "pointerup", point.x, point.y); };
    tap(); expect(inspect).toHaveBeenCalledWith("neon-avenue"); inspect.mockClear();
    let point = projected(rig, 3);
    pointer(element, "pointerdown", point.x, point.y); pointer(element, "pointermove", point.x + 20, point.y); pointer(element, "pointermove", point.x, point.y); pointer(element, "pointerup", point.x, point.y);
    expect(inspect).not.toHaveBeenCalled();
    point = projected(rig, 3);
    pointer(element, "pointerdown", point.x, point.y); pointer(element, "pointercancel", point.x, point.y); pointer(element, "pointerup", point.x, point.y);
    expect(inspect).not.toHaveBeenCalled();
    pointer(element, "pointerdown", point.x, point.y, { pointerType: "touch" }); pointer(element, "pointerdown", point.x + 30, point.y, { pointerId: 2, pointerType: "touch", isPrimary: false });
    pointer(element, "pointerup", point.x + 30, point.y, { pointerId: 2, pointerType: "touch", isPrimary: false }); pointer(element, "pointerup", point.x, point.y, { pointerType: "touch" });
    expect(inspect).not.toHaveBeenCalled();
    rig.setInteractive(false); tap(); expect(inspect).not.toHaveBeenCalled();
    rig.setInteractive(true); rig.setView("first_person"); tap(); expect(inspect).not.toHaveBeenCalled();
  } finally { rig.dispose(); }
});

it("follows only an explicitly centered overview target, stops on manual navigation and preserves a user's first-person direction on a same-position sync", () => {
  const element = canvas(); const rig = new CameraRig(CITY, element, new MotionClock());
  try {
    rig.setView("overview"); rig.focus(4, "p2");
    expect(rig.following).toBe("p2");
    const original = rig.camera.position.clone();
    rig.follow(boardPosition(CITY, 5));
    expect(rig.camera.position.clone().sub(original).distanceTo(boardPosition(CITY, 5).sub(boardPosition(CITY, 4)))).toBeLessThan(1e-10);
    pointer(element, "pointerdown", 600, 400); pointer(element, "pointerup", 600, 400);
    expect(rig.following).toBeNull();
    rig.setView("first_person"); rig.firstPerson.setPosition(3);
    rig.camera.lookAt(rig.camera.position.clone().add(new THREE.Vector3(1, 0.2, 0)));
    const direction = rig.camera.quaternion.clone();
    rig.firstPerson.setPosition(3); expect(rig.camera.quaternion.toArray()).toEqual(direction.toArray());
  } finally { rig.dispose(); }
});

it("disposes native control and inspection listeners over twenty resource lifecycles", () => {
  for (let count = 0; count < 20; count += 1) {
    const element = canvas(); const inspect = vi.fn();
    const removed = vi.spyOn(element, "removeEventListener");
    const docRemoved = vi.spyOn(element.ownerDocument, "removeEventListener");
    const rig = new CameraRig(CITY, element, new MotionClock(), inspect);
    rig.setView("overview"); const point = projected(rig, 3); rig.dispose();
    pointer(element, "pointerdown", point.x, point.y); pointer(element, "pointerup", point.x, point.y);
    expect(inspect).not.toHaveBeenCalled();
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "wheel", "contextmenu"]) expect(removed.mock.calls.some((call) => call[0] === type)).toBe(true);
    for (const type of ["mousemove", "pointerlockchange", "pointerlockerror", "keydown"]) expect(docRemoved.mock.calls.some((call) => call[0] === type)).toBe(true);
    expect(element.style.touchAction).toBe("auto");
  }
});

it.each([1.5, 0.35, 2.4])("keeps real board spaces visible at the maximum zoom before and after rotating and resizing at aspect %s", (aspect) => {
  const element = canvas(); const rig = new CameraRig(CITY, element, new MotionClock());
  try {
    rig.resize(aspect); rig.setView("overview");
    for (let step = 0; step < 60; step += 1) element.dispatchEvent(Object.assign(new Event("wheel", { cancelable: true }), { deltaY: -100, deltaMode: 0, clientX: 600, clientY: 400 }));
    const assertVisible = () => {
      rig.camera.updateMatrixWorld();
      const visible = CITY.path.map((_, index) => boardPosition(CITY, index).project(rig.camera)).filter((point) => Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
      expect(visible.length).toBeGreaterThan(0);
    };
    assertVisible();
    for (const [horizontal, vertical] of [[300, 500], [-600, -200], [900, 300]] as const) {
      pointer(element, "pointerdown", 600, 400);
      pointer(element, "pointermove", 600 + horizontal, 400 + vertical);
      pointer(element, "pointerup", 600 + horizontal, 400 + vertical);
      assertVisible();
    }
    rig.resize(1.5);
    assertVisible();
  } finally { rig.dispose(); }
});
