import { createMatchConfig } from "../domain/config";
import type { GameView } from "./GameSession";

const COMPLETED_KEY = "richman3d.tutorial.v1";
export const tutorialConfig = () => createMatchConfig(940);
export type TutorialProgress = { readonly started: boolean; readonly inspected: boolean };
export type TutorialStep = { readonly number: 1 | 2 | 3 | 4 | 5; readonly ready: boolean };

export function tutorialStep(view: GameView, progress: TutorialProgress): TutorialStep {
  const ready = view.attached && view.mode === "running" && !view.presenting && !view.error;
  if (!progress.started) return { number: 1, ready };
  if (view.committed.revision === 0 || view.committed.revision === 1 && view.presenting) return { number: 2, ready };
  if (view.committed.revision === 1) return { number: progress.inspected ? 4 : 3, ready };
  return { number: 5, ready: ready && view.committed.activePlayerId === "p1" && view.committed.revision >= 3 };
}

export function loadTutorialCompleted(storage?: Pick<Storage, "getItem">): boolean {
  try { return (storage ?? window.localStorage).getItem(COMPLETED_KEY) === "completed"; } catch { return false; }
}

export function saveTutorialCompleted(storage?: Pick<Storage, "setItem">): void {
  try { (storage ?? window.localStorage).setItem(COMPLETED_KEY, "completed"); } catch { }
}
