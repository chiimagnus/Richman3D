import type { MapDefinition } from "../board";

export const CITY: MapDefinition = {
  id: "city", version: 1,
  tiles: [
    { type: "start", id: "start" },
    { type: "property", id: "harbor-walk", price: 140, rent: 24, group: "cyan" },
    { type: "chance", id: "chance-1" },
    { type: "property", id: "neon-avenue", price: 180, rent: 32, group: "cyan" },
    { type: "tax", id: "city-tax", amount: 80 },
    { type: "property", id: "metro-plaza", price: 220, rent: 40, group: "amber" },
    { type: "property", id: "skyline-road", price: 240, rent: 44, group: "amber" },
    { type: "chance", id: "chance-2" },
    { type: "property", id: "river-market", price: 200, rent: 36, group: "amber" },
    { type: "tax", id: "service-fee", amount: 100 },
    { type: "property", id: "central-station", price: 260, rent: 48, group: "violet" },
    { type: "chance", id: "chance-3" },
    { type: "property", id: "tech-park", price: 300, rent: 56, group: "violet" },
    { type: "property", id: "lakeside", price: 280, rent: 52, group: "violet" },
    { type: "tax", id: "luxury-tax", amount: 120 },
    { type: "property", id: "art-district", price: 320, rent: 62, group: "emerald" },
    { type: "chance", id: "chance-4" },
    { type: "property", id: "grand-boulevard", price: 360, rent: 72, group: "emerald" },
    { type: "property", id: "financial-center", price: 420, rent: 86, group: "emerald" },
    { type: "chance", id: "chance-5" },
  ],
  path: [
    { x: 10.5, z: 10.5 }, { x: 6.3, z: 10.5 }, { x: 2.1, z: 10.5 }, { x: -2.1, z: 10.5 }, { x: -6.3, z: 10.5 }, { x: -10.5, z: 10.5 },
    { x: -10.5, z: 6.3 }, { x: -10.5, z: 2.1 }, { x: -10.5, z: -2.1 }, { x: -10.5, z: -6.3 }, { x: -10.5, z: -10.5 },
    { x: -6.3, z: -10.5 }, { x: -2.1, z: -10.5 }, { x: 2.1, z: -10.5 }, { x: 6.3, z: -10.5 }, { x: 10.5, z: -10.5 },
    { x: 10.5, z: -6.3 }, { x: 10.5, z: -2.1 }, { x: 10.5, z: 2.1 }, { x: 10.5, z: 6.3 },
  ],
};
