import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";
import { loadTutorialCompleted, saveTutorialCompleted, tutorialConfig, tutorialStep } from "../../src/app/tutorial";
import { legalCommands } from "../../src/domain/selectors";

it("the actual fixed-seed game supports all five teaching steps, including a real buy and opponent rent", async () => {
  const game = new Game(tutorialConfig());
  const session = new GameSession(game, "practice", "tutorial");
  session.bind({ sync() {}, stop() {}, async present(_events, _signal, settle) { settle(); } });
  expect(tutorialStep(session.getSnapshot(), { started: false, inspected: false }).number).toBe(1);
  expect(tutorialStep(session.getSnapshot(), { started: true, inspected: false }).number).toBe(2);
  await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
  expect(tutorialStep(session.getSnapshot(), { started: true, inspected: false }).number).toBe(3);
  expect(tutorialStep(session.getSnapshot(), { started: true, inspected: true }).number).toBe(4);
  expect(game.snapshot.decision).toEqual({ kind: "awaiting_purchase", propertyId: "neon-avenue" });
  await session.dispatch(legalCommands(game.snapshot, "p1").find((command) => command.kind === "buy")!);
  expect(tutorialStep(session.getSnapshot(), { started: true, inspected: true })).toEqual({ number: 5, ready: true });
  expect(game.snapshot.owners["neon-avenue"]).toBe("p1");
  expect(game.snapshot.players[0]?.cash).toBe(1352);
  expect(game.snapshot.players[1]?.statistics.rentPaid).toBe(32);
});

it("the independent completion marker is bounded and storage refusal never blocks practice", () => {
  const values = new Map<string, string>([["existing-match", "preserve-me"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(loadTutorialCompleted(storage)).toBe(false);
  saveTutorialCompleted(storage);
  expect(loadTutorialCompleted(storage)).toBe(true);
  expect(values.get("existing-match")).toBe("preserve-me");
  expect(values.size).toBe(2);
  expect(loadTutorialCompleted({ getItem() { throw new Error("denied"); } })).toBe(false);
  expect(() => saveTutorialCompleted({ setItem() { throw new Error("denied"); } })).not.toThrow();
});
