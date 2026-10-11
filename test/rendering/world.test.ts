import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { World } from "../../src/rendering/World";
import { DiceView } from "../../src/rendering/DiceView";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { CITY } from "../../src/domain/maps/city";
import { QUICK_RULES } from "../../src/domain/rules";
import { stubCanvas } from "../fixtures/canvas";

vi.mock("three", async (original) => ({ ...await original<typeof THREE>(), WebGLRenderer: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function viewport() {
  stubCanvas();
  vi.stubGlobal("window", Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
  const ownerDocument = Object.assign(new EventTarget(), { pointerLockElement: null });
  const element = Object.assign(new EventTarget(), {
    ownerDocument, style: { touchAction: "auto" },
    getRootNode: () => ownerDocument, setAttribute: vi.fn(), remove: vi.fn(),
    parentElement: { clientWidth: 1200, clientHeight: 800 },
  });
  const container = Object.assign(element.parentElement, { append: vi.fn() });
  const renderer = {
    domElement: element, shadowMap: {}, setPixelRatio: vi.fn(), setSize: vi.fn(),
    setAnimationLoop: vi.fn(), render: vi.fn(), clear: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
  };
  vi.mocked(THREE.WebGLRenderer).mockImplementation(() => renderer as unknown as THREE.WebGLRenderer);
  let notify = () => {};
  const observe = vi.fn(); const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  const create = () => new World(container as unknown as HTMLElement, "en", createMatchConfig(), CITY, QUICK_RULES);
  return { container, renderer, observe, disconnect, create, notify: () => notify() };
}

it("resizes the real world and dice when its container changes without a window resize", () => {
  const view = viewport();
  const diceResize = vi.spyOn(DiceView.prototype, "resize");
  const world = view.create();
  try {
    expect(view.observe).toHaveBeenCalledExactlyOnceWith(view.container);
    expect(view.renderer.setSize).toHaveBeenLastCalledWith(1200, 800, false);
    const snapshot = new Game(createMatchConfig()).snapshot;
    world.sync(snapshot); world.setView("overview");
    const frame = view.renderer.setAnimationLoop.mock.calls[0]![0] as (time: number) => void;
    frame(0);
    const scene = view.renderer.render.mock.calls[0]![0] as THREE.Scene;
    const ground = scene.children.find((object) => object instanceof THREE.Mesh && object.material instanceof THREE.ShadowMaterial) as THREE.Mesh<THREE.BufferGeometry, THREE.ShadowMaterial>;
    expect((scene.background as THREE.Color).getHex()).toBe(0xd8e9e5);
    expect(ground.receiveShadow).toBe(true);
    expect(ground.material.transparent).toBe(true);
    expect(ground.material.opacity).toBe(0.2);
    const camera = view.renderer.render.mock.calls[0]![1] as THREE.PerspectiveCamera;
    const direction = camera.position.clone().normalize();
    view.container.clientWidth = 900; view.container.clientHeight = 400;
    view.notify(); frame(16);
    expect(view.renderer.setSize).toHaveBeenLastCalledWith(900, 400, false);
    expect(camera.aspect).toBe(900 / 400);
    expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-10);
    expect(diceResize).toHaveBeenLastCalledWith(900 / 400);
    world.setView("first_person"); frame(32);
    expect((view.renderer.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera).aspect).toBe(900 / 400);
    expect(snapshot).toEqual(new Game(createMatchConfig()).snapshot);
  } finally { world.dispose(); }
});

it("disconnects the container observer exactly once when leaving the world", () => {
  const view = viewport(); const world = view.create();
  world.dispose(); world.dispose();
  expect(view.disconnect).toHaveBeenCalledTimes(1);
  expect(view.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
  expect(view.renderer.dispose).toHaveBeenCalledTimes(1);
  expect(view.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(view.renderer.domElement.remove).toHaveBeenCalledTimes(1);
});

it("disconnects the observer and releases the canvas if rendering cannot start", () => {
  const view = viewport();
  view.renderer.setAnimationLoop.mockImplementation(() => { throw new Error("Cannot start rendering"); });
  expect(view.create).toThrow("Cannot start rendering");
  expect(view.disconnect).toHaveBeenCalledTimes(1);
  expect(view.renderer.dispose).toHaveBeenCalledTimes(1);
  expect(view.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(view.renderer.domElement.remove).toHaveBeenCalledTimes(1);
});
