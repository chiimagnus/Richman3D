import type { LandingResult } from "../domain/types";

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private readonly nodes = new Map<OscillatorNode, GainNode>();
  private readonly musicNodes = new Set<OscillatorNode>();
  private readonly listeners = new Set<() => void>();
  private status: "locked" | "ready" | "blocked" = "locked";
  private playing = false;
  private disposed = false;

  constructor(private enabled = true, private effectsVolume = 1, private musicVolume = 0.12) {}

  getSnapshot = () => this.status;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.stop(); this.stopMusic(); }
    if (this.master && this.context) this.master.gain.setValueAtTime(enabled ? 1 : 0, this.context.currentTime);
    this.startMusic();
  }

  setVolumes(effectsVolume: number, musicVolume: number): void {
    this.effectsVolume = effectsVolume;
    this.musicVolume = musicVolume;
    if (this.context) {
      this.effects?.gain.setValueAtTime(effectsVolume, this.context.currentTime);
      this.music?.gain.setValueAtTime(musicVolume * 0.035, this.context.currentTime);
    }
    if (effectsVolume === 0) this.stop();
    if (musicVolume === 0) this.stopMusic();
    this.startMusic();
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (!playing) this.stopMusic();
    else this.startMusic();
  }

  get activeNodeCount(): number { return this.nodes.size + this.musicNodes.size; }

  unlock(): void {
    const context = this.audioContext(true);
    if (!context) return;
    const ready = () => {
      if (this.disposed || this.context !== context) return;
      this.publishStatus(context.state === "running" ? "ready" : "blocked");
      this.startMusic();
    };
    try {
      if (context.state === "running") ready();
      else void context.resume().then(ready, () => { if (!this.disposed && this.context === context) this.publishStatus("blocked"); });
    } catch { this.publishStatus("blocked"); }
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
    this.stopMusic();
    this.context?.removeEventListener("statechange", this.stateChanged);
    this.effects?.disconnect();
    this.music?.disconnect();
    this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.effects = null;
    this.music = null;
    this.listeners.clear();
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
      case "movement_card":
      case "item_received":
      case "rent_waived":
      case "chance_ignored": this.playIncome(); break;
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
    if (!context || context.state !== "running" || this.status !== "ready" || this.effectsVolume === 0) {
      return;
    }

    const start = context.currentTime + delay;
    let oscillator: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      const activeOscillator = oscillator;
      const activeGain = gain;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(this.effects!);
      this.nodes.set(oscillator, gain);
      oscillator.onended = () => {
        this.nodes.delete(activeOscillator);
        activeOscillator.disconnect();
        activeGain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      if (oscillator) {
        this.nodes.delete(oscillator);
        oscillator.onended = null;
        try { oscillator.stop(); } catch { }
        oscillator.disconnect();
      }
      gain?.disconnect();
      this.publishStatus("blocked");
    }
  }

  private startMusic(): void {
    const context = this.context;
    if (!this.playing || !this.enabled || this.disposed || this.musicVolume === 0 || this.status !== "ready" || !context || context.state !== "running" || this.musicNodes.size) return;
    try {
      for (const frequency of [110, 165, 220]) {
        const oscillator = context.createOscillator();
        this.musicNodes.add(oscillator);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        oscillator.connect(this.music!);
        oscillator.start();
      }
    } catch { this.stopMusic(); this.publishStatus("blocked"); }
  }

  private stopMusic(): void {
    for (const oscillator of this.musicNodes) {
      try { oscillator.stop(); } catch { }
      oscillator.disconnect();
    }
    this.musicNodes.clear();
  }

  private publishStatus(status: typeof this.status): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.listeners) { try { listener(); } catch { } }
  }

  private readonly stateChanged = (): void => {
    if (!this.context || this.disposed) return;
    this.publishStatus(this.context.state === "running" ? "ready" : "locked");
    if (this.context.state !== "running") { this.stop(); this.stopMusic(); }
    else this.startMusic();
  };

  private audioContext(create = false): AudioContext | null {
    if (!this.enabled || this.disposed) {
      return null;
    }

    let created: AudioContext | null = null;
    try {
      if (!this.context) {
        if (!create) return null;
        created = new AudioContext();
        const master = created.createGain();
        const effects = created.createGain();
        const music = created.createGain();
        master.gain.setValueAtTime(this.enabled ? 1 : 0, created.currentTime);
        effects.gain.setValueAtTime(this.effectsVolume, created.currentTime);
        music.gain.setValueAtTime(this.musicVolume * 0.035, created.currentTime);
        effects.connect(master); music.connect(master); master.connect(created.destination);
        created.addEventListener("statechange", this.stateChanged);
        this.context = created; this.master = master; this.effects = effects; this.music = music;
      }
      return this.context;
    } catch {
      if (created) void created.close().catch(() => undefined);
      this.publishStatus("blocked");
      return null;
    }
  }
}
