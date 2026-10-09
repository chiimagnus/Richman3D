import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave } from "../../src/storage/snapshot";
import { readChallengeProfile } from "../../src/storage/challenges";
import { dailyChallenge, challengeConfig } from "../../src/domain/challenges";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";

function complete(game: Game) {
  for (let count = 0; game.snapshot.decision.kind !== "game_over" && count < 400; count += 1) {
    const state = game.snapshot;
    if (state.decision.kind === "game_over") break;
    const choices = legalCommands(state, state.decision.actorId);
    const command = choices.find((choice) => choice.kind === "buy") ?? choices.find((choice) => choice.kind === "roll") ?? choices[0]!;
    expect(game.apply(command).ok).toBe(true);
  }
  expect(game.snapshot.decision.kind).toBe("game_over");
}

it("upgrading the real v1 database adds profile without touching valid current/backup games", async () => {
  const factory = new IDBFactory();
  const initial = makeSave(new Game(createMatchConfig()).snapshot, crypto.randomUUID());
  const request = factory.open("richman3d", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("games");
  const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const transaction = database.transaction("games", "readwrite");
  transaction.objectStore("games").put(initial, "current"); transaction.objectStore("games").put(initial, "backup");
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); }); database.close();
  const store = new GameStore(() => factory);
  expect((await store.read())!.record).toEqual(initial);
  expect((await store.read("backup"))!.record).toEqual(initial);
  expect(await store.readChallenges()).toEqual({ active: null, results: [] });
});

it("challenge start, finish, same-day replay and terminal retries are committed once and preserve first/best", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const challenge = dailyChallenge("2026-10-09");
  let previous = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const game = new Game(challengeConfig(challenge)); const matchId = crypto.randomUUID();
    const initial = await store.save(makeSave(game.snapshot, matchId), previous, challenge);
    complete(game);
    const final = makeSave(game.snapshot, matchId);
    await store.save(final, initial, challenge);
    const profile = await store.readChallenges();
    expect(profile.active).toMatchObject({ matchId, challenge, completed: true });
    expect(profile.results).toHaveLength(1);
    expect(profile.results[0]).toMatchObject({ attempts: attempt, first: profile.results[0]!.best });
    expect(profile.results[0]!.best).not.toBeNull();
    await store.save(final, final, challenge);
    expect(await store.readChallenges()).toEqual(profile);
    expect((await store.read())!.record.state).toEqual(final.state);
    previous = final;
  }
});

it("aborting after score and backup writes rolls back the whole save and retry does not repeat a rule command", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const challenge = dailyChallenge("2026-10-08"); const game = new Game(challengeConfig(challenge)); const matchId = crypto.randomUUID();
  const initial = await store.save(makeSave(game.snapshot, matchId), null, challenge);
  complete(game); const final = makeSave(game.snapshot, matchId);
  const before = await store.readChallenges();
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = original.call(this, value, key);
    if (key === "current") request.addEventListener("success", () => this.transaction.abort());
    return request;
  });
  try { await expect(store.save(final, initial, challenge)).rejects.toMatchObject({ kind: "unavailable" }); } finally { spy.mockRestore(); }
  expect((await store.read())!.record).toEqual(initial); expect(await store.read("backup")).toBeNull(); expect(await store.readChallenges()).toEqual(before);
  const state = game.snapshot;
  await store.save(final, initial, challenge);
  expect(game.snapshot).toBe(state); expect((await store.readChallenges()).results[0]!.first).not.toBeNull();
});

it("a free match or imported terminal challenge cannot enroll or alter official challenge results", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const game = new Game(createMatchConfig()); const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), null);
  complete(game); await store.save(makeSave(game.snapshot, initial.matchId), initial);
  expect((await store.readChallenges()).results).toHaveLength(0);
  const challenge = dailyChallenge("2026-10-09"); const incoming = new Game(challengeConfig(challenge)); complete(incoming);
  await store.replace(makeSave(incoming.snapshot, crypto.randomUUID(), "imported"), (await store.read())!.record);
  expect((await store.readChallenges()).results).toHaveLength(0);
});

it("retains at most 30 UTC days and preserves corrupt profile data instead of overwriting it", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory); let previous = null;
  for (let day = 1; day <= 31; day += 1) {
    const challenge = dailyChallenge(`2026-10-${String(day).padStart(2, "0")}`);
    const initial = makeSave(new Game(challengeConfig(challenge)).snapshot, crypto.randomUUID());
    await store.save(initial, previous, challenge); previous = initial;
  }
  const profile = await store.readChallenges(); expect(profile.results).toHaveLength(30); expect(profile.results.some((entry) => entry.challenge.date === "2026-10-01")).toBe(false);
  const request = factory.open("richman3d"); const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const transaction = database.transaction("profile", "readwrite"); transaction.objectStore("profile").put({ privateData: "keep" }, "challenges");
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); }); database.close();
  await expect(store.readChallenges()).rejects.toMatchObject({ kind: "invalid" });
  const next = makeSave(new Game(createMatchConfig()).snapshot, crypto.randomUUID());
  await expect(store.save(next, previous)).rejects.toMatchObject({ kind: "invalid" }); expect((await store.read())!.record).toEqual(previous);
  expect(await store.readRawProfile()).toEqual({ privateData: "keep" });
  await store.resetChallenges();
  expect(await store.readChallenges()).toEqual({ active: null, results: [] });
  expect((await store.read())!.record).toEqual(previous);
  expect(() => readChallengeProfile({ ...profile, results: [...profile.results, profile.results[0]] })).toThrow();
});
