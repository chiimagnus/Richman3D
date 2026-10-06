import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { GameSession } from "../../src/app/GameSession";
import { DiceView } from "../../src/rendering/DiceView";
import { MotionClock } from "../../src/rendering/MotionClock";
import { PlayerView } from "../../src/rendering/PlayerView";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "../fixtures/property-match";
import { PRESENTATION_RATES } from "../../src/settings/preferences";
import { debtCheckpoint } from "../fixtures/debt-match";
import type { PresentationPort } from "../../src/app/PresentationQueue";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["normal", "fast"] as const)("%s keeps notice lifetime aligned with real playback, without double-scaling logical waits", async (speed) => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const config = createMatchConfig(6);
  const game = new Game({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
  const session = new GameSession(game); session.setPresentationSpeed(speed);
  let complete = () => {};
  session.bind({ sync() {}, stop() {}, async present(_events, _signal, settle) {
    expect(settle()).toBe(1750);
    await new Promise<void>(resolve => { complete = resolve; });
  } });
  try {
    expect(session.confirmHandover("p1")).toBe(true);
    const work = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 }); await Promise.resolve();
    const view = session.getSnapshot();
    expect(view.notice!.expiresAt).toBe(1000 + 1750 / PRESENTATION_RATES[speed]);
    expect(view.notice!.event.kind).toBe("paid"); expect(view.presenting).toBe(true);
    expect(view.committed.players[0]!.cash).toBe(1420);
    await session.dispatch({ kind: "roll", actor: "p2", expectedRevision: 1 });
    expect(game.snapshot).toBe(view.committed);
    complete(); await work;
    expect(session.handoverActor).toBe("p2"); expect(game.snapshot.revision).toBe(1);
  } finally { session.dispose(); }
});

