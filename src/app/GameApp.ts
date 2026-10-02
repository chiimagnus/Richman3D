import { GameAudio } from "../audio/GameAudio";
import { loadPreferences, savePreferences, type GamePreferences } from "../settings/preferences";
import type { GameSession } from "./GameSession";
import { createMatchConfig } from "../domain/config";
import type { MatchConfig } from "../domain/types";
import { loadTutorialCompleted, saveTutorialCompleted, tutorialConfig } from "./tutorial";
import { GameStore } from "../storage/GameStore";
import { makeSave, SaveError, type SaveRecord, type StoredGame } from "../storage/snapshot";

export type StoredView = { readonly kind: "loading" | "empty" } | { readonly kind: "valid"; readonly record: SaveRecord }
  | { readonly kind: "error"; readonly error: SaveError["kind"] };

export type AppView = {
  readonly preferences: GamePreferences;
  readonly session: GameSession | null;
  readonly loading: boolean;
  readonly loadFailed: boolean;
  readonly tutorialCompleted: boolean;
  readonly stored: StoredView;
};

export class GameApp {
  private view: AppView = { preferences: loadPreferences(), session: null, loading: false, loadFailed: false, tutorialCompleted: loadTutorialCompleted(), stored: { kind: "loading" } };
  private readonly listeners = new Set<() => void>();
  readonly audio = new GameAudio(this.view.preferences.soundEnabled);
  private request = 0;

  constructor(readonly store = new GameStore()) {
    document.documentElement.lang = this.view.preferences.language;
    document.addEventListener("visibilitychange", this.visibility);
    void this.readStored();
  }

  getSnapshot = (): AppView => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(config: MatchConfig = createMatchConfig(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1), purpose: "match" | "tutorial" = "match", restored?: StoredGame): Promise<void> {
    if (this.view.loading) return;
    this.audio.unlock();
    const request = ++this.request;
    const previous = this.view.session;
    this.publish({ ...this.view, loading: true, loadFailed: false });
    previous?.pause();
    if (previous && !restored && !await previous.flush()) {
      if (request === this.request) this.publish({ ...this.view, loading: false });
      return;
    }
    if (request !== this.request) return;
    previous?.dispose();
    this.audio.stop();
    this.publish({ ...this.view, session: null, loading: true, loadFailed: false });
    try {
      const [{ Game }, { GameSession }] = await Promise.all([import("../domain/game"), import("./GameSession"), import("../ui/SceneHost")]);
      const stored = purpose === "match" ? restored ?? await this.readStored() : null;
      if (request !== this.request) return;
      const session = new GameSession(restored ? Game.restore(restored.record.state) : new Game(config), restored?.record.matchId ?? crypto.randomUUID(), purpose,
        purpose === "match" ? { store: this.store, expected: stored?.record ?? null, source: restored?.record.source ?? "local" } : undefined);
      this.publish({ ...this.view, session, loading: false });
      await session.initializeSave();
      if (request !== this.request) return;
      await session.activate();
    } catch {
      if (request === this.request) this.publish({ ...this.view, loading: false, loadFailed: true });
    }
  }

  restart(replay = false): Promise<void> {
    if (this.view.session?.purpose === "tutorial") return this.startTutorial();
    const config = this.view.session?.getSnapshot().committed.config;
    return this.start(config ? { ...config, seed: replay ? config.seed : crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 } : undefined);
  }

  startTutorial(): Promise<void> { return this.start(tutorialConfig(), "tutorial"); }

  async continueSaved(): Promise<void> {
    if (this.view.loading) return;
    this.audio.unlock();
    const request = ++this.request;
    this.publish({ ...this.view, loading: true });
    const stored = await this.readStored();
    if (request !== this.request) return;
    this.publish({ ...this.view, loading: false });
    if (stored) await this.start(stored.snapshot.config, "match", stored);
  }

  private async readStored(): Promise<StoredGame | null> {
    const request = this.request;
    try {
      const stored = await this.store.read();
      if (request === this.request) this.publish({ ...this.view, stored: stored ? { kind: "valid", record: stored.record } : { kind: "empty" } });
      return stored;
    } catch (cause) {
      const error = cause instanceof SaveError ? cause.kind : "unavailable";
      if (request === this.request) this.publish({ ...this.view, stored: { kind: "error", error } });
      return null;
    }
  }

  async replaceSaved(incoming: StoredGame, expectedRaw: unknown, source: SaveRecord["source"]): Promise<void> {
    if (this.view.loading) throw new SaveError("conflict");
    const next = makeSave(incoming.snapshot, crypto.randomUUID(), source, incoming.record.savedAt);
    const request = ++this.request;
    const previous = this.view.session;
    this.publish({ ...this.view, loading: true });
    previous?.pause();
    try {
      await previous?.flush();
      if (request !== this.request) throw new SaveError("conflict");
      const record = await this.store.replace(next, expectedRaw);
      if (request !== this.request) return;
      previous?.dispose();
      this.audio.stop();
      this.publish({ ...this.view, session: null, loading: false, loadFailed: false, stored: { kind: "valid", record } });
    } finally {
      if (request === this.request && this.view.loading) this.publish({ ...this.view, loading: false });
    }
  }

  finishTutorial(completed: boolean): void {
    if (this.view.session?.purpose !== "tutorial") return;
    if (completed) saveTutorialCompleted();
    this.publish({ ...this.view, tutorialCompleted: this.view.tutorialCompleted || completed });
    this.leave();
  }

  async leave(discard = false): Promise<void> {
    const request = ++this.request;
    const session = this.view.session;
    session?.pause();
    if (session && !discard && !await session.flush()) return;
    if (request !== this.request || session !== this.view.session) return;
    this.view.session?.dispose();
    this.audio.stop();
    this.publish({ ...this.view, session: null, loading: false, loadFailed: false });
    await this.readStored();
  }

  setPreferences(preferences: GamePreferences): void {
    if (Object.keys(preferences).every((key) => preferences[key as keyof GamePreferences] === this.view.preferences[key as keyof GamePreferences])) return;
    savePreferences(preferences);
    this.audio.setEnabled(preferences.soundEnabled);
    if (this.view.session && preferences.soundEnabled && !this.view.preferences.soundEnabled) this.audio.unlock();
    document.documentElement.lang = preferences.language;
    this.publish({ ...this.view, preferences });
  }

  dispose(): void {
    this.request += 1;
    this.view.session?.dispose();
    this.publish({ ...this.view, session: null, loading: false });
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
