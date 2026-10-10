import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import type { GameSession } from "../../src/app/GameSession";
import { audioProtocol } from "../fixtures/audio";

vi.mock("../../src/ui/SceneHost", () => ({ SceneHost: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture() {
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: { lang: "" } });
  vi.stubGlobal("document", document);
  const contexts = audioProtocol(); const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const app = new GameApp(store); const attached = new Set<GameSession>();
  app.subscribe(() => {
    const session = app.getSnapshot().session;
    if (session?.kind === "local" && !attached.has(session)) {
      attached.add(session);
      session.bind({ sync() {}, stop() { app.audio.stop(); }, async present(events) {
        if (events.some(event => event.kind === "purchased")) app.audio.playPurchase();
      } });
    }
  });
  await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("empty"));
  return { app, store, document, contexts };
}

it("the actual application owns music across pause/visibility/leave/reentry and preserves zero volumes and mute", async () => {
  const { app, document, contexts } = await fixture();
  try {
    expect(contexts).toHaveLength(0); await app.start(createMatchConfig(6));
    const session = app.getSnapshot().session!; const before = session.getSnapshot().committed;
    expect(contexts).toHaveLength(1); expect(app.audio.activeNodeCount).toBe(3);
    app.audio.playRoll(); expect(app.audio.activeNodeCount).toBe(7);
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    expect(app.audio.activeNodeCount).toBe(0); expect(session.getSnapshot().mode).toBe("paused");
    document.hidden = false; document.dispatchEvent(new Event("visibilitychange"));
    expect(app.audio.activeNodeCount).toBe(0); await session.resume(); expect(app.audio.activeNodeCount).toBe(3);
    expect(session.getSnapshot().committed).toBe(before);
    await app.leave(); expect(app.audio.activeNodeCount).toBe(0);
    await app.continueSaved(); expect(app.audio.activeNodeCount).toBe(3); expect(contexts).toHaveLength(1);
    app.setPreferences({ ...app.getSnapshot().preferences, effectsVolume: 0, musicVolume: 0 });
    expect(app.audio.activeNodeCount).toBe(0); await app.restart(); app.audio.playPurchase();
    expect(app.audio.activeNodeCount).toBe(0); expect(contexts).toHaveLength(1);
    app.setPreferences({ ...app.getSnapshot().preferences, effectsVolume: 1, musicVolume: 0.12, soundEnabled: false });
    await app.restart(); expect(app.audio.activeNodeCount).toBe(0); expect(contexts).toHaveLength(1);
  } finally { app.dispose(); expect(contexts[0]!.close).toHaveBeenCalledTimes(1); }
});

it("a real session reaching its terminal decision stops ambient music without changing rule or saved results", async () => {
  const { app, store, contexts } = await fixture(); const config = createMatchConfig(6);
  try {
    await app.start({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
    const session = app.getSnapshot().session!;
    if (session.kind !== "local") throw new Error("Expected local session");
    for (let index = 0; index < 300 && session.getSnapshot().committed.decision.kind !== "game_over"; index += 1) {
      const snapshot = session.getSnapshot().committed;
      if (snapshot.decision.kind === "game_over") break;
      if (session.handoverActor) expect(session.confirmHandover(snapshot.decision.actorId)).toBe(true);
      const commands = legalCommands(snapshot, snapshot.decision.actorId);
      const command = commands.find(command => command.kind === "roll" || command.kind === "buy" || command.kind === "discard_item" || command.kind === "bankrupt") ?? commands[0]!;
      await session.dispatch(command);
    }
    const terminal = session.getSnapshot().committed; expect(terminal.decision.kind).toBe("game_over");
    for (const oscillator of contexts[0]!.oscillators) {
      const ended = oscillator.onended; oscillator.onended = null; ended?.();
    }
    expect(app.audio.activeNodeCount).toBe(0); expect((await store.read())!.snapshot).toEqual(terminal);
    expect(contexts).toHaveLength(1);
  } finally { app.dispose(); }
});

it("native audio allocation failure during an actual purchase cannot reject, repeat or lose the committed payment", async () => {
  const { app, store, contexts } = await fixture(); const config = createMatchConfig(940);
  try {
    await app.start({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
    const session = app.getSnapshot().session!;
    if (session.kind !== "local") throw new Error("Expected local session");
    expect(session.confirmHandover("p1")).toBe(true);
    await session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 });
    vi.spyOn(contexts[0]!, "createOscillator").mockImplementationOnce(() => { throw new Error("allocation"); });
    await session.dispatch({ kind: "buy", actor: "p1", expectedRevision: 1 });
    expect(session.getSnapshot().error).toBeNull(); expect(session.getSnapshot().committed.players[0]!.cash).toBe(1320);
    expect(session.getSnapshot().committed.properties["neon-avenue"]!.ownerId).toBe("p1");
    expect((await store.read())!.snapshot).toEqual(session.getSnapshot().committed); expect(app.audio.getSnapshot()).toBe("blocked");
  } finally { app.dispose(); }
});
