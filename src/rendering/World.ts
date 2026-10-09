import * as THREE from "three";

import type { GameSnapshot, LandingResult, MatchConfig, PlayerId } from "../domain/types";
import type { MapDefinition } from "../domain/board";
import type { RuleSet } from "../domain/rules";
import { observerId } from "../domain/config";
import { messages } from "../i18n";
import type { Language } from "../i18n/language";
import { BoardView } from "./BoardView";
import { CameraRig, type CameraView } from "./CameraRig";
import { PlayerView } from "./PlayerView";
import { MotionClock } from "./MotionClock";
import { disposeObject } from "./disposeObject";
import { DiceView } from "./DiceView";
import { PRESENTATION_RATES, type PresentationSpeed } from "../settings/preferences";

export class World {
  readonly canvas: HTMLCanvasElement;

  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly board: BoardView;
  private readonly players = new Map<PlayerId, PlayerView>();
  private readonly cameraRig: CameraRig;
  private observer: PlayerId | null;
  private readonly clock = new MotionClock();
  private readonly dice: DiceView;
  private lastTime: number | null = null;
  private disposed = false;

  constructor(container: HTMLElement, language: Language, config: MatchConfig, map: MapDefinition, rules: RuleSet, private readonly onFailure: () => void = () => {}, onInspect: (tileId: string) => void = () => {}) {
    this.observer = observerId(config);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "game-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", messages(language).worldAria);
    this.canvas.setAttribute("aria-keyshortcuts", "L");
    container.append(this.canvas);

