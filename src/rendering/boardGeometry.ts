import * as THREE from "three";
import type { MapDefinition } from "../domain/board";

export const TILE_SPACING = 4.2;
export const TILE_SIZE = 3.7;

export function boardPosition(map: MapDefinition, index: number): THREE.Vector3 {
  const point = map.path[((index % map.path.length) + map.path.length) % map.path.length];
  if (!point) throw new RangeError("地图路径不存在");
  return new THREE.Vector3(point.x, 0, point.z);
}

export function boardDirection(map: MapDefinition, index: number): THREE.Vector3 {
  return boardPosition(map, index + 1).sub(boardPosition(map, index)).normalize();
}

export function worldPath(map: MapDefinition, indices: readonly number[], height: number): THREE.Vector3[] {
  return indices.map((index) => { const position = boardPosition(map, index); position.y = height; return position; });
}

export function boardBounds(map: MapDefinition): THREE.Box3 {
  const bounds = new THREE.Box3().setFromPoints(map.path.map((_, index) => boardPosition(map, index)));
  bounds.expandByVector(new THREE.Vector3(TILE_SIZE / 2, 0, TILE_SIZE / 2));
  return bounds;
}
