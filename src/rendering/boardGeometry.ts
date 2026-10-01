import * as THREE from "three";

import { BOARD } from "../domain/board";

export const TILE_SPACING = 4.2;
export const TILE_SIZE = 3.7;
export const BOARD_GRID_SIZE = 6;

const HALF_GRID = (BOARD_GRID_SIZE - 1) / 2;

export function boardPosition(index: number): THREE.Vector3 {
  const normalized = ((index % BOARD.length) + BOARD.length) % BOARD.length;
  let gridX: number;
  let gridZ: number;

  if (normalized <= 5) {
    gridX = HALF_GRID - normalized;
    gridZ = HALF_GRID;
  } else if (normalized <= 10) {
    gridX = -HALF_GRID;
    gridZ = HALF_GRID - (normalized - 5);
  } else if (normalized <= 15) {
    gridX = -HALF_GRID + (normalized - 10);
    gridZ = -HALF_GRID;
  } else {
    gridX = HALF_GRID;
    gridZ = -HALF_GRID + (normalized - 15);
  }

  return new THREE.Vector3(gridX * TILE_SPACING, 0, gridZ * TILE_SPACING);
}

export function boardDirection(index: number): THREE.Vector3 {
  return boardPosition(index + 1).sub(boardPosition(index)).normalize();
}

export function worldPath(indices: readonly number[], y: number): THREE.Vector3[] {
  return indices.map((index) => {
    const position = boardPosition(index);
    position.y = y;
    return position;
  });
}
