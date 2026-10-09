import { readSave, SaveError, type SaveRecord, type StoredGame } from "./snapshot";
import { sameData } from "../domain/restore";

export const MAX_SAVE_BYTES = 1_048_576;

export async function importSave(file: File): Promise<StoredGame> {
  if (file.size > MAX_SAVE_BYTES) throw new SaveError("too_large");
  let content: string;
  try { content = await file.text(); }
  catch (cause) { throw new SaveError("unavailable", { cause }); }
  try { return readSave(JSON.parse(content)); }
  catch (cause) { throw cause instanceof SaveError ? cause : new SaveError("invalid", { cause }); }
}

export function downloadSave(record: SaveRecord): void {
  const checked = readSave(record).record;
  downloadJson(JSON.stringify(checked, null, 2), `${checked.matchId}.richman.json`);
}

export function downloadRawSave(raw: unknown): void {
  downloadRawJson(raw, "original.richman.json");
}

export function downloadRawProfile(raw: unknown): void {
  downloadRawJson(raw, "original.richman-profile.json");
}

function downloadRawJson(raw: unknown, filename: string): void {
  try {
    const content = JSON.stringify(raw, (_key, value: unknown) => {
      if (value === undefined || typeof value === "number" && !Number.isFinite(value)) throw new SaveError("invalid");
      return value;
    }, 2);
    if (!sameData(JSON.parse(content), raw)) throw new SaveError("invalid");
    downloadJson(content, filename);
  } catch (cause) { throw cause instanceof SaveError ? cause : new SaveError("unavailable", { cause }); }
}

function downloadJson(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
