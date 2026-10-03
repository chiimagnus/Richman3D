import { Game } from "../domain/game";
import { chooseBotCommand } from "../domain/bot";
import { observerId, playerConfig } from "../domain/config";
import type { Command, GameEvent, GameSnapshot, PlayerId } from "../domain/types";
import { PresentationQueue, type PresentationPort } from "./PresentationQueue";
import { GameStore } from "../storage/GameStore";
import { makeSave, SaveError, type SaveIdentity, type SaveRecord } from "../storage/snapshot";

export type SaveView = { readonly kind: "disabled" | "saving" } | { readonly kind: "saved"; readonly savedAt: number }
  | { readonly kind: "unsaved"; readonly acknowledged: boolean; readonly error: SaveError["kind"] } | { readonly kind: "conflict" };

export type GameView = {
  readonly committed: GameSnapshot;
  readonly displayed: GameSnapshot;
  readonly mode: "running" | "paused" | "disposed";
  readonly presenting: boolean;
  readonly attached: boolean;
  readonly events: readonly GameEvent[];
  readonly error: "presentation_failed" | "command_rejected" | null;
  readonly notice: { readonly id: number; readonly event: GameEvent; readonly expiresAt: number } | null;
  readonly save: SaveView;
  readonly viewPlayerId: PlayerId | null;
};

export class GameSession {
  private readonly queue = new PresentationQueue();
  private readonly listeners = new Set<() => void>();
  private port: PresentationPort | null = null;
  private work: Promise<void> | null = null;
  private announcedNoticeId = 0;
  private view: GameView;
  private saving: Promise<boolean> | null = null;
  private expected: SaveIdentity | null;
  private allowUnsaved = false;

  constructor(private readonly game: Game, readonly matchId = "local",
    private readonly persistence?: { readonly store: GameStore; readonly expected: SaveIdentity | null; readonly source: SaveRecord["source"] }) {
    this.expected = persistence?.expected ?? null;
    this.view = { committed: game.snapshot, displayed: game.snapshot, mode: "running", presenting: false, attached: false, events: [], error: null, notice: null, save: { kind: persistence ? "saving" : "disabled" }, viewPlayerId: game.snapshot.config.players.filter((player) => player.controller === "human").length > 1 ? null : observerId(game.snapshot.config) };
  }

  getSnapshot = (): GameView => this.view;

  get handoverActor(): PlayerId | null {
    const { decision, config } = this.view.displayed;
    return !this.view.presenting && decision.kind !== "game_over" && this.view.viewPlayerId === null && playerConfig(config, decision.actorId).controller === "human" ? decision.actorId : null;
  }

  async initializeSave(): Promise<void> { await this.persist(); }

  async flush(): Promise<boolean> {
    await this.work;
    await this.saving;
    const saved = !this.persistence || this.view.save.kind === "saved";
    if (!saved && this.view.mode !== "disposed") {
      if (this.view.save.kind === "unsaved") this.publish({ save: { ...this.view.save, acknowledged: false } });
      this.pause();
    }
    return saved;
  }

  async retrySave(): Promise<void> {
    await this.work;
    if (this.view.mode === "disposed" || this.view.save.kind === "conflict") return;
    await this.persist();
  }

  async continueUnsaved(): Promise<void> {
    await this.work;
    if (this.view.mode === "disposed" || this.view.save.kind !== "unsaved") return;
    this.allowUnsaved = true;
    this.publish({ save: { ...this.view.save, acknowledged: true } });
    await this.resume();
  }

  exportRecord(): SaveRecord { return makeSave(this.game.snapshot, this.matchId, this.persistence?.source ?? "local"); }

  private persist(): Promise<boolean> {
    if (!this.persistence) return Promise.resolve(true);
    if (this.saving) return this.saving;
    const { store, source } = this.persistence;
    const snapshot = this.game.snapshot;
    this.publish({ save: { kind: "saving" } });
    this.saving = Promise.resolve().then(async () => {
      try {
        const saved = await store.save(makeSave(snapshot, this.matchId, source), this.expected);
        this.expected = { matchId: saved.matchId, revision: saved.revision };
        if (this.view.mode !== "disposed") this.publish({ save: { kind: "saved", savedAt: saved.savedAt } });
        return true;
      } catch (cause) {
        const error = cause instanceof SaveError ? cause : new SaveError("unavailable", { cause });
        if (this.view.mode !== "disposed") {
          this.publish({ save: error.kind === "conflict" ? { kind: "conflict" } : { kind: "unsaved", acknowledged: this.allowUnsaved, error: error.kind } });
          if (error.kind === "conflict" || !this.allowUnsaved) this.pause();
        }
        return false;
      }
    }).finally(() => { this.saving = null; });
    return this.saving;
  }

