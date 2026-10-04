import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { debtView } from "../../src/ui/viewModel";
import { makeSave } from "../../src/storage/snapshot";
import { builtRentDebtMatch, debtCheckpoint, debtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

const instant = { sync() {}, stop() {}, async present() {} };

it("saves fixed debt before canceled presentation, resumes without replay and saves a rescue and payment atomically", async () => {
  const game = debtCheckpoint();
  const factory = new IDBFactory();
  const repository = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store: repository, expected: null, source: "local" });
  await session.initializeSave();
  session.bind({ ...instant, present: async () => new Promise(() => {}) });
  const rolling = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  await vi.waitFor(() => {
    expect(game.snapshot.decision.kind).toBe("awaiting_debt");
    expect(session.getSnapshot().save.kind).toBe("saved");
  });
  session.pause();
  await rolling;
  const pending = game.snapshot;
  expect((await repository.read())?.snapshot).toEqual(pending);
  session.dispose();
  const record = (await repository.read())!.record;
  const restored = Game.restore(record.state);
  const resumed = new GameSession(restored, propertyMatchId, { store: repository, expected: { matchId: propertyMatchId, revision: record.revision }, source: "local" });
  await resumed.initializeSave();
  resumed.bind({ ...instant, present: async (_events, _signal, settle) => {
    settle();
    if (restored.snapshot.decision.kind !== "awaiting_debt") {
      expect(resumed.getSnapshot().notice?.event).toMatchObject({ kind: "paid", amount: 120 });
      resumed.pause();
    }
  } });
  const command = debtView(resumed.getSnapshot())!.management!.properties["neon-avenue"]!.mortgage.command!;
  expect(restored.snapshot).toEqual(pending);
  await resumed.dispatch(command);
  const paid = restored.snapshot;
  expect(paid.revision).toBe(pending.revision + 1);
  expect(paid.players[0]!.cash).toBe(0);
  expect(paid.properties["neon-avenue"]!.mortgagePrincipal).toBe(90);
  expect(paid.history.slice(-3).map((entry) => entry.event.kind)).toEqual(["mortgaged", "paid", "turn"]);
  expect(resumed.getSnapshot().notice).toBeNull();
  expect(paid.history.at(-2)!.event).toMatchObject({ kind: "paid", amount: 120 });
  expect((await repository.read())?.snapshot).toEqual(paid);
  expect(paid.random).toEqual(pending.random);
  await resumed.resume();
  resumed.pause();
  const after = restored.snapshot;
  const save = vi.spyOn(repository, "save");
  await resumed.dispatch(command);
  expect(restored.snapshot).toBe(after);
  expect(save).not.toHaveBeenCalled();
  resumed.dispose();
});

it("hot-seat restore requires the debtor's explicit handover, and debt resolution routes the next operator", async () => {
  const original = debtMatch();
  const state = makeSave(original.snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, config: { ...state.config, players: state.config.players.map((player) => ({ ...player, controller: "human" })) } });
  const session = new GameSession(game);
  session.bind(instant);
  const pending = game.snapshot;
  expect(session.handoverActor).toBe("p1");
  expect(debtView(session.getSnapshot())!.management).toBeNull();
  await session.dispatch({ kind: "mortgage", propertyId: "neon-avenue", actor: "p1", expectedRevision: pending.revision });
  expect(game.snapshot).toBe(pending);
  session.confirmHandover("p1");
  const command = debtView(session.getSnapshot())!.management!.properties["neon-avenue"]!.mortgage.command!;
  session.pause();
  await session.resume();
  expect(game.snapshot).toBe(pending);
  await session.dispatch(command);
  expect(game.snapshot.players[0]!.cash).toBe(0);
  expect(session.handoverActor).toBe("p2");
  expect(session.getSnapshot().viewPlayerId).toBeNull();
  session.dispose();
});

it("saves the entire built-estate liquidation and unique terminal result before presentation and restores without economic replay", async () => {
  const game = builtRentDebtMatch(2);
  const factory = new IDBFactory();
  const repository = new GameStore(() => factory);
  const session = new GameSession(game, propertyMatchId, { store: repository, expected: null, source: "local" });
  await session.initializeSave();
  const sync = vi.fn();
  session.bind({ sync, stop() {}, present: async () => new Promise(() => {}) });
  const before = game.snapshot;
  const command = debtView(session.getSnapshot())!.bankruptcy!;
  const settling = session.dispatch(command);
  await vi.waitFor(() => {
    expect(session.getSnapshot().save.kind).toBe("saved");
    expect(game.snapshot.decision.kind).toBe("game_over");
  });
  expect(session.getSnapshot().presenting).toBe(true);
  expect(session.getSnapshot().displayed).toBe(before);
  const terminal = game.snapshot;
  expect((await repository.read())!.snapshot).toEqual(terminal);
  session.pause();
  await settling;
  expect(sync).toHaveBeenLastCalledWith(terminal);
  session.dispose();
  const saved = (await repository.read())!;
  const restored = Game.restore(saved.record.state);
  const resumed = new GameSession(restored, propertyMatchId, { store: repository, expected: saved.record, source: "local" });
  await resumed.initializeSave();
  const present = vi.fn(async () => {});
  resumed.bind({ ...instant, present });
  await resumed.activate();
  resumed.pause();
  await resumed.resume();
  await resumed.dispatch(command);
  expect(present).not.toHaveBeenCalled();
  expect(restored.snapshot).toEqual(terminal);
  expect((await repository.read())!.snapshot).toEqual(terminal);
  expect(terminal.history.filter((entry) => entry.event.kind === "ended")).toHaveLength(1);
  resumed.dispose();
});
