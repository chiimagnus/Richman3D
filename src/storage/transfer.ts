import { readSave, type SaveRecord } from "./snapshot";

export function downloadSave(record: SaveRecord): void {
  const checked = readSave(record).record;
  const url = URL.createObjectURL(new Blob([JSON.stringify(checked, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${checked.matchId}.richman.json`;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
