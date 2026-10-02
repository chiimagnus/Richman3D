import { CITY } from "./city";
import type { MapDefinition } from "../board";

export function mapFor(id: string, version: number): MapDefinition {
  if (id !== CITY.id || version !== CITY.version) throw new Error("地图版本未知");
  return CITY;
}
