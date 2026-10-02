import { Game } from "../domain/game";
import { loadPreferences, savePreferences, type GamePreferences } from "../settings/preferences";
import { GameSession } from "./GameSession";

export type AppView = {
  readonly preferences: GamePreferences;
  readonly session: GameSession | null;
};

export class GameApp {
  private view: AppView = { preferences: loadPreferences(), session: null };
  private readonly listeners = new Set<() => void>();

  constructor() {
    document.documentElement.lang = this.view.preferences.language;
    document.addEventListener("visibilitychange", this.visibility);
  }

  getSnapshot = (): AppView => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1): void {
    const session = new GameSession(new Game({ seed }), crypto.randomUUID());
    this.view.session?.dispose();
    this.publish({ ...this.view, session });
  }

  leave(): void {
    this.view.session?.dispose();
    this.publish({ ...this.view, session: null });
  }

  setPreferences(preferences: GamePreferences): void {
    if (Object.keys(preferences).every((key) => preferences[key as keyof GamePreferences] === this.view.preferences[key as keyof GamePreferences])) return;
    savePreferences(preferences);
    document.documentElement.lang = preferences.language;
    this.publish({ ...this.view, preferences });
  }

  dispose(): void {
    this.leave();
    document.removeEventListener("visibilitychange", this.visibility);
    this.listeners.clear();
  }

  private readonly visibility = (): void => {
    if (document.hidden) this.view.session?.pause();
  };

  private publish(view: AppView): void {
    this.view = view;
    for (const listener of this.listeners) {
      try { listener(); } catch { }
    }
  }
}
