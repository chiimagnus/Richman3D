import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { DiceView } from "../../src/rendering/DiceView";
import { MotionClock } from "../../src/rendering/MotionClock";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { GameSession } from "../../src/app/GameSession";
import { itemCheckpoint } from "../fixtures/items";
import { makeSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "../fixtures/property-match";

function topFaces(view: DiceView) {
  view.scene.updateMatrixWorld(true);
  return view.scene.children.filter((object) => object instanceof THREE.Group).map((die) => {
    const top = die.children.find((face) => face instanceof THREE.Group && new THREE.Vector3(0, 0, 1).applyQuaternion(face.getWorldQuaternion(new THREE.Quaternion())).dot(new THREE.Vector3(0, 1, 0)) > 0.999999);
    expect(top).toBeDefined();
    return { value: Number(top!.name.split("-").at(-1)), pips: top!.children.length, visible: die.visible };
  });
}

const PAIRS = Array.from({ length: 36 }, (_, index) => [Math.floor(index / 6) + 1, index % 6 + 1] as const);

it.each(Array.from({ length: 11 }, (_, index) => index + 2))("uses the actual chosen total %s through session settlement and real 3D faces, without consuming presentation RNG", async (total) => {
  const checkpoint = itemCheckpoint("controlled-dice");
  const state = makeSave(checkpoint.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
  const command = legalCommands(game.snapshot, "p1").find((candidate) => candidate.kind === "use_item" && candidate.total === total)!;
  expect(game.apply(command).ok).toBe(true);
  const session = new GameSession(game); const clock = new MotionClock(); const view = new DiceView(clock);
  session.bind({ sync() {}, stop() { clock.cancel(); view.hide(); }, async present(events, signal, _settle, _show, settleDice) {
    const rolled = events.find((event) => event.kind === "rolled");
    if (rolled?.kind !== "rolled") throw new Error("Missing controlled roll");
    await view.roll(rolled.result.dice, settleDice, signal, false);
  } });
  expect(session.confirmHandover("p1")).toBe(true);
  try {
    const rolling = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
    await vi.waitFor(() => expect(clock.activeCount).toBe(1));
    const committed = game.snapshot;
    const rolled = session.getSnapshot().events.find((event) => event.kind === "rolled");
    if (rolled?.kind !== "rolled") throw new Error("Missing controlled roll");
    expect(rolled.result.controlledBy).toBeDefined(); expect(rolled.result.steps).toBe(total); expect(rolled.result.path).toHaveLength(total);
    expect(committed.lastRoll).toEqual(rolled.result.dice);
    clock.update(600);
    expect(topFaces(view).map((face) => face.pips)).toEqual(rolled.result.dice);
    expect(topFaces(view).reduce((sum, face) => sum + face.pips, 0)).toBe(total);
    expect(session.getSnapshot().settledRoll!.result).toBe(rolled.result);
    expect(session.claimDiceAnnouncement(committed.revision)).toBe(true); expect(session.claimDiceAnnouncement(committed.revision)).toBe(false);
    clock.update(200); await rolling;
    expect(game.snapshot).toBe(committed); expect(clock.activeCount).toBe(0);
  } finally { session.dispose(); view.dispose(); }
});

it.each(PAIRS)("settles real pip meshes on %s and %s, once, with the same final pose under reduced motion", async (first, second) => {
  const clock = new MotionClock(); const view = new DiceView(clock); const settled = vi.fn();
  try {
    const values = [first, second] as const;
    const rolling = view.roll(values, settled, new AbortController().signal, false);
    clock.update(599); expect(settled).not.toHaveBeenCalled();
    clock.update(1); expect(settled).toHaveBeenCalledTimes(1);
    expect(topFaces(view)).toEqual(values.map((value) => ({ value, pips: value, visible: true })));
    clock.update(200); expect(await rolling).toBe(true); expect(settled).toHaveBeenCalledTimes(1);
    const pose = view.scene.children.filter((object) => object instanceof THREE.Group).map((die) => die.quaternion.toArray());
    settled.mockClear();
    const reduced = view.roll(values, settled, new AbortController().signal, true);
    expect(topFaces(view)).toEqual(values.map((value) => ({ value, pips: value, visible: true })));
    expect(view.scene.children.filter((object) => object instanceof THREE.Group).map((die) => die.quaternion.toArray())).toEqual(pose);
    expect(settled).toHaveBeenCalledTimes(1); clock.update(200); expect(await reduced).toBe(true);
    expect(settled).toHaveBeenCalledTimes(1); expect(clock.activeCount).toBe(0);
  } finally { clock.cancel(); view.dispose(); }
});

it.each([0, 100, 599, 600, 750])("cancels at %sms without late settlement, extra clock work or objects staying visible", async (elapsed) => {
  const clock = new MotionClock(); const view = new DiceView(clock); const settled = vi.fn(); const controller = new AbortController();
  try {
    const rolling = view.roll([1, 6], settled, controller.signal, false);
    clock.update(elapsed); const calls = settled.mock.calls.length;
    controller.abort(); expect(await rolling).toBe(false); clock.update(1000);
    expect(settled).toHaveBeenCalledTimes(calls); expect(clock.activeCount).toBe(0);
    expect(view.scene.children.filter((object) => object instanceof THREE.Group).every((die) => !die.visible)).toBe(true);
    expect(await view.roll([1, 1], settled, controller.signal, false)).toBe(false);
    expect(settled).toHaveBeenCalledTimes(calls);
  } finally { clock.cancel(); view.dispose(); }
});

it("resizes the overlay without changing dice or choosing another result, and renders with one existing renderer", async () => {
  const clock = new MotionClock(); const view = new DiceView(clock); const renderer = { clearDepth: vi.fn(), render: vi.fn() };
  try {
    view.render(renderer as unknown as THREE.WebGLRenderer); expect(renderer.render).not.toHaveBeenCalled();
    const rolling = view.roll([3, 5], () => {}, new AbortController().signal, true);
    for (const aspect of [0.35, 390 / 844, 1.5, 2.4]) {
      view.resize(aspect); view.camera.updateMatrixWorld();
      for (const die of view.scene.children.filter((object) => object instanceof THREE.Group)) {
        die.updateMatrixWorld(true);
        for (const horizontal of [-0.5, 0.5]) for (const vertical of [-0.5, 0.5]) for (const depth of [-0.5, 0.5]) {
          const point = new THREE.Vector3(horizontal, vertical, depth).applyMatrix4(die.matrixWorld).project(view.camera);
          expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
        }
      }
      expect(topFaces(view).map((face) => face.value)).toEqual([3, 5]);
    }
    view.render(renderer as unknown as THREE.WebGLRenderer);
    expect(renderer.clearDepth).toHaveBeenCalledTimes(1); expect(renderer.render).toHaveBeenCalledWith(view.scene, view.camera);
    view.hide(); view.render(renderer as unknown as THREE.WebGLRenderer); expect(renderer.render).toHaveBeenCalledTimes(1);
    clock.update(200); await rolling;
  } finally { clock.cancel(); view.dispose(); }
});

it("reuses only two geometries and two materials, releasing each once over twenty lifecycles", async () => {
  for (let count = 0; count < 20; count += 1) {
    const clock = new MotionClock(); const view = new DiceView(clock);
    const geometry = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    view.scene.traverse((object) => { if (object instanceof THREE.Mesh) { geometry.add(object.geometry); materials.add(object.material as THREE.Material); } });
    expect(geometry.size).toBe(2); expect(materials.size).toBe(2);
    const disposed = [...geometry, ...materials].map((resource) => vi.spyOn(resource, "dispose"));
    const rolling = view.roll([2, 6], () => {}, new AbortController().signal, false);
    clock.cancel(); view.hide(); view.dispose(); expect(await rolling).toBe(false);
    expect(clock.activeCount).toBe(0); expect(view.scene.children).toHaveLength(0);
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1);
  }
});
