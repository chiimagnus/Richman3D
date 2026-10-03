import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { RuleRandom } from "../../src/domain/random";
import type { PlayerId } from "../../src/domain/types";
import { makeSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "./property-match";

export function movementCheckpoint(seed = 35, actor: PlayerId = "p1", cash?: number, chancePosition = 11): Game {
  const game = new Game(createMatchConfig(seed));
  for (const kind of ["roll", "buy"] as const) {
    const result = game.apply({ kind, actor: game.snapshot.turnPlayerId, expectedRevision: game.snapshot.revision });
    if (!result.ok) throw new Error(result.reason);
  }
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  return Game.restore({ ...state, turnPlayerId: actor, decision: { kind: "awaiting_roll", actorId: actor },
    players: state.players.map((player) => player.id === actor ? { ...player,
      position: (chancePosition - steps + game.snapshot.map.tiles.length) % game.snapshot.map.tiles.length,
      cash: cash ?? player.cash,
      statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - (cash ?? player.cash) },
    } : player) });
}
