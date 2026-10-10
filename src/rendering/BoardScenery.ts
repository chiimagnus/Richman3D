import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MapDefinition } from "../domain/board";
import { boardBounds, TILE_SIZE } from "./boardGeometry";
import { createSceneryModels } from "./SceneryModels";

export function createBoardScenery(map: MapDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = `${map.id}-decoration`;
  const bounds = boardBounds(map);
  const size = bounds.getSize(new THREE.Vector3());
  const width = size.x - TILE_SIZE * 2;
  const depth = size.z - TILE_SIZE * 2;
  root.position.copy(bounds.getCenter(new THREE.Vector3()));
  if (width <= 0 || depth <= 0) return root;
  root.scale.set(width / 16, 1, depth / 16);

  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const roof = new THREE.ConeGeometry(1, 1, 4);
  const models = createSceneryModels(map.id === "harbor");
  const modelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  const palette = {
    stone: 0xf4e7ce, pavement: 0xd6c9ae, grass: 0xb3cb8b,
    trunk: 0x956b48, water: 0x69b9c3,
    cream: 0xfff4da, coral: 0xd98b70, mint: 0x8fb7a1,
    roof: 0x456e77, window: 0x294c58,
  };
  const materials = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key,
    new THREE.MeshStandardMaterial({ color, roughness: key === "water" ? 0.32 : 0.72 }),
  ])) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
  const part = (name: string, geometry: THREE.BufferGeometry, material: keyof typeof palette,
    scale: readonly [number, number, number], position: readonly [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.name = name;
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const model = (name: string, horizontal: number, vertical: number, footprint: number, rotation = 0, elevation = 0.05) => {
    const geometry = models.get(name)!;
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const scale = Math.min(footprint / Math.max(size.x, size.z), (1.65 - elevation) / size.y);
    const placement = new THREE.Group();
    placement.position.set(horizontal, elevation, vertical);
    placement.scale.set(1 / root.scale.x, 1, 1 / root.scale.z);
    const mesh = new THREE.Mesh(geometry, modelMaterial);
    mesh.name = `model-${name}`;
    mesh.rotation.y = rotation;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    placement.add(mesh);
    root.add(placement);
    return mesh;
  };
  const tree = (horizontal: number, vertical: number) => {
    part("tree-planter", cylinder, "stone", [0.3, 0.07, 0.3], [horizontal, 0.075, vertical]);
    model("tree", horizontal, vertical, 0.5, 0, 0.11);
  };

  if (map.id === "harbor") {
    part("harbor-water", box, "water", [16, 0.16, 16], [0, -0.04, 0]);
    part("harbor-quay", box, "stone", [16, 0.18, 3.2], [0, 0.06, -6.4]);
    for (const horizontal of [-5, 0, 5]) {
      part("wooden-dock", box, "trunk", [1.2, 0.14, 4.8], [horizontal, 0.11, -2.5]);
      for (const vertical of [-4.4, -3.3, -2.2, -1.1, -0.2]) {
        part("dock-plank", box, "stone", [1.12, 0.025, 0.035], [horizontal, 0.2, vertical]);
      }
      model(horizontal === 0 ? "fishingBoat" : "sailboat", horizontal + 1.3, -2.3, 2.5);
      tree(horizontal + 1, -6.6);
    }
    model("cargoShip", -1, 3.8, 5.8, Math.PI / 2);
    part("lighthouse-island", cylinder, "stone", [1.3, 0.16, 1.3], [5.8, 0.04, 4.8]);
    part("lighthouse-base", cylinder, "cream", [0.35, 0.95, 0.35], [5.8, 0.6, 4.8]);
    part("lighthouse-stripe", cylinder, "coral", [0.36, 0.2, 0.36], [5.8, 0.65, 4.8]);
    part("lighthouse-gallery", cylinder, "cream", [0.46, 0.06, 0.46], [5.8, 1.11, 4.8]);
    part("lighthouse-lantern", cylinder, "window", [0.23, 0.24, 0.23], [5.8, 1.26, 4.8]);
    part("lighthouse-roof", roof, "roof", [0.43, 0.2, 0.43], [5.8, 1.5, 4.8]).rotation.y = Math.PI / 4;
    for (const vertical of [1.2, 3, 5.6]) {
      part("water-ripple", box, "cream", [2, 0.006, 0.035], [-4, 0.045, vertical]);
      part("water-ripple", box, "cream", [1.3, 0.006, 0.035], [4.6, 0.045, vertical + 0.4]);
    }
  } else {
    part("city-lawn", box, "grass", [16, 0.12, 16], [0, -0.04, 0]);
    part("garden-walk", box, "stone", [2.4, 0.06, 15.8], [0, 0.05, 0]);
    part("garden-walk", box, "stone", [15.8, 0.06, 2.4], [0, 0.05, 0]);
    for (const [horizontal, vertical, name, rotation] of [
      [-5.4, -5.3, "houseA", 0], [-2.5, -5.3, "houseC", 0], [3, -5.3, "houseI", 0],
      [5.9, -3.3, "houseC", -Math.PI / 2], [-5.4, 3.4, "houseI", Math.PI / 2], [-2.4, 5.3, "houseA", Math.PI],
      [3, 5.3, "houseC", Math.PI], [5.8, 3.4, "houseA", -Math.PI / 2],
    ] as const) {
      part("house-garden", box, "mint", [2.5, 0.04, 2.6], [horizontal, 0.035, vertical]);
      model(name, horizontal, vertical, 2.3, rotation);
    }
    part("fountain-plaza", cylinder, "pavement", [2.4, 0.08, 2.4], [0, 0.1, 0]);
    part("fountain-rim", cylinder, "cream", [1.3, 0.16, 1.3], [0, 0.2, 0]);
    part("fountain-water", cylinder, "water", [1.1, 0.04, 1.1], [0, 0.3, 0]);
    part("fountain-column", cylinder, "stone", [0.2, 0.42, 0.2], [0, 0.5, 0]);
    part("fountain-bowl", cylinder, "cream", [0.65, 0.1, 0.65], [0, 0.75, 0]);
    for (const [horizontal, vertical] of [[-6, 0], [6, 0], [-3, -2.6], [3, 2.6], [-6, 6], [6, -6]] as const) tree(horizontal, vertical);
    for (const horizontal of [-3.2, 3.2]) {
      part("park-bench", box, "trunk", [1.4, 0.12, 0.45], [horizontal, 0.26, 0]);
      part("park-bench-back", box, "trunk", [1.4, 0.25, 0.08], [horizontal, 0.42, -0.25]);
    }
  }
  const usedGeometries = new Set<THREE.BufferGeometry>();
  const usedMaterials = new Set<THREE.Material>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh) { usedGeometries.add(object.geometry); usedMaterials.add(object.material as THREE.Material); }
  });
  for (const geometry of [box, cylinder, roof, ...models.values()]) if (!usedGeometries.has(geometry)) geometry.dispose();
  for (const material of [...Object.values(materials), modelMaterial]) if (!usedMaterials.has(material)) material.dispose();
  return root;
}
