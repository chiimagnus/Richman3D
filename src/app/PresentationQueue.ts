import type { GameEvent, GameReadSnapshot } from "../domain/types";
import { playerConfig } from "../domain/config";

export function feedbackEvent(events: readonly GameEvent[], snapshot: GameReadSnapshot): GameEvent | null {
  const event = events.find((entry) => entry.kind === "paid") ?? events.find((entry) => entry.kind === "card_moved") ?? events.find((entry) => entry.kind !== "turn" && entry.kind !== "ended");
  return event && snapshot.decision.kind !== "awaiting_debt" && snapshot.decision.kind !== "awaiting_trade" && snapshot.decision.kind !== "awaiting_discard" &&
    !("actor" in event && ["purchased", "upgraded", "building_sold", "item_used"].includes(event.kind) && playerConfig(snapshot.config, event.actor).controller === "human") &&
    !((event.kind === "rolled" || event.kind === "card_moved") && event.result.landing.kind === "property_available") ? event : null;
}

export type PresentationPort = {
  sync(snapshot: GameReadSnapshot): void;
  present(events: readonly GameEvent[], signal: AbortSignal, settle: () => number, show: (event: GameEvent) => void, settleDice: () => void): Promise<void>;
  stop(): void;
};

export class PresentationQueue {
  private current: AbortController | null = null;

  async run(port: PresentationPort, events: readonly GameEvent[], settle: () => number, show: (event: GameEvent) => void, settleDice: () => void): Promise<boolean> {
    const controller = new AbortController();
    this.current = controller;
    let onAbort = () => {};
    const aborted = new Promise<boolean>((resolve) => {
      onAbort = () => resolve(controller.signal.reason === "skip");
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([
        port.present(events, controller.signal, () => this.current === controller && !controller.signal.aborted ? settle() : 0, (event) => { if (this.current === controller && !controller.signal.aborted) show(event); }, () => { if (this.current === controller && !controller.signal.aborted) settleDice(); }).then(() => !controller.signal.aborted || controller.signal.reason === "skip"),
        aborted,
      ]);
    } finally {
      controller.signal.removeEventListener("abort", onAbort);
      if (this.current === controller) this.current = null;
    }
  }

  cancel(reason: "cancel" | "skip" = "cancel"): void {
    this.current?.abort(reason);
  }
}
