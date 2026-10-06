import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { RuleRandom } from "../../src/domain/random";
import { makeSave } from "../../src/storage/snapshot";

export const propertyMatchId = "00000000-0000-4000-8000-000000000005";

export function propertyMatch(): Game {
  const game = new Game(createMatchConfig(8));
  for (let index = 0; index < 100; index += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.turnPlayerId === "p1" && snapshot.properties["harbor-walk"]!.ownerId === "p1" &&
        snapshot.properties["neon-avenue"]!.ownerId === "p1" && snapshot.properties["skyline-road"]!.ownerId === "p2") return game;
    if (snapshot.decision.kind === "game_over") break;
    const decision = snapshot.decision;
    const targets = decision.actorId === "p1" ? ["neon-avenue", "harbor-walk"] : ["skyline-road"];
    const kind = decision.kind === "awaiting_purchase" ? targets.includes(decision.propertyId) ? "buy" : "skip"
      : decision.kind === "awaiting_discard" ? "discard_item" : "roll";
    const command = legalCommands(snapshot, decision.actorId).find((candidate) => candidate.kind === kind)!;
    const result = game.apply(command);
    if (!result.ok) throw new Error(result.reason);
  }
  throw new Error("No complete property checkpoint");
}

export function opponentRentCheckpoint(game: Game): Game {
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  const target = game.snapshot.map.tiles.findIndex((tile) => tile.id === "neon-avenue");
  return Game.restore({ ...state, turnPlayerId: "p2", decision: { kind: "awaiting_roll", actorId: "p2" },
    players: state.players.map((player) => player.id === "p2" ? { ...player, position: (target - steps + game.snapshot.map.tiles.length) % game.snapshot.map.tiles.length } : player),
  });
}
