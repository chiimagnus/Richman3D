import { expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { GameSession } from "../../src/app/GameSession";
import { makeSave } from "../../src/storage/snapshot";

const matchId = "00000000-0000-4000-8000-000000000004";
const instant = { sync() {}, stop() {}, async present() {} };

function localGame() {
  const base = createMatchConfig(940);
  return new Game({ ...base, players: base.players.map((player) => ({ ...player, controller: "human" })) });
}

it("requires one explicit local authorization without a command, RNG draw or save", async () => {
  const game = localGame();
  const session = new GameSession(game, matchId);
  const before = game.snapshot;
  expect(session.handoverActor).toBe("p1");
  expect(session.confirmHandover("p1")).toBe(false);
  session.bind(instant);
  await session.dispatch(legalCommands(before, "p1")[0]!);
  expect(game.snapshot).toBe(before);
  expect(session.confirmHandover("p2")).toBe(false);
  const exported = session.exportRecord();
  expect(session.confirmHandover("p1")).toBe(true);
  const authorized = session.getSnapshot();
  expect(session.confirmHandover("p1")).toBe(false);
  expect(session.getSnapshot()).toBe(authorized);
  expect(session.exportRecord().state).toEqual(exported.state);
  expect(game.snapshot).toBe(before);
  await session.dispatch(legalCommands(before, "p1")[0]!);
  expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_purchase", actorId: "p1" });
  expect(session.handoverActor).toBeNull();
  await session.dispatch(legalCommands(game.snapshot, "p1").find((command) => command.kind === "skip")!);
  expect(session.handoverActor).toBe("p2");
  expect(session.getSnapshot().viewPlayerId).toBeNull();
});

it.each(["skip", "pause"] as const)("%s settles the committed turn before routing the next local actor", async (action) => {
  const game = localGame();
  const session = new GameSession(game, matchId);
  session.bind({ ...instant, present: vi.fn(async () => { if (game.snapshot.revision === 2) await new Promise<void>(() => {}); }) });
  session.confirmHandover("p1");
  await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
  const work = session.dispatch(legalCommands(game.snapshot, "p1").find((command) => command.kind === "buy")!);
  await Promise.resolve();
  expect(game.snapshot.turnPlayerId).toBe("p2");
  expect(session.getSnapshot().displayed.turnPlayerId).toBe("p1");
  expect(session.getSnapshot().viewPlayerId).toBe("p1");
  expect(session.handoverActor).toBeNull();
  expect(session.confirmHandover("p2")).toBe(false);
  if (action === "pause") session.pause(); else session.skipPresentation();
  await work;
  expect(session.handoverActor).toBe("p2");
  if (action === "pause") {
    expect(session.confirmHandover("p2")).toBe(false);
    await session.resume();
  }
  const before = game.snapshot;
  await session.dispatch({ kind: "roll", actor: "p2", expectedRevision: before.revision });
  await session.dispatch({ kind: "roll", actor: "p1", expectedRevision: before.revision });
  expect(game.snapshot).toBe(before);
  expect(session.confirmHandover("p2")).toBe(true);
  expect(game.snapshot).toBe(before);
  session.dispose();
});

it("restoring a purchasing decision does not restore the previous local authorization", async () => {
  const game = localGame();
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  const snapshot = game.snapshot;
  const restored = Game.restore(makeSave(snapshot, matchId).state);
  const session = new GameSession(restored, matchId);
  session.bind(instant);
  expect(session.getSnapshot().viewPlayerId).toBeNull();
  expect(session.handoverActor).toBe("p1");
  await session.dispatch(legalCommands(restored.snapshot, "p1").find((command) => command.kind === "buy")!);
  expect(restored.snapshot).toEqual(snapshot);
  expect(session.confirmHandover("p1")).toBe(true);
  await session.dispatch(legalCommands(restored.snapshot, "p1").find((command) => command.kind === "buy")!);
  expect(restored.snapshot.properties["neon-avenue"]!.ownerId).toBe("p1");
  expect(session.handoverActor).toBe("p2");
});

it("computer-first activation executes real bot commands and stops at the first local handover", async () => {
  const base = createMatchConfig(940, 3);
  const game = new Game({ ...base, players: base.players.map((player) => ({ ...player, controller: player.id === "p2" ? "bot" : "human" })) });
  const session = new GameSession(game, matchId);
  session.bind(instant);
  expect(session.handoverActor).toBeNull();
  await session.activate();
  expect(game.snapshot.revision).toBeGreaterThan(0);
  expect(game.snapshot.turnPlayerId).toBe("p3");
  expect(session.handoverActor).toBe("p3");
  const before = game.snapshot;
  await session.dispatch({ kind: "roll", actor: "p2", expectedRevision: before.revision });
  expect(game.snapshot).toBe(before);
  session.dispose();
});
