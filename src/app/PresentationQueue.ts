import type { GameEvent, GameSnapshot } from "../domain/types";

export type PresentationPort = {
  sync(snapshot: GameSnapshot): void;
  present(events: readonly GameEvent[], signal: AbortSignal): Promise<void>;
  stop(): void;
};

export class PresentationQueue {
  private current: AbortController | null = null;

  async run(port: PresentationPort, events: readonly GameEvent[]): Promise<boolean> {
    const controller = new AbortController();
    this.current = controller;
    let onAbort = () => {};
    const aborted = new Promise<boolean>((resolve) => {
      onAbort = () => resolve(controller.signal.reason === "skip");
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([
        port.present(events, controller.signal).then(() => !controller.signal.aborted || controller.signal.reason === "skip"),
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
