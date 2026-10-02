import * as THREE from "three";

import type { GameSnapshot, LandingResult } from "../domain/types";
import { messages } from "../i18n";
import type { Language } from "../settings/preferences";
import { BoardView } from "./BoardView";
import { FirstPersonRig } from "./FirstPersonRig";
import { PlayerView } from "./PlayerView";
import { MotionClock } from "./MotionClock";
import { disposeObject } from "./disposeObject";

export class World {
  readonly canvas: HTMLCanvasElement;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.08, 180);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly board: BoardView;
  private readonly bot: PlayerView;
  private readonly firstPerson: FirstPersonRig;
  private readonly clock = new MotionClock();
  private lastTime: number | null = null;
  private disposed = false;

  constructor(container: HTMLElement, language: Language) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "game-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", messages(language).worldAria);
    container.append(this.canvas);

    this.scene.background = new THREE.Color(0x07111a);
    this.scene.fog = new THREE.FogExp2(0x07111a, 0.016);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.addEnvironment();
    this.board = new BoardView(this.scene, language);
    this.bot = new PlayerView(this.scene, "#ffb75e", this.clock);
    this.firstPerson = new FirstPersonRig(this.camera, this.canvas, this.clock);

    this.resize();
    window.addEventListener("resize", this.resize);
    this.renderer.setAnimationLoop(this.render);
  }

  sync(snapshot: GameSnapshot): void {
    this.board.syncOwnership(snapshot);

    const human = snapshot.players.find((player) => player.id === "human");
    const bot = snapshot.players.find((player) => player.id === "bot");

    if (human) {
      this.firstPerson.setPosition(human.position);
    }

    if (bot) {
      this.bot.setPosition(bot.position);
    }
  }

  syncOwnership(snapshot: GameSnapshot): void {
    this.board.syncOwnership(snapshot);
  }

  moveHuman(path: readonly number[], onStep?: () => void, signal?: AbortSignal): Promise<void> {
    return this.firstPerson.moveAlong(path, onStep, signal);
  }

  moveBot(path: readonly number[], onStep?: () => void, signal?: AbortSignal): Promise<void> {
    return this.bot.moveAlong(path, onStep, signal);
  }

  landOnTile(index: number, landing: LandingResult): void {
    this.board.pulseTile(index, landing);
  }

  setLookSensitivity(pointerSpeed: number): void {
    this.firstPerson.setPointerSpeed(pointerSpeed);
  }

  setLanguage(language: Language): void {
    this.canvas.setAttribute("aria-label", messages(language).worldAria);
    this.board.setLanguage(language);
  }

  lockFirstPerson(): void {
    this.firstPerson.lock();
  }

  unlockFirstPerson(): void {
    this.firstPerson.unlock();
  }

  onPointerLockChange(listener: (locked: boolean) => void): () => void {
    return this.firstPerson.onLockChange(listener);
  }

  wait(duration: number, signal?: AbortSignal): Promise<boolean> {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return this.clock.animate(reduced ? 0 : duration, () => {}, signal);
  }

  cancelPresentation(): void { this.clock.cancel(); }

  get resourceInfo() {
    return { ...this.renderer.info.memory, activeAnimations: this.clock.activeCount, canvases: this.canvas.isConnected ? 1 : 0, disposed: this.disposed };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    this.clock.cancel();
    this.firstPerson.dispose();
    this.bot.dispose();
    this.board.dispose();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private readonly render = (time: number): void => {
    if (this.disposed) return;
    const delta = this.lastTime === null ? 0 : Math.max(time - this.lastTime, 0);
    this.lastTime = time;
    this.clock.update(delta);
    this.board.update(time);
    this.renderer.render(this.scene, this.camera);
  };

  private readonly resize = (): void => {
    const width = Math.max(this.canvas.parentElement?.clientWidth ?? window.innerWidth, 1);
    const height = Math.max(
      this.canvas.parentElement?.clientHeight ?? window.innerHeight,
      1,
    );

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private addEnvironment(): void {
    const hemisphere = new THREE.HemisphereLight(0xa8dfff, 0x081019, 1.5);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(12, 24, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 70;
    this.scene.add(keyLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(52, 64),
      new THREE.MeshStandardMaterial({
        color: 0x071821,
        roughness: 0.9,
        metalness: 0.04,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.22;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(72, 36, 0x1f6175, 0x123543);
    grid.position.y = -0.2;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.28;
    }
    this.scene.add(grid);
  }
}
