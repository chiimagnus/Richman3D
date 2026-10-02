import type { GameSnapshot, PlayerId } from "./types";

export function nextTurn(snapshot: GameSnapshot): { activePlayerId: PlayerId; completedRounds: number } {
  const current = snapshot.players.findIndex((player) => player.id === snapshot.activePlayerId);
  for (let offset = 1; offset <= snapshot.players.length; offset += 1) {
    const absolute = current + offset;
    const next = snapshot.players[absolute % snapshot.players.length];
    if (next && !next.bankrupt) return { activePlayerId: next.id, completedRounds: snapshot.completedRounds + (absolute >= snapshot.players.length ? 1 : 0) };
  }
  throw new Error("无存活玩家");
}
