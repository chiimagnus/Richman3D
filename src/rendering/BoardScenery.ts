import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MapDefinition } from "../domain/board";
import { boardBounds, TILE_SIZE } from "./boardGeometry";

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
  const foliage = new THREE.IcosahedronGeometry(1, 1);
  const roof = new THREE.ConeGeometry(1, 1, 4);
  const palette = {
    stone: 0xf4e7ce, pavement: 0xd6c9ae, grass: 0xb3cb8b,
    leaf: 0x548968, trunk: 0x956b48, water: 0x69b9c3,
    cream: 0xfff4da, coral: 0xd98b70, mint: 0x8fb7a1,
    blue: 0x779bad, roof: 0x456e77, window: 0x294c58,
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
  const tree = (horizontal: number, vertical: number) => {
    part("tree-planter", cylinder, "stone", [0.44, 0.09, 0.44], [horizontal, 0.1, vertical]);
    part("tree-trunk", cylinder, "trunk", [0.065, 0.35, 0.065], [horizontal, 0.3, vertical]);
    part("tree-canopy", foliage, "leaf", [0.38, 0.4, 0.38], [horizontal, 0.64, vertical]);
  };

  if (map.id === "harbor") {
    part("harbor-water", box, "water", [16, 0.16, 16], [0, -0.04, 0]);
    part("harbor-quay", box, "stone", [16, 0.18, 3.2], [0, 0.06, -6.4]);
    for (const horizontal of [-5, 0, 5]) {
      part("wooden-dock", box, "trunk", [1.2, 0.14, 4.8], [horizontal, 0.11, -2.5]);
      for (const vertical of [-4.4, -3.3, -2.2, -1.1, -0.2]) {
        part("dock-plank", box, "stone", [1.12, 0.025, 0.035], [horizontal, 0.2, vertical]);
      }
      part("boat-hull", box, "coral", [0.9, 0.22, 1.8], [horizontal + 1.4, 0.14, -2.3]);
      part("boat-deck", box, "cream", [0.7, 0.07, 1.4], [horizontal + 1.4, 0.28, -2.3]);
      part("boat-mast", cylinder, "trunk", [0.035, 0.65, 0.035], [horizontal + 1.4, 0.59, -2.3]);
      const sail = part("boat-sail", roof, "cream", [0.46, 0.58, 0.025], [horizontal + 1.4, 0.61, -2.3]);
      sail.rotation.y = Math.PI / 4;
      tree(horizontal + 1, -6.6);
    }
    part("lighthouse-island", cylinder, "stone", [1.8, 0.16, 1.8], [0, 0.04, 4.4]);
    part("lighthouse-base", cylinder, "cream", [0.4, 0.6, 0.4], [0, 0.43, 4.4]);
    part("lighthouse-stripe", cylinder, "coral", [0.41, 0.16, 0.41], [0, 0.55, 4.4]);
    part("lighthouse-lantern", cylinder, "window", [0.25, 0.2, 0.25], [0, 0.83, 4.4]);
    part("lighthouse-roof", roof, "roof", [0.44, 0.15, 0.44], [0, 1, 4.4]).rotation.y = Math.PI / 4;
    for (const vertical of [1.2, 3, 5.6]) {
      part("water-ripple", box, "cream", [2, 0.006, 0.035], [-4, 0.045, vertical]);
      part("water-ripple", box, "cream", [1.3, 0.006, 0.035], [4.6, 0.045, vertical + 0.4]);
    }
  } else {
    part("city-lawn", box, "grass", [16, 0.12, 16], [0, -0.04, 0]);
    part("garden-walk", box, "stone", [2.4, 0.06, 15.8], [0, 0.05, 0]);
    part("garden-walk", box, "stone", [15.8, 0.06, 2.4], [0, 0.05, 0]);
    for (const [horizontal, vertical, height, color] of [
      [-5.6, -5.4, 0.65, "coral"], [-2.5, -5.4, 0.72, "cream"], [3.2, -5.4, 0.55, "mint"],
      [6, -3.5, 0.64, "blue"], [-5.6, 3.5, 0.67, "cream"], [-2.5, 5.6, 0.59, "blue"],
      [3, 5.5, 0.74, "coral"], [6, 4.6, 0.65, "mint"],
    ] as const) {
      part("city-house", box, color, [1.9, height, 1.8], [horizontal, 0.08 + height / 2, vertical]);
      const cap = part("city-roof", roof, "roof", [1.35, 0.23, 1.3], [horizontal, 0.08 + height + 0.115, vertical]);
      cap.rotation.y = Math.PI / 4;
      for (const offset of [-0.5, 0.5]) {
        part("city-window", box, "window", [0.28, 0.27, 0.04], [horizontal + offset, 0.12 + height / 2, vertical + 0.91]);
      }
      part("city-door", box, "cream", [0.24, 0.32, 0.04], [horizontal, 0.26, vertical + 0.92]);
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
  for (const geometry of [box, cylinder, foliage, roof]) if (!usedGeometries.has(geometry)) geometry.dispose();
  for (const material of Object.values(materials)) if (!usedMaterials.has(material)) material.dispose();
  return root;
}
