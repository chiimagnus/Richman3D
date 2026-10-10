import { useSyncExternalStore } from "react";
import type { PlaySession } from "../app/Session";

export function useGameView(session: PlaySession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
