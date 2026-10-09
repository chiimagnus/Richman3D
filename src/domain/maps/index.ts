import { CITY } from "./city";
import { validateMap, type MapDefinition } from "../board";

export function validateMaps(maps: readonly MapDefinition[]): void {
  const identities = maps.map((map) => `${map.id}:${map.version}`);
  if (new Set(identities).size !== maps.length) throw new Error("地图版本重复");
  maps.forEach(validateMap);
}

export const MAPS: readonly MapDefinition[] = [CITY];
validateMaps(MAPS);

export function mapFor(id: string, version: number): MapDefinition {
  const map = MAPS.find((candidate) => candidate.id === id && candidate.version === version);
  if (!map) throw new Error("地图版本未知");
  return map;
}
