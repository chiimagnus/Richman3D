import { RuleRandom } from "./random";
import type { GameSnapshot, MatchConfig, PlayerId } from "./types";

export function initialTurnOrder(config: MatchConfig, random = new RuleRandom(config.seed)): readonly PlayerId[] {
  const order = config.players.map((player) => player.id);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = random.integer(index + 1);
    [order[index], order[target]] = [order[target]!, order[index]!];
  }
  return order;
}

export function nextTurn(snapshot: GameSnapshot): { activePlayerId: PlayerId; completedRounds: number } {
  const current = snapshot.turnOrder.indexOf(snapshot.activePlayerId);
  for (let offset = 1; offset <= snapshot.turnOrder.length; offset += 1) {
    const absolute = current + offset;
    const next = snapshot.players.find((player) => player.id === snapshot.turnOrder[absolute % snapshot.turnOrder.length]);
    if (next && !next.bankrupt) return { activePlayerId: next.id, completedRounds: snapshot.completedRounds + (absolute >= snapshot.turnOrder.length ? 1 : 0) };
  }
  throw new Error("无存活玩家");
}
