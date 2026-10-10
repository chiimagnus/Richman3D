import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const [directory, model] = process.argv.slice(2);
if (!directory || !model) throw new Error("Usage: node scripts/bake-scenery.mjs <OBJ directory> <model name>");
const png = readFileSync(join(directory, "Textures/colormap.png"));
const chunks = [];
let palette;
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (png.toString("hex", 0, 8) !== "89504e470d0a1a0a" || png[24] !== 8 || png[25] !== 3 || png[28] !== 0) throw new Error("Expected the pack's non-interlaced 8-bit indexed palette");
for (let offset = 8; offset < png.length;) {
  const size = png.readUInt32BE(offset);
  const type = png.toString("ascii", offset + 4, offset + 8);
  const data = png.subarray(offset + 8, offset + 8 + size);
  if (type === "PLTE") palette = data;
  if (type === "IDAT") chunks.push(data);
  offset += 12 + size;
}
if (!palette) throw new Error("Missing palette");
const pixels = inflateSync(Buffer.concat(chunks));
if (pixels.length !== height * (width + 1)) throw new Error("Unexpected palette size");
for (let row = 0; row < height; row += 1) if (pixels[row * (width + 1)] !== 0) throw new Error("Expected the pack's unfiltered palette rows");
const object = new OBJLoader().parse(readFileSync(join(directory, `${model}.obj`), "utf8"));
if (!object.children.length || object.children.some(child => !(child instanceof THREE.Mesh))) throw new Error("Expected static meshes");
const source = mergeGeometries(object.children.map(child => child.geometry));
if (!source) throw new Error("Could not merge model parts");
const uv = source.getAttribute("uv");
const colors = [];
const color = new THREE.Color();
for (let vertex = 0; vertex < uv.count; vertex += 1) {
  const horizontal = Math.min(width - 1, Math.max(0, Math.floor(uv.getX(vertex) * width)));
  const vertical = Math.min(height - 1, Math.max(0, Math.floor((1 - uv.getY(vertex)) * height)));
  const index = pixels[vertical * (width + 1) + horizontal + 1] * 3;
  color.setRGB(palette[index] / 255, palette[index + 1] / 255, palette[index + 2] / 255, THREE.SRGBColorSpace);
  colors.push(color.r, color.g, color.b);
}
source.deleteAttribute("uv");
source.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
source.clearGroups();
const geometry = mergeVertices(source);
geometry.computeBoundingBox();
const bounds = geometry.boundingBox;
geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
const data = geometry.toJSON();
delete data.uuid;
for (const attribute of Object.values(data.data.attributes)) attribute.array = attribute.array.map(value => Math.round(value * 100000) / 100000);
process.stdout.write(JSON.stringify(data));
