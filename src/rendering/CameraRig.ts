import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MapDefinition } from "../domain/board";
import type { PlayerId } from "../domain/types";
import { boardBounds, boardPosition, TILE_SIZE } from "./boardGeometry";
import { FirstPersonRig } from "./FirstPersonRig";
import type { MotionClock } from "./MotionClock";

export type CameraView = "first_person" | "overview";

export class CameraRig {
  readonly firstPersonCamera = new THREE.PerspectiveCamera(68, 1, 0.08, 500);
  readonly overviewCamera = new THREE.PerspectiveCamera(50, 1, 0.08, 1000);
  readonly firstPerson: FirstPersonRig;
  private readonly overview: OrbitControls;
  private view: CameraView = "first_person";
  private interactive = true;
  private fitHeight = 0;
  private pointer: { id: number; x: number; y: number; moved: boolean } | null = null;
  following: PlayerId | null = null;

  constructor(private readonly map: MapDefinition, private readonly canvas: HTMLCanvasElement, clock: MotionClock, private readonly onInspect: (tileId: string) => void = () => {}) {
    this.firstPerson = new FirstPersonRig(this.firstPersonCamera, canvas, clock, map);
    this.overview = new OrbitControls(this.overviewCamera, canvas);
    this.overview.enablePan = false;
    this.overview.minPolarAngle = 0.08;
    this.overview.maxPolarAngle = Math.PI / 3;
    this.overview.target.copy(boardBounds(map).getCenter(new THREE.Vector3()));
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.cancelPointer);
    canvas.addEventListener("lostpointercapture", this.cancelPointer);
    this.overview.addEventListener("start", this.stopFollowing);
    this.resize(1);
    this.setView(this.view);
  }

  get camera(): THREE.PerspectiveCamera { return this.view === "overview" ? this.overviewCamera : this.firstPersonCamera; }
  get mode(): CameraView { return this.view; }

  setView(view: CameraView): void {
    if (view !== this.view) this.stopFollowing();
    this.view = view;
    this.setInteractive(this.interactive);
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    this.pointer = null;
    this.firstPerson.setEnabled(interactive && this.view === "first_person");
    this.overview.enabled = interactive && this.view === "overview";
  }

  focus(index: number, playerId: PlayerId): void {
    this.following = playerId;
    this.follow(boardPosition(this.map, index));
  }

  follow(position: THREE.Vector3): void {
    const target = new THREE.Vector3(position.x, 0, position.z);
    this.overviewCamera.position.add(target.clone().sub(this.overview.target));
    this.overview.target.copy(target);
    this.overview.update();
  }

  resize(aspect: number): void {
    for (const camera of [this.firstPersonCamera, this.overviewCamera]) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    const bounds = boardBounds(this.map);
    const size = bounds.getSize(new THREE.Vector3());
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.overviewCamera.fov / 2));
    const height = Math.max(size.z, size.x / aspect) / (2 * tangent) * 1.65;
    const offset = this.fitHeight === 0 ? new THREE.Vector3(0.22, 0.88, 0.42).normalize().multiplyScalar(height) : this.overviewCamera.position.clone().sub(this.overview.target).multiplyScalar(height / this.fitHeight);
    this.fitHeight = height;
    this.overview.minDistance = height * 0.6;
    this.overview.maxDistance = height * 1.25;
    this.overviewCamera.position.copy(this.overview.target).add(offset);
    this.overview.update();
    this.overviewCamera.updateMatrixWorld();
  }

  dispose(): void {
    this.firstPerson.dispose();
    this.overview.removeEventListener("start", this.stopFollowing);
    this.overview.dispose();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.cancelPointer);
    this.canvas.removeEventListener("lostpointercapture", this.cancelPointer);
    this.cancelPointer();
  }

  private readonly stopFollowing = (): void => { this.following = null; };
  private readonly cancelPointer = (): void => { this.pointer = null; };
  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.overview.enabled) return;
    if (this.pointer) { this.pointer.moved = true; return; }
    if (!event.isPrimary || event.button !== 0) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 8) this.pointer.moved = true;
  };
  private readonly pointerUp = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    this.pointer = null;
    if (!this.overview.enabled || pointer.moved || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) return;
    const rect = this.canvas.getBoundingClientRect();
    const point = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    const ray = new THREE.Raycaster();
    this.overviewCamera.updateMatrixWorld();
    ray.setFromCamera(point, this.overviewCamera);
    const position = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.205), new THREE.Vector3());
    if (!position) return;
    const index = this.map.path.findIndex((tile) => Math.abs(tile.x - position.x) <= TILE_SIZE / 2 && Math.abs(tile.z - position.z) <= TILE_SIZE / 2);
    if (index >= 0) { this.stopFollowing(); this.onInspect(this.map.tiles[index]!.id); }
  };
}
