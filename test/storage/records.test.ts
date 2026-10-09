import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave } from "../../src/storage/snapshot";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { dailyChallenge, challengeConfig } from "../../src/domain/challenges";
import { EMPTY_RECORDS, readRecordProfile } from "../../src/storage/records";
import { finishMatch } from "../fixtures/record-match";

it("keeps twenty actual results, counts each match once and unlocks both maps only after completing them", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory); let previous = null;
  for (let index = 0; index < 22; index += 1) {
    const game = new Game({ ...createMatchConfig(index + 1), mapId: index % 2 === 0 ? "city" : "harbor" });
    const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), previous);
    const earned = finishMatch(game);
    const final = await store.save(makeSave(game.snapshot, initial.matchId), initial, { earned });
    const profile = await store.readProfile();
    expect(profile.records.recent).toHaveLength(Math.min(index + 1, 20));
    expect(profile.records.recent[0]).toMatchObject({ matchId: initial.matchId, mode: "free", mapId: game.snapshot.config.mapId });
    expect(profile.records.achievements.includes("both-maps")).toBe(index > 0);
    expect(profile.challenges.results).toHaveLength(0);
    await store.save(final, final, { earned });
    expect(await store.readProfile()).toEqual(profile); previous = final;
  }
  expect((await store.readProfile()).records.recent.at(-1)!.seed).toBe(3);
});

it("clearing a completed match preserves saves and prevents refresh or newer saves resurrecting old achievements/results", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const challenge = dailyChallenge("2026-10-09"); const game = new Game(challengeConfig(challenge));
  const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), null, { challenge });
  const earned = finishMatch(game); const final = await store.save(makeSave(game.snapshot, initial.matchId), initial, { challenge, earned });
  const before = await store.readProfile(); const backup = await store.read("backup");
  expect(before.records.recent[0]!.mode).toBe("challenge");
  await store.clearRecords();
  expect((await store.read())!.record).toEqual(final); expect(await store.read("backup")).toEqual(backup);
  const cleared = await store.readProfile();
  expect(cleared.records).toEqual({ ...EMPTY_RECORDS, milestones: before.records.milestones });
  expect(cleared.challenges).toEqual({ active: before.challenges.active, results: [] });
  await store.save(final, final, { challenge, earned });
  expect(await store.readProfile()).toEqual(cleared);
});

it("clearing during an ongoing challenge allows its later first completion to be recorded once", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const challenge = dailyChallenge("2026-10-08"); const game = new Game(challengeConfig(challenge));
  const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), null, { challenge });
  await store.clearRecords();
  const earned = finishMatch(game); const final = await store.save(makeSave(game.snapshot, initial.matchId), initial, { challenge, earned });
  const profile = await store.readProfile();
  expect(profile.challenges.results).toHaveLength(1); expect(profile.challenges.results[0]).toMatchObject({ attempts: 1, first: { rank: expect.any(Number) } });
  expect(profile.records.recent).toHaveLength(1);
  await store.save(final, final, { challenge, earned }); expect(await store.readProfile()).toEqual(profile);
});

it("an aborted transaction rolls back records, achievements, challenge results and saves together", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const game = new Game(createMatchConfig());
  const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), null); const earned = finishMatch(game);
  const profile = await store.readProfile(); const final = makeSave(game.snapshot, initial.matchId);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = original.call(this, value, key);
    if (key === "current") request.addEventListener("success", () => this.transaction.abort());
    return request;
  });
  try { await expect(store.save(final, initial, { earned })).rejects.toMatchObject({ kind: "unavailable" }); } finally { spy.mockRestore(); }
  expect(await store.readProfile()).toEqual(profile); expect((await store.read())!.record).toEqual(initial); expect(await store.read("backup")).toBeNull();
  await store.save(final, initial, { earned }); expect((await store.readProfile()).records.recent).toHaveLength(1);
});

it("imported games and non-enrolled recovered checkpoints cannot unlock achievements or create official records", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const game = new Game(createMatchConfig());
  const earned = finishMatch(game);
  const imported = await store.replace(makeSave(game.snapshot, crypto.randomUUID(), "imported"), undefined);
  expect((await store.readProfile()).records).toEqual(EMPTY_RECORDS);
  await store.save(makeSave(game.snapshot, crypto.randomUUID()), imported, { earned });
  expect((await store.readProfile()).records).toEqual(EMPTY_RECORDS);
});

it("corrupt records are preserved, exportable and block overwrites until an explicit records-only clear", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const game = new Game(createMatchConfig());
  const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), null);
  const request = factory.open("richman3d"); const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const transaction = database.transaction("profile", "readwrite"); const corrupt = { keep: "unknown-version" };
  transaction.objectStore("profile").put(corrupt, "records"); await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); }); database.close();
  await expect(store.readProfile()).rejects.toMatchObject({ kind: "invalid" });
  finishMatch(game); await expect(store.save(makeSave(game.snapshot, initial.matchId), initial)).rejects.toMatchObject({ kind: "invalid" });
  expect((await store.readRawProfile()).records).toEqual(corrupt); expect((await store.read())!.record).toEqual(initial);
  await store.clearRecords(); expect((await store.readProfile()).records).toEqual(EMPTY_RECORDS); expect((await store.read())!.record).toEqual(initial);
  await store.save(makeSave(game.snapshot, initial.matchId), initial);
  expect((await store.readProfile()).records.recent).toHaveLength(1);
});

it.each([null, { ...EMPTY_RECORDS, achievements: ["not-real"] }, { ...EMPTY_RECORDS, completedMaps: ["moon"] }, { ...EMPTY_RECORDS, recent: [{}] }])("rejects invalid profile boundaries without fallback %#", (value) => {
  expect(() => readRecordProfile(value)).toThrow();
});
