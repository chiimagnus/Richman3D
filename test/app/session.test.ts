import { createMatchConfig } from "../../src/domain/config";
import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../../src/app/GameSession";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import type { PresentationPort } from "../../src/app/PresentationQueue";

function controlledPort() {
  let complete = () => {};
  const port: PresentationPort = {
    sync: vi.fn(), stop: vi.fn(),
    present: vi.fn(() => new Promise<void>((resolve) => { complete = resolve; })),
  };
  return { port, finish: () => complete() };
}

describe("session lifecycle and visible order", () => {
  it("explicit application activation waits for the real view, then drives a computer p1 and stops at the human p2", async () => {
    const base = createMatchConfig(940);
    const config = { ...base, players: base.players.map((player, index) => ({ ...player, controller: index === 0 ? "bot" as const : "human" as const })) };
    const game = new Game(config);
    const session = new GameSession(game);
    const activation = session.activate();
    expect(game.snapshot.revision).toBe(0);
    session.bind({ sync() {}, stop() {}, async present() {} });
    await activation;
    expect(game.snapshot.turnPlayerId).toBe("p2");
    expect(game.snapshot.revision).toBe(2);
    expect(game.snapshot.owners["neon-avenue"]).toBe("p1");
    expect(game.snapshot.players[0]?.cash).toBe(1320);
  });

  it("disposal releases activation waiting without a ghost command", async () => {
    const game = new Game(createMatchConfig(940));
    const session = new GameSession(game);
    const waiting = session.activate();
    session.dispose();
    await waiting;
    expect(game.snapshot.revision).toBe(0);
  });
  it("settles cash and exposes the cause before allowing the next bot command", async () => {
    const game = new Game(createMatchConfig(6));
    const session = new GameSession(game);
    let release = () => {};
    const presenting = vi.fn<PresentationPort["present"]>(async (_events, _signal, settle) => {
      if (game.snapshot.revision === 1) {
        expect(settle()).toBe(1750);
        await new Promise<void>((resolve) => { release = resolve; });
      }
    });
    session.bind({ sync() {}, stop() {}, present: presenting });
    const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    await Promise.resolve();
    const feedback = session.getSnapshot();
    expect(feedback.presenting).toBe(true);
    expect(feedback.displayed.players[0]?.cash).toBe(1420);
    expect(feedback.notice?.event.kind).toBe("rolled");
    expect(game.snapshot.revision).toBe(1);
    expect(presenting).toHaveBeenCalledTimes(1);
    expect(session.claimAnnouncement(feedback.notice!.id)).toBe(true);
    expect(session.claimAnnouncement(feedback.notice!.id)).toBe(false);
    await session.dispatch({ kind: "roll", actor: "p2", expectedRevision: 1 });
    expect(game.snapshot.revision).toBe(1);
    release();
    await work;
    expect(game.snapshot.revision).toBe(3);
  });

  it("holds the previous player and balances while the committed result is already final", async () => {
    const game = new Game(createMatchConfig(6));
    const session = new GameSession(game);
    const controlled = controlledPort();
    session.bind(controlled.port);
    const before = session.getSnapshot();
    expect(session.getSnapshot()).toBe(before);
    const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    await Promise.resolve();
    const mid = session.getSnapshot();
    expect(mid.presenting).toBe(true);
    expect(mid.displayed.players[0]?.cash).toBe(1500);
    expect(mid.displayed.turnPlayerId).toBe("p1");
    expect(mid.committed.players[0]?.cash).toBe(1420);
    expect(mid.committed.turnPlayerId).toBe("p2");
    await session.dispatch({ kind: "roll", actor: "p2", expectedRevision: 1 });
    expect(game.snapshot.revision).toBe(1);
    session.pause();
    await work;
    expect(session.getSnapshot().displayed).toBe(game.snapshot);
    expect(session.getSnapshot().presenting).toBe(false);
    expect(game.snapshot.revision).toBe(1);
  });

  it.each(["pause", "dispose"] as const)("%s ends waiting even if a renderer ignores cancellation; late completion cannot advance", async (action) => {
    const game = new Game(createMatchConfig(6));
    const session = new GameSession(game);
    const controlled = controlledPort();
    session.bind(controlled.port);
    const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    await Promise.resolve();
    session[action]();
    await work;
    const stopped = session.getSnapshot();
    controlled.finish();
    await Promise.resolve();
    expect(game.snapshot.revision).toBe(1);
    expect(session.getSnapshot()).toBe(stopped);
    expect(controlled.port.stop).toHaveBeenCalled();
  });

  it("skip reveals the final purchase decision without a second command", async () => {
    const game = new Game(createMatchConfig(940));
    const session = new GameSession(game);
    const controlled = controlledPort();
    session.bind(controlled.port);
    const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    await Promise.resolve();
    session.skipPresentation();
    await work;
    expect(game.snapshot.revision).toBe(1);
    expect(session.getSnapshot().displayed.decision.kind).toBe("awaiting_purchase");
    expect(controlled.port.sync).toHaveBeenLastCalledWith(game.snapshot);
  });

  it("binding reconstructs committed state; unmounting does not destroy or replay the match", async () => {
    const game = new Game(createMatchConfig(6));
    const session = new GameSession(game);
    const controlled = controlledPort();
    const unbind = session.bind(controlled.port);
    const work = session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    await Promise.resolve();
    unbind();
    await work;
    const committed = game.snapshot;
    const newPort = controlledPort().port;
    session.bind(newPort);
    expect(newPort.sync).toHaveBeenCalledWith(committed);
    expect(newPort.present).not.toHaveBeenCalled();
    expect(session.getSnapshot().mode).toBe("paused");
    expect(game.snapshot).toBe(committed);
  });

  it("normal completion drives the bot through the same command entrance", async () => {
    const game = new Game(createMatchConfig(6));
    const session = new GameSession(game);
    const port: PresentationPort = { sync: vi.fn(), stop: vi.fn(), present: vi.fn(async () => {}) };
    session.bind(port);
    await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    expect(game.snapshot.turnPlayerId).toBe("p1");
    expect(game.snapshot.revision).toBeGreaterThanOrEqual(2);
    expect(game.snapshot.players[0]?.cash).toBe(1420);
    expect(session.getSnapshot().displayed).toBe(game.snapshot);
  });

  it("a presentation failure preserves committed money and pauses instead of retrying rules", async () => {
    const game = new Game(createMatchConfig(6));
    const session = new GameSession(game);
    session.bind({ sync: vi.fn(), stop: vi.fn(), present: async () => { throw new Error("GPU failed"); } });
    await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    expect(session.getSnapshot().mode).toBe("paused");
    expect(session.getSnapshot().error).toBe("presentation_failed");
    await session.resume();
    expect(session.getSnapshot().mode).toBe("paused");
    expect(session.getSnapshot().error).toBe("presentation_failed");
    expect(game.snapshot.players[0]?.cash).toBe(1420);
    expect(game.snapshot.revision).toBe(1);
  });

  it("can resume after rejected stale input, then execute a real roll and purchase once", async () => {
    const game = new Game(createMatchConfig(940));
    const session = new GameSession(game);
    session.bind({ sync() {}, stop() {}, async present() {} });
    const before = game.snapshot;
    await session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 1 });
    expect(session.getSnapshot().error).toBe("command_rejected");
    expect(game.snapshot).toBe(before);
    session.pause();
    await session.resume();
    expect(session.getSnapshot().mode).toBe("running");
    expect(session.getSnapshot().error).toBeNull();
    expect(game.snapshot).toBe(before);
    await session.dispatch(legalCommands(game.snapshot, "p1")[0]!);
    expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
    await session.dispatch(legalCommands(game.snapshot, "p1").find((command) => command.kind === "buy")!);
    expect(game.snapshot.owners["neon-avenue"]).toBe("p1");
    expect(game.snapshot.players[0]?.cash).toBe(1352);
    expect(game.snapshot.revision).toBe(3);
  });
});
