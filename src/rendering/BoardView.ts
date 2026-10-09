import * as THREE from "three";

import type { BoardTile, MapDefinition } from "../domain/board";
import type { RuleSet } from "../domain/rules";
import type { GameSnapshot, LandingResult, MatchConfig, PlayerId } from "../domain/types";
import { playerConfig } from "../domain/config";
import { formatMessage, messages, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { boardBounds, boardDirection, boardPosition, TILE_SIZE, TILE_SPACING } from "./boardGeometry";
import { disposeObject } from "./disposeObject";
import { completeGroup, rentFor } from "../domain/economy";
import { createNumberTexture, createPropertyBuilding } from "./PropertyBuilding";
import type { MotionClock } from "./MotionClock";

const GROUP_COLORS = {
  cyan: 0x1da9c5,
  amber: 0xd99a2b,
  violet: 0x8d64d8,
  emerald: 0x30a874,
  rose: 0xda6789,
} as const;

export class BoardView {
  private readonly object = new THREE.Group();
  private readonly selection = new THREE.Group();

  private readonly ownerMarkers = new Map<string, THREE.Mesh>();
  private readonly tileMaterials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly tileLabels = new Map<number, THREE.Mesh>();
  private readonly propertyFlags = new Map<string, THREE.Group>();
  private readonly tileDetails = new Map<number, string>();
  private readonly propertyBuildings = new Map<string, { level: number; ownerId: PlayerId; object: THREE.Group }>();
  private snapshot: GameSnapshot | null = null;

  constructor(
    scene: THREE.Scene,
    private language: Language,
    private readonly map: MapDefinition,
    private readonly config: MatchConfig,
    private readonly rules: RuleSet,
  ) {
    this.object.name = "board";
    scene.add(this.object);
    this.buildTiles();
    this.buildCenter();
    this.buildSelection();
  }

  setLanguage(language: Language): void {
    if (language === this.language) {
      return;
    }

    this.language = language;
    this.map.tiles.forEach((tile, index) => this.updateLabel(tile, index, true));
  }

  setSelectedTile(tileId: string | null): void {
    const index = this.map.tiles.findIndex((tile) => tile.id === tileId);
    this.selection.visible = index >= 0;
    if (index >= 0) this.selection.position.copy(boardPosition(this.map, index));
  }

  syncOwnership(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    for (const [index, tile] of this.map.tiles.entries()) {
      if (tile.type !== "property") {
        continue;
      }

      this.updateLabel(tile, index);
      this.syncBuilding(tile.id, index, snapshot);
      this.propertyFlags.get(tile.id)!.visible = completeGroup(snapshot, tile);
      const ownerId = snapshot.properties[tile.id]!.ownerId;
      const existing = this.ownerMarkers.get(tile.id);

      if (!ownerId) {
        if (existing) {
          disposeObject(existing);
        }
        this.ownerMarkers.delete(tile.id);
        continue;
      }

      if (existing) {
        const material = existing.material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(playerConfig(this.config, ownerId).color);
          material.emissive.set(playerConfig(this.config, ownerId).color);
        }
        if (existing.userData.ownerId !== ownerId) {
          const badge = existing.getObjectByName("owner-seat") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
          badge.material.map!.dispose();
          badge.material.map = createNumberTexture(this.config.players.findIndex((player) => player.id === ownerId) + 1);
          badge.material.needsUpdate = true;
          existing.userData.ownerId = ownerId;
        }
        continue;
      }

      const marker = this.createOwnerMarker(ownerId);
      marker.name = `owner-marker-${tile.id}`;
      const position = boardPosition(this.map, this.map.tiles.indexOf(tile));
      marker.position.set(
        position.x + TILE_SIZE * 0.32,
        0.48,
        position.z - TILE_SIZE * 0.32,
      );
      this.object.add(marker);
      this.ownerMarkers.set(tile.id, marker);
    }
  }

  private syncBuilding(propertyId: string, index: number, snapshot: GameSnapshot): void {
    const property = snapshot.properties[propertyId]!;
    const existing = this.propertyBuildings.get(propertyId);
    if (existing?.level === property.level && existing.ownerId === property.ownerId) return;
    if (existing) {
      disposeObject(existing.object);
      this.propertyBuildings.delete(propertyId);
    }
    if (property.level === 0 || property.ownerId === null) return;
    const building = createPropertyBuilding(property.level, playerConfig(this.config, property.ownerId).color);
    building.name = `property-building-${propertyId}`;
    const position = boardPosition(this.map, index);
    building.position.set(position.x - TILE_SIZE * 0.35, 0.2, position.z - TILE_SIZE * 0.35);
    this.object.add(building);
    this.propertyBuildings.set(propertyId, { level: property.level, ownerId: property.ownerId, object: building });
  }

  growProperty(propertyId: string, clock: MotionClock, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const building = this.propertyBuildings.get(propertyId)!.object;
    if (reducedMotion()) return Promise.resolve(true);
    building.scale.y = 0.2;
    return clock.animate(280, (progress) => { building.scale.y = 0.2 + 0.8 * (1 - (1 - progress) ** 3); }, signal)
      .finally(() => { building.scale.y = 1; });
  }

  private updateLabel(tile: BoardTile, index: number, force = false): void {
    const detail = tileDetail(tile, this.language, this.rules, this.snapshot);
    if (!force && this.tileDetails.get(index) === detail) return;
    const label = this.tileLabels.get(index)!;
    const material = label.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = createTileLabelTexture(tile, this.language, this.rules, detail);
    material.needsUpdate = true;
    this.tileDetails.set(index, detail);
  }

  popOwner(propertyId: string, clock: MotionClock, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const marker = this.ownerMarkers.get(propertyId)!;
    if (reducedMotion()) return Promise.resolve(true);
    marker.scale.setScalar(0.01);
    return clock.animate(300, progress => marker.scale.setScalar(Math.max(1 - (1 - progress) ** 3, 0.01)), signal)
      .finally(() => marker.scale.setScalar(1));
  }

  pulseTile(index: number, landing: LandingResult, clock: MotionClock, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const material = this.tileMaterials.get(index);
    if (!material) return Promise.resolve(true);
    material.emissive.setHex(pulseColor(landing));
    return clock.animate(reducedMotion() ? 0 : 720, progress => { material.emissiveIntensity = reducedMotion() ? 0 : Math.sin(Math.PI * progress) * 1.25; }, signal)
      .finally(() => {
        material.emissiveIntensity = 0;
        material.emissive.setHex(0x000000);
      });
  }

  private buildTiles(): void {
    const arrowGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0.28, 0, -0.19, -0.18, 0, 0.19, -0.18, 0], 3));
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xf5fbff });
    this.map.tiles.forEach((tile, index) => {
      const position = boardPosition(this.map, index);
      const tileGroup = new THREE.Group();
      this.object.add(tileGroup);
      tileGroup.position.copy(position);

      const baseMaterial = new THREE.MeshStandardMaterial({
        color: tileColor(tile),
        roughness: 0.72,
        metalness: 0.08,
      });
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE, 0.32, TILE_SIZE),
        baseMaterial,
      );
      this.tileMaterials.set(index, baseMaterial);
      base.castShadow = true;
      base.receiveShadow = true;
      tileGroup.add(base);

      const inset = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE - 0.18, 0.035, TILE_SIZE - 0.18),
        new THREE.MeshStandardMaterial({
          color: 0x142331,
          roughness: 0.55,
          metalness: 0.18,
        }),
      );
      inset.position.y = 0.18;
      inset.receiveShadow = true;
      tileGroup.add(inset);

      const label = createTileLabel(tile, this.language, this.rules);
      label.position.set(0, 0.205, 0);
      label.rotation.x = -Math.PI / 2;
      this.tileLabels.set(index, label);
      this.tileDetails.set(index, tileDetail(tile, this.language, this.rules));
      tileGroup.add(label);
      const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
      arrow.name = `forward-${tile.id}`;
      const direction = boardDirection(this.map, index);
      arrow.rotation.set(-Math.PI / 2, 0, 0);
      arrow.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-direction.x, -direction.z)));
      arrow.position.set(1.55, 0.23, 0.3);
      tileGroup.add(arrow);

      if (tile.type === "property") {
        if (tile.group === "rose") {
          const diamond = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          diamond.name = `rose-diamond-${tile.id}`;
          diamond.rotation.y = Math.PI / 4;
          diamond.position.set(-1.55, 0.23, 1.55);
          tileGroup.add(diamond);
        }
        const geometry = new THREE.BoxGeometry();
        const group = new THREE.Group();
        group.name = `complete-group-${tile.id}`;
        const groupMaterial = new THREE.MeshBasicMaterial({ color: GROUP_COLORS[tile.group] });
        for (const depth of [-1.65, -1.43]) {
          const band = new THREE.Mesh(geometry, groupMaterial);
          band.scale.set(2.95, 0.025, 0.08);
          band.position.set(0, 0.23, depth);
          group.add(band);
        }
        group.visible = false;
        tileGroup.add(group);
        this.propertyFlags.set(tile.id, group);
      }

    });
  }

  private buildSelection(): void {
    this.selection.name = "selected-tile";
    this.selection.visible = false;
    const geometry = new THREE.BoxGeometry(0.5, 0.035, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const horizontal of [-1, 1]) for (const depth of [-1, 1]) {
      const across = new THREE.Mesh(geometry, material);
      across.position.set(horizontal * 1.45, 0.26, depth * 1.75);
      const along = new THREE.Mesh(geometry, material);
      along.rotation.y = Math.PI / 2;
      along.position.set(horizontal * 1.75, 0.26, depth * 1.45);
      this.selection.add(across, along);
    }
    this.object.add(this.selection);
  }

  dispose(): void {
    disposeObject(this.object);
    this.ownerMarkers.clear();
    this.tileMaterials.clear();
    this.tileLabels.clear();
    this.propertyFlags.clear();
    this.tileDetails.clear();
    this.propertyBuildings.clear();
    this.snapshot = null;
  }

  private buildCenter(): void {
    if (this.map.id === "harbor") { this.buildHarbor(); return; }
    const centerSize = TILE_SPACING * 4.15;
    const bounds = boardBounds(this.map);
    const size = bounds.getSize(new THREE.Vector3());
    const interior = Math.min(size.x, size.z) - TILE_SIZE * 2;
    if (interior <= 0) return;
    const city = new THREE.Group();
    city.name = "city-decoration";
    city.position.copy(bounds.getCenter(new THREE.Vector3()));
    city.scale.set(interior / centerSize, 0.14, interior / centerSize);
    this.object.add(city);
    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(centerSize, 0.2, centerSize),
      new THREE.MeshStandardMaterial({
        color: 0x0d1f2d,
        roughness: 0.6,
        metalness: 0.25,
      }),
    );
    plaza.position.y = -0.04;
    plaza.receiveShadow = true;
    city.add(plaza);

    const buildings = [
      [-5.8, -5.4, 2.7, 6.2],
      [-1.9, -5.2, 2.4, 4.4],
      [2.2, -5.6, 3.1, 7.6],
      [5.8, -4.2, 2.2, 5.1],
      [-5.4, -0.7, 2.5, 4.1],
      [5.2, 0.3, 2.9, 6.8],
      [-5.9, 4.6, 2.4, 5.6],
      [-1.7, 5.5, 3.0, 7.1],
      [2.4, 5.1, 2.5, 4.9],
      [5.8, 4.7, 2.2, 6.1],
    ] as const;

    const towerGeometry = new THREE.BoxGeometry();
    const towerMaterials = [0x1b394b, 0x244d63].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.28 }));
    for (const [x, z, footprint, height] of buildings) {
      const building = new THREE.Mesh(
        towerGeometry,
        towerMaterials[height > 6 ? 1 : 0],
      );
      building.scale.set(footprint, height, footprint);
      building.position.set(x, height / 2 + 0.08, z);
      building.castShadow = true;
      building.receiveShadow = true;
      city.add(building);
    }

    const monument = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.2, 0.26, 96, 12),
      new THREE.MeshStandardMaterial({
        color: 0x53d6e8,
        emissive: 0x123849,
        emissiveIntensity: 0.65,
        metalness: 0.75,
        roughness: 0.22,
      }),
    );
    monument.position.y = 2.3;
    monument.scale.setScalar(0.72);
    monument.castShadow = true;
    city.add(monument);
  }

  private buildHarbor(): void {
    const harbor = new THREE.Group();
    harbor.name = "harbor-decoration";
    const bounds = boardBounds(this.map);
    const size = bounds.getSize(new THREE.Vector3());
    harbor.position.copy(bounds.getCenter(new THREE.Vector3()));
    this.object.add(harbor);
    const geometry = new THREE.BoxGeometry();
    const water = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x153e59, roughness: 0.25, metalness: 0.35 }));
    water.scale.set(size.x - TILE_SIZE * 2, 0.12, size.z - TILE_SIZE * 2);
    water.position.y = -0.08;
    water.receiveShadow = true;
    harbor.add(water);
    const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x8c7e6d, roughness: 0.8 });
    for (const position of [-6, 0, 6]) {
      const dock = new THREE.Mesh(geometry, dockMaterial);
      dock.scale.set(1.5, 0.18, 6);
      dock.position.set(position, 0.08, -6);
      dock.receiveShadow = true;
      harbor.add(dock);
    }
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xcedde4, roughness: 0.55 });
    for (const position of [-6, 0, 6]) {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 0.4, 6), hullMaterial);
      hull.scale.set(1, 1, 2.5);
      hull.position.set(position + 1.4, 0.15, -4);
      hull.castShadow = true;
      harbor.add(hull);
    }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.2, 8), hullMaterial);
    beacon.position.set(0, 0.6, 4);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd78c, emissive: 0xffbb55, emissiveIntensity: 0.7 }));
    light.position.set(0, 1.4, 4);
    harbor.add(beacon, light);
  }

  private createOwnerMarker(ownerId: PlayerId): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.4, 0.52, 8),
      new THREE.MeshStandardMaterial({
        color: playerConfig(this.config, ownerId).color,
        emissive: playerConfig(this.config, ownerId).color,
        emissiveIntensity: 0.18,
        roughness: 0.45,
      }),
    );
    const material = new THREE.MeshBasicMaterial({ map: createNumberTexture(this.config.players.findIndex((player) => player.id === ownerId) + 1) });
    const geometry = new THREE.PlaneGeometry(0.48, 0.48);
    const front = new THREE.Mesh(geometry, material);
    front.name = "owner-seat";
    front.position.z = 0.405;
    const top = new THREE.Mesh(geometry, material);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.265;
    marker.add(front, top);
    marker.userData.ownerId = ownerId;
    marker.castShadow = true;
    return marker;
  }
}

