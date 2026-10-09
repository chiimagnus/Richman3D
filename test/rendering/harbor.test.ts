import { afterEach, expect, it, vi } from "vitest";
import { Mesh, Scene } from "three";
import { BoardView } from "../../src/rendering/BoardView";
import { boardBounds } from "../../src/rendering/boardGeometry";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { HARBOR } from "../../src/domain/maps/harbor";
import { stubCanvas } from "../fixtures/canvas";

afterEach(() => vi.unstubAllGlobals());

it("creates harbor-only scenery, diamond group identifiers and translated labels, releasing every resource once", () => {
  stubCanvas();
  const state = new Game({ ...createMatchConfig(), mapId: HARBOR.id, mapVersion: HARBOR.version }).snapshot;
  const scene = new Scene();
  const board = new BoardView(scene, "en", state.map, state.config, state.rules);
  board.syncOwnership(state);
  expect(scene.getObjectByName("harbor-decoration")).toBeDefined();
  expect(scene.getObjectByName("city-decoration")).toBeUndefined();
  expect(scene.getObjectByName("rose-diamond-ocean-museum")).toBeDefined();
  expect(boardBounds(HARBOR).max.x).toBeGreaterThan(14);
  board.setLanguage("zh-CN");
  const resources = new Set<{ dispose(): void }>();
  scene.traverse((object) => {
    if (object instanceof Mesh) { resources.add(object.geometry); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { resources.add(material); if ("map" in material && material.map) resources.add(material.map as { dispose(): void }); }); }
  });
  const spies = [...resources].map((resource) => vi.spyOn(resource, "dispose"));
  board.dispose();
  expect(scene.children).toHaveLength(0);
  spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});
