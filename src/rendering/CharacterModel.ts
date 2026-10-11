import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CHARACTERS = ["king", "queen", "knight", "bishop"] as const;

export function createCharacterModel(color: string, seatIndex: number): THREE.Group {
  const role = CHARACTERS[seatIndex];
  if (!role) throw new RangeError("人物席位不存在");
  const root = new THREE.Group();
  root.name = `character-${role}`;
  const material = (name: string, tint: THREE.ColorRepresentation, roughness = 0.58, metalness = 0) => {
    const result = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness });
    result.name = name;
    return result;
  };
  const palette = {
    coat: material("character-enamel", new THREE.Color(color).lerp(new THREE.Color(0xfff2db), 0.22), 0.4),
    seat: material("character-seat", color, 0.38),
    ivory: material("character-ivory", 0xfff0d4, 0.52),
    gold: material("character-brass", 0xd8ae62, 0.34, 0.55),
    skin: material("character-skin", [0xe5b18d, 0xc98768, 0xd9a780, 0xaf785b][seatIndex]!),
    hair: material("character-hair", [0x694535, 0x493332, 0x58443e, 0xe2d4b9][seatIndex]!, 0.72),
    ink: material("character-ink", 0x293b43, 0.58),
    armor: material("character-pewter", 0x9bafb3, 0.42, 0.38),
  };
  const sphere = new THREE.SphereGeometry(1, 20, 12);
  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const sources = new Set<THREE.BufferGeometry>([sphere, box, cylinder]);
  const pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const part = (geometry: THREE.BufferGeometry, surface: THREE.Material, position: readonly number[], scale: readonly number[] = [1, 1, 1], rotation: readonly number[] = [0, 0, 0]) => {
    sources.add(geometry);
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    const baked = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    baked.applyMatrix4(transform);
    baked.deleteAttribute("uv");
    const group = pieces.get(surface) ?? [];
    group.push(baked);
    pieces.set(surface, group);
  };
  const profile = (points: readonly (readonly [number, number])[], surface: THREE.Material) => {
    part(new THREE.LatheGeometry(points.map(([radius, height]) => new THREE.Vector2(radius, height)), 32), surface, [0, 0, 0]);
  };
  const curve = (points: readonly (readonly [number, number, number])[], radius: number, surface: THREE.Material) => {
    part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), 12, radius, 6, false), surface, [0, 0, 0]);
  };
  const relief = (outline: THREE.Shape, depth: number, surface: THREE.Material, position: readonly number[]) => {
    part(new THREE.ExtrudeGeometry(outline, { depth, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.018, bevelThickness: 0.018, curveSegments: 12 }), surface, position);
  };

  profile([[0, 0], [0.56, 0], [0.62, 0.025], [0.64, 0.06], [0.64, 0.12], [0.61, 0.16], [0.56, 0.18], [0, 0.18]], palette.ivory);
  profile([[0.636, 0.07], [0.649, 0.08], [0.649, 0.105], [0.636, 0.115]], palette.gold);
  part(cylinder, palette.seat, [0, 0.184, 0], [0.55, 0.012, 0.55]);
  for (const horizontal of [-0.16, 0.16]) {
    part(sphere, palette.ink, [horizontal, 0.28, 0.055], [0.125, 0.1, 0.19]);
    if (role === "king" || role === "knight") part(box, role === "knight" ? palette.armor : palette.ink, [horizontal, 0.46, 0], [0.17, 0.32, 0.2]);
  }

  if (role === "queen" || role === "bishop") {
    profile([[0, 0.31], [0.36, 0.31], [0.37, 0.36], [0.34, 0.5], [0.29, 0.75], [0.23, 0.97], [0.29, 1.12], [0.22, 1.26], [0, 1.28]], palette.coat);
    profile([[0.36, 0.34], [0.372, 0.36], [0.366, 0.39], [0.356, 0.4]], palette.gold);
  } else {
    part(sphere, role === "knight" ? palette.armor : palette.coat, [0, 0.98, 0], [0.31, 0.36, 0.24]);
    part(box, palette.ink, [0, 0.7, 0], [0.55, 0.08, 0.37]);
    part(box, palette.gold, [0, 0.7, 0.195], [0.11, 0.1, 0.028]);
  }
  for (const side of [-1, 1]) {
    part(sphere, role === "knight" ? palette.armor : palette.coat, [side * 0.31, 1.08, 0], [0.145, 0.22, 0.17]);
    part(sphere, palette.coat, [side * 0.385, 0.89, 0.045], [0.105, 0.2, 0.12]);
    part(cylinder, palette.gold, [side * 0.4, 0.76, 0.06], [0.105, 0.045, 0.11]);
    part(sphere, palette.skin, [side * 0.4, 0.69, 0.075], [0.085, 0.09, 0.085]);
  }
  part(sphere, palette.ivory, [0, 1.23, 0], [0.26, 0.09, 0.24]);
  part(cylinder, palette.skin, [0, 1.34, 0], [0.105, 0.19, 0.105]);
  part(sphere, palette.skin, [0, 1.62, 0], [0.3, 0.32, 0.265]);
  for (const side of [-1, 1]) {
    part(sphere, palette.skin, [side * 0.293, 1.6, 0], [0.046, 0.07, 0.049]);
    part(sphere, palette.ivory, [side * 0.105, 1.65, 0.245], [0.045, 0.057, 0.022]);
    part(sphere, palette.ink, [side * 0.105, 1.65, 0.265], [0.022, 0.031, 0.008]);
    part(sphere, palette.ivory, [side * 0.105 - 0.007, 1.663, 0.273], [0.007, 0.009, 0.004]);
    curve([[side * 0.15, 1.735, 0.235], [side * 0.105, 1.751, 0.252], [side * 0.065, 1.738, 0.247]], 0.014, palette.hair);
  }
  part(sphere, palette.skin, [0, 1.585, 0.265], [0.049, 0.05, 0.063]);
  curve([[-0.068, 1.513, 0.246], [0, 1.494, 0.259], [0.068, 1.513, 0.246]], 0.009, palette.ink);
  const hairCap = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.48);
  part(hairCap, role === "knight" ? palette.armor : palette.hair, [0, 1.65, -0.006], [0.313, 0.307, 0.279]);

  if (role === "king" || role === "queen") {
    part(createCapeGeometry(), palette.coat, [0, 0, 0]);
    for (const side of [-1, 1]) {
      part(sphere, palette.ivory, [side * 0.18, 1.205, 0.105], [0.17, 0.07, 0.17]);
      part(sphere, palette.gold, [side * 0.21, 1.16, 0.195], [0.038, 0.038, 0.028]);
    }
    const crownHeight = role === "king" ? 1.96 : 1.94;
    const crownRadius = role === "king" ? 0.285 : 0.245;
    part(cylinder, palette.gold, [0, crownHeight, 0], [crownRadius, 0.075, crownRadius]);
    for (let tooth = 0; tooth < 5; tooth += 1) {
      const angle = tooth * Math.PI * 2 / 5;
      const crown = new THREE.Shape();
      crown.moveTo(-0.085, 0);
      crown.lineTo(-0.035, 0.13);
      crown.quadraticCurveTo(0, 0.21, 0.035, 0.13);
      crown.lineTo(0.085, 0);
      crown.closePath();
      const geometry = new THREE.ExtrudeGeometry(crown, { depth: 0.035, steps: 1, bevelSegments: 2, bevelSize: 0.012, bevelThickness: 0.012 });
      part(geometry, palette.gold, [Math.sin(angle) * crownRadius, crownHeight, Math.cos(angle) * crownRadius], [1, role === "queen" ? 1.15 : 1, 1], [0, angle, 0]);
      part(sphere, palette.seat, [Math.sin(angle) * crownRadius, crownHeight + 0.035, Math.cos(angle) * crownRadius], [0.025, 0.031, 0.025]);
    }
    if (role === "king") {
      curve([[-0.27, 1.99, 0], [-0.17, 2.075, 0], [0, 2.105, 0], [0.17, 2.075, 0], [0.27, 1.99, 0]], 0.018, palette.gold);
      curve([[0, 1.99, -0.27], [0, 2.075, -0.17], [0, 2.105, 0], [0, 2.075, 0.17], [0, 1.99, 0.27]], 0.018, palette.gold);
      part(box, palette.gold, [0, 2.19, 0], [0.045, 0.22, 0.045]);
      part(box, palette.gold, [0, 2.23, 0], [0.15, 0.045, 0.045]);
      part(sphere, palette.hair, [0, 1.61, -0.205], [0.265, 0.22, 0.11]);
      for (const side of [-1, 1]) {
        curve([[side * 0.012, 1.56, 0.305], [side * 0.07, 1.547, 0.3], [side * 0.125, 1.567, 0.265]], 0.025, palette.hair);
        part(sphere, palette.hair, [side * 0.23, 1.55, -0.11], [0.087, 0.17, 0.13]);
      }
      for (const height of [0.91, 1.04]) part(sphere, palette.gold, [0, height, 0.244], [0.027, 0.027, 0.016]);
      part(sphere, palette.gold, [-0.43, 0.8, 0.14], [0.09, 0.09, 0.09]);
    } else {
      part(sphere, palette.hair, [0, 1.57, -0.2], [0.29, 0.34, 0.14]);
      for (const side of [-1, 1]) {
        curve([[side * 0.255, 1.79, -0.035], [side * 0.28, 1.56, -0.055], [side * 0.22, 1.32, -0.055]], 0.066, palette.hair);
        part(sphere, palette.gold, [side * 0.29, 1.51, 0.065], [0.032, 0.045, 0.028]);
      }
      part(sphere, palette.seat, [0, 1.18, 0.255], [0.054, 0.07, 0.023]);
      part(cylinder, palette.gold, [0.44, 1.0, 0.1], [0.018, 0.8, 0.018]);
      part(sphere, palette.gold, [0.44, 1.42, 0.1], [0.075, 0.045, 0.075]);
      part(sphere, palette.seat, [0.44, 1.5, 0.1], [0.062, 0.08, 0.062]);
    }
  } else if (role === "knight") {
    for (const side of [-1, 1]) {
      part(box, palette.armor, [side * 0.26, 1.59, 0.08], [0.09, 0.23, 0.12]);
      part(sphere, palette.gold, [side * 0.26, 1.73, 0.085], [0.035, 0.035, 0.03]);
    }
    curve([[-0.265, 1.795, 0.12], [0, 1.855, 0.227], [0.265, 1.795, 0.12]], 0.035, palette.armor);
    const plume = new THREE.Shape();
    plume.moveTo(-0.06, 0);
    plume.bezierCurveTo(-0.15, 0.22, 0.07, 0.38, 0.22, 0.27);
    plume.bezierCurveTo(0.12, 0.24, 0.07, 0.12, 0.06, 0);
    plume.closePath();
    relief(plume, 0.08, palette.seat, [-0.08, 1.9, -0.05]);
    const shield = new THREE.Shape();
    shield.moveTo(-0.155, 0.2);
    shield.quadraticCurveTo(0, 0.26, 0.155, 0.2);
    shield.lineTo(0.135, -0.06);
    shield.quadraticCurveTo(0.09, -0.19, 0, -0.25);
    shield.quadraticCurveTo(-0.09, -0.19, -0.135, -0.06);
    shield.closePath();
    relief(shield, 0.055, palette.gold, [0.405, 0.76, 0.17]);
    part(box, palette.seat, [0.405, 0.78, 0.251], [0.23, 0.32, 0.025]);
    part(box, palette.ivory, [0.405, 0.78, 0.273], [0.032, 0.22, 0.016]);
    part(box, palette.ivory, [0.405, 0.82, 0.273], [0.14, 0.032, 0.016]);
    part(box, palette.armor, [-0.42, 0.43, 0.1], [0.06, 0.36, 0.035]);
    part(box, palette.gold, [-0.42, 0.63, 0.1], [0.19, 0.045, 0.07]);
    part(box, palette.ink, [-0.42, 0.72, 0.1], [0.045, 0.13, 0.045]);
  } else {
    const mitre = new THREE.Shape();
    mitre.moveTo(-0.25, 0);
    mitre.quadraticCurveTo(-0.2, 0.25, 0, 0.46);
    mitre.quadraticCurveTo(0.2, 0.25, 0.25, 0);
    mitre.closePath();
    relief(mitre, 0.2, palette.ivory, [0, 1.87, -0.11]);
    part(box, palette.gold, [0, 1.9, 0.12], [0.47, 0.065, 0.04]);
    part(box, palette.gold, [0, 2.1, 0.117], [0.035, 0.22, 0.02]);
    part(box, palette.gold, [0, 2.13, 0.117], [0.14, 0.035, 0.02]);
    for (const side of [-1, 1]) part(box, palette.ivory, [side * 0.105, 0.9, 0.263], [0.1, 0.61, 0.025]);
    part(sphere, palette.gold, [0, 1.16, 0.25], [0.045, 0.045, 0.02]);
    part(cylinder, palette.gold, [-0.46, 1.12, 0.08], [0.018, 1.49, 0.018]);
    curve([[-0.46, 1.86, 0.08], [-0.46, 2.06, 0.08], [-0.36, 2.13, 0.08], [-0.285, 2.04, 0.08], [-0.35, 1.985, 0.08]], 0.024, palette.gold);
    part(sphere, palette.hair, [0, 1.4, 0.18], [0.13, 0.11, 0.1]);
  }

  for (const [surface, geometries] of pieces) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, surface);
    mesh.name = surface.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  for (const geometry of sources) geometry.dispose();
  for (const surface of Object.values(palette)) if (!pieces.has(surface)) surface.dispose();
  return root;
}

function createCapeGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const rows = 8;
  const columns = 20;
  for (let row = 0; row <= rows; row += 1) {
    const fraction = row / rows;
    const width = 0.27 + fraction * 0.15;
    for (let column = 0; column <= columns; column += 1) {
      const angle = -Math.PI / 2 + column / columns * Math.PI;
      const fold = Math.cos(angle * 8) * 0.015 * fraction;
      vertices.push(Math.sin(angle) * width, 1.21 - fraction * 0.73, -0.12 - Math.cos(angle) * (0.18 + fraction * 0.09 + fold));
      if (row === rows || column === columns) continue;
      const start = row * (columns + 1) + column;
      indices.push(start, start + 1, start + columns + 1, start + 1, start + columns + 2, start + columns + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
