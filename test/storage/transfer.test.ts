import { expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { makeSave } from "../../src/storage/snapshot";
import { downloadRawSave, importSave, MAX_SAVE_BYTES } from "../../src/storage/transfer";

const record = makeSave(new Game(createMatchConfig(341)).snapshot, "00000000-0000-4000-8000-000000000001");

it("reads a bounded file through complete snapshot validation without executing commands", async () => {
  const file = new File([JSON.stringify(record)], "match.richman.json");
  expect((await importSave(file)).record).toEqual(record);
});

it("checks byte size before reading, including multibyte input, and accepts the exact limit", async () => {
  const oversized = new File(["中".repeat(Math.ceil(MAX_SAVE_BYTES / 3))], "large.json");
  const reading = vi.spyOn(oversized, "text");
  await expect(importSave(oversized)).rejects.toMatchObject({ kind: "too_large" });
  expect(reading).not.toHaveBeenCalled();
  const json = JSON.stringify(record);
  const exact = new File([json, " ".repeat(MAX_SAVE_BYTES - new TextEncoder().encode(json).length)], "limit.json");
  expect(exact.size).toBe(MAX_SAVE_BYTES);
  expect((await importSave(exact)).record).toEqual(record);
});

it.each([
  ["broken JSON", "{", "invalid"],
  ["future schema", JSON.stringify({ ...record, schemaVersion: 99 }), "incompatible"],
  ["unknown rules", JSON.stringify({ ...record, rulesVersion: "future", state: { ...record.state, config: { ...record.state.config, rulesVersion: "future" } } }), "incompatible"],
  ["duplicate players", JSON.stringify({ ...record, state: { ...record.state, players: [record.state.players[0], record.state.players[0]] } }), "invalid"],
  ["invalid ownership", JSON.stringify({ ...record, state: { ...record.state, owners: { "neon-avenue": "missing" } } }), "invalid"],
])("rejects %s without accepting a partial state", async (_label, content, kind) => {
  await expect(importSave(new File([content], "bad.json"))).rejects.toMatchObject({ kind });
});

it("reports a failed file read as unavailable rather than a successful empty import", async () => {
  const file = new File([], "unreadable.json");
  vi.spyOn(file, "text").mockRejectedValue(new DOMException("denied", "NotReadableError"));
  await expect(importSave(file)).rejects.toMatchObject({ kind: "unavailable" });
});

it("does not silently convert damaged non-JSON values into a different raw export", () => {
  expect(() => downloadRawSave({ amount: NaN })).toThrow("invalid");
  expect(() => downloadRawSave({ missing: undefined })).toThrow("invalid");
  expect(() => downloadRawSave({ replaced: new Map([["data", "keep"]]) })).toThrow();
});
