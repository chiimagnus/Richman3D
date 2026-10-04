import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands, publicProperty } from "../../src/domain/selectors";
import { makeSave } from "../../src/storage/snapshot";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import { stubCanvas } from "../fixtures/canvas";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function badge(marker: THREE.Object3D) {
  return marker.getObjectByName("owner-seat") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

it("projects actual group completion, mortgage pattern and redemption without a second economic state or rebuilding static flags", () => {
  stubCanvas(); const game = propertyMatch(); const scene = new THREE.Scene();
  const before = game.snapshot;
  const board = new BoardView(scene, "en", before.map, before.config, before.rules);
  try {
    board.syncOwnership(before);
    const groups = ["harbor-walk", "neon-avenue"].map((id) => scene.getObjectByName(`complete-group-${id}`)!);
    const mortgage = scene.getObjectByName("mortgage-pattern-neon-avenue")!;
    const marker = scene.getObjectByName("owner-marker-neon-avenue")!;
    const texture = badge(marker).material.map!;
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    [...groups, mortgage].forEach((group) => group.traverse((object) => {
      if (object instanceof THREE.Mesh) { resources.add(object.geometry); resources.add(object.material as THREE.Material); }
    }));
    const disposals = [...resources].map((resource) => vi.spyOn(resource, "dispose"));
    expect(groups.every((group) => group.visible)).toBe(true);
    expect(groups.every((group) => group.children.length === 2)).toBe(true);
    expect(mortgage.visible).toBe(false);
    for (const kind of ["mortgage", "redeem"] as const) {
      expect(game.apply({ kind, actor: "p1", propertyId: "neon-avenue", expectedRevision: game.snapshot.revision }).ok).toBe(true);
      const saved = makeSave(game.snapshot, propertyMatchId);
      board.syncOwnership(game.snapshot);
      expect(mortgage.visible).toBe(kind === "mortgage");
      expect(mortgage.children).toHaveLength(4);
      expect(groups.every((group) => group.visible)).toBe(kind === "redeem");
      expect(publicProperty(game.snapshot, "harbor-walk").groupComplete).toBe(kind === "redeem");
      expect(badge(marker).material.map).toBe(texture);
      expect(makeSave(game.snapshot, propertyMatchId).state).toEqual(saved.state);
    }
    board.setLanguage("zh-CN"); board.syncOwnership(game.snapshot);
    expect(badge(marker).material.map).toBe(texture);
    disposals.forEach((disposed) => expect(disposed).not.toHaveBeenCalled());
    board.dispose(); disposals.forEach((disposed) => expect(disposed).toHaveBeenCalledTimes(1));
  } finally { board.dispose(); }
});

it("identifies all four actual owners by seat number independently of their colors and unchanged language", () => {
  stubCanvas(); const game = new Game(createMatchConfig(31, 4)); const scene = new THREE.Scene();
  const before = game.snapshot; const board = new BoardView(scene, "en", before.map, before.config, before.rules);
  const seen = new Set<string>();
  try {
    for (let step = 0; step < 300 && seen.size < 4 && game.snapshot.decision.kind !== "game_over"; step += 1) {
      const actions = legalCommands(game.snapshot, game.snapshot.decision.actorId);
      const command = actions.find((action) => action.kind === "buy") ?? actions.find((action) => action.kind === "roll") ?? actions.find((action) => action.kind === "auction_pass") ?? actions[0]!;
      expect(game.apply(command).ok).toBe(true);
      board.syncOwnership(game.snapshot);
      for (const [id, property] of Object.entries(game.snapshot.properties)) {
        if (!property.ownerId) continue;
        seen.add(property.ownerId);
        const marker = scene.getObjectByName(`owner-marker-${id}`)!;
        const number = game.snapshot.config.players.findIndex((player) => player.id === property.ownerId) + 1;
        const canvas = badge(marker).material.map!.image as { draws: { text: string }[] };
        expect(canvas.draws.map((draw) => draw.text)).toEqual([String(number)]);
        expect((marker as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe(game.snapshot.config.players[number - 1]!.color.slice(1));
        const map = badge(marker).material.map;
        board.setLanguage("zh-CN"); board.syncOwnership(game.snapshot);
        expect(badge(marker).material.map).toBe(map);
      }
    }
    expect(seen.size).toBe(4);
  } finally { board.dispose(); }
});

it("releases every shared native resource once over twenty owned boards and repeated language changes", () => {
  stubCanvas(); const game = propertyMatch(); const snapshot = game.snapshot;
  const textureDisposal = vi.spyOn(THREE.Texture.prototype, "dispose");
  const geometryDisposal = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
  const materialDisposal = vi.spyOn(THREE.Material.prototype, "dispose");
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const scene = new THREE.Scene(); const board = new BoardView(scene, "en", snapshot.map, snapshot.config, snapshot.rules);
    board.syncOwnership(snapshot);
    const marker = scene.getObjectByName("owner-marker-neon-avenue")!;
    const map = badge(marker).material.map;
    for (const language of ["zh-CN", "en", "zh-CN", "en"] as const) {
      board.setLanguage(language); board.syncOwnership(snapshot);
      expect(badge(marker).material.map).toBe(map);
    }
    board.dispose(); board.dispose();
    expect(scene.children).toHaveLength(0);
  }
  for (const spy of [textureDisposal, geometryDisposal, materialDisposal]) {
    const counts = new Map<unknown, number>();
    for (const resource of spy.mock.contexts) counts.set(resource, (counts.get(resource) ?? 0) + 1);
    expect(counts.size).toBeGreaterThan(0);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  }
});
