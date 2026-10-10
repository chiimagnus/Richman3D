import * as THREE from "three";
import houseA from "../assets/scenery/building-type-a.json";
import houseC from "../assets/scenery/building-type-c.json";
import houseI from "../assets/scenery/building-type-i.json";
import tree from "../assets/scenery/tree-small.json";
import sailboat from "../assets/scenery/boat-sail-a.json";
import fishingBoat from "../assets/scenery/boat-fishing-small.json";
import cargoShip from "../assets/scenery/ship-cargo-a.json";
import type { PropertyState } from "../domain/types";

export function createHouseGeometry(level: Exclude<PropertyState["level"], 0>): THREE.BufferGeometry {
  return new THREE.BufferGeometryLoader().parse([houseI, houseA, houseC][level - 1]!);
}

export function createSceneryModels(harbor: boolean): Map<string, THREE.BufferGeometry> {
  const sources = harbor
    ? { tree, sailboat, fishingBoat, cargoShip }
    : { tree, houseA, houseC, houseI };
  const loader = new THREE.BufferGeometryLoader();
  return new Map(Object.entries(sources).map(([name, data]) => [name, loader.parse(data)]));
}
