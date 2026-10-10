import type { Command, GameReadSnapshot } from "../domain/types";
import type { RoomClient } from "../network/RoomClient";
import type { ServerMessage } from "../network/protocol";
import { PRESENTATION_RATES, type PresentationSpeed } from "../settings/preferences";
import type { GameView } from "./GameSession";
import { feedbackEvent, PresentationQueue, type PresentationPort } from "./PresentationQueue";
import type { PlaySession } from "./Session";

type StateMessage = Extract<ServerMessage, { kind: "state" }>;
export class OnlineSession implements PlaySession {
  readonly kind = "online";
  readonly matchId: string;
  private view: GameView;
  private latest: GameReadSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly queue = new PresentationQueue();
  private readonly pending: StateMessage[] = [];
  private port: PresentationPort | null = null;
  private work: Promise<void> | null = null;
  private readonly unbind: () => void;
  private lastMessage: StateMessage | null;
  private speed: PresentationSpeed = "normal";
  private announcedNotice = 0;
  private announcedDice = 0;

  constructor(private readonly client: RoomClient) {
    const room = client.getSnapshot().room;
    if (!room?.snapshot) throw new Error("Room has not started");
    this.matchId = `room:${room.code}:${room.playerId}`;
    this.latest = room.snapshot;
    this.lastMessage = client.getSnapshot().message;
    this.view = { committed: room.snapshot, displayed: room.snapshot, mode: "running", presenting: false, attached: false,
      events: [], presentationEvent: null, settledRoll: null, botDecision: null, error: null, notice: null, save: { kind: "disabled" }, viewPlayerId: room.playerId, network: this.connection() };
    this.unbind = client.subscribe(this.receive);
  }
  getSnapshot = (): GameView => this.view;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  setPresentationSpeed(speed: PresentationSpeed): void { this.speed = speed; }

  bind(port: PresentationPort): () => void {
    if (this.port || this.view.mode === "disposed") throw new Error("Presentation already bound");
    port.sync(this.latest); this.port = port;
    this.publish({ attached: true, committed: this.latest, displayed: this.latest });
    return () => {
      if (this.port !== port) return;
      this.queue.cancel(); this.pending.length = 0; port.stop(); this.port = null;
      this.publish({ attached: false, presenting: false, committed: this.latest, displayed: this.latest, presentationEvent: null, notice: null });
    };
  }

  async dispatch(command: Command): Promise<void> {
    if (this.view.mode !== "running" || !this.port || this.view.presenting || this.work || this.pending.length ||
        this.view.error === "presentation_failed" || command.actor !== this.view.viewPlayerId || command.expectedRevision !== this.latest.revision) return;
    this.client.command(command);
  }
  pause(): void {
    if (this.view.mode === "disposed") return;
    this.queue.cancel(); this.pending.length = 0; this.port?.stop(); this.port?.sync(this.latest);
    this.publish({ mode: "paused", committed: this.latest, displayed: this.latest, presenting: false, presentationEvent: null, notice: null });
  }
  async resume(): Promise<void> {
    await this.work;
    if (this.view.mode !== "paused" || !this.port || this.view.error === "presentation_failed") return;
    this.port.sync(this.latest);
    this.publish({ mode: "running", committed: this.latest, displayed: this.latest, error: null });
  }
  skipPresentation(): void { this.queue.cancel("skip"); this.port?.stop(); }
  failPresentation(): void { this.pause(); this.publish({ error: "presentation_failed" }); }
  claimAnnouncement(id: number): boolean {
    if (this.view.notice?.id !== id || this.view.notice.expiresAt <= Date.now() || id <= this.announcedNotice) return false;
    this.announcedNotice = id; return true;
  }
  claimDiceAnnouncement(revision: number): boolean {
    if (this.view.settledRoll?.revision !== revision || revision <= this.announcedDice) return false;
    this.announcedDice = revision; return true;
  }
  dispose(): void {
    if (this.view.mode === "disposed") return;
    this.unbind(); this.queue.cancel(); this.pending.length = 0; this.port?.stop(); this.port = null;
    this.publish({ mode: "disposed", attached: false, presenting: false, committed: this.latest, displayed: this.latest, presentationEvent: null, notice: null });
    this.listeners.clear();
  }

  private connection(): NonNullable<GameView["network"]> {
    const view = this.client.getSnapshot();
    return { connected: view.status === "connected", pending: view.pending, error: view.error };
  }
  private readonly receive = (): void => {
    if (this.view.mode === "disposed") return;
    const client = this.client.getSnapshot();
    this.publish({ network: this.connection() });
    const message = client.message;
    if (!message || message === this.lastMessage) return;
    this.lastMessage = message;
    const snapshot = message.room.snapshot;
    if (!snapshot || snapshot.revision < this.latest.revision) return;
    if (snapshot.revision === this.latest.revision && !message.reset) return;
    this.latest = snapshot;
    if (message.reset || !this.port || this.view.mode !== "running") {
      this.queue.cancel(); this.pending.length = 0; this.port?.stop(); this.port?.sync(snapshot);
      this.publish({ committed: snapshot, displayed: snapshot, presenting: false, presentationEvent: null, settledRoll: null, notice: null });
      return;
    }
    this.pending.push(message);
    if (!this.work) this.drain();
  };
  private drain(): void {
    this.work = Promise.resolve().then(async () => {
      while (this.pending.length && this.port && this.view.mode === "running") {
        const message = this.pending.shift()!;
        const snapshot = message.room.snapshot!;
        const port = this.port;
        this.publish({ committed: snapshot, presenting: true, events: message.events, presentationEvent: null, settledRoll: null, notice: null, error: null });
        let settled = false;
        const rolled = message.events.find((event) => event.kind === "rolled");
        const settleDice = () => {
          if (this.port === port && this.view.mode === "running" && rolled?.kind === "rolled") this.publish({ settledRoll: { revision: snapshot.revision, result: rolled.result } });
        };
        const settle = () => {
          if (settled || this.port !== port || this.view.mode !== "running") return 0;
          settled = true; settleDice();
          const event = feedbackEvent(message.events, snapshot);
          const duration = event ? 1750 : 0;
          this.publish({ displayed: snapshot, presentationEvent: null, notice: event ? { id: snapshot.revision, event, expiresAt: Date.now() + duration / PRESENTATION_RATES[this.speed] } : null });
          return duration;
        };
        const finished = await this.queue.run(port, message.events, settle, (event) => this.publish({ presentationEvent: event }), settleDice);
        if (!finished || this.port !== port || this.view.mode !== "running") return;
        settle(); port.sync(snapshot);
        this.publish({ displayed: snapshot, presenting: false, presentationEvent: null });
      }
    }).catch(() => { if (this.view.mode !== "disposed") this.failPresentation(); }).finally(() => {
      this.work = null;
      if (this.view.mode !== "disposed" && this.pending.length && this.port && this.view.mode === "running") this.drain();
    });
  }
  private publish(change: Partial<GameView>): void {
    if (Object.entries(change).every(([key, value]) => this.view[key as keyof GameView] === value)) return;
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) { try { listener(); } catch {} }
  }
}
