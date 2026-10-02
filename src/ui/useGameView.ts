import { useSyncExternalStore } from "react";
import type { GameSession } from "../app/GameSession";

export function useGameView(session: GameSession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
