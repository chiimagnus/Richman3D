import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { PropertyState } from "../domain/types";

export function createPropertyBuilding(level: Exclude<PropertyState["level"], 0>, color: string): THREE.Group {
  const building = new THREE.Group();
  const height = [0, 0.55, 0.8, 1][level]!;
  const roofHeight = [0, 0.3, 0.28, 0.35][level]!;
  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.045);
  const material = new THREE.MeshStandardMaterial({ color: 0xffedcf, roughness: 0.72 });
  const base = new THREE.Mesh(box, material);
  base.name = "property-building-base";
  base.scale.set(1.1, 0.1, 1.1);
  base.position.y = 0.05;
  base.receiveShadow = true;
  building.add(base);
  const body = new THREE.Mesh(box, material);
  body.scale.set(0.9, height, 0.9);
  body.position.y = 0.1 + height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  building.add(body);
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x305a64, roughness: 0.45 });
  for (const horizontal of [-0.25, 0.25]) {
    const window = new THREE.Mesh(box, windowMaterial);
    window.scale.set(0.17, 0.17, 0.035);
    window.position.set(horizontal, 0.12 + height * 0.7, 0.46);
    building.add(window);
  }
  const roof = new THREE.Mesh(level === 2 ? box : new THREE.ConeGeometry(level === 1 ? 0.72 : 0.4, roofHeight, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
  if (level === 2) roof.scale.set(0.65, roofHeight, 0.65);
  roof.position.y = 0.1 + height + roofHeight / 2;
  if (level !== 2) roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  building.add(roof);
  const texture = createNumberTexture(level);
  const labelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const geometry = new THREE.PlaneGeometry(0.48, 0.48);
  const front = new THREE.Mesh(geometry, labelMaterial);
  front.position.set(0, 0.4, 0.455);
  const top = new THREE.Mesh(geometry, labelMaterial);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, 0.1 + height + roofHeight + 0.01, 0);
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
