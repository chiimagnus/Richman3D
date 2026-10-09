import { GameAudio } from "../audio/GameAudio";
import { loadPreferences, savePreferences, type GamePreferences } from "../settings/preferences";
import type { GameSession, SaveView } from "./GameSession";
import { createMatchConfig } from "../domain/config";
import type { MatchConfig } from "../domain/types";
import { GameStore, type LocalProfile } from "../storage/GameStore";
import { makeSave, SaveError, type SaveRecord, type StoredGame } from "../storage/snapshot";
import { challengeConfig, type DailyChallenge } from "../domain/challenges";

export type StoredView = { readonly kind: "loading" | "empty" } | { readonly kind: "valid"; readonly record: SaveRecord }
  | { readonly kind: "error"; readonly error: SaveError["kind"] };

export type AppView = {
  readonly preferences: GamePreferences;
  readonly session: GameSession | null;
  readonly loading: boolean;
  readonly loadFailed: boolean;
  readonly stored: StoredView;
  readonly profile: { readonly kind: "loading" } | ({ readonly kind: "ready" } & LocalProfile) | { readonly kind: "error"; readonly error: SaveError["kind"] };
};

export class GameApp {
  private view: AppView = { preferences: loadPreferences(), session: null, loading: false, loadFailed: false, stored: { kind: "loading" }, profile: { kind: "loading" } };
  private readonly listeners = new Set<() => void>();
  readonly audio = new GameAudio(this.view.preferences.soundEnabled, this.view.preferences.effectsVolume, this.view.preferences.musicVolume);
  private unbindAudio = () => {};
  private request = 0;

  constructor(readonly store = new GameStore()) {
    document.documentElement.lang = this.view.preferences.language;
    document.addEventListener("visibilitychange", this.visibility);
    void this.readStored();
    void this.refreshProfile();
  }

  getSnapshot = (): AppView => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(config: MatchConfig = createMatchConfig(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1), restored?: StoredGame, challenge?: DailyChallenge): Promise<void> {
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
    this.releaseSessionAudio();
    this.audio.stop();
    this.publish({ ...this.view, session: null, loading: true, loadFailed: false });
    try {
      const [{ Game }, { GameSession }] = await Promise.all([import("../domain/game"), import("./GameSession"), import("../ui/SceneHost")]);
      const stored = restored ?? await this.readStored();
      const progress = restored ? await this.store.readChallenges() : null;
      if (request !== this.request) return;
      const session = new GameSession(restored ? Game.restore(restored.record.state) : new Game(config), restored?.record.matchId ?? crypto.randomUUID(),
        { store: this.store, expected: stored?.record ?? null, source: restored?.record.source ?? "local", challenge: challenge ?? (progress?.active?.matchId === restored?.record.matchId ? progress?.active?.challenge ?? undefined : undefined) });
      session.setPresentationSpeed(this.view.preferences.presentationSpeed);
      if (document.hidden) session.pause();
      let observedSave: SaveView | null = null;
      const syncAudio = () => {
        const view = session.getSnapshot();
        this.audio.setPlaying(view.mode === "running" && view.committed.decision.kind !== "game_over");
        if (view.save.kind === "saved" && observedSave !== view.save) { observedSave = view.save; void this.refreshProfile(); }
      };
      this.unbindAudio = session.subscribe(syncAudio);
      syncAudio();
      this.publish({ ...this.view, session, loading: false });
      await session.initializeSave();
      if (request !== this.request) return;
      await session.activate();
    } catch {
      if (request === this.request) this.publish({ ...this.view, loading: false, loadFailed: true });
    }
  }

  restart(replay = false): Promise<void> {
    const challenge = this.view.session?.challenge;
    if (challenge) return this.startChallenge(challenge);
    const config = this.view.session?.getSnapshot().committed.config;
    return this.start(config ? { ...config, seed: replay ? config.seed : crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 } : undefined);
  }

  startChallenge(challenge: DailyChallenge): Promise<void> { return this.start(challengeConfig(challenge), undefined, challenge); }

  async refreshProfile(): Promise<void> {
    const request = this.request;
    try {
      const profile = await this.store.readProfile();
      if (request === this.request) this.publish({ ...this.view, profile: { kind: "ready", ...profile } });
    } catch (cause) {
      if (request === this.request) this.publish({ ...this.view, profile: { kind: "error", error: cause instanceof SaveError ? cause.kind : "unavailable" } });
    }
  }

  async continueSaved(): Promise<void> {
    if (this.view.loading) return;
    this.audio.unlock();
    const request = ++this.request;
    this.publish({ ...this.view, loading: true });
    const stored = await this.readStored();
    if (request !== this.request) return;
    this.publish({ ...this.view, loading: false });
    if (stored) await this.start(stored.snapshot.config, stored);
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
      this.releaseSessionAudio();
      this.audio.stop();
      this.publish({ ...this.view, session: null, loading: false, loadFailed: false, stored: { kind: "valid", record } });
    } finally {
      if (request === this.request && this.view.loading) this.publish({ ...this.view, loading: false });
    }
  }

  async leave(discard = false): Promise<void> {
    const request = ++this.request;
    const session = this.view.session;
    session?.pause();
    if (session && !discard && !await session.flush()) return;
    if (request !== this.request || session !== this.view.session) return;
    this.view.session?.dispose();
    this.releaseSessionAudio();
    this.audio.stop();
    this.publish({ ...this.view, session: null, loading: false, loadFailed: false });
    await this.readStored();
    await this.refreshProfile();
  }

  setPreferences(preferences: GamePreferences): void {
    if (Object.keys(preferences).every((key) => preferences[key as keyof GamePreferences] === this.view.preferences[key as keyof GamePreferences])) return;
    savePreferences(preferences);
    this.view.session?.setPresentationSpeed(preferences.presentationSpeed);
    this.audio.setEnabled(preferences.soundEnabled);
    this.audio.setVolumes(preferences.effectsVolume, preferences.musicVolume);
    if (this.view.session && preferences.soundEnabled && !this.view.preferences.soundEnabled) this.audio.unlock();
    document.documentElement.lang = preferences.language;
    this.publish({ ...this.view, preferences });
  }

  dispose(): void {
    this.request += 1;
    this.view.session?.dispose();
    this.releaseSessionAudio();
    this.publish({ ...this.view, session: null, loading: false });
    this.audio.dispose();
    document.removeEventListener("visibilitychange", this.visibility);
    this.listeners.clear();
  }

  private readonly visibility = (): void => {
    if (document.hidden) this.view.session?.pause();
  };

  private releaseSessionAudio(): void { this.unbindAudio(); this.unbindAudio = () => {}; this.audio.setPlaying(false); }

  private publish(view: AppView): void {
    this.view = view;
    for (const listener of this.listeners) {
      try { listener(); } catch { }
    }
  }
}
