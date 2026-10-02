import * as THREE from "three";
import type { MapDefinition } from "../domain/board";
import { boardBounds } from "./boardGeometry";
import { FirstPersonRig } from "./FirstPersonRig";
import type { MotionClock } from "./MotionClock";

export type CameraView = "first_person" | "overview";

export class CameraRig {
  readonly firstPersonCamera = new THREE.PerspectiveCamera(68, 1, 0.08, 500);
  readonly overviewCamera = new THREE.PerspectiveCamera(50, 1, 0.08, 1000);
  readonly firstPerson: FirstPersonRig;
  private view: CameraView = "first_person";

  constructor(private readonly map: MapDefinition, canvas: HTMLCanvasElement, clock: MotionClock) {
    this.firstPerson = new FirstPersonRig(this.firstPersonCamera, canvas, clock, map);
    this.resize(1);
  }

  get camera(): THREE.PerspectiveCamera { return this.view === "overview" ? this.overviewCamera : this.firstPersonCamera; }
  get mode(): CameraView { return this.view; }

  setView(view: CameraView): void {
    this.view = view;
    this.firstPerson.setEnabled(view === "first_person");
  }

  resize(aspect: number): void {
    for (const camera of [this.firstPersonCamera, this.overviewCamera]) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    const bounds = boardBounds(this.map);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.overviewCamera.fov / 2));
    const height = Math.max(size.z, size.x / aspect) / (2 * tangent) * 1.65;
    this.overviewCamera.position.set(center.x, height, center.z + 0.001);
    this.overviewCamera.lookAt(center);
    this.overviewCamera.updateMatrixWorld();
  }

  dispose(): void { this.firstPerson.dispose(); }
}
