import { readSave, SaveError, type SaveIdentity, type SaveRecord, type StoredGame } from "./snapshot";
import { sameData } from "../domain/restore";

export class GameStore {
  constructor(private readonly factory: () => IDBFactory = () => window.indexedDB, private readonly name = "richman3d") {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      try {
        const request = this.factory().open(this.name, 1);
        let blocked = false;
        request.onupgradeneeded = () => request.result.createObjectStore("games");
        request.onerror = () => reject(new SaveError("unavailable", { cause: request.error }));
        request.onblocked = () => { blocked = true; reject(new SaveError("unavailable")); };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => database.close();
          if (blocked) database.close(); else resolve(database);
        };
      } catch (cause) { reject(new SaveError("unavailable", { cause })); }
    });
  }

  async readRaw(key: "current" | "backup" = "current"): Promise<unknown> {
    const database = await this.open();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction("games", "readonly");
        const request = transaction.objectStore("games").get(key);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(new SaveError("unavailable", { cause: transaction.error }));
      });
    } catch (cause) { throw cause instanceof SaveError ? cause : new SaveError("unavailable", { cause }); }
    finally { database.close(); }
  }

  async read(key: "current" | "backup" = "current"): Promise<StoredGame | null> {
    const raw = await this.readRaw(key);
    return raw === undefined ? null : readSave(raw);
  }

  async save(value: SaveRecord, expected: SaveIdentity | null): Promise<SaveRecord> {
    return this.write(value, { kind: "save", identity: expected });
  }

  async replace(value: SaveRecord, expectedRaw: unknown): Promise<SaveRecord> {
    return this.write(value, { kind: "replace", raw: expectedRaw });
  }

  private async write(value: SaveRecord, expected: { kind: "save"; identity: SaveIdentity | null } | { kind: "replace"; raw: unknown }): Promise<SaveRecord> {
    const next = readSave(value).record;
    const database = await this.open();
    try {
      return await new Promise<SaveRecord>((resolve, reject) => {
        const transaction = database.transaction("games", "readwrite");
        let failure: SaveError | null = null;
        let saved = next;
        transaction.oncomplete = () => resolve(saved);
        transaction.onabort = () => reject(failure ?? new SaveError("unavailable", { cause: transaction.error }));
        const store = transaction.objectStore("games");
        const current = store.get("current");
        current.onsuccess = () => {
          try {
            if (expected.kind === "replace" && !sameData(current.result, expected.raw)) throw new SaveError("conflict");
            let previous: SaveRecord | null = null;
            if (current.result !== undefined) {
              try { previous = readSave(current.result).record; }
              catch (cause) { if (expected.kind !== "replace") throw cause; }
            }
            if (expected.kind === "save") {
              const identity = expected.identity;
              if (identity === null ? previous !== null : !previous || previous.matchId !== identity.matchId || previous.revision !== identity.revision) throw new SaveError("conflict");
            } else if (previous?.matchId === next.matchId) throw new SaveError("conflict");
            if (previous?.matchId === next.matchId && next.revision < previous.revision) throw new SaveError("conflict");
            if (previous && next.matchId === previous.matchId && next.revision === previous.revision) {
              if (!sameData(next.state, previous.state) || next.source !== previous.source) throw new SaveError("conflict");
              saved = previous;
              return;
            }
            if (previous) store.put(previous, "backup");
            store.put(next, "current");
          } catch (cause) {
            failure = cause instanceof SaveError ? cause : new SaveError("unavailable", { cause });
            transaction.abort();
          }
        };
      });
    } catch (cause) { throw cause instanceof SaveError ? cause : new SaveError("unavailable", { cause }); }
    finally { database.close(); }
  }
}
