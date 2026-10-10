import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import type { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { challengeConfig, dailyChallenge } from "../../src/domain/challenges";
import { legalCommands } from "../../src/domain/selectors";

vi.mock("../../src/ui/SceneHost", () => ({ SceneHost: () => null }));
afterEach(() => vi.unstubAllGlobals());

it("the application preserves a captured challenge across leave/continue and retries without choosing a new date or seed", async () => {
  vi.stubGlobal("document", { hidden: true, documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const app = new GameApp(store);
  const bound = new Set<GameSession>();
  app.subscribe(() => { const session = app.getSnapshot().session; if (session?.kind === "local" && !bound.has(session)) { bound.add(session); session.bind({ sync() {}, stop() {}, async present() {} }); } });
  try {
    await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("empty"));
    const challenge = dailyChallenge("2026-12-31");
    await app.startChallenge(challenge);
    const first = app.getSnapshot().session!;
    if (first.kind !== "local") throw new Error("Expected local session");
    expect(first.challenge).toEqual(challenge); expect(first.getSnapshot().committed.config).toEqual(challengeConfig(challenge));
    expect((await store.readChallenges()).results[0]!.attempts).toBe(1);
    await app.leave(); await app.continueSaved();
    const restored = app.getSnapshot().session!;
    if (restored.kind !== "local") throw new Error("Expected local session");
    expect(restored.challenge).toEqual(challenge);
    expect(restored.getSnapshot().committed).toEqual(first.getSnapshot().committed);
    expect((await store.readChallenges()).results[0]!.attempts).toBe(1);
    await app.restart();
    const restarted = app.getSnapshot().session!;
    if (restarted.kind !== "local") throw new Error("Expected local session");
    expect(restarted.challenge).toEqual(challenge);
    expect(app.getSnapshot().session!.matchId).not.toBe(first.matchId);
    expect((await store.readChallenges()).results[0]!.attempts).toBe(2);
    await app.refreshProfile();
    expect(app.getSnapshot().profile).toMatchObject({ kind: "ready", challenges: { results: [{ challenge, attempts: 2 }] } });
  } finally { app.dispose(); }
});

it("the terminal save refreshes the actual application score projection after transaction completion, not at the preceding rule commit", async () => {
  vi.stubGlobal("document", { hidden: false, documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const app = new GameApp(store);
  const bound = new Set<GameSession>();
  app.subscribe(() => { const session = app.getSnapshot().session; if (session?.kind === "local" && !bound.has(session)) { bound.add(session); session.bind({ sync() {}, stop() {}, async present() {} }); } });
  try {
    await app.startChallenge(dailyChallenge("2026-10-09"));
    const session = app.getSnapshot().session!;
    for (let count = 0; session.getSnapshot().committed.decision.kind !== "game_over" && count < 150; count += 1) {
      const state = session.getSnapshot().committed;
      const commands = legalCommands(state, "p1");
      const command = commands.find((choice) => choice.kind === "buy") ?? commands.find((choice) => choice.kind === "roll") ?? commands[0]!;
      await session.dispatch(command);
    }
    expect(session.getSnapshot().committed.decision.kind).toBe("game_over");
    await vi.waitFor(() => expect(app.getSnapshot().profile).toMatchObject({ kind: "ready", challenges: { active: { completed: true }, results: [{ best: { rank: expect.any(Number), netAssets: expect.any(Number) } }] } }));
    expect((await store.readProfile()).records.recent).toHaveLength(1);
    expect((await store.readProfile()).records.achievements).toEqual(expect.arrayContaining(["first-match", "first-purchase"]));
    expect(app.getSnapshot().profile).toEqual({ kind: "ready", ...await store.readProfile() });
  } finally { app.dispose(); }
});
