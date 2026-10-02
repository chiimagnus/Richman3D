import * as THREE from "three";

import { boardPosition, worldPath } from "./boardGeometry";
import { animatePositions } from "./motion";
import { MotionClock } from "./MotionClock";
import { disposeObject } from "./disposeObject";

const PAWN_OFFSET = new THREE.Vector3(0.72, 0.18, -0.72);

export class PlayerView {
  private readonly object = new THREE.Group();

  constructor(scene: THREE.Scene, color: string, private readonly clock: MotionClock) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.62, 1.25, 20),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.34,
        metalness: 0.24,
      }),
    );
    body.position.y = 0.63;
    body.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 20, 16),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.2,
      }),
    );
    head.position.y = 1.55;
    head.castShadow = true;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.08, 8, 28),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.3,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;

    this.object.add(body, head, ring);
    scene.add(this.object);
  }

  setPosition(index: number): void {
    this.object.position.copy(boardPosition(index).add(PAWN_OFFSET));
  }

  async moveAlong(
    path: readonly number[],
    onStep?: () => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const points = [
      this.object.position.clone(),
      ...worldPath(path, PAWN_OFFSET.y).map((position) =>
        position.add(new THREE.Vector3(PAWN_OFFSET.x, 0, PAWN_OFFSET.z)),
      ),
    ];

    await animatePositions(
      this.clock,
      points,
      (position, frame) => {
        this.object.position.copy(position);
        this.object.position.y += Math.sin(Math.PI * frame.segmentProgress) * 0.24;
      },
      { onSegment: () => onStep?.(), signal },
    );
  }

  dispose(): void { disposeObject(this.object); }
}
