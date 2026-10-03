import type { LandingResult } from "../domain/types";

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly nodes = new Map<OscillatorNode, GainNode>();
  private disposed = false;

  constructor(private enabled = true) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
    if (this.master && this.context) this.master.gain.setValueAtTime(enabled ? 1 : 0, this.context.currentTime);
  }

  get activeNodeCount(): number { return this.nodes.size; }

  unlock(): void {
    const context = this.audioContext(true);
    try { if (context) void context.resume().catch(() => undefined); } catch { }
  }

  stop(): void {
    for (const [oscillator, gain] of this.nodes) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.nodes.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
  }

  playRoll(): void {
    this.sequence([
      [190, 0, 0.055],
      [250, 0.07, 0.05],
      [170, 0.14, 0.045],
      [310, 0.21, 0.04],
    ]);
  }

  playStep(): void {
    this.tone(170, 0.045, 0.018, "square");
  }

  playLanding(landing: LandingResult): void {
    switch (landing.kind) {
      case "rent":
      case "tax":
        this.playExpense();
        break;
      case "chance":
        if (landing.amount >= 0) {
          this.playIncome();
        } else {
          this.sequence([
            [390, 0, 0.035],
            [260, 0.08, 0.035],
          ]);
        }
        break;
      case "property_available":
        this.sequence([
          [330, 0, 0.03],
          [440, 0.09, 0.035],
        ]);
        break;
      case "property_owned":
      case "start":
        this.playIncome();
        break;
    }
  }

  playPurchase(): void {
    this.sequence([
      [330, 0, 0.04],
      [495, 0.08, 0.045],
      [660, 0.16, 0.045],
    ]);
  }

  playTurn(isLocal: boolean): void {
    if (isLocal) {
      this.sequence([
        [440, 0, 0.025],
        [660, 0.09, 0.03],
      ]);
    } else {
      this.sequence([
        [300, 0, 0.022],
        [240, 0.09, 0.025],
      ]);
    }
  }

  playGameOver(localWon: boolean): void {
    if (localWon) {
      this.sequence([
        [440, 0, 0.04],
        [554, 0.12, 0.045],
        [659, 0.24, 0.05],
        [880, 0.38, 0.055],
      ]);
    } else {
      this.sequence([
        [330, 0, 0.04],
        [247, 0.14, 0.045],
        [196, 0.29, 0.05],
      ]);
    }
  }

  private playIncome(): void {
    this.sequence([
      [520, 0, 0.035],
      [780, 0.09, 0.04],
    ]);
  }

  private playExpense(): void {
    this.sequence([
      [300, 0, 0.04],
      [190, 0.1, 0.045],
    ]);
  }

  private sequence(
    notes: readonly (readonly [frequency: number, delay: number, gain: number])[],
  ): void {
    for (const [frequency, delay, gain] of notes) {
      this.tone(frequency, 0.085, gain, "sine", delay);
    }
  }

  private tone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const context = this.audioContext();
    if (!context) {
      return;
    }

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(this.master!);
    this.nodes.set(oscillator, gain);
    oscillator.onended = () => {
      this.nodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private audioContext(create = false): AudioContext | null {
    if (!this.enabled || this.disposed) {
      return null;
    }

    try {
      if (!this.context) {
        if (!create) return null;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      return this.context;
    } catch {
      return null;
    }
  }
}
