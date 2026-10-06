import { expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { makeSave } from "../../src/storage/snapshot";
import { tradeView } from "../../src/ui/viewModel";
import { propertyMatch, propertyMatchId } from "../fixtures/property-match";

const instant = { sync() {}, stop() {}, async present() {} };

it.each(["trade_accept", "trade_reject"] as const)("persists a pending proposal, restores recipient handover and performs %s exactly once without moving the turn", async (kind) => {
  const state = makeSave(propertyMatch().snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
  const factory = new IDBFactory();
  const repository = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store: repository, expected: null, source: "local" });
  await session.initializeSave();
  session.bind(instant);
  expect(tradeView(session.getSnapshot()).canPropose).toBe(false);
  session.confirmHandover("p1");
  expect(tradeView(session.getSnapshot()).canPropose).toBe(true);
  const original = game.snapshot;
  const propose = { kind: "trade_propose" as const, actor: "p1" as const, expectedRevision: original.revision,
    terms: { recipientId: "p2" as const, givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2" as const, amount: 180 } } };
  await Promise.all([session.dispatch(propose), session.dispatch(propose)]);
  const pending = game.snapshot;
  expect(pending.revision).toBe(original.revision + 1);
  expect(pending.players).toEqual(original.players);
  expect(session.handoverActor).toBe("p2");
  expect(session.getSnapshot().notice).toBeNull();
  const saved = (await repository.read())!;
  expect(saved.snapshot).toEqual(pending);
  session.dispose();
  const restored = Game.restore(saved.record.state);
  const resumed = new GameSession(restored, propertyMatchId, { store: repository, expected: saved.record, source: "local" });
  await resumed.initializeSave();
  resumed.bind(instant);
  const response = { kind, actor: "p2" as const, expectedRevision: pending.revision, proposalRevision: pending.revision };
  await resumed.dispatch(response);
  expect(restored.snapshot).toEqual(pending);
  resumed.confirmHandover("p2");
  resumed.pause();
  expect(restored.snapshot).toEqual(pending);
  expect(tradeView(resumed.getSnapshot()).commands).toEqual([]);
  await resumed.resume();
  await Promise.all([resumed.dispatch(response), resumed.dispatch(response)]);
  const final = restored.snapshot;
  expect(final.revision).toBe(pending.revision + 1);
  expect(final.turnPlayerId).toBe("p1");
  expect(final.completedRounds).toBe(original.completedRounds);
  expect(final.players.map((player) => player.cash)).toEqual(original.players.map((player) => player.cash + (kind === "trade_accept" ? player.id === "p1" ? 180 : -180 : 0)));
  expect(final.properties["neon-avenue"]!.ownerId).toBe(kind === "trade_accept" ? "p2" : "p1");
  expect((await repository.read())!.snapshot).toEqual(final);
  expect((await repository.read("backup"))!.snapshot).toEqual(pending);
  expect(resumed.handoverActor).toBe("p1");
  expect(resumed.getSnapshot().notice?.event.kind).toBe(kind === "trade_accept" ? "trade_accepted" : "trade_rejected");
  await resumed.dispatch(response);
  expect(restored.snapshot).toBe(final);
  resumed.dispose();
});

it("lets a real bot respond once to a human proposal and returns to the proposer without rolling", async () => {
  const game = propertyMatch();
  const session = new GameSession(game);
  session.bind(instant);
  const before = game.snapshot;
  await session.dispatch({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision,
    terms: { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 180 } } });
  expect(game.snapshot.revision).toBe(before.revision + 2);
  expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe("p2");
  expect(game.snapshot.decision).toEqual({ kind: "awaiting_roll", actorId: "p1" });
  expect(game.snapshot.random).toEqual(before.random);
  expect(session.getSnapshot().viewPlayerId).toBe("p1");
  session.dispose();
});
