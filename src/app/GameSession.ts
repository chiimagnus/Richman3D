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
};

export class GameSession {
  private readonly queue = new PresentationQueue();
  private readonly listeners = new Set<() => void>();
  private port: PresentationPort | null = null;
  private work: Promise<void> | null = null;
  private view: GameView;

  constructor(private readonly game: Game) {
    this.view = { committed: game.snapshot, displayed: game.snapshot, mode: "running", presenting: false, attached: false, events: [], error: null };
  }

  getSnapshot = (): GameView => this.view;
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
    this.port?.stop();
    this.port?.sync(this.game.snapshot);
  }

  async resume(): Promise<void> {
    if (this.view.mode !== "paused" || !this.port || this.view.error) return;
    await this.work;
    if (this.view.mode !== "paused" || !this.port) return;
    this.publish({ mode: "running" });
    const command = chooseBotCommand(this.game.snapshot);
    if (command) await this.dispatch(command);
  }

  skipPresentation(): void {
    this.queue.cancel("skip");
    this.port?.stop();
  }

  failPresentation(): void {
    this.pause();
    this.publish({ error: "presentation_failed" });
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
        const finished = await this.queue.run(port, result.events);
        if (this.getSnapshot().mode === "disposed") return;
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
