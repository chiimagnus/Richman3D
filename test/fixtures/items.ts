import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { cardType } from "../../src/domain/cards";
import { legalCommands } from "../../src/domain/selectors";
import { RuleRandom } from "../../src/domain/random";
import type { ItemCardId } from "../../src/domain/types";
import { makeSave } from "../../src/storage/snapshot";
import { propertyMatchId } from "./property-match";

function advance(game: Game): void {
  const snapshot = game.snapshot;
  if (snapshot.decision.kind === "game_over") throw new Error("Match ended before checkpoint");
  const actor = snapshot.decision.actorId;
  const targets = actor === "p1" ? ["neon-avenue", "harbor-walk"] : ["skyline-road"];
  const kind = snapshot.decision.kind === "awaiting_purchase" ? targets.includes(snapshot.decision.propertyId) ? "buy" : "skip"
    : snapshot.decision.kind === "awaiting_discard" ? "discard_item" : snapshot.decision.kind === "awaiting_debt" ? "bankrupt" : "roll";
  const commands = legalCommands(snapshot, actor);
  const command = commands.find((command) => command.kind === kind) ?? commands[0];
  if (!command || !game.apply(command).ok) throw new Error("Could not reach a real item checkpoint");
}

export function itemCheckpoint(type: ItemCardId, withProperty = false): Game {
  const seed = withProperty ? type === "construction-discount" ? 13 : 2 : type === "tax-discount" ? 3 : 1;
  const game = new Game(createMatchConfig(seed));
  for (let count = 0; count < 150; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") break;
    const actor = snapshot.decision.actorId;
    const propertyReady = !withProperty || (type === "construction-discount" ? ["neon-avenue", "harbor-walk"].every((id) => snapshot.properties[id]!.ownerId === "p1") : snapshot.properties["skyline-road"]!.ownerId === "p2");
    if (propertyReady && snapshot.decision.kind === "awaiting_roll" && actor === "p1" && snapshot.players[0]!.hand.some((id) => cardType(id) === type)) return game;
    advance(game);
  }
  throw new Error("No item checkpoint");
}

export function fullHandCheckpoint(): Game {
  const game = itemCheckpoint("controlled-dice");
  for (let count = 0; count < 100; count += 1) {
    if (game.snapshot.decision.kind === "awaiting_discard" && game.snapshot.decision.actorId === "p1") return game;
    advance(game);
  }
  throw new Error("No full hand checkpoint");
}

export function itemFineCheckpoint(type: "tax-discount" | "rent-waiver"): Game {
  const game = new Game(createMatchConfig(type === "tax-discount" ? 8 : 10));
  for (let count = 0; count < 150; count += 1) {
    const snapshot = game.snapshot;
    const next = snapshot.deck.drawPile.at(-1);
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.turnPlayerId === "p1" && snapshot.players[0]!.hand.some((id) => cardType(id) === type) && next && ["maintenance-cost", "traffic-fine"].includes(cardType(next))) {
      const state = makeSave(snapshot, propertyMatchId).state;
      const random = new RuleRandom(state.random);
      const steps = random.integer(6) + random.integer(6) + 2;
      return Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, position: (11 - steps + snapshot.map.tiles.length) % snapshot.map.tiles.length } : player) });
    }
    advance(game);
  }
  throw new Error("No actual item plus Chance fine checkpoint");
}

export function itemLandingCheckpoint(type: ItemCardId, target: number, cash?: number): Game {
  const game = itemCheckpoint(type, type === "rent-waiver");
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  return Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player,
    position: (target - steps + game.snapshot.map.tiles.length) % game.snapshot.map.tiles.length,
    cash: cash ?? player.cash,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - (cash ?? player.cash) },
  } : player) });
}
