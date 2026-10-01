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

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  setPosition(index: number): void {
    const position = boardPosition(index);
    this.camera.position.set(position.x, EYE_HEIGHT, position.z);

    const direction = boardDirection(index);
    const lookTarget = this.camera.position
      .clone()
      .add(new THREE.Vector3(direction.x, 0, direction.z));
    this.camera.lookAt(lookTarget);
  }

  async moveAlong(path: readonly number[]): Promise<void> {
    const points = [
      this.camera.position.clone(),
      ...worldPath(path, EYE_HEIGHT),
    ];

    await animatePositions(points, (position) => {
      this.camera.position.copy(position);
    });
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
