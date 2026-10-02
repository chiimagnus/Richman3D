import { Game } from "../domain/game";
import { chooseBotCommand } from "../domain/bot";
import type { Command, GameEvent, GameSnapshot } from "../domain/types";
import { PresentationQueue, type PresentationPort } from "./PresentationQueue";

export type GameView = {
  readonly committed: GameSnapshot;
  readonly displayed: GameSnapshot;
  readonly mode: "running" | "paused" | "disposed";
  readonly presenting: boolean;
  readonly attached: boolean;
  readonly events: readonly GameEvent[];
  readonly error: "presentation_failed" | "command_rejected" | null;
  readonly notice: { readonly id: number; readonly event: GameEvent; readonly expiresAt: number } | null;
};

export class GameSession {
  private readonly queue = new PresentationQueue();
  private readonly listeners = new Set<() => void>();
  private port: PresentationPort | null = null;
  private work: Promise<void> | null = null;
  private announcedNoticeId = 0;
  private view: GameView;

  constructor(private readonly game: Game, readonly matchId = "local") {
    this.view = { committed: game.snapshot, displayed: game.snapshot, mode: "running", presenting: false, attached: false, events: [], error: null, notice: null };
  }

  getSnapshot = (): GameView => this.view;
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
    if (this.work || this.view.presenting || !this.port || this.view.mode !== "running") return Promise.resolve();
    this.work = Promise.resolve().then(() => this.run(command)).finally(() => { this.work = null; });
    return this.work;
  }

  pause(): void {
    if (this.view.mode === "disposed") return;
    this.publish({ mode: "paused", displayed: this.game.snapshot });
    this.queue.cancel();
    try {
      this.port?.stop();
      this.port?.sync(this.game.snapshot);
    } catch { this.failPresentation(); }
  }

  async resume(): Promise<void> {
    if (this.getSnapshot().mode !== "paused" || !this.port || this.getSnapshot().error === "presentation_failed") return;
    await this.work;
    if (this.view.mode !== "paused" || !this.port || this.view.error === "presentation_failed") return;
    this.publish({ mode: "running", error: null });
    const command = chooseBotCommand(this.game.snapshot);
    if (command) await this.dispatch(command);
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
        if (this.getSnapshot().mode !== "running" || this.port !== port) return;
        const event = result.events.find((entry) => entry.kind !== "turn" && entry.kind !== "ended");
        const meaningful = event && !(event.kind === "purchased" && event.actor === "human") && !(event.kind === "rolled" && event.result.landing.kind === "property_available");
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
        this.publish({ displayed: this.game.snapshot, presenting: false });
        if (!finished || this.port !== port || this.view.mode !== "running") return;
        port.sync(this.game.snapshot);
        command = chooseBotCommand(this.game.snapshot);
      }
    } catch {
      if (this.view.mode !== "disposed") this.failPresentation();
    } finally {
      if (this.view.mode !== "disposed") this.publish({ presenting: false, displayed: this.game.snapshot });
    }
  }

  private publish(change: Partial<GameView>): void {
    if (Object.entries(change).every(([key, value]) => this.view[key as keyof GameView] === value)) return;
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) {
      try { listener(); } catch { }
    }
  }
}
