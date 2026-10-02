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
  it("holds the previous player and balances while the committed result is already final", async () => {
    const game = new Game({ seed: 1 });
    const session = new GameSession(game);
    const controlled = controlledPort();
    session.bind(controlled.port);
    const before = session.getSnapshot();
    expect(session.getSnapshot()).toBe(before);
    const work = session.dispatch(legalCommands(game.snapshot, "human")[0]!);
    await Promise.resolve();
    const mid = session.getSnapshot();
    expect(mid.presenting).toBe(true);
    expect(mid.displayed.players[0]?.cash).toBe(1500);
    expect(mid.displayed.activePlayerId).toBe("human");
    expect(mid.committed.players[0]?.cash).toBe(1420);
    expect(mid.committed.activePlayerId).toBe("bot");
    await session.dispatch({ kind: "roll", actor: "bot", expectedRevision: 1 });
    expect(game.snapshot.revision).toBe(1);
    session.pause();
    await work;
    expect(session.getSnapshot().displayed).toBe(game.snapshot);
    expect(session.getSnapshot().presenting).toBe(false);
    expect(game.snapshot.revision).toBe(1);
  });

  it.each(["pause", "dispose"] as const)("%s ends waiting even if a renderer ignores cancellation; late completion cannot advance", async (action) => {
    const game = new Game({ seed: 1 });
    const session = new GameSession(game);
    const controlled = controlledPort();
    session.bind(controlled.port);
    const work = session.dispatch(legalCommands(game.snapshot, "human")[0]!);
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
    const game = new Game({ seed: 341 });
    const session = new GameSession(game);
    const controlled = controlledPort();
    session.bind(controlled.port);
    const work = session.dispatch(legalCommands(game.snapshot, "human")[0]!);
    await Promise.resolve();
    session.skipPresentation();
    await work;
    expect(game.snapshot.revision).toBe(1);
    expect(session.getSnapshot().displayed.decision.kind).toBe("awaiting_purchase");
    expect(controlled.port.sync).toHaveBeenLastCalledWith(game.snapshot);
  });

  it("binding reconstructs committed state; unmounting does not destroy or replay the match", async () => {
    const game = new Game({ seed: 1 });
    const session = new GameSession(game);
    const controlled = controlledPort();
    const unbind = session.bind(controlled.port);
    const work = session.dispatch(legalCommands(game.snapshot, "human")[0]!);
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
    const game = new Game({ seed: 1 });
    const session = new GameSession(game);
    const port: PresentationPort = { sync: vi.fn(), stop: vi.fn(), present: vi.fn(async () => {}) };
    session.bind(port);
    await session.dispatch(legalCommands(game.snapshot, "human")[0]!);
    expect(game.snapshot.activePlayerId).toBe("human");
    expect(game.snapshot.revision).toBeGreaterThanOrEqual(2);
    expect(game.snapshot.players[0]?.cash).toBe(1420);
    expect(session.getSnapshot().displayed).toBe(game.snapshot);
  });

  it("a presentation failure preserves committed money and pauses instead of retrying rules", async () => {
    const game = new Game({ seed: 1 });
    const session = new GameSession(game);
    session.bind({ sync: vi.fn(), stop: vi.fn(), present: async () => { throw new Error("GPU failed"); } });
    await session.dispatch(legalCommands(game.snapshot, "human")[0]!);
    expect(session.getSnapshot().mode).toBe("paused");
    expect(session.getSnapshot().error).toBe("presentation_failed");
    await session.resume();
    expect(session.getSnapshot().mode).toBe("paused");
    expect(session.getSnapshot().error).toBe("presentation_failed");
    expect(game.snapshot.players[0]?.cash).toBe(1420);
    expect(game.snapshot.revision).toBe(1);
  });

  it("can resume after rejected stale input, then execute a real roll and purchase once", async () => {
    const game = new Game({ seed: 341 });
    const session = new GameSession(game);
    session.bind({ sync() {}, stop() {}, async present() {} });
    const before = game.snapshot;
    await session.dispatch({ kind: "roll", actor: "human", expectedRevision: 1 });
    expect(session.getSnapshot().error).toBe("command_rejected");
    expect(game.snapshot).toBe(before);
    session.pause();
    await session.resume();
    expect(session.getSnapshot().mode).toBe("running");
    expect(session.getSnapshot().error).toBeNull();
    expect(game.snapshot).toBe(before);
    await session.dispatch(legalCommands(game.snapshot, "human")[0]!);
    expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
    await session.dispatch(legalCommands(game.snapshot, "human").find((command) => command.kind === "buy")!);
    expect(game.snapshot.owners["neon-avenue"]).toBe("human");
    expect(game.snapshot.players[0]?.cash).toBe(1352);
    expect(game.snapshot.revision).toBe(3);
  });
});
