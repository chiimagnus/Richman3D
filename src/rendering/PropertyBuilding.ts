import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { PropertyState } from "../domain/types";
import { createHouseGeometry } from "./SceneryModels";

export function createPropertyBuilding(level: Exclude<PropertyState["level"], 0>, color: string): THREE.Group {
  const building = new THREE.Group();
  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.045);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const base = new THREE.Mesh(box, material);
  base.name = "property-building-base";
  base.scale.set(1.1, 0.1, 1.1);
  base.position.y = 0.05;
  base.receiveShadow = true;
  building.add(base);
  const geometry = createHouseGeometry(level);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const scale = 1.05 / Math.max(size.x, size.z);
  const house = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }));
  house.name = "property-building-house";
  house.scale.setScalar(scale);
  house.position.y = 0.1;
  house.castShadow = true;
  house.receiveShadow = true;
  building.add(house);
  const texture = createNumberTexture(level);
  const labelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const labelGeometry = new THREE.PlaneGeometry(0.28, 0.28);
  const front = new THREE.Mesh(labelGeometry, labelMaterial);
  front.position.set(0, 0.25, 0.535);
  const top = new THREE.Mesh(labelGeometry, labelMaterial);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0.25, 0.1 + size.y * scale + 0.01, 0);
  building.add(front, top);
  return building;
}

export function createNumberTexture(number: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建棋盘数字画布");
  context.fillStyle = "#244f57";
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "#ffffff";
  context.font = "700 96px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(number), 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
