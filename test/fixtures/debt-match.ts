import { Game } from "../../src/domain/game";
import { RuleRandom } from "../../src/domain/random";
import { makeSave } from "../../src/storage/snapshot";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { propertyMatch, propertyMatchId } from "./property-match";
import { createMatchConfig } from "../../src/domain/config";

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

export function chanceDebtCheckpoint(cash = 30): Game {
  const game = new Game(createMatchConfig(36, 3));
  for (const kind of ["roll", "buy"] as const) {
    const result = game.apply({ kind, actor: "p1", expectedRevision: game.snapshot.revision });
    if (!result.ok) throw new Error(result.reason);
  }
  const state = makeSave(game.snapshot, propertyMatchId).state;
  return Game.restore({ ...state, turnPlayerId: "p1", decision: { kind: "awaiting_roll", actorId: "p1" },
    players: state.players.map((player) => player.id === "p1" ? { ...player, cash,
      statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash } } : player),
  });
}

export function chanceDebtMatch(cash = 30): Game {
  const game = chanceDebtCheckpoint(cash);
  const result = game.apply({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
  if (!result.ok || game.snapshot.decision.kind !== "awaiting_debt" || game.snapshot.decision.debt.source.kind !== "chance") throw new Error("Expected a real chance debt");
  return game;
}

export function rentDebtMatch(cash = 30, levels = 0): Game {
  const game = propertyMatch();
  for (let level = 0; level < levels; level += 1) for (const propertyId of ["neon-avenue", "harbor-walk"]) {
    const result = game.apply({ kind: "upgrade", propertyId, actor: "p1", expectedRevision: game.snapshot.revision });
    if (!result.ok) throw new Error(result.reason);
  }
  for (let count = 0; count < 80; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.turnPlayerId === "p1") {
      const random = new RuleRandom(snapshot.random);
      const steps = random.integer(6) + random.integer(6) + 2;
      const target = snapshot.map.tiles.findIndex((tile, index) => index >= steps && tile.type === "property" && snapshot.properties[tile.id]!.ownerId === "p2" && tile.rent > cash);
      if (target >= 0) {
        const state = makeSave(game.snapshot, propertyMatchId).state;
        const restored = Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, cash, position: target - steps,
          statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash - cash } } : player) });
        const result = restored.apply({ kind: "roll", actor: "p1", expectedRevision: restored.snapshot.revision });
        if (!result.ok || restored.snapshot.decision.kind !== "awaiting_debt") throw new Error("Expected a real fixed rent obligation");
        return restored;
      }
    }
    const command = (chooseBotAction(observeBot(snapshot), "normal")?.command ?? null) ?? legalCommands(snapshot, snapshot.decision.kind === "game_over" ? "p1" : snapshot.decision.actorId).find((candidate) => candidate.kind === "roll" || candidate.kind === "skip");
    if (!command || !game.apply(command).ok) throw new Error("Could not reach a rent checkpoint");
  }
  throw new Error("No suitable real owned rent property");
}

export function builtRentDebtMatch(seats: 2 | 3 | 4 = 3, discounted = false, ownCentral = false): Game {
  const game = new Game(createMatchConfig(seats === 2 ? 61 : seats === 3 ? 1 : 10, seats));
  for (let count = 0; count < 400; count += 1) {
    const snapshot = game.snapshot;
    if (snapshot.decision.kind === "game_over") break;
    const owned = (ids: string[], owner: string, level: number) => ids.every((id) => snapshot.properties[id]!.ownerId === owner && snapshot.properties[id]!.level >= level);
    if (snapshot.decision.kind === "awaiting_roll" && snapshot.turnPlayerId === "p1" &&
        owned(["neon-avenue", "harbor-walk"], "p1", 1) && (!ownCentral || snapshot.properties["central-station"]!.ownerId === "p1") && owned(["art-district", "grand-boulevard", "financial-center"], "p2", 2)) {
      const state = makeSave(snapshot, propertyMatchId).state;
      const random = new RuleRandom(state.random);
      const steps = random.integer(6) + random.integer(6) + 2;
      const target = snapshot.map.tiles.findIndex((tile) => tile.id === "financial-center");
      const discount = discounted ? 54 : 0;
      const restored = Game.restore({ ...state,
        properties: discounted ? { ...state.properties,
          "neon-avenue": { ...state.properties["neon-avenue"]!, constructionCosts: [71] },
          "harbor-walk": { ...state.properties["harbor-walk"]!, constructionCosts: [35] },
        } : state.properties,
        players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 30, position: target - steps,
          statistics: { ...player.statistics, constructionSpent: player.statistics.constructionSpent - discount,
            taxesPaid: player.statistics.taxesPaid + player.cash + discount - 30 } } : player),
      });
      const result = restored.apply({ kind: "roll", actor: "p1", expectedRevision: restored.snapshot.revision });
      if (!result.ok || restored.snapshot.decision.kind !== "awaiting_debt") throw new Error("Expected a built-group rent obligation");
      return restored;
    }
    const actor = snapshot.decision.actorId;
    const commands = legalCommands(snapshot, actor);
    const upgrade = commands.find((command) => command.kind === "upgrade" && snapshot.properties[command.propertyId]!.level < (actor === "p1" ? 1 : actor === "p2" ? 2 : 0));
    const decision = snapshot.decision;
    const target = decision.kind === "awaiting_purchase" ? snapshot.map.tiles.find((tile) => tile.id === decision.propertyId) : null;
    const group = actor === "p1" ? "cyan" : actor === "p2" ? "emerald" : null;
    const kind = snapshot.decision.kind === "awaiting_purchase" ? target?.type === "property" && (target.group === group || ownCentral && actor === "p1" && target.id === "central-station") && commands.some((command) => command.kind === "buy") ? "buy" : "skip"
      : snapshot.decision.kind === "awaiting_debt" ? "bankrupt" : snapshot.decision.kind === "awaiting_discard" ? "discard_item" : "roll";
    const command = upgrade ?? commands.find((candidate) => candidate.kind === kind) ?? commands[0];
    if (!command || !game.apply(command).ok) throw new Error("Could not reach a built-group checkpoint");
  }
  throw new Error("No built-group checkpoint");
}
