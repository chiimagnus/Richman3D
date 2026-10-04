import * as THREE from "three";
import type { PropertyState } from "../domain/types";

export function createPropertyBuilding(level: Exclude<PropertyState["level"], 0>, color: string): THREE.Group {
  const building = new THREE.Group();
  const height = [0, 0.8, 1.5, 2.3][level]!;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, height, 0.9), new THREE.MeshStandardMaterial({ color: 0xcee2e8, roughness: 0.65 }));
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  building.add(body);
  const roof = new THREE.Mesh(level === 1 ? new THREE.ConeGeometry(0.72, 0.4, 4) : level === 2 ? new THREE.BoxGeometry(0.65, 0.35, 0.65) : new THREE.ConeGeometry(0.4, 0.9, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
  roof.position.y = height + (level === 1 ? 0.2 : level === 2 ? 0.175 : 0.45);
  if (level !== 2) roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  building.add(roof);
  const texture = createNumberTexture(level);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const geometry = new THREE.PlaneGeometry(0.48, 0.48);
  const front = new THREE.Mesh(geometry, material);
  front.position.set(0, 0.4, 0.455);
  const top = new THREE.Mesh(geometry, material);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, height + (level === 1 ? 0.41 : level === 2 ? 0.36 : 0.91), 0);
  building.add(front, top);
  return building;
}

export function createNumberTexture(number: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建棋盘数字画布");
  context.fillStyle = "#09212c";
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
