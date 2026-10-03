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
const kinds = ["auction_bid", "auction_pass", "trade_accept", "trade_reject"] as const;

function pendingMarket(kind: typeof kinds[number]) {
  let game: Game;
  if (kind.startsWith("trade")) {
    const state = makeSave(propertyMatch().snapshot, propertyMatchId).state;
    game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
    expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
      terms: { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 180 } } }).ok).toBe(true);
  } else {
    const config = createMatchConfig(940);
    game = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: "human" })) });
    for (const action of ["roll", "skip"] as const) expect(game.apply({ kind: action, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
    if (kind === "auction_pass") expect(game.apply({ kind: "auction_bid", amount: 10, actor: "p2", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  }
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
    expect(committed.players.map((player) => player.cash)).toEqual(kind === "auction_pass" ? [1500, 1490] : kind === "trade_accept" ? [1408, 1082] : pending.state.players.map((player) => player.cash));
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

it.each(["awaiting_auction", "awaiting_trade"] as const)("competing %s responses cannot overwrite the winning save or continue the conflicted page", async (market) => {
  const pending = pendingMarket(market === "awaiting_auction" ? "auction_bid" : "trade_accept");
  const factory = new IDBFactory();
  const store = new GameStore(() => factory);
  const initial = makeSave(pending.game.snapshot, propertyMatchId);
  await store.save(initial, null);
  const games = [Game.restore(initial.state), Game.restore(initial.state)];
  const sessions = games.map((game) => new GameSession(game, propertyMatchId, { store: new GameStore(() => factory), expected: initial, source: "local" }));
  try {
    for (const session of sessions) { await session.initializeSave(); session.bind(instant); session.confirmHandover(pending.command.actor); }
    const commands: Command[] = market === "awaiting_auction" ? [pending.command, { ...pending.command, kind: "auction_bid", amount: 20 }]
      : [pending.command, { ...pending.command, kind: "trade_reject", proposalRevision: initial.revision }];
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

it("two local humans and a bot complete auction and trade decisions without adding market rounds", async () => {
  const config = createMatchConfig(940, 3);
  const game = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: player.id === "p3" ? "bot" : "human" })) });
  const session = new GameSession(game, propertyMatchId);
  session.bind(instant);
  session.confirmHandover("p2");
  await session.dispatch({ kind: "roll", actor: "p2", expectedRevision: game.snapshot.revision });
  await session.dispatch({ kind: "skip", actor: "p2", expectedRevision: game.snapshot.revision });
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_auction", actorId: "p1", highestBid: 10, highestBidderId: "p3" });
  const ordinary = game.snapshot.turnPlayerId;
  for (const actor of ["p1", "p2"] as const) {
    expect(session.confirmHandover(actor)).toBe(true);
    await session.dispatch({ kind: "auction_pass", actor, expectedRevision: game.snapshot.revision });
  }
  expect(ordinary).toBe("p2");
  expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe("p3");
  expect(game.snapshot.turnPlayerId).toBe("p1");
  expect(session.confirmHandover("p1")).toBe(true);
  const before = game.snapshot;
  await session.dispatch({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision,
    terms: { recipientId: "p3", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p1", amount: 10 } } });
  expect(game.snapshot.revision).toBe(before.revision + 2);
  expect(game.snapshot.turnPlayerId).toBe("p1");
  expect(game.snapshot.completedRounds).toBe(before.completedRounds);
  expect(game.snapshot.random).toEqual(before.random);
  expect(game.snapshot.players.map((player) => player.cash)).toEqual(before.players.map((player) => player.id === "p1" ? player.cash - 10 : player.id === "p3" ? player.cash + 10 : player.cash));
  expect(game.snapshot.history.at(-1)!.event).toMatchObject({ kind: "trade_accepted", reason: "fair_value" });
  expect(readSave(session.exportRecord()).snapshot).toEqual(game.snapshot);
  session.dispose();
});
