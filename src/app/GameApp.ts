import { Game } from "../domain/game";
import { legalCommands } from "../domain/selectors";
import type { Command, GameEvent } from "../domain/types";
import { GameAudio } from "../audio/GameAudio";
import { World } from "../rendering/World";
import { BOARD } from "../domain/board";
import { messages } from "../i18n";
import { loadPreferences, savePreferences, lookSensitivityScale, type GamePreferences } from "../settings/preferences";
import { Hud } from "../ui/Hud";
import { SettingsPanel } from "../ui/SettingsPanel";
import { FeedbackLayer } from "../ui/FeedbackLayer";
import { eventText } from "../ui/eventText";
import { GameSession } from "./GameSession";

export class GameApp {
  readonly session = new GameSession(new Game({ seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 }));
  private preferences = loadPreferences();
  private readonly audio = new GameAudio(this.preferences.soundEnabled);
  private readonly world: World;
  private readonly hud: Hud;
  private readonly settings: SettingsPanel;
  private readonly feedback: FeedbackLayer;
  private readonly cleanups: (() => void)[] = [];
  private pointerLocked = false;
  private disposed = false;

  get resourceInfo() {
    return { world: this.world.resourceInfo, audioNodes: this.audio.activeNodeCount };
  }

  constructor(private readonly root: HTMLElement) {
    root.className = "game-root";
    const worldLayer = document.createElement("div");
    worldLayer.className = "world-layer";
    root.replaceChildren(worldLayer);
    this.world = new World(worldLayer, this.preferences.language);
    this.world.setLookSensitivity(lookSensitivityScale(this.preferences.lookSensitivity));
    const dispatch = (command: Command) => { void this.session.dispatch(command); };
    this.hud = new Hud(root, { roll: dispatch, buy: dispatch, skip: dispatch });
    this.settings = new SettingsPanel(root, {
      setSoundEnabled: (soundEnabled) => this.setPreferences({ ...this.preferences, soundEnabled }),
      setLookSensitivity: (lookSensitivity) => this.setPreferences({ ...this.preferences, lookSensitivity }),
      setLanguage: (language) => this.setPreferences({ ...this.preferences, language }),
      returnToGame: () => { this.settings.close(); void this.session.resume(); },
      focusGame: () => this.world.canvas.focus(),
    });
    this.feedback = new FeedbackLayer(root, this.preferences.language, () => { this.dispose(); new GameApp(root); }, (duration, signal) => this.world.wait(duration, signal));
    this.cleanups.push(this.session.bind({
      sync: (snapshot) => this.world.sync(snapshot),
      present: (events, signal) => this.present(events, signal),
      stop: () => { this.world.cancelPresentation(); this.feedback.stop(); this.audio.stop(); },
    }));
    this.cleanups.push(this.session.subscribe(() => this.render()));
    this.cleanups.push(this.world.onPointerLockChange((locked) => { this.pointerLocked = locked; this.render(); }));
    this.world.canvas.addEventListener("click", this.enterFirstPerson);
    window.addEventListener("keydown", this.keydown);
    document.addEventListener("visibilitychange", this.visibility);
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    window.removeEventListener("keydown", this.keydown);
    document.removeEventListener("visibilitychange", this.visibility);
    this.world.canvas.removeEventListener("click", this.enterFirstPerson);
    this.feedback.dispose();
    this.settings.dispose();
    this.hud.dispose();
    this.audio.dispose();
    this.world.dispose();
    this.root.replaceChildren();
  }

  private readonly enterFirstPerson = () => this.world.lockFirstPerson();
  private readonly visibility = () => {
    if (document.hidden) { this.session.pause(); this.world.unlockFirstPerson(); }
    else if (this.session.getSnapshot().mode === "paused") this.settings.open();
  };
  private readonly keydown = (event: KeyboardEvent) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || this.settings.isOpen ||
        (event.target instanceof HTMLElement && event.target.closest("button,input,select,textarea,a[href],[contenteditable='true']"))) return;
    const kind = ({ Space: "roll", KeyB: "buy", KeyN: "skip" } as const)[event.code as "Space" | "KeyB" | "KeyN"];
    const view = this.session.getSnapshot();
    if (kind && !view.presenting) {
      const command = legalCommands(view.displayed, "human").find((action) => action.kind === kind);
      if (command) { event.preventDefault(); void this.session.dispatch(command); }
    } else if (event.code === "KeyM") this.setPreferences({ ...this.preferences, soundEnabled: !this.preferences.soundEnabled });
  };

  private setPreferences(preferences: GamePreferences): void {
    this.preferences = preferences;
    this.audio.setEnabled(preferences.soundEnabled);
    savePreferences(preferences);
    document.documentElement.lang = preferences.language;
    this.world.setLanguage(preferences.language);
    this.world.setLookSensitivity(lookSensitivityScale(preferences.lookSensitivity));
    this.feedback.setLanguage(preferences.language);
    this.render();
  }

  private async present(events: readonly GameEvent[], signal: AbortSignal): Promise<void> {
    for (const event of events) {
      if (signal.aborted) return;
      switch (event.kind) {
        case "rolled": {
          this.audio.playRoll();
          await this.feedback.showDice(event.result.dice, event.result.playerId, signal);
          if (signal.aborted) return;
          const move = event.result.playerId === "human" ? this.world.moveHuman.bind(this.world) : this.world.moveBot.bind(this.world);
          await move(event.result.path, () => this.audio.playStep(), signal);
          if (signal.aborted) return;
          this.world.landOnTile(event.result.to, event.result.landing);
          this.audio.playLanding(event.result.landing);
          this.feedback.showRollResult(event.result.playerId, event.result);
          break;
        }
        case "purchased":
        case "skipped": {
          const tile = BOARD.find((candidate) => candidate.id === event.propertyId);
          if (!tile || tile.type !== "property") throw new Error("事件地产不存在");
          if (event.kind === "purchased") { this.audio.playPurchase(); this.feedback.showPurchase(event.actor, tile, event.price); }
          else this.feedback.showSkipped(event.actor, tile);
          break;
        }
        case "turn": this.feedback.showTurn(event.actor); this.audio.playTurn(event.actor); break;
        case "ended": this.world.unlockFirstPerson(); this.audio.playGameOver(event.winnerId); this.feedback.showGameOver(event.winnerId); break;
      }
    }
  }

  private render(): void {
    if (this.disposed) return;
    const view = this.session.getSnapshot();
    const event = view.events.find((entry) => entry.kind !== "turn");
    this.hud.render(view.displayed, {
      busy: view.presenting || view.mode !== "running" || !view.attached,
      pointerLocked: this.pointerLocked,
      status: view.presenting ? messages(this.preferences.language).status.rolling : event ? eventText(this.preferences.language, event) : messages(this.preferences.language).status.initial,
      language: this.preferences.language,
    });
    this.settings.render({ preferences: this.preferences, pointerLocked: this.pointerLocked });
  }
}
