import { GameAudio } from "../audio/GameAudio";
import { loadPreferences, savePreferences, type GamePreferences } from "../settings/preferences";
import type { GameSession } from "./GameSession";

export type AppView = {
  readonly preferences: GamePreferences;
  readonly session: GameSession | null;
  readonly loading: boolean;
  readonly loadFailed: boolean;
};

export class GameApp {
  private view: AppView = { preferences: loadPreferences(), session: null, loading: false, loadFailed: false };
  private readonly listeners = new Set<() => void>();
  readonly audio = new GameAudio(this.view.preferences.soundEnabled);
  private request = 0;

  constructor() {
    document.documentElement.lang = this.view.preferences.language;
    document.addEventListener("visibilitychange", this.visibility);
  }

  getSnapshot = (): AppView => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1): Promise<void> {
    if (this.view.loading) return;
    this.audio.unlock();
    const request = ++this.request;
    this.view.session?.dispose();
    this.audio.stop();
    this.publish({ ...this.view, session: null, loading: true, loadFailed: false });
    try {
      const [{ Game }, { GameSession }] = await Promise.all([import("../domain/game"), import("./GameSession"), import("../ui/SceneHost")]);
      if (request !== this.request) return;
      const session = new GameSession(new Game({ seed }), crypto.randomUUID());
      this.publish({ ...this.view, session, loading: false });
    } catch {
      if (request === this.request) this.publish({ ...this.view, loading: false, loadFailed: true });
    }
  }

  leave(): void {
    this.request += 1;
    this.view.session?.dispose();
    this.audio.stop();
    this.publish({ ...this.view, session: null, loading: false, loadFailed: false });
  }

  setPreferences(preferences: GamePreferences): void {
    if (Object.keys(preferences).every((key) => preferences[key as keyof GamePreferences] === this.view.preferences[key as keyof GamePreferences])) return;
    savePreferences(preferences);
    this.audio.setEnabled(preferences.soundEnabled);
    if (preferences.soundEnabled) this.audio.unlock();
    document.documentElement.lang = preferences.language;
    this.publish({ ...this.view, preferences });
  }

  dispose(): void {
    this.leave();
    this.audio.dispose();
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
