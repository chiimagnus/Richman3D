import { expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import type { PresentationPort } from "../../src/app/PresentationQueue";
import { makeSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "../fixtures/property-match";

function presentation() {
  let settled = () => {};
  let finish = () => {};
  const port: PresentationPort = { sync() {}, stop() {}, present: (_events, _signal, _settle, _show, settleDice) => {
    settled = settleDice;
    return new Promise<void>((resolve) => { finish = resolve; });
  } };
  return { port, settle: () => settled(), finish: () => finish() };
}

it("projects one actual settled roll before movement completes without opening the purchase decision or changing rules", async () => {
  const game = new Game(createMatchConfig(940)); const session = new GameSession(game); const view = presentation();
  session.bind(view.port);
  try {
    const rolling = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 });
    await vi.waitFor(() => expect(session.getSnapshot().presenting).toBe(true));
    const committed = game.snapshot; const event = session.getSnapshot().events.find((entry) => entry.kind === "rolled");
    expect(event?.kind).toBe("rolled"); if (event?.kind !== "rolled") throw new Error("Missing roll");
    expect(session.getSnapshot().settledRoll).toBeNull();
    expect(session.claimDiceAnnouncement(1)).toBe(false);
    view.settle(); const settled = session.getSnapshot();
    expect(settled.settledRoll).toEqual({ revision: committed.revision, result: event.result });
    expect(settled.settledRoll!.result).toBe(event.result);
    expect(settled.presenting).toBe(true); expect(settled.displayed.revision).toBe(0); expect(game.snapshot).toBe(committed);
    expect(session.claimDiceAnnouncement(1)).toBe(true); expect(session.claimDiceAnnouncement(1)).toBe(false);
    view.settle(); expect(session.getSnapshot()).toBe(settled);
    await session.dispatch({ kind: "buy", actor: "p1", expectedRevision: 1 }); expect(game.snapshot).toBe(committed);
    view.finish(); await rolling; expect(session.getSnapshot().presenting).toBe(false);
    expect(session.getSnapshot().displayed).toBe(committed); expect(committed.lastRoll).toEqual(event.result.dice);
    session.pause(); await session.resume(); expect(session.claimDiceAnnouncement(1)).toBe(false); expect(game.snapshot).toBe(committed);
  } finally { session.dispose(); }
});

it.each(["skip", "pause", "dispose"] as const)("%s synchronizes the committed roll and ignores a late renderer settlement", async (action) => {
  const game = new Game(createMatchConfig(940)); const session = new GameSession(game); const view = presentation();
  session.bind(view.port);
  try {
    const rolling = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 });
    await vi.waitFor(() => expect(session.getSnapshot().presenting).toBe(true));
    const committed = game.snapshot;
    if (action === "skip") session.skipPresentation(); else session[action]();
    await rolling;
    const stopped = session.getSnapshot(); view.settle(); view.finish(); await Promise.resolve();
    expect(session.getSnapshot()).toBe(stopped); expect(game.snapshot).toBe(committed);
    expect(stopped.displayed.lastRoll).toEqual(committed.lastRoll); expect(stopped.presenting).toBe(false);
    if (action === "skip") { expect(stopped.settledRoll?.result.dice).toEqual(committed.lastRoll); expect(session.claimDiceAnnouncement(committed.revision)).toBe(true); expect(session.claimDiceAnnouncement(committed.revision)).toBe(false); }
    else { expect(stopped.settledRoll).toBeNull(); expect(session.claimDiceAnnouncement(committed.revision)).toBe(false); }
  } finally { session.dispose(); }
});

it("does not replay a dice announcement when reconstructing an already committed match", () => {
  const game = new Game(createMatchConfig(940)); expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const session = new GameSession(Game.restore(makeSave(game.snapshot, propertyMatchId).state));
  try { session.bind({ sync() {}, stop() {}, async present() {} }); expect(session.getSnapshot().displayed.lastRoll).toEqual(game.snapshot.lastRoll); expect(session.getSnapshot().settledRoll).toBeNull(); expect(session.claimDiceAnnouncement(1)).toBe(false); }
  finally { session.dispose(); }
});