function pulseColor(landing: LandingResult): number {
  switch (landing.kind) {
    case "rent":
    case "tax":
      return 0xff5f6d;
    case "chance":
      return landing.amount >= 0 ? 0x62e2aa : 0xb58cff;
    case "movement_card":
    case "item_received":
    case "rent_waived":
    case "chance_ignored": return 0xb58cff;
    case "property_available":
      return 0xffc66e;
    case "property_owned":
    case "start":
      return 0x62e2aa;
  }
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function tileColor(tile: BoardTile): number {
  switch (tile.type) {
    case "start":
      return 0x2b9aaa;
    case "chance":
      return 0x7f5bd1;
    case "tax":
      return 0xa84f53;
    case "property":
      return GROUP_COLORS[tile.group];
  }
}

function createTileLabel(tile: BoardTile, language: Language, rules: RuleSet): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 2.325),
    new THREE.MeshBasicMaterial({
      map: createTileLabelTexture(tile, language, rules),
      transparent: true,
      depthWrite: false,
    }),
  );
}

function createTileLabelTexture(
  tile: BoardTile,
  language: Language,
  rules: RuleSet,
  detail = tileDetail(tile, language, rules),
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法创建棋盘文字画布");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(6, 17, 27, 0.82)";
  roundedRect(context, 24, 24, 464, 336, 28);
  context.fill();

  context.fillStyle = "#f5fbff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 48px system-ui, sans-serif";
  const detailTop = drawWrappedText(context, tileName(language, tile), language, 80, 56) + 12;

  context.fillStyle = "rgba(224, 241, 249, 0.72)";
  context.font = "600 28px system-ui, sans-serif";
  drawWrappedText(context, detail, language, detailTop, 38);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, language: Language, top: number, lineHeight: number): number {
  const words = new Intl.Segmenter(language, { granularity: "word" });
  const graphemes = new Intl.Segmenter(language, { granularity: "grapheme" });
  const segments = [...words.segment(text)].flatMap(({ segment }) => context.measureText(segment).width > 420
    ? [...graphemes.segment(segment)].map((entry) => entry.segment) : [segment]);
  let line = "";
  let baseline = top;
  for (const segment of segments) {
    if (line.trim() && context.measureText(line + segment).width > 420) {
      context.fillText(line.trim(), 256, baseline);
      baseline += lineHeight;
      line = segment.trimStart();
    } else line += segment;
  }
  if (line.trim()) context.fillText(line.trim(), 256, baseline);
  return baseline + lineHeight;
}

export function tileDetail(tile: BoardTile, language: Language, rules: RuleSet, snapshot: GameSnapshot | null = null): string {
  const copy = messages(language).board;

  switch (tile.type) {
    case "start":
      return formatMessage(copy.startDetail, { amount: rules.passStartBonus });
    case "chance":
      return copy.chanceDetail;
    case "tax":
      return `-${tile.amount}`;
    case "property":
      return formatMessage(copy.propertyDetail, {
        price: tile.price,
        rent: snapshot ? rentFor(snapshot, tile.id) : tile.rent,
      });
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}
