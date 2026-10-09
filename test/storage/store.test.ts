import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave } from "../../src/storage/snapshot";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

function fixture() {
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const game = new Game(createMatchConfig(940));
  return { factory, store, game, initial: makeSave(game.snapshot, firstId, "local", 1000) };
}

it("persists full state only after completion; retries preserve the actual timestamp and previous backup", async () => {
  const { store, game, initial } = fixture();
  expect(await store.read()).toBeNull();
  await store.save(initial, null);
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  const next = makeSave(game.snapshot, firstId, "local", 2000);
  await store.save(next, initial);
  expect((await store.read())?.record).toEqual(next);
  expect((await store.read("backup"))?.record).toEqual(initial);
  expect(await store.save({ ...next, savedAt: 3000 }, next)).toEqual(next);
  expect((await store.read())?.record).toEqual(next);
  expect((await store.read("backup"))?.record).toEqual(initial);
});

it("serializes competing pages: only one accepts the same persisted revision", async () => {
  const { factory, store, game, initial } = fixture();
  await store.save(initial, null);
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  const next = makeSave(game.snapshot, firstId);
  const other = new GameStore(() => factory);
  const results = await Promise.allSettled([store.save(next, initial), other.save(next, initial)]);
  expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { kind: "conflict" } });
  expect((await store.read())?.record).toEqual(next);
  expect((await store.read("backup"))?.record).toEqual(initial);
});

it("equal revisions in different matches cannot bypass identity and late old writes cannot overwrite a new match", async () => {
  const { store, game, initial } = fixture();
  await store.save(initial, null);
  const replacement = makeSave(game.snapshot, secondId);
  await store.save(replacement, initial);
  await expect(store.save(initial, initial)).rejects.toMatchObject({ kind: "conflict" });
  await expect(store.save(initial, null)).rejects.toMatchObject({ kind: "conflict" });
  expect((await store.read())?.record).toEqual(replacement);
  expect((await store.read("backup"))?.record).toEqual(initial);
});

it("a transaction aborted after backup write rolls back both keys and never reports success", async () => {
  const { store, game, initial } = fixture();
  await store.save(initial, null);
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  const next = makeSave(game.snapshot, firstId);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = original.call(this, value, key);
    if (key === "current") request.addEventListener("success", () => this.transaction.abort());
    return request;
  });
  try { await expect(store.save(next, initial)).rejects.toMatchObject({ kind: "unavailable" }); }
  finally { spy.mockRestore(); }
  expect((await store.read())?.record).toEqual(initial);
  expect(await store.read("backup")).toBeNull();
});

it("repeated replacements keep only the fixed current and backup keys", async () => {
  const { factory, store, game } = fixture();
  let expected = null;
  for (let index = 1; index <= 20; index += 1) {
    const next = makeSave(game.snapshot, `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    await store.save(next, expected);
    expected = next;
  }
  const request = factory.open("richman3d");
  const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const keys = database.transaction("games").objectStore("games").getAllKeys();
  expect(await new Promise((resolve) => { keys.onsuccess = () => resolve(keys.result); })).toEqual(["backup", "current"]);
  database.close();
});

it("preserves unreadable data and refuses ordinary writes instead of clearing it", async () => {
  const { factory, store, initial } = fixture();
  await store.save(initial, null);
  const request = factory.open("richman3d");
  const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const transaction = database.transaction("games", "readwrite");
  const raw = { schemaVersion: 999, privateData: "preserve me" };
  transaction.objectStore("games").put(raw, "current");
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
  database.close();
  await expect(store.read()).rejects.toMatchObject({ kind: "incompatible" });
  await expect(store.save(initial, initial)).rejects.toMatchObject({ kind: "incompatible" });
  expect(await store.readRaw()).toEqual(raw);
  expect(await store.readRaw("backup")).toBeUndefined();
});

it("reports synchronous storage denial through the same actionable error channel", async () => {
  const store = new GameStore(() => { throw new DOMException("denied", "SecurityError"); });
  await expect(store.read()).rejects.toMatchObject({ kind: "unavailable" });
});

it("keeps an old mortgage-era record and backup unchanged rather than silently replacing them", async () => {
  const { factory, store, initial } = fixture();
  const old = { ...initial, rulesVersion: "city-v12-quick", state: { ...initial.state,
    config: { ...initial.state.config, rulesVersion: "city-v12-quick" }, properties: { ...initial.state.properties,
      "neon-avenue": { ...initial.state.properties["neon-avenue"], mortgagePrincipal: 90 } } } };
  const request = factory.open("richman3d");
  request.onupgradeneeded = () => request.result.createObjectStore("games");
  const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const transaction = database.transaction("games", "readwrite");
  transaction.objectStore("games").put(old, "current");
  transaction.objectStore("games").put(old, "backup");
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
  database.close();
  await expect(store.read()).rejects.toMatchObject({ kind: "incompatible" });
  await expect(store.save(initial, null)).rejects.toMatchObject({ kind: "incompatible" });
  expect(await store.readRaw()).toEqual(old);
  expect(await store.readRaw("backup")).toEqual(old);
});

it("explicit replacement preserves valid current as backup and rejects stale previews and identity reuse", async () => {
  const { store, game, initial } = fixture();
  await store.save(initial, null);
  const replacement = makeSave(game.snapshot, secondId, "imported");
  await expect(store.replace(initial, initial)).rejects.toMatchObject({ kind: "conflict" });
  await store.replace(replacement, initial);
  expect((await store.read())?.record).toEqual(replacement);
  expect((await store.read("backup"))?.record).toEqual(initial);
  await expect(store.replace(initial, initial)).rejects.toMatchObject({ kind: "conflict" });
  await expect(store.save(initial, initial)).rejects.toMatchObject({ kind: "conflict" });
  expect((await store.read())?.record).toEqual(replacement);
});

it("confirmed damaged-data replacement keeps the valid backup and rejects intervening raw-data changes", async () => {
  const { factory, store, game, initial } = fixture();
  await store.save(initial, null);
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  await store.save(makeSave(game.snapshot, firstId), initial);
  const request = factory.open("richman3d");
  const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
  const raw = { schemaVersion: 999, privateData: "keep until explicit confirmation", brokenAmount: NaN };
  const transaction = database.transaction("games", "readwrite");
  transaction.objectStore("games").put(raw, "current");
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
  database.close();
  const restored = { ...initial, matchId: secondId };
  await expect(store.replace(restored, { ...raw, privateData: "outdated preview" })).rejects.toMatchObject({ kind: "conflict" });
  expect(await store.readRaw()).toEqual(raw);
  expect((await store.read("backup"))?.record).toEqual(initial);
  await store.replace(restored, raw);
  expect((await store.read())?.record).toEqual(restored);
  expect((await store.read("backup"))?.record).toEqual(initial);
  await expect(store.save(initial, initial)).rejects.toMatchObject({ kind: "conflict" });
});

it("aborted explicit replacement preserves both records and cannot claim recovery", async () => {
  const { store, game, initial } = fixture();
  await store.save(initial, null);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = original.call(this, value, key);
    if (key === "current") request.addEventListener("success", () => this.transaction.abort());
    return request;
  });
  try { await expect(store.replace(makeSave(game.snapshot, secondId), initial)).rejects.toMatchObject({ kind: "unavailable" }); }
  finally { spy.mockRestore(); }
  expect((await store.read())?.record).toEqual(initial);
  expect(await store.read("backup")).toBeNull();
});
