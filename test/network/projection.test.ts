import { expect, it } from "vitest";
import { projectGame } from "../../src/network/protocol";
import { legalCommands, playerAssets } from "../../src/domain/selectors";
import { itemCheckpoint, fullHandCheckpoint } from "../fixtures/items";
import { validateRoomState } from "../../src/network/readState";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { MAPS } from "../../src/domain/maps";
import { QUICK_RULES, STANDARD_RULES } from "../../src/domain/rules";

function stateMessage(game: Game) {
  const snapshot = game.snapshot;
  return { version: 1, kind: "state", reset: true, events: [], room: { code: "ABCDEFGH", playerId: "p1", expiresAt: Date.now() + 10000,
    options: { seats: snapshot.players.length, mapId: snapshot.config.mapId, rulesVersion: snapshot.config.rulesVersion },
    members: snapshot.config.players.map((player) => ({ id: player.id, name: player.name, connected: true })), snapshot: projectGame(snapshot, "p1") } };
}

it("validates actual public states throughout both maps, rule sets and every seat count", () => {
  for (const map of MAPS) for (const rules of [QUICK_RULES, STANDARD_RULES]) for (const seats of [2, 3, 4]) {
    const config = createMatchConfig(37, seats);
    const game = new Game({ ...config, mapId: map.id, mapVersion: map.version, rulesVersion: rules.version, players: config.players.map((player) => ({ ...player, controller: "human" })) });
    for (let step = 0; step < 120; step += 1) {
      expect(() => validateRoomState(stateMessage(game), "ABCDEFGH")).not.toThrow();
      if (game.snapshot.decision.kind === "game_over") break;
      const commands = legalCommands(game.snapshot, game.snapshot.decision.actorId);
      const command = commands.find((candidate) => candidate.kind === "buy") ?? commands.find((candidate) => candidate.kind === "roll") ?? commands[0]!;
      const result = game.apply(command);
      expect(result.ok).toBe(true);
      if (result.ok) expect(() => validateRoomState({ ...stateMessage(game), events: result.events, reset: false }, "ABCDEFGH")).not.toThrow();
    }
  }
});

it("rejects missing state, private leaks and malformed money, decisions and events", () => {
  const config = createMatchConfig();
  const game = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: "human" })) });
  for (const mutate of [
    (value: ReturnType<typeof stateMessage>) => { Object.assign(value.room.snapshot.config, { seed: 42 }); },
    (value: ReturnType<typeof stateMessage>) => { Object.assign(value.room.snapshot.players[1]!, { hand: [] }); },
    (value: ReturnType<typeof stateMessage>) => { Object.assign(value.room.snapshot.players[0]!, { cash: -1 }); },
    (value: ReturnType<typeof stateMessage>) => { Object.assign(value.room.snapshot, { decision: { kind: "anything" } }); },
    (value: ReturnType<typeof stateMessage>) => { Object.assign(value, { events: [{ kind: "rolled", result: {} }] }); },
    (value: ReturnType<typeof stateMessage>) => { Object.assign(value.room, { options: { seats: 7 } }); },
  ]) {
    const value = structuredClone(stateMessage(game)); mutate(value);
    expect(() => validateRoomState(value, "ABCDEFGH")).toThrow();
  }
});

it("keeps public asset queries and the seat's legal commands identical without fake rule state", () => {
  const game = itemCheckpoint("construction-discount", true);
  const full = game.snapshot;
  const view = projectGame(full, "p1");
  for (const player of full.players) expect(playerAssets(view, player.id)).toEqual(playerAssets(full, player.id));
  expect(legalCommands(view, "p1")).toEqual(legalCommands(full, "p1"));
  expect(view).not.toHaveProperty("random"); expect(view).not.toHaveProperty("deck");
});

it("never exposes another player's private discard choices", () => {
  const game = fullHandCheckpoint();
  const full = game.snapshot;
  expect(legalCommands(projectGame(full, "p1"), "p1")).toEqual(legalCommands(full, "p1"));
  expect(legalCommands(projectGame(full, "p2"), "p1")).toEqual([]);
});
