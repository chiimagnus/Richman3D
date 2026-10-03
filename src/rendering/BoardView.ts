import * as THREE from "three";

import type { BoardTile, MapDefinition } from "../domain/board";
import type { RuleSet } from "../domain/rules";
import type { GameSnapshot, LandingResult, MatchConfig, PlayerId } from "../domain/types";
import { playerConfig } from "../domain/config";
import { formatMessage, messages, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { boardPosition, TILE_SIZE, TILE_SPACING } from "./boardGeometry";
import { disposeObject } from "./disposeObject";
import { rentFor } from "../domain/economy";
import { createPropertyBuilding } from "./PropertyBuilding";

const GROUP_COLORS = {
  cyan: 0x1da9c5,
  amber: 0xd99a2b,
  violet: 0x8d64d8,
  emerald: 0x30a874,
} as const;

export class BoardView {
  private readonly object = new THREE.Group();

  private readonly ownerMarkers = new Map<string, THREE.Mesh>();
  private readonly tileMaterials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly tileLabels = new Map<number, THREE.Mesh>();
  private readonly tilePulses = new Map<number, number>();
  private readonly markerPops = new Map<THREE.Mesh, number>();
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
  }

  setLanguage(language: Language): void {
    if (language === this.language) {
      return;
    }

    this.language = language;
    this.map.tiles.forEach((tile, index) => this.updateLabel(tile, index, true));
  }

  syncOwnership(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    for (const [index, tile] of this.map.tiles.entries()) {
      if (tile.type !== "property") {
        continue;
      }

      this.updateLabel(tile, index);
      this.syncBuilding(tile.id, index, snapshot);
      const ownerId = snapshot.properties[tile.id]!.ownerId;
      const existing = this.ownerMarkers.get(tile.id);

      if (!ownerId) {
        if (existing) {
          this.markerPops.delete(existing);
          disposeObject(existing);
        }
        this.ownerMarkers.delete(tile.id);
        continue;
      }

      if (existing) {
        const material = existing.material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(playerConfig(this.config, ownerId).color);
        }
        continue;
      }

      const marker = this.createOwnerMarker(ownerId);
      const position = boardPosition(this.map, this.map.tiles.indexOf(tile));
      marker.position.set(
        position.x + TILE_SIZE * 0.32,
        0.72,
        position.z - TILE_SIZE * 0.32,
      );
      if (!reducedMotion()) {
        marker.scale.setScalar(0.01);
        this.markerPops.set(marker, performance.now());
      }
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
    building.position.set(position.x - TILE_SIZE * 0.28, 0.2, position.z - TILE_SIZE * 0.28);
    this.object.add(building);
    this.propertyBuildings.set(propertyId, { level: property.level, ownerId: property.ownerId, object: building });
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

  pulseTile(index: number, landing: LandingResult): void {
    const material = this.tileMaterials.get(index);
    if (!material) {
      return;
    }

    material.emissive.setHex(pulseColor(landing));

    this.tilePulses.set(index, performance.now());
  }

  update(now: number): void {
    for (const [index, startedAt] of this.tilePulses) {
      const material = this.tileMaterials.get(index);
      if (!material) {
        this.tilePulses.delete(index);
        continue;
      }

      const progress = Math.min((now - startedAt) / (reducedMotion() ? 120 : 720), 1);
      material.emissiveIntensity = Math.sin(Math.PI * progress) * 1.25;

      if (progress >= 1) {
        material.emissiveIntensity = 0;
        material.emissive.setHex(0x000000);
        this.tilePulses.delete(index);
      }
    }

    for (const [marker, startedAt] of this.markerPops) {
      const progress = Math.min((now - startedAt) / 300, 1);
      const eased = 1 - (1 - progress) ** 3;
      marker.scale.setScalar(Math.max(eased, 0.01));

      if (progress >= 1) {
        marker.scale.setScalar(1);
        this.markerPops.delete(marker);
      }
    }
  }

  private buildTiles(): void {
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

    });
  }

  dispose(): void {
    disposeObject(this.object);
    this.ownerMarkers.clear();
    this.tileMaterials.clear();
    this.tileLabels.clear();
    this.tilePulses.clear();
    this.markerPops.clear();
    this.tileDetails.clear();
    this.propertyBuildings.clear();
    this.snapshot = null;
  }

  private buildCenter(): void {
    const centerSize = TILE_SPACING * 4.15;
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
    this.object.add(plaza);

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

    for (const [x, z, footprint, height] of buildings) {
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(footprint, height, footprint),
        new THREE.MeshStandardMaterial({
          color: height > 6 ? 0x244d63 : 0x1b394b,
          roughness: 0.5,
          metalness: 0.28,
        }),
      );
      building.position.set(x, height / 2 + 0.08, z);
      building.castShadow = true;
      building.receiveShadow = true;
      this.object.add(building);
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
    this.object.add(monument);
  }

  private createOwnerMarker(ownerId: PlayerId): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.2, 8),
      new THREE.MeshStandardMaterial({
        color: playerConfig(this.config, ownerId).color,
        emissive: playerConfig(this.config, ownerId).color,
        emissiveIntensity: 0.18,
        roughness: 0.45,
      }),
    );
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
    new THREE.PlaneGeometry(3.1, 1.55),
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
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法创建棋盘文字画布");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(6, 17, 27, 0.82)";
  roundedRect(context, 24, 24, 464, 208, 28);
  context.fill();

  context.fillStyle = "#f5fbff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 48px system-ui, sans-serif";
  context.fillText(tileName(language, tile), 256, 105, 420);

  context.fillStyle = "rgba(224, 241, 249, 0.72)";
  context.font = "600 28px system-ui, sans-serif";
  context.fillText(detail, 256, 166, 420);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
      if (snapshot && snapshot.properties[tile.id]!.mortgagePrincipal > 0) return formatMessage(copy.mortgagedDetail, { principal: snapshot.properties[tile.id]!.mortgagePrincipal, rent: rentFor(snapshot, tile.id) });
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
