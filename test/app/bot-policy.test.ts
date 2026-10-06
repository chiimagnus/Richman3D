import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as bot from "../../src/domain/bot";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { propertyMatchId } from "../fixtures/property-match";
import { BOT_DIFFICULTIES } from "../../src/domain/types";
import { makeSave } from "../../src/storage/snapshot";
import { actionView } from "../../src/ui/viewModel";
import { messages } from "../../src/i18n";

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

it.each(BOT_DIFFICULTIES)("the real session uses its saved %s strategy and projects only that committed action's bilingual reason", async (difficulty) => {
  const initial = new Game(createMatchConfig(940));
  expect(initial.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const state = makeSave(initial.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state,
    config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: player.id === "p1" ? "bot" : "human", difficulty })) },
    players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 480, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - 480 } } : player),
  });
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  let presentations = 0;
  try {
    await session.initializeSave();
    session.bind({ sync() {}, stop() {}, async present(_events, _signal, settle) {
      presentations += 1;
      const view = session.getSnapshot();
      expect(view).toMatchObject({ presenting: true, botDecision: { actorId: "p1", revision: 2, difficulty, reason: difficulty === "easy" ? "reserve_cash" : "buy_property" } });
      const before = game.snapshot;
      for (const language of ["en", "zh-CN"] as const) {
        const model = actionView(view, language);
        expect(model.status).toContain(messages(language).ai.difficulties[difficulty]);
        expect(model.status).toContain(messages(language).ai.reasons[difficulty === "easy" ? "reserve_cash" : "buy_property"]);
        expect(model.commands).toEqual([]);
        expect(actionView({ ...view, mode: "paused" }, language).status).toBe(messages(language).runtime.paused);
        expect(actionView({ ...view, botDecision: { ...view.botDecision!, revision: 1 } }, language).status).not.toContain(messages(language).ai.reasons[difficulty === "easy" ? "reserve_cash" : "buy_property"]);
      }
      expect(game.snapshot).toBe(before);
      settle();
    } });
    const random = game.snapshot.random;
    await session.activate();
    expect(presentations).toBe(1);
    expect(game.snapshot.revision).toBe(2);
    expect(game.snapshot.random).toEqual(random);
    expect(game.snapshot.players[0]!.cash).toBe(difficulty === "easy" ? 480 : 300);
    expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe(difficulty === "easy" ? null : "p1");
    expect((await store.read())!.record.state).toEqual(makeSave(game.snapshot, propertyMatchId).state);
    expect((await store.read())!.record.state.config.players[0]!.difficulty).toBe(difficulty);
    expect(session.getSnapshot().error).toBeNull();
    expect(actionView(session.getSnapshot(), "en").status).not.toContain(messages("en").ai.reasons[difficulty === "easy" ? "reserve_cash" : "buy_property"]);
  } finally { session.dispose(); }
});
