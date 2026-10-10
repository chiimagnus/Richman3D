import { normalizeName } from "../domain/config";
import { MAPS } from "../domain/maps";
import { QUICK_RULES, STANDARD_RULES } from "../domain/rules";
import type { Command, GameEvent, GameReadSnapshot, GameSnapshot, PlayerId } from "../domain/types";

export const ROOM_TTL = 24 * 60 * 60 * 1000;
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{8}$/;
export const ROOM_TOKEN = /^[a-f0-9]{64}$/;
export const PROTOCOL_VERSION = 1;
export type RoomOptions = { readonly seats: number; readonly mapId: string; readonly rulesVersion: string };
export type RoomMember = { readonly id: PlayerId; readonly name: string | null; readonly connected: boolean };
export type RoomState = {
  readonly code: string;
  readonly options: RoomOptions;
  readonly members: readonly RoomMember[];
  readonly playerId: PlayerId;
  readonly expiresAt: number;
  readonly snapshot: GameReadSnapshot | null;
};
export type RoomError = "invalid_request" | "not_found" | "full" | "started" | "forbidden" | "not_ready" | "stale_revision" | "illegal_action" | "storage_failed" | "rate_limited" | "incompatible";
export type ServerMessage = { readonly version: typeof PROTOCOL_VERSION } & (
  { readonly kind: "state"; readonly room: RoomState; readonly events: readonly GameEvent[]; readonly reset: boolean }
  | { readonly kind: "error"; readonly error: RoomError });
export type ClientMessage = { readonly kind: "start" }
  | { readonly kind: "command"; readonly command: Command };

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function roomOptions(value: unknown): RoomOptions {
  if (!object(value) || Object.keys(value).length !== 3 || !Number.isInteger(value.seats) || Number(value.seats) < 2 || Number(value.seats) > 4 ||
      typeof value.mapId !== "string" || !MAPS.some((map) => map.id === value.mapId) ||
      typeof value.rulesVersion !== "string" || ![QUICK_RULES.version, STANDARD_RULES.version].includes(value.rulesVersion)) throw new Error("invalid_request");
  return { seats: Number(value.seats), mapId: value.mapId, rulesVersion: value.rulesVersion };
}

export function memberInput(value: unknown, creating: boolean) {
  if (!object(value) || Object.keys(value).length !== (creating ? 3 : 2) || typeof value.token !== "string" || !ROOM_TOKEN.test(value.token) ||
      typeof value.name !== "string") throw new Error("invalid_request");
  return { token: value.token, name: normalizeName(value.name), options: creating ? roomOptions(value.options) : null };
}

export function projectGame(snapshot: GameSnapshot, playerId: PlayerId): GameReadSnapshot {
  const { random: _random, deck: _deck, config, players, ...publicState } = snapshot;
  const { seed: _seed, ...publicConfig } = config;
  return { ...publicState, config: publicConfig, players: players.map((player) => ({ ...player, hand: player.id === playerId ? player.hand : null })) };
}
