import { expect, it } from "vitest";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { HISTORY_LIMIT, type GameSnapshot } from "../../src/domain/types";
import { makeSave, readSave } from "../../src/storage/snapshot";

const matchId = "00000000-0000-4000-8000-000000000004";

function played() {
  const game = new Game(createMatchConfig(940));
  for (const kind of ["roll", "buy", "roll"] as const) expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((command) => command.kind === kind)!).ok).toBe(true);
  return game;
}

it("atomically retains the last 100 semantic events and restores without replay or shared mutable input", () => {
  const game = new Game(createMatchConfig(940, 4));
  const all: GameSnapshot["history"][number][] = [];
  for (let count = 0; count < 400 && game.snapshot.decision.kind !== "game_over"; count += 1) {
    const result = game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).at(-1)!);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    all.push(...result.events.map((event) => ({ revision: result.snapshot.revision, event })));
    expect(result.snapshot.history).toEqual(all.slice(-HISTORY_LIMIT));
  }
  expect(all.length).toBeGreaterThan(HISTORY_LIMIT);
  expect(game.snapshot.decision.kind).toBe("game_over");
  const raw = JSON.parse(JSON.stringify(makeSave(game.snapshot, matchId)));
  const restored = Game.restore(readSave(raw).record.state);
  expect(restored.snapshot).toEqual(game.snapshot);
  raw.state.history[0].event.actor = "mutated";
  expect(restored.snapshot).toEqual(game.snapshot);
  expect(Object.isFrozen(restored.snapshot.history[0]?.event)).toBe(true);
});

it("rejected commands do not append and restoring nested movement does not retain raw references", () => {
  const game = played();
  const before = game.snapshot;
  expect(game.apply({ actor: "p1", kind: "roll", expectedRevision: 0 }).ok).toBe(false);
  expect(game.snapshot.history).toBe(before.history);
  const raw = JSON.parse(JSON.stringify(makeSave(before, matchId)));
  const restored = Game.restore(raw.state);
  raw.state.history[0].event.result.path[0] = 19;
  raw.state.history[0].event.result.landing.price = 0;
  expect(restored.snapshot).toEqual(before);
});

it.each([
  (raw: any) => { delete raw.state.history; },
  (raw: any) => { raw.state.history = []; },
  (raw: any) => { raw.state.history = Array(101).fill(raw.state.history[0]); },
  (raw: any) => { raw.state.history.reverse(); },
  (raw: any) => { raw.state.history[0].revision = 4; },
  (raw: any) => { raw.state.history[0].event.result.playerId = "p4"; },
  (raw: any) => { raw.state.history[0].event.result.dice = [0, 6]; },
  (raw: any) => { raw.state.history[0].event.result.path[0] = 19; },
  (raw: any) => { raw.state.history[0].event.result.startBonus = 200; },
  (raw: any) => { raw.state.history[0].event.result.landing.propertyId = "city-tax"; },
  (raw: any) => { raw.state.history[0].event.result.landing.price = 0; },
  (raw: any) => { raw.state.history[1].event.price = 0; },
  (raw: any) => { raw.state.history[2].event.actor = "p4"; },
  (raw: any) => { raw.state.history[3].event.result.landing.ownerId = "p2"; },
  (raw: any) => { raw.state.history[3].event.result.landing.amount = -1; },
  (raw: any) => { raw.state.history[0].event.externalURL = "https://example.com"; },
])("rejects malformed history %# without changing the live match", (mutate) => {
  const game = played();
  const before = game.snapshot;
  const raw = JSON.parse(JSON.stringify(makeSave(before, matchId)));
  mutate(raw);
  expect(() => readSave(raw)).toThrow();
  expect(game.snapshot).toBe(before);
});
