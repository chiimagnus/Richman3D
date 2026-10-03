import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as bot from "../../src/domain/bot";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { propertyMatchId } from "../fixtures/property-match";

afterEach(() => vi.restoreAllMocks());

it.each(["wrong_actor", "stale_revision"] as const)("the real session rejects a policy's %s command without changing money, RNG or saved state", async (invalid) => {
  const config = createMatchConfig(21);
  const game = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human" })) });
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  const before = game.snapshot;
  try {
    await session.initializeSave();
    const saved = (await store.read())!.record;
    session.bind({ sync() {}, stop() {}, async present() {} });
    vi.spyOn(bot, "chooseBotAction").mockReturnValueOnce({ command: { kind: "roll", actor: invalid === "wrong_actor" ? "p2" : "p1", expectedRevision: invalid === "stale_revision" ? before.revision + 1 : before.revision }, reason: "roll" });
    await session.activate();
    expect(game.snapshot).toBe(before);
    expect(session.getSnapshot()).toMatchObject({ error: "command_rejected", presenting: false });
    expect((await store.read())!.record).toEqual(saved);
    expect(await store.read("backup")).toBeNull();
  } finally { session.dispose(); }
});
