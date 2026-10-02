import { expect, it } from "vitest";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import { makeSave, readSave } from "../../src/storage/snapshot";

const matchId = "00000000-0000-4000-8000-000000000001";

it.each([768, 940, 108])("restores every committed decision and RNG of a real match with seed %s, without replaying events", (seed) => {
  let game = new Game(createMatchConfig(seed));
  for (let commandCount = 0; commandCount < 200; commandCount += 1) {
    const record = makeSave(game.snapshot, matchId, "local", 1000);
    expect(Object.keys(record.state)).not.toContain("map");
    expect(Object.keys(record.state)).not.toContain("rules");
    const restored = Game.restore(readSave(JSON.parse(JSON.stringify(record))).record.state);
    expect(restored.snapshot).toEqual(game.snapshot);
    expect(restored.snapshot).toBe(restored.snapshot);
    expect(Object.isFrozen(restored.snapshot.players[0]?.statistics)).toBe(true);
    if (game.snapshot.decision.kind === "game_over") return;
    const command = chooseBotCommand(game.snapshot) ?? legalCommands(game.snapshot, game.snapshot.activePlayerId).at(-1)!;
    expect(restored.apply(command)).toEqual(game.apply(command));
    game = restored;
  }
  throw new Error("Match did not finish");
});

it("does not retain mutable external state or accept injected rules under a registered version", () => {
  const game = new Game(createMatchConfig(940));
  const raw = JSON.parse(JSON.stringify(makeSave(game.snapshot, matchId)));
  const restored = Game.restore(readSave(raw).record.state);
  raw.state.players[0].cash = 0;
  raw.state.config.players[0].name = "changed";
  expect(restored.snapshot).toEqual(game.snapshot);
  expect(() => makeSave({ ...game.snapshot, rules: { ...game.snapshot.rules, startingCash: 9 } }, matchId)).toThrow();
});

it.each([
  (raw: any) => { raw.schemaVersion = 2; },
  (raw: any) => { raw.rulesVersion = raw.state.config.rulesVersion = "unknown"; },
  (raw: any) => { raw.mapVersion = raw.state.config.mapVersion = 2; },
  (raw: any) => { raw.state.players[0].cash = NaN; },
  (raw: any) => { raw.state.players[0].cash = Number.MAX_SAFE_INTEGER + 1; },
  (raw: any) => { raw.state.players[0].statistics.taxesPaid = -1; },
  (raw: any) => { raw.state.players[0].cash += 1; },
  (raw: any) => { raw.state.players[0].position = 20; },
  (raw: any) => { raw.state.players[0].bankrupt = true; },
  (raw: any) => { raw.state.players[1].id = "p1"; },
  (raw: any) => { raw.state.config.players[1].id = "p1"; },
  (raw: any) => { raw.state.activePlayerId = "p4"; },
  (raw: any) => { raw.state.turnOrder = ["p1", "p1"]; },
  (raw: any) => { raw.state.turnOrder.reverse(); },
  (raw: any) => { delete raw.state.turnOrder; },
  (raw: any) => { raw.rulesVersion = raw.state.config.rulesVersion = "city-v1-quick"; },
  (raw: any) => { raw.state.owners["city-tax"] = "p1"; },
  (raw: any) => { raw.state.owners["neon-avenue"] = "p4"; },
  (raw: any) => { raw.state.owners["neon-avenue"] = "p1"; },
  (raw: any) => { raw.state.decision = { kind: "awaiting_purchase", propertyId: "neon-avenue" }; },
  (raw: any) => { raw.state.decision = { kind: "game_over", result: { reason: "last_survivor", winnerIds: ["p1"], rankings: [] } }; },
  (raw: any) => { raw.state.completedRounds = 20; },
  (raw: any) => { raw.state.random.state = 0; },
  (raw: any) => { raw.state.random.draws = 0; },
  (raw: any) => { raw.state.random.inputSeed = 5; },
  (raw: any) => { raw.state.lastRoll = [0, 7]; },
  (raw: any) => { raw.state.animation = {}; },
  (raw: any) => { raw.state.players[0].externalURL = "https://example.com"; },
  (raw: any) => { raw.state.config.players[0].controller = "remote"; },
  (raw: any) => { raw.state.config.players.forEach((player: any) => { player.controller = "bot"; }); },
  (raw: any) => { raw.revision = 1; },
  (raw: any) => { raw.savedAt = Infinity; },
  (raw: any) => { raw.matchId = "bad"; },
  (raw: any) => { raw.source = "trusted"; },
])("rejects malformed, contradictory or incompatible state %# without touching the original", (mutate) => {
  const game = new Game(createMatchConfig(940));
  const before = game.snapshot;
  const raw = JSON.parse(JSON.stringify(makeSave(before, matchId)));
  mutate(raw);
  expect(() => readSave(raw)).toThrow();
  expect(game.snapshot).toBe(before);
});

it("rejects an owned pending purchase and tampered final rankings", () => {
  const game = new Game(createMatchConfig(940));
  game.apply(legalCommands(game.snapshot, "p1")[0]!);
  const pending = makeSave(game.snapshot, matchId);
  expect(() => readSave({ ...pending, state: { ...pending.state, owners: { "neon-avenue": "p2" } } })).toThrow();
  for (let count = 0; game.snapshot.decision.kind !== "game_over" && count < 200; count += 1) game.apply(chooseBotCommand(game.snapshot) ?? legalCommands(game.snapshot, game.snapshot.activePlayerId).at(-1)!);
  const terminal = JSON.parse(JSON.stringify(makeSave(game.snapshot, matchId)));
  terminal.state.decision.result.rankings[0].netAssets += 1;
  expect(() => readSave(terminal)).toThrow();
});