  async activate(): Promise<void> {
    if (!this.view.attached && this.view.mode !== "disposed" && !this.view.error) await new Promise<void>((resolve) => {
      const unsubscribe = this.subscribe(() => {
        if (this.view.attached || this.view.mode === "disposed" || this.view.error) { unsubscribe(); resolve(); }
      });
    });
    const command = chooseBotCommand(this.game.snapshot);
    if (command) await this.enqueue(command);
  }
  claimAnnouncement(id: number): boolean {
    if (id <= this.announcedNoticeId || this.view.notice?.id !== id || this.view.notice.expiresAt <= Date.now()) return false;
    this.announcedNoticeId = id;
    return true;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  bind(port: PresentationPort): () => void {
    if (this.port || this.view.mode === "disposed") throw new Error("会话不可绑定");
    port.sync(this.game.snapshot);
    this.port = port;
    this.publish({ attached: true, displayed: this.game.snapshot });
    return () => {
      if (this.port !== port) return;
      if (this.work) this.pause();
      this.queue.cancel();
      port.stop();
      this.port = null;
      this.publish({ attached: false, displayed: this.game.snapshot });
    };
  }

  dispatch(command: Command): Promise<void> {
    if (command.actor !== this.view.viewPlayerId || playerConfig(this.game.snapshot.config, command.actor).controller !== "human") return Promise.resolve();
    return this.enqueue(command);
  }

  confirmHandover(actor: PlayerId): boolean {
    if (actor !== this.handoverActor || this.work || !this.port || this.view.mode !== "running" || this.view.save.kind === "saving") return false;
    this.publish({ viewPlayerId: actor, notice: null });
    return true;
  }

  private enqueue(command: Command): Promise<void> {
    if (this.work || this.view.presenting || this.view.save.kind === "saving" || !this.port || this.view.mode !== "running") return Promise.resolve();
    this.work = Promise.resolve().then(() => this.run(command)).finally(() => { this.work = null; });
    return this.work;
  }

  pause(): void {
    if (this.view.mode === "disposed") return;
    this.publish({ mode: "paused", displayed: this.game.snapshot, viewPlayerId: this.nextViewPlayer() });
    this.queue.cancel();
    try {
      this.port?.stop();
      this.port?.sync(this.game.snapshot);
    } catch { this.failPresentation(); }
  }

  async resume(): Promise<void> {
    if (this.getSnapshot().mode !== "paused" || !this.port || this.getSnapshot().error === "presentation_failed" || this.view.save.kind === "saving" || this.view.save.kind === "conflict" || this.view.save.kind === "unsaved" && !this.view.save.acknowledged) return;
    await this.work;
    if (this.view.mode !== "paused" || !this.port || this.view.error === "presentation_failed") return;
    this.publish({ mode: "running", error: null });
    const command = chooseBotCommand(this.game.snapshot);
    if (command) await this.enqueue(command);
  }

  skipPresentation(): void {
    this.queue.cancel("skip");
    this.port?.stop();
  }

  failPresentation(): void {
    if (this.view.mode === "disposed") return;
    this.queue.cancel();
    try { this.port?.stop(); } catch { }
    this.publish({ mode: "paused", displayed: this.game.snapshot, error: "presentation_failed" });
  }

  dispose(): void {
    if (this.view.mode === "disposed") return;
    this.publish({ mode: "disposed", displayed: this.game.snapshot, attached: false, presenting: false });
    this.queue.cancel();
    this.port?.stop();
    this.port = null;
    this.listeners.clear();
  }

  private async run(first: Command): Promise<void> {
    let command: Command | null = first;
    try {
      while (command && this.port && this.view.mode === "running") {
        const before = this.game.snapshot;
        const result = this.game.apply(command);
        if (!result.ok) {
          this.publish({ error: "command_rejected" });
          return;
        }
        const port = this.port;
        this.publish({ committed: result.snapshot, displayed: before, events: result.events, presenting: true, error: null });
        if (this.persistence) await this.persist();
        if (this.getSnapshot().mode !== "running" || this.port !== port) return;
        const event = result.events.find((entry) => entry.kind !== "turn" && entry.kind !== "ended");
        const meaningful = event && !("actor" in event && ["purchased", "upgraded", "building_sold", "mortgaged", "redeemed"].includes(event.kind) && playerConfig(before.config, event.actor).controller === "human") && !(event.kind === "rolled" && event.result.landing.kind === "property_available");
        let settled = false;
        const settle = () => {
          if (settled || this.getSnapshot().mode === "disposed" || this.port !== port) return 0;
          settled = true;
          const duration = meaningful ? 1750 : 0;
          this.publish({ displayed: result.snapshot, notice: meaningful ? { id: result.snapshot.revision, event, expiresAt: Date.now() + duration } : null });
          return duration;
        };
        const finished = await this.queue.run(port, result.events, settle);
        if (this.getSnapshot().mode === "disposed") return;
        settle();
        this.publish({ displayed: this.game.snapshot, presenting: false, viewPlayerId: this.nextViewPlayer() });
        if (!finished || this.port !== port || this.view.mode !== "running") return;
        port.sync(this.game.snapshot);
        command = chooseBotCommand(this.game.snapshot);
      }
    } catch {
      if (this.view.mode !== "disposed") this.failPresentation();
    } finally {
      if (this.view.mode !== "disposed") this.publish({ presenting: false, displayed: this.game.snapshot, viewPlayerId: this.nextViewPlayer() });
    }
  }

  private nextViewPlayer(): PlayerId | null {
    const snapshot = this.game.snapshot;
    if (snapshot.config.players.filter((player) => player.controller === "human").length > 1 && snapshot.decision.kind !== "game_over" && playerConfig(snapshot.config, snapshot.decision.actorId).controller === "human" && snapshot.decision.actorId !== this.view.viewPlayerId) return null;
    return this.view.viewPlayerId;
  }

  private publish(change: Partial<GameView>): void {
    if (Object.entries(change).every(([key, value]) => this.view[key as keyof GameView] === value)) return;
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) {
      try { listener(); } catch { }
    }
  }
}
