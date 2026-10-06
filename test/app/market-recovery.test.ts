import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave, readSave, SaveError } from "../../src/storage/snapshot";
import type { Command } from "../../src/domain/types";
import { legalCommands } from "../../src/domain/selectors";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";
import { eventText } from "../../src/ui/eventText";

const instant = { sync() {}, stop() {}, async present() {} };
const kinds = ["trade_accept", "trade_reject"] as const;

function pendingMarket(kind: typeof kinds[number]) {
  const state = makeSave(propertyMatch().snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
    terms: { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 180 } } }).ok).toBe(true);
  if (game.snapshot.decision.kind === "game_over") throw new Error("Unexpected result");
  const command = legalCommands(game.snapshot, game.snapshot.decision.actorId).find((entry) => entry.kind === kind)!;
  return { game, command };
}

it.each(kinds)("retries a failed %s save without replaying any payment, ownership change or market response", async (kind) => {
  const { game, command } = pendingMarket(kind);
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store, expected: null, source: "local" });
  try {
    await session.initializeSave();
    session.bind(instant);
    session.confirmHandover(command.actor);
    const pending = (await store.read())!.record;
    const save = vi.spyOn(store, "save").mockRejectedValueOnce(new SaveError("unavailable"));
    await session.dispatch(command);
    const committed = game.snapshot;
    expect(committed.revision).toBe(pending.revision + 1);
    expect(session.getSnapshot()).toMatchObject({ mode: "paused", save: { kind: "unsaved", acknowledged: false } });
    expect((await store.read())!.record).toEqual(pending);
    expect(readSave(session.exportRecord()).snapshot).toEqual(committed);
    await session.retrySave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(game.snapshot).toBe(committed);
    expect((await store.read())!.snapshot).toEqual(committed);
    expect((await store.read("backup"))!.record).toEqual(pending);
    await session.resume();
    expect(session.confirmHandover(game.snapshot.decision.kind === "game_over" ? game.snapshot.turnPlayerId : game.snapshot.decision.actorId)).toBe(true);
    await session.dispatch(command);
    expect(game.snapshot).toBe(committed);
    expect(save).toHaveBeenCalledTimes(2);
    expect(committed.players.map((player) => player.cash)).toEqual(pending.state.players.map((player) => player.cash + (kind === "trade_accept" ? player.id === "p1" ? 180 : -180 : 0)));
    save.mockRestore();
  } finally { session.dispose(); }
});

it.each(kinds)("pause, view rebind and late %s presentation cannot replay or reveal the next decision early", async (kind) => {
  const { game, command } = pendingMarket(kind);
  const session = new GameSession(game, propertyMatchId);
  let finish = () => {};
  const unbind = session.bind({ ...instant, present: () => new Promise<void>((resolve) => { finish = resolve; }) });
  session.confirmHandover(command.actor);
  const before = game.snapshot;
  const work = session.dispatch(command);
  await vi.waitFor(() => expect(session.getSnapshot().presenting).toBe(true));
  const committed = game.snapshot;
  expect(committed.revision).toBe(before.revision + 1);
  expect(session.handoverActor).toBeNull();
  expect(session.getSnapshot().displayed).toBe(before);
  expect(session.confirmHandover(committed.turnPlayerId)).toBe(false);
  session.pause();
  await work;
  unbind();
  const sync = vi.fn();
  session.bind({ ...instant, sync });
  expect(sync).toHaveBeenCalledExactlyOnceWith(committed);
  expect(session.getSnapshot().displayed).toBe(committed);
  expect(session.getSnapshot().viewPlayerId).toBeNull();
  await session.resume();
  const actor = committed.decision.kind === "game_over" ? committed.turnPlayerId : committed.decision.actorId;
  expect(session.handoverActor).toBe(actor);
  expect(session.confirmHandover(actor)).toBe(true);
  const authorized = session.getSnapshot();
  finish();
  await Promise.resolve();
  expect(session.getSnapshot()).toBe(authorized);
  expect(game.snapshot).toBe(committed);
  expect(readSave(session.exportRecord()).snapshot).toEqual(committed);
  session.dispose();
});

it("competing trade responses cannot overwrite the winning save or continue the conflicted page", async () => {
  const pending = pendingMarket("trade_accept");
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const initial = makeSave(pending.game.snapshot, propertyMatchId);
  await store.save(initial, null);
  const games = [Game.restore(initial.state), Game.restore(initial.state)];
  const sessions = games.map((game) => new GameSession(game, propertyMatchId, { store: new GameStore(() => factory), expected: initial, source: "local" }));
  try {
    for (const session of sessions) { await session.initializeSave(); session.bind(instant); session.confirmHandover(pending.command.actor); }
    const commands: Command[] = [pending.command, { ...pending.command, kind: "trade_reject", proposalRevision: initial.revision }];
    await Promise.all(sessions.map((session, index) => session.dispatch(commands[index]!)));
    const winner = sessions.find((session) => session.getSnapshot().save.kind === "saved")!;
    const loser = sessions.find((session) => session.getSnapshot().save.kind === "conflict")!;
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    const current = (await store.read())!;
    expect(current.snapshot).toEqual(winner.getSnapshot().committed);
    expect((await store.read("backup"))!.record).toEqual(initial);
    const losing = loser.getSnapshot().committed;
    expect(loser.getSnapshot().mode).toBe("paused");
    await loser.retrySave();
    await loser.continueUnsaved();
    await loser.resume();
    expect(loser.getSnapshot().mode).toBe("paused");
    expect(loser.getSnapshot().committed).toBe(losing);
    expect((await store.read())!.record).toEqual(current.record);
    expect(readSave(loser.exportRecord()).snapshot).toEqual(losing);
    expect(Game.restore(current.record.state).snapshot).toEqual(current.snapshot);
    const before = winner.getSnapshot().committed;
    for (const entry of before.history) {
      eventText("en", entry.event, before);
      eventText("zh-CN", entry.event, before);
    }
    expect(winner.getSnapshot().committed).toBe(before);
  } finally { for (const session of sessions) session.dispose(); }
});

it("two local humans and a bot complete a trade without adding rounds", async () => {
  const config = createMatchConfig(940, 3);
  const game = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: player.id === "p3" ? "bot" : "human" })) });
  const session = new GameSession(game, propertyMatchId);
  session.bind(instant);
  const before = game.snapshot;
  const actor = before.turnPlayerId;
  expect(session.confirmHandover(actor)).toBe(true);
  await session.dispatch({ kind: "trade_propose", actor, expectedRevision: before.revision,
    terms: { recipientId: "p3", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: actor, amount: 10 } } });
  expect(game.snapshot.revision).toBe(before.revision + 2);
  expect(game.snapshot.turnPlayerId).toBe(actor);
  expect(game.snapshot.completedRounds).toBe(before.completedRounds);
  expect(game.snapshot.random).toEqual(before.random);
  expect(game.snapshot.players.map((player) => player.cash)).toEqual(before.players.map((player) => player.id === actor ? player.cash - 10 : player.id === "p3" ? player.cash + 10 : player.cash));
  expect(game.snapshot.history.at(-1)!.event).toMatchObject({ kind: "trade_accepted" });
  expect(session.getSnapshot().botDecision).toMatchObject({ actorId: "p3", reason: "fair_trade", revision: game.snapshot.revision });
  expect(readSave(session.exportRecord()).snapshot).toEqual(game.snapshot);
  session.dispose();
});