    let disconnectControls = () => {};
    let disposeDice = () => {};
    try {

    this.dice = new DiceView(this.clock);
    disposeDice = () => this.dice.dispose();

    this.scene.background = new THREE.Color(0xd8e9e5);
    this.scene.fog = new THREE.FogExp2(0xd8e9e5, 0.012);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.autoClear = false;

    this.addEnvironment();
    this.board = new BoardView(this.scene, language, map, config, rules);
    config.players.forEach((player, index) => this.players.set(player.id, new PlayerView(this.scene, player.color, this.clock, map, index)));
    this.cameraRig = new CameraRig(map, this.canvas, this.clock, onInspect);
    disconnectControls = () => this.cameraRig.dispose();

    this.resize();
    window.addEventListener("resize", this.resize);
    this.renderer.setAnimationLoop(this.render);
    } catch (error) {
      disconnectControls();
      window.removeEventListener("resize", this.resize);
      disposeObject(this.scene);
      disposeDice();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.canvas.remove();
      throw error;
    }
  }

  sync(snapshot: GameSnapshot): void {
    this.board.syncOwnership(snapshot);

    for (const player of snapshot.players) {
      this.players.get(player.id)?.setPosition(player.position);
      this.players.get(player.id)!.setActing(snapshot.decision.kind !== "game_over" && snapshot.decision.actorId === player.id);
      if (player.id === this.observer) this.cameraRig.firstPerson.setPosition(player.position);
    }
  }

  setSelectedTile(tileId: string | null): void { this.board.setSelectedTile(tileId); }
  growProperty(propertyId: string, signal: AbortSignal): Promise<boolean> { return this.board.growProperty(propertyId, this.clock, signal); }
  popOwner(propertyId: string, signal: AbortSignal): Promise<boolean> { return this.board.popOwner(propertyId, this.clock, signal); }

  setObserver(id: PlayerId | null, snapshot: GameSnapshot): void {
    if (id === this.observer) return;
    this.unlockFirstPerson();
    this.observer = id;
    const player = snapshot.players.find((candidate) => candidate.id === id);
    if (player) this.cameraRig.firstPerson.setPosition(player.position);
    this.setView(id === null ? "overview" : this.cameraRig.mode);
  }

  async movePlayer(id: PlayerId, path: readonly number[], onStep?: () => void, signal?: AbortSignal): Promise<void> {
    await Promise.all([
      this.players.get(id)?.moveAlong(path, onStep, signal),
      id === this.observer ? this.cameraRig.firstPerson.moveAlong(path, undefined, signal) : undefined,
    ]);
  }

  teleportPlayer(id: PlayerId, to: number): void {
    this.players.get(id)!.setPosition(to);
    if (id === this.observer) this.cameraRig.firstPerson.setPosition(to);
  }

  setView(view: CameraView): void {
    this.cameraRig.setView(view);
    for (const [id, player] of this.players) player.setVisible(view === "overview" || id !== this.observer);
    this.scene.fog = view === "overview" ? null : new THREE.FogExp2(0xd8e9e5, 0.012);
  }

  setInteractive(interactive: boolean): void { this.cameraRig.setInteractive(interactive); }
  centerCurrent(snapshot: GameSnapshot): void {
    const player = snapshot.players.find((player) => player.id === snapshot.turnPlayerId)!;
    this.cameraRig.focus(player.position, player.id);
  }

  landOnTile(index: number, landing: LandingResult, signal: AbortSignal): void {
    void this.board.pulseTile(index, landing, this.clock, signal);
  }

  setLookSensitivity(pointerSpeed: number): void {
    this.cameraRig.firstPerson.setPointerSpeed(pointerSpeed);
  }

  setPresentationSpeed(speed: PresentationSpeed): void { this.clock.setPlaybackRate(PRESENTATION_RATES[speed]); }
  setHeadBobEnabled(enabled: boolean): void { this.cameraRig.firstPerson.setHeadBobEnabled(enabled); }

  setLanguage(language: Language): void {
    this.canvas.setAttribute("aria-label", messages(language).worldAria);
    this.board.setLanguage(language);
  }

  lockFirstPerson(onFailure: () => void): void {
    this.cameraRig.firstPerson.lock(onFailure);
  }

  unlockFirstPerson(): void {
    this.cameraRig.firstPerson.unlock();
  }

  wait(duration: number, signal?: AbortSignal): Promise<boolean> {
    return this.clock.animate(duration, () => {}, signal);
  }

  rollDice(values: readonly [number, number], signal: AbortSignal, onSettled: () => void): Promise<boolean> {
    return this.dice.roll(values, onSettled, signal, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  hideDice(): void { this.dice.hide(); }
  cancelPresentation(): void { this.clock.cancel(); this.dice.hide(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    this.clock.cancel();
    this.cameraRig.dispose();
    this.dice.dispose();
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
    this.board.dispose();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private readonly render = (time: number): void => {
    if (this.disposed) return;
    try {
    const delta = this.lastTime === null ? 0 : Math.max(time - this.lastTime, 0);
    this.lastTime = time;
    this.clock.update(delta);
    const following = this.cameraRig.following;
    if (following !== null) this.cameraRig.follow(this.players.get(following)!.position);
    this.renderer.clear();
    this.renderer.render(this.scene, this.cameraRig.camera);
    this.dice.render(this.renderer);
    } catch {
      this.renderer.setAnimationLoop(null);
      this.clock.cancel();
      this.onFailure();
    }
  };

  private readonly resize = (): void => {
    const width = Math.max(this.canvas.parentElement?.clientWidth ?? window.innerWidth, 1);
    const height = Math.max(
      this.canvas.parentElement?.clientHeight ?? window.innerHeight,
      1,
    );

    this.cameraRig.resize(width / height);
    this.dice.resize(width / height);
    this.renderer.setSize(width, height, false);
  };

  private addEnvironment(): void {
    const hemisphere = new THREE.HemisphereLight(0xe5f4ff, 0xc6b593, 2);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffecd1, 3);
    keyLight.position.set(-18, 28, 14);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 70;
    keyLight.shadow.normalBias = 0.03;
    keyLight.shadow.bias = -0.0001;
    this.scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xc7e8ed, 0.7);
    fill.position.set(14, 12, -18);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(52, 64),
      new THREE.MeshStandardMaterial({
        color: 0xd8e9e5,
        roughness: 0.9,
        metalness: 0.04,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.82;
    ground.receiveShadow = true;
    this.scene.add(ground);

  }
}