async function trace(seed: number, mode: "normal" | "fast" | "reduced" | "skip") {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: mode === "reduced" }) });
  const config = createMatchConfig(seed);
  const game = new Game({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
  const session = new GameSession(game); const clock = new MotionClock(); const dice = new DiceView(clock); const scene = new THREE.Scene();
  const pawns = new Map(config.players.map((player, index) => [player.id, new PlayerView(scene, player.color, clock, game.snapshot.map, index)]));
  const speed = mode === "fast" ? "fast" : "normal";
  session.setPresentationSpeed(speed); clock.setPlaybackRate(PRESENTATION_RATES[speed]);
  session.bind({
    sync(snapshot) { for (const player of snapshot.players) pawns.get(player.id)!.setPosition(player.position); },
    stop() { clock.cancel(); dice.hide(); },
    async present(events, signal, settle, show, settleDice) {
      for (const event of events) {
        if (signal.aborted) return;
        if (event.kind === "rolled") {
          if (!await dice.roll(event.result.dice, settleDice, signal, mode === "reduced")) return;
          await pawns.get(event.result.playerId)!.moveAlong(event.result.path, undefined, signal);
        } else if (event.kind === "card_moved") {
          show(event);
          if (event.result.direction === "teleport") pawns.get(event.result.playerId)!.setPosition(event.result.to);
          else await pawns.get(event.result.playerId)!.moveAlong(event.result.path, undefined, signal);
        }
      }
      if (!signal.aborted) await clock.animate(settle(), () => {}, signal);
    },
  });
  const snapshots = [];
  try {
    for (let commandIndex = 0; commandIndex < 500 && game.snapshot.decision.kind !== "game_over"; commandIndex += 1) {
      const actor = game.snapshot.decision.actorId;
      if (session.handoverActor) expect(session.confirmHandover(actor)).toBe(true);
      const commands = legalCommands(game.snapshot, actor);
      const command = commands.find(candidate => candidate.kind === "roll" || candidate.kind === "buy" || candidate.kind === "discard_item" || candidate.kind === "bankrupt") ?? commands[0]!;
      let complete = false;
      const work = session.dispatch(command).then(() => { complete = true; });
      for (let frame = 0; frame < 200 && !complete; frame += 1) {
        await Promise.resolve(); clock.update(100);
        if (mode === "skip" && commandIndex % 3 === 0 && session.getSnapshot().presenting) session.skipPresentation();
      }
      expect(complete).toBe(true); await work;
      expect(session.getSnapshot().error).toBeNull(); expect(session.getSnapshot().displayed).toBe(game.snapshot);
      const record = makeSave(game.snapshot, propertyMatchId); expect(readSave(record).snapshot).toEqual(game.snapshot); snapshots.push(record.state);
      for (const player of game.snapshot.players) expect(pawns.get(player.id)!.position.distanceTo(new THREE.Vector3(game.snapshot.map.path[player.position]!.x, 0, game.snapshot.map.path[player.position]!.z))).toBeLessThan(1e-8);
    }
    expect(game.snapshot.decision.kind).toBe("game_over"); expect(clock.activeCount).toBe(0);
    return snapshots;
  } finally { session.dispose(); dice.dispose(); for (const pawn of pawns.values()) pawn.dispose(); }
}

it.each([6, 55, 940].flatMap(seed => ["fast", "reduced", "skip"].map(mode => ({ seed, mode: mode as "fast" | "reduced" | "skip" }))))("seed $seed under $mode has the same entire command/save trajectory as normal playback", async ({ seed, mode }) => {
  expect(await trace(seed, mode)).toEqual(await trace(seed, "normal"));
});

it("fast playback and repeated skip/pause cannot dismiss a real debt decision or re-charge its fixed obligation", async () => {
  const game = debtCheckpoint(); const session = new GameSession(game); session.setPresentationSpeed("fast");
  session.bind({ sync() {}, stop() {}, async present(_events, _signal, settle) { expect(settle()).toBe(0); } });
  try {
    await session.dispatch({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
    const debt = game.snapshot; expect(debt.decision.kind).toBe("awaiting_debt"); expect(session.getSnapshot().notice).toBeNull();
    session.skipPresentation(); session.pause(); await session.resume(); session.skipPresentation();
    expect(game.snapshot).toBe(debt); expect(session.getSnapshot().displayed).toBe(debt); expect(session.getSnapshot().notice).toBeNull();
  } finally { session.dispose(); }
});

it("fast playback keeps a trade response open without accepting it or dropping the actor handover", async () => {
  const config = createMatchConfig(940); const game = new Game({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
  const session = new GameSession(game); session.setPresentationSpeed("fast");
  session.bind({ sync() {}, stop() {}, async present(_events, _signal, settle) { expect(settle()).toBe(0); } });
  try {
    expect(session.confirmHandover("p1")).toBe(true); await session.dispatch({ kind: "trade_propose", actor: "p1", expectedRevision: game.snapshot.revision,
      terms: { recipientId: "p2", givePropertyIds: [], receivePropertyIds: [], cash: { payerId: "p1", amount: 10 } } });
    const trade = game.snapshot; expect(trade.decision.kind).toBe("awaiting_trade"); expect(session.handoverActor).toBe("p2");
    session.skipPresentation(); session.pause(); await session.resume();
    expect(session.confirmHandover("p2")).toBe(true); session.skipPresentation();
    expect(game.snapshot).toBe(trade); expect(session.getSnapshot().notice).toBeNull(); expect(session.getSnapshot().displayed.decision).toBe(trade.decision);
  } finally { session.dispose(); }
});

it("pause and resume reject every late projection callback from the old renderer, even during the next committed action", async () => {
  const config = createMatchConfig(6); const game = new Game({ ...config, players: config.players.map(player => ({ ...player, controller: "human" })) });
  const session = new GameSession(game);
  const callbacks: { settle: () => number; show: Parameters<PresentationPort["present"]>[3]; dice: () => void }[] = [];
  session.bind({ sync() {}, stop() {}, present(_events, _signal, settle, show, dice) {
    callbacks.push({ settle, show, dice }); return new Promise(() => {});
  } });
  try {
    expect(session.confirmHandover("p1")).toBe(true);
    const first = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 }); await Promise.resolve();
    const events = session.getSnapshot().events; session.pause(); await first;
    expect(session.getSnapshot().notice).toBeNull();
    await session.resume(); expect(session.confirmHandover("p2")).toBe(true);
    const second = session.dispatch({ kind: "roll", actor: "p2", expectedRevision: 1 }); await Promise.resolve();
    const current = session.getSnapshot(); expect(current.committed.revision).toBe(2);
    expect(callbacks[0]!.settle()).toBe(0); callbacks[0]!.show(events[0]!); callbacks[0]!.dice();
    expect(session.getSnapshot()).toBe(current); expect(game.snapshot).toBe(current.committed);
    session.skipPresentation(); await second;
    expect(session.getSnapshot().displayed).toBe(current.committed);
  } finally { session.dispose(); }
});
