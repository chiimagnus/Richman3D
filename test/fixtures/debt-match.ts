import { Game } from "../../src/domain/game";
import { RuleRandom } from "../../src/domain/random";
import { makeSave } from "../../src/storage/snapshot";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { propertyMatch, propertyMatchId } from "./property-match";

export function debtCheckpoint(cash = 30, levels = 0): Game {
  const game = propertyMatch();
  for (let level = 0; level < levels; level += 1) {
    for (const propertyId of ["neon-avenue", "harbor-walk"]) {
      const result = game.apply({ kind: "upgrade", propertyId, actor: "p1", expectedRevision: game.snapshot.revision });
      if (!result.ok) throw new Error(result.reason);
    }
  }
  const state = makeSave(game.snapshot, propertyMatchId).state;
  const random = new RuleRandom(state.random);
  const steps = random.integer(6) + random.integer(6) + 2;
  return Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, cash, position: 14 - steps,
    statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash } } : player) });
}

export function debtMatch(cash = 30, levels = 0): Game {
  const game = debtCheckpoint(cash, levels);
  const result = game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  if (!result.ok || game.snapshot.decision.kind !== "awaiting_debt") throw new Error("Expected a real fixed tax obligation");
  return game;
}

export function rentDebtMatch(cash = 30, mortgaged = false): Game {
  const game = propertyMatch();
  for (let count = 0; count < 80; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.turnPlayerId === "p1") {
      const random = new RuleRandom(snapshot.random);
      const steps = random.integer(6) + random.integer(6) + 2;
      const target = snapshot.map.tiles.findIndex((tile, index) => index >= steps && tile.type === "property" && snapshot.properties[tile.id]!.ownerId === "p2" && tile.rent > cash);
      if (target >= 0) {
        if (mortgaged) for (const propertyId of ["neon-avenue", "harbor-walk"]) {
          const result = game.apply({ kind: "mortgage", propertyId, actor: "p1", expectedRevision: game.snapshot.revision });
          if (!result.ok) throw new Error(result.reason);
        }
        const state = makeSave(game.snapshot, propertyMatchId).state;
        const restored = Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, cash, position: target - steps,
          statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash } } : player) });
        const result = restored.apply({ kind: "roll", actor: "p1", expectedRevision: restored.snapshot.revision });
        if (!result.ok || restored.snapshot.decision.kind !== "awaiting_debt") throw new Error("Expected a real fixed rent obligation");
        return restored;
      }
    }
    const command = chooseBotCommand(snapshot) ?? legalCommands(snapshot, "p1").find((candidate) => candidate.kind === "roll" || candidate.kind === "skip");
    if (!command || !game.apply(command).ok) throw new Error("Could not reach a rent checkpoint");
  }
  throw new Error("No suitable real owned rent property");
}
