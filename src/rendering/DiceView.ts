import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MotionClock } from "./MotionClock";
import { disposeObject } from "./disposeObject";

const FACE_NORMALS = [
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0),
];
const CORNERS = [[-0.22, -0.22], [-0.22, 0.22], [0.22, -0.22], [0.22, 0.22]] as const;
const PIPS = [
  [[0, 0]], [[-0.22, -0.22], [0.22, 0.22]], [[-0.22, -0.22], [0, 0], [0.22, 0.22]],
  CORNERS, [...CORNERS, [0, 0]], [...CORNERS, [-0.22, 0], [0.22, 0]],
] as const;

export class DiceView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-5, 5, 3.5, -3.5, 0.1, 30);
  private readonly dice = [new THREE.Group(), new THREE.Group()];

  constructor(private readonly clock: MotionClock) {
    const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
    const dot = new THREE.CircleGeometry(0.075, 16);
    const ivory = new THREE.MeshStandardMaterial({ color: 0xf0f8fc, roughness: 0.32 });
    const ink = new THREE.MeshBasicMaterial({ color: 0x102532 });
    for (const die of this.dice) {
      die.add(new THREE.Mesh(box, ivory));
      for (const [index, normal] of FACE_NORMALS.entries()) {
        const face = new THREE.Group();
        face.name = `dice-face-${index + 1}`;
        face.position.copy(normal).multiplyScalar(0.501);
        face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        for (const [horizontal, vertical] of PIPS[index]!) {
          const pip = new THREE.Mesh(dot, ink);
          pip.position.set(horizontal, vertical, 0);
          face.add(pip);
        }
        die.add(face);
      }
      die.visible = false;
      this.scene.add(die);
    }
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-3, 6, 4);
    this.scene.add(new THREE.AmbientLight(0xb8dfff, 1.5), light);
    this.camera.position.set(3, 7, 5);
    this.camera.lookAt(0, 0, 0);
  }

  resize(aspect: number): void {
    const height = Math.max(3.5, 1.65 / aspect);
    this.camera.left = -aspect * height;
    this.camera.right = aspect * height;
    this.camera.top = height;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
  }

  async roll(values: readonly [number, number], onSettled: () => void, signal: AbortSignal, reducedMotion: boolean): Promise<boolean> {
    if (signal.aborted) return false;
    const rotations = values.map((value) => new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[value - 1]!, new THREE.Vector3(0, 1, 0)));
    const spin = new THREE.Quaternion();
    const euler = new THREE.Euler();
    let settled = false;
    const write = (progress: number) => {
      const rolling = Math.min(progress / 0.75, 1);
      for (const [index, die] of this.dice.entries()) {
        die.visible = true;
        die.position.set(index === 0 ? -0.8 : 0.8, Math.abs(Math.sin(rolling * Math.PI * 4)) * (1 - rolling) * 0.65, 0);
        die.scale.setScalar(0.95 + Math.sin(rolling * Math.PI) * 0.05);
        euler.set((1 - rolling) * Math.PI * 6, (1 - rolling) * Math.PI * (index === 0 ? 4 : -4), (1 - rolling) * Math.PI * 2);
        spin.setFromEuler(euler);
        die.quaternion.copy(rotations[index]!).multiply(spin);
      }
      if (rolling === 1 && !settled) { settled = true; onSettled(); }
    };
    write(reducedMotion ? 1 : 0);
    const finished = await this.clock.animate(reducedMotion ? 200 : 800, (progress) => write(reducedMotion ? 1 : progress), signal);
    if (!finished) this.hide();
    return finished;
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (!this.dice[0]!.visible) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  hide(): void { for (const die of this.dice) die.visible = false; }
  dispose(): void { disposeObject(this.scene); }
}
