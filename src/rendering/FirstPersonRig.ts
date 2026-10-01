import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

import { boardDirection, boardPosition, worldPath } from "./boardGeometry";
import { animatePositions } from "./motion";

const EYE_HEIGHT = 1.72;

export class FirstPersonRig {
  private readonly controls: PointerLockControls;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.controls = new PointerLockControls(camera, canvas);
  }

  setPosition(index: number): void {
    const position = boardPosition(index);
    this.camera.position.set(position.x, EYE_HEIGHT, position.z);
    this.faceBoardDirection(index);
  }

  async moveAlong(path: readonly number[]): Promise<void> {
    const points = [
      this.camera.position.clone(),
      ...worldPath(path, EYE_HEIGHT),
    ];
    const previous = this.camera.position.clone();
    const movement = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    await animatePositions(points, (position) => {
      this.camera.position.copy(position);

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
    });

    const destination = path.at(-1);
    if (destination !== undefined && !this.controls.isLocked) {
      this.faceBoardDirection(destination);
    }
  }

  lock(): void {
    if (!this.controls.isLocked) {
      this.controls.lock();
    }
  }

  unlock(): void {
    if (this.controls.isLocked) {
      this.controls.unlock();
    }
  }

  private faceBoardDirection(index: number): void {
    const direction = boardDirection(index);
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
