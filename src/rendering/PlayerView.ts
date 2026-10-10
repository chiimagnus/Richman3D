import * as THREE from "three";

import { boardPosition, worldPath } from "./boardGeometry";
import { animatePositions } from "./motion";
import { MotionClock } from "./MotionClock";
import { disposeObject } from "./disposeObject";
import type { MapDefinition } from "../domain/board";

export class PlayerView {
  private readonly object = new THREE.Group();
  private readonly offset: THREE.Vector3;
  private readonly ring: THREE.Mesh;

  constructor(scene: THREE.Scene, color: string, private readonly clock: MotionClock, private readonly map: MapDefinition, seatIndex: number) {
    this.offset = new THREE.Vector3(seatIndex % 2 === 0 ? -0.45 : 0.45, 0.18, seatIndex < 2 ? -0.45 : 0.45);
    this.object.scale.setScalar(0.5);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.62, 1.25, 20),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.08,
      }),
    );
    body.position.y = 0.63;
    body.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 20, 16),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.08,
      }),
    );
    head.position.y = 1.55;
    head.castShadow = true;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.08, 8, 28),
      new THREE.MeshStandardMaterial({
        color: 0x235e65,
        emissive: 0x235e65,
        emissiveIntensity: 0.12,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    ring.name = "acting-player-ring";
    ring.visible = false;
    this.ring = ring;

    this.object.add(body, head, ring);
    scene.add(this.object);
  }

  setPosition(index: number): void {
    this.object.position.copy(boardPosition(this.map, index).add(this.offset));
  }

  get position(): THREE.Vector3 { return this.object.position.clone().sub(this.offset); }

  async moveAlong(
    path: readonly number[],
    onStep?: () => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const points = [
      this.object.position.clone(),
      ...worldPath(this.map, path, this.offset.y).map((position) =>
        position.add(new THREE.Vector3(this.offset.x, 0, this.offset.z)),
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
  setVisible(visible: boolean): void { this.object.visible = visible; }
  setActing(acting: boolean): void { this.ring.visible = acting; }
}
