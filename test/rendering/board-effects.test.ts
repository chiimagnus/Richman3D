import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { MotionClock } from "../../src/rendering/MotionClock";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import { stubCanvas } from "../fixtures/canvas";
import { makeSave, readSave } from "../../src/storage/snapshot";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["normal", "fast", "abort", "stop", "reduced"] as const)("%s ownership and landing effects share timing, converge after cancellation and never replay on restore", async mode => {
  stubCanvas(); vi.stubGlobal("window", { matchMedia: () => ({ matches: mode === "reduced" }) });
  const game = propertyMatch(); const scene = new THREE.Scene(); const snapshot = game.snapshot;
  const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules); const clock = new MotionClock();
  clock.setPlaybackRate(mode === "fast" ? 2 : 1); board.syncOwnership(snapshot);
  const marker = scene.getObjectByName("owner-marker-neon-avenue")!;
  const tile = scene.getObjectByName("forward-neon-avenue")!.parent!.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  expect(marker.scale.toArray()).toEqual([1, 1, 1]); expect(clock.activeCount).toBe(0);
  const controller = new AbortController();
  try {
    const pop = board.popOwner("neon-avenue", clock, controller.signal);
    const pulse = board.pulseTile(snapshot.map.tiles.findIndex(tile => tile.id === "neon-avenue"), { kind: "property_owned", propertyId: "neon-avenue" }, clock, controller.signal);
    if (mode === "reduced") expect(clock.activeCount).toBe(0);
    else {
      expect(clock.activeCount).toBe(2); clock.update(mode === "fast" ? 75 : 150);
      expect(marker.scale.y).toBeCloseTo(0.875); expect(tile.material.emissiveIntensity).toBeGreaterThan(0);
      if (mode === "abort") controller.abort();
      else if (mode === "stop") clock.cancel();
      else clock.finish();
    }
    const finished = mode !== "abort" && mode !== "stop";
    expect(await pop).toBe(finished); expect(await pulse).toBe(finished); expect(clock.activeCount).toBe(0);
    expect(marker.scale.toArray()).toEqual([1, 1, 1]); expect(tile.material.emissiveIntensity).toBe(0); expect(tile.material.emissive.getHex()).toBe(0);
    const saved = makeSave(snapshot, propertyMatchId); board.syncOwnership(readSave(saved).snapshot);
    board.setLanguage("zh-CN"); clock.update(1000);
    expect(scene.getObjectByName("owner-marker-neon-avenue")).toBe(marker); expect(marker.scale.y).toBe(1);
    expect(game.snapshot).toBe(snapshot); expect(clock.activeCount).toBe(0);
    controller.abort(); expect(await board.popOwner("neon-avenue", clock, controller.signal)).toBe(false);
    expect(await board.pulseTile(3, { kind: "property_owned", propertyId: "neon-avenue" }, clock, controller.signal)).toBe(false);
    expect(tile.material.emissiveIntensity).toBe(0); expect(marker.scale.y).toBe(1);
  } finally { clock.cancel(); board.dispose(); }
});

it.each(["finish", "skip", "pause", "dispose"] as const)("%s during an actual purchase cannot leave a tiny owner marker or replay a purchase after sync", async mode => {
  stubCanvas();
  const config = createMatchConfig(940); const game = new Game({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const before = game.snapshot; const scene = new THREE.Scene(); const board = new BoardView(scene, "en", before.map, before.config, before.rules);
  const session = new GameSession(game); const clock = new MotionClock();
  session.bind({ sync: snapshot => board.syncOwnership(snapshot), stop() { clock.cancel(); }, async present(events, signal) {
    board.syncOwnership(game.snapshot);
    const purchased = events.find(event => event.kind === "purchased");
    if (purchased?.kind === "purchased") await board.popOwner(purchased.propertyId, clock, signal);
  } });
  try {
    expect(session.confirmHandover("p1")).toBe(true);
    const buying = session.dispatch({ kind: "buy", actor: "p1", expectedRevision: before.revision }); await Promise.resolve();
    const committed = game.snapshot; const marker = scene.getObjectByName("owner-marker-neon-avenue")!;
    expect(marker.scale.y).toBe(0.01); expect(committed.players[0]!.cash).toBe(before.players[0]!.cash - 180);
    if (mode === "finish") clock.finish();
    else if (mode === "skip") session.skipPresentation();
    else session[mode]();
    await buying; expect(marker.scale.y).toBe(1); expect(clock.activeCount).toBe(0);
    board.syncOwnership(readSave(makeSave(committed, propertyMatchId)).snapshot); clock.update(1000);
    expect(marker.scale.y).toBe(1); expect(game.snapshot).toBe(committed); expect(committed.random).toEqual(before.random);
    expect(scene.getObjectByName("owner-marker-neon-avenue")).toBe(marker);
  } finally { session.dispose(); board.dispose(); }
});
