import { integer, record, sameData, restoreSnapshot } from "../domain/restore";
import { rulesFor } from "../domain/rules";
import { mapFor } from "../domain/maps";
import type { GameSnapshot, SavedGameState } from "../domain/types";

export type SaveRecord = {
  readonly schemaVersion: 1;
  readonly matchId: string;
  readonly revision: number;
  readonly mapId: string;
  readonly mapVersion: number;
  readonly rulesVersion: string;
  readonly savedAt: number;
  readonly source: "local" | "imported";
  readonly state: SavedGameState;
};

export type SaveIdentity = Pick<SaveRecord, "matchId" | "revision">;
export type StoredGame = { readonly record: SaveRecord; readonly snapshot: GameSnapshot };
export class SaveError extends Error {
  constructor(readonly kind: "unavailable" | "invalid" | "incompatible" | "conflict", options?: ErrorOptions) { super(kind, options); }
}

export function readSave(value: unknown): StoredGame {
  try {
    const raw = record(value);
    if (raw.schemaVersion !== 1) throw new SaveError("incompatible");
    record(raw, ["schemaVersion", "matchId", "revision", "mapId", "mapVersion", "rulesVersion", "savedAt", "source", "state"]);
    if (typeof raw.matchId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(raw.matchId)) throw new Error("对局标识无效");
    integer(raw.revision);
    integer(raw.savedAt, 0, 8_640_000_000_000_000);
    if (raw.source !== "local" && raw.source !== "imported") throw new Error("来源无效");
    const state = record(raw.state);
    const config = record(state.config);
    if (raw.revision !== state.revision || raw.mapId !== config.mapId || raw.mapVersion !== config.mapVersion || raw.rulesVersion !== config.rulesVersion) throw new Error("存档版本不匹配");
    if (typeof raw.rulesVersion !== "string" || typeof raw.mapId !== "string") throw new Error("版本无效");
    integer(raw.mapVersion, 1);
    try { rulesFor(raw.rulesVersion); mapFor(raw.mapId, raw.mapVersion as number); }
    catch (cause) { throw new SaveError("incompatible", { cause }); }
    const snapshot = restoreSnapshot(state);
    const { rules: _rules, map: _map, ...savedState } = snapshot;
    const result: SaveRecord = { schemaVersion: 1, matchId: raw.matchId, revision: raw.revision as number, savedAt: raw.savedAt as number,
      source: raw.source, mapId: snapshot.config.mapId, mapVersion: snapshot.config.mapVersion, rulesVersion: snapshot.config.rulesVersion, state: savedState };
    return { record: result, snapshot };
  } catch (cause) {
    if (cause instanceof SaveError) throw cause;
    throw new SaveError("invalid", { cause });
  }
}

export function makeSave(snapshot: GameSnapshot, matchId: string, source: SaveRecord["source"] = "local", savedAt = Date.now()): SaveRecord {
  if (!sameData(snapshot.rules, rulesFor(snapshot.config.rulesVersion)) || !sameData(snapshot.map, mapFor(snapshot.config.mapId, snapshot.config.mapVersion))) throw new SaveError("invalid");
  const { rules: _rules, map: _map, ...state } = snapshot;
  return readSave({ schemaVersion: 1, matchId, revision: snapshot.revision, mapId: snapshot.config.mapId, mapVersion: snapshot.config.mapVersion,
    rulesVersion: snapshot.config.rulesVersion, savedAt, source, state }).record;
}
