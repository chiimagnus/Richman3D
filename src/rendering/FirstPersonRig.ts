import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

import { boardDirection, boardPosition, worldPath } from "./boardGeometry";
import { animatePositions } from "./motion";
import { MotionClock } from "./MotionClock";
import type { MapDefinition } from "../domain/board";

const EYE_HEIGHT = 1.72;

export class FirstPersonRig {
  private readonly controls: PointerLockControls;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly clock: MotionClock,
    private readonly map: MapDefinition,
  ) {
    this.controls = new PointerLockControls(camera, canvas);
  }

  setPosition(index: number): void {
    const position = boardPosition(this.map, index);
    this.camera.position.set(position.x, EYE_HEIGHT, position.z);
    this.faceBoardDirection(index);
  }

  async moveAlong(
    path: readonly number[],
    onStep?: () => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const points = [
      this.camera.position.clone(),
      ...worldPath(this.map, path, EYE_HEIGHT),
    ];
    const previous = this.camera.position.clone();
    const movement = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    const finished = await animatePositions(
      this.clock,
      points,
      (position, frame) => {
        this.camera.position.copy(position);
        this.camera.position.y += Math.sin(Math.PI * frame.segmentProgress) * 0.08;

        if (!this.controls.isLocked) {
          movement.copy(position).sub(previous);
          movement.y = 0;

          if (movement.lengthSq() > 0.0001) {
            movement.normalize();
            lookTarget.copy(position).add(movement);
            this.camera.lookAt(lookTarget);
          }
        }

        previous.copy(position);
      },
      { onSegment: () => onStep?.(), signal },
    );

    const destination = path.at(-1);
    if (finished && destination !== undefined && !this.controls.isLocked) {
      this.faceBoardDirection(destination);
    }
  }

  setPointerSpeed(pointerSpeed: number): void {
    this.controls.pointerSpeed = pointerSpeed;
  }

  setEnabled(enabled: boolean): void { this.controls.enabled = enabled; if (!enabled) this.unlock(); }

  dispose(): void {
    this.unlock();
    this.controls.dispose();
  }

  lock(onFailure: () => void): void {
    if (this.controls.enabled && !this.controls.isLocked) {
      try {
        const request = this.canvas.requestPointerLock();
        if (request) void request.catch(onFailure);
      } catch { onFailure(); }
    }
  }

  unlock(): void {
    if (this.controls.isLocked) {
      this.controls.unlock();
    }
  }

  private faceBoardDirection(index: number): void {
    const direction = boardDirection(this.map, index);
    const lookTarget = this.camera.position
      .clone()
      .add(new THREE.Vector3(direction.x, 0, direction.z));
    this.camera.lookAt(lookTarget);
  }

  onLockChange(listener: (locked: boolean) => void): () => void {
    const handleLock = (): void => listener(true);
    const handleUnlock = (): void => listener(false);

    this.controls.addEventListener("lock", handleLock);
    this.controls.addEventListener("unlock", handleUnlock);

    return () => {
      this.controls.removeEventListener("lock", handleLock);
      this.controls.removeEventListener("unlock", handleUnlock);
    };
  }
}
