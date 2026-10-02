import { GameAudio } from "../audio/GameAudio";
import { tileAt, type PropertyTile } from "../domain/board";
import { Game } from "../domain/game";
import type { GameSnapshot, PlayerId, RollResult, Command } from "../domain/types";
import { chooseBotCommand } from "../domain/bot";
import { pendingProperty, legalCommands } from "../domain/selectors";
import {
  chanceCardText,
  formatMessage,
  messages,
  playerName,
  tileName,
} from "../i18n";
import { World } from "../rendering/World";
import {
  loadPreferences,
  lookSensitivityScale,
  savePreferences,
  type GamePreferences,
  type Language,
  type LookSensitivity,
} from "../settings/preferences";
import { FeedbackLayer } from "../ui/FeedbackLayer";
import { Hud } from "../ui/Hud";
import { SettingsPanel } from "../ui/SettingsPanel";

type StatusText = (language: Language) => string;

export class GameApp {
  private readonly game = new Game({ seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 });
  private displayedSnapshot = this.game.snapshot;
  private preferences: GamePreferences = loadPreferences();
  private readonly audio = new GameAudio(this.preferences.soundEnabled);
  private readonly world: World;
  private readonly hud: Hud;
  private readonly settings: SettingsPanel;
  private readonly feedback: FeedbackLayer;
  private busy = false;
  private pointerLocked = false;
  private status: StatusText = (language) => messages(language).status.initial;

  constructor(private readonly root: HTMLElement) {
    document.documentElement.lang = this.preferences.language;
    this.root.className = "game-root";
    this.root.replaceChildren();

    const worldLayer = document.createElement("div");
    worldLayer.className = "world-layer";
    this.root.append(worldLayer);

    this.world = new World(worldLayer, this.preferences.language);
    this.world.setLookSensitivity(
      lookSensitivityScale(this.preferences.lookSensitivity),
    );
    this.hud = new Hud(this.root, {
      roll: (command) => void this.rollHuman(command),
      buy: (command) => this.buyHumanProperty(command),
      skip: (command) => this.skipHumanProperty(command),
    });
    this.settings = new SettingsPanel(this.root, {
      setSoundEnabled: (enabled) => this.setSoundEnabled(enabled),
      setLookSensitivity: (sensitivity) =>
        this.setLookSensitivity(sensitivity),
      setLanguage: (language) => this.setLanguage(language),
      returnToGame: () => this.returnToGame(),
      focusGame: () => this.world.canvas.focus(),
    });
    this.feedback = new FeedbackLayer(
      this.root,
      this.preferences.language,
      () => window.location.reload(),
    );

    this.world.sync(this.game.snapshot);
    this.world.canvas.addEventListener("click", this.enterFirstPerson);
    this.world.onPointerLockChange((locked) => {
      this.pointerLocked = locked;

      if (locked) {
        this.settings.close();
      }

      this.render();

      if (!locked) {
        window.setTimeout(() => {
          if (
            !this.pointerLocked &&
            this.game.snapshot.decision.kind !== "game_over"
          ) {
            this.settings.open();
          }
        }, 120);
      }
    });
    window.addEventListener("keydown", this.handleKeydown);

    this.render();
    this.feedback.showTurn("human");
  }

  private readonly enterFirstPerson = (): void => {
    this.world.lockFirstPerson();
  };

  private returnToGame(): void {
    if (this.game.snapshot.decision.kind !== "game_over") {
      this.world.canvas.focus();
      this.world.lockFirstPerson();
    }
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      this.settings.isOpen ||
      isNativeInteractiveTarget(event.target)
    ) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      void this.rollHuman();
      return;
    }

    if (event.code === "KeyB") {
      this.buyHumanProperty();
      return;
    }

    if (event.code === "KeyN") {
      this.skipHumanProperty();
      return;
    }

    if (event.code === "KeyM") {
      this.toggleSound();
    }
  };

  private async rollHuman(command = this.humanCommand("roll")): Promise<void> {
    const snapshot = this.game.snapshot;
    if (
      !command || this.busy ||
      snapshot.decision.kind !== "awaiting_roll" ||
      snapshot.activePlayerId !== "human"
    ) {
      return;
    }

    this.busy = true;
    this.status = (language) => messages(language).status.rolling;
    this.render();

    this.audio.playRoll();
    const result = this.applyRoll(command);
    await this.feedback.showDice(result.dice, "human");
    this.status = (language) => rollStatus(language, "human", result);
    await this.world.moveHuman(result.path, () => this.audio.playStep());
    this.world.landOnTile(result.to, result.landing);
    this.audio.playLanding(result.landing);
    this.world.syncOwnership(this.game.snapshot);

    this.busy = false;
    this.render();
    this.feedback.showRollResult("human", result);

    if (this.game.snapshot.decision.kind === "game_over") {
      this.finishGame();
      return;
    }

    if (this.game.snapshot.activePlayerId === "bot") {
      await this.runBotTurn();
    }
  }

  private buyHumanProperty(command = this.humanCommand("buy")): void {
    const snapshot = this.game.snapshot;
    const property = pendingProperty(snapshot);

    if (
      !command || this.busy ||
      snapshot.decision.kind !== "awaiting_purchase" ||
      snapshot.activePlayerId !== "human" ||
      !property
    ) {
      return;
    }

    const human = snapshot.players.find((player) => player.id === "human");
    if (!human || human.cash < property.price) {
      this.status = (language) => messages(language).status.insufficientFunds;
      this.render();
      return;
    }

    this.applyCommand(command);
    this.world.syncOwnership(this.game.snapshot);
    this.status = (language) =>
      formatMessage(messages(language).status.purchased, {
        propertyName: tileName(language, property),
      });
    this.render();
    this.audio.playPurchase();
    this.feedback.showPurchase("human", property, property.price);
    void this.runBotTurn();
  }

  private skipHumanProperty(command = this.humanCommand("skip")): void {
    const snapshot = this.game.snapshot;
    const property = pendingProperty(snapshot);

    if (
      !command || this.busy ||
      snapshot.decision.kind !== "awaiting_purchase" ||
      snapshot.activePlayerId !== "human" ||
      !property
    ) {
      return;
    }

    this.applyCommand(command);
    this.status = (language) =>
      formatMessage(messages(language).status.skipped, {
        propertyName: tileName(language, property),
      });
    this.render();
    this.feedback.showSkipped("human", property);
    void this.runBotTurn();
  }

  private async runBotTurn(): Promise<void> {
    const before = this.game.snapshot;
    if (
      this.busy ||
      before.decision.kind === "game_over" ||
      before.activePlayerId !== "bot"
    ) {
      return;
    }

    this.busy = true;
    this.status = (language) => messages(language).status.botActing;
    this.render();
    this.feedback.showTurn("bot");
    this.audio.playTurn("bot");
    await pause(620);

    this.audio.playRoll();
    const result = this.applyRoll();
    await this.feedback.showDice(result.dice, "bot");
    await this.world.moveBot(result.path, () => this.audio.playStep());
    this.world.landOnTile(result.to, result.landing);
    this.audio.playLanding(result.landing);
    this.world.syncOwnership(this.game.snapshot);
    this.feedback.showRollResult("bot", result);

    if (
      this.game.snapshot.decision.kind === "awaiting_purchase" &&
      this.game.snapshot.activePlayerId === "bot"
    ) {
      this.resolveBotPurchase();
    }

    this.busy = false;

    if (this.game.snapshot.decision.kind === "game_over") {
      this.finishGame();
      return;
    }

    this.status = (language) => messages(language).status.yourTurn;
    this.render();
    this.feedback.showTurn("human");
    this.audio.playTurn("human");
  }

  private resolveBotPurchase(): void {
    const snapshot = this.game.snapshot;
    const property = pendingProperty(snapshot);
    const command = chooseBotCommand(snapshot);
    if (!property || !command) throw new Error("电脑购买阶段缺少合法动作");
    this.applyCommand(command);
    this.world.syncOwnership(this.game.snapshot);
    if (command.kind === "buy") {
      this.audio.playPurchase();
      this.feedback.showPurchase("bot", property, property.price);
    } else {
      this.feedback.showSkipped("bot", property);
    }
  }

  private applyCommand(command: Command) {
    const result = this.game.apply(command);
    if (!result.ok) throw new Error(result.reason);
    return result;
  }

  private applyRoll(input?: Command): RollResult {
    const snapshot = this.game.snapshot;
    const command = input ?? (snapshot.activePlayerId === "bot"
      ? chooseBotCommand(snapshot)
      : this.humanCommand("roll"));
    if (!command) throw new Error("没有合法掷骰动作");
    const event = this.applyCommand(command).events.find((entry) => entry.kind === "rolled");
    if (!event || event.kind !== "rolled") throw new Error("缺少掷骰结果");
    return event.result;
  }

  private humanCommand(kind: Command["kind"]): Command | undefined {
    return legalCommands(this.displayedSnapshot, "human").find((action) => action.kind === kind);
  }

  private toggleSound(): void {
    this.setSoundEnabled(!this.preferences.soundEnabled);
  }

  private setSoundEnabled(soundEnabled: boolean): void {
    if (soundEnabled === this.preferences.soundEnabled) {
      return;
    }

    this.preferences = { ...this.preferences, soundEnabled };
    this.audio.setEnabled(soundEnabled);
    savePreferences(this.preferences);
    this.render();
  }

  private setLookSensitivity(lookSensitivity: LookSensitivity): void {
    if (lookSensitivity === this.preferences.lookSensitivity) {
      return;
    }

    this.preferences = { ...this.preferences, lookSensitivity };
    this.world.setLookSensitivity(lookSensitivityScale(lookSensitivity));
    savePreferences(this.preferences);
    this.render();
  }

  private setLanguage(language: Language): void {
    if (language === this.preferences.language) {
      return;
    }

    this.preferences = { ...this.preferences, language };
    savePreferences(this.preferences);
    document.documentElement.lang = language;
    this.world.setLanguage(language);
    this.feedback.setLanguage(language);
    this.render();
  }

  private finishGame(): void {
    this.busy = false;
    this.world.unlockFirstPerson();

    const snapshot = this.game.snapshot;
    const winnerId = snapshot.decision.kind === "game_over" ? snapshot.decision.winnerId : null;
    this.status = (language) =>
      winnerId
        ? formatMessage(messages(language).status.winner, {
            playerName: playerName(language, winnerId),
          })
        : messages(language).status.gameOver;
    this.render();
    this.audio.playGameOver(winnerId);
    this.feedback.showGameOver(winnerId);
  }

  private render(): void {
    this.displayedSnapshot = this.game.snapshot;
    this.hud.render(this.game.snapshot, {
      busy: this.busy,
      pointerLocked: this.pointerLocked,
      status: this.status(this.preferences.language),
      language: this.preferences.language,
    });
    this.settings.render({
      preferences: this.preferences,
      pointerLocked: this.pointerLocked,
    });
  }
}

function rollStatus(
  language: Language,
  actorId: PlayerId,
  result: RollResult,
): string {
  const copy = messages(language).status;
  const actor = playerName(language, actorId);
  const landing = result.landing;

  switch (landing.kind) {
    case "property_available":
      return formatMessage(copy.rollPropertyAvailable, {
        actor,
        steps: result.steps,
      });
    case "rent":
      return formatMessage(copy.rollRent, {
        actor,
        steps: result.steps,
        amount: landing.amount,
      });
    case "tax":
      return formatMessage(copy.rollTax, {
        actor,
        steps: result.steps,
        amount: landing.amount,
      });
    case "chance":
      return formatMessage(copy.rollChance, {
        actor,
        steps: result.steps,
        message: chanceCardText(language, landing.cardId),
      });
    case "property_owned":
      return formatMessage(copy.rollOwned, {
        actor,
        steps: result.steps,
      });
    case "start":
      return formatMessage(copy.rollStart, {
        actor,
        steps: result.steps,
      });
  }
}

function isNativeInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      "button, input, select, textarea, a[href], [contenteditable='true']",
    ) !== null
  );
}

function pause(milliseconds: number): Promise<void> {
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const duration = reduceMotion ? Math.min(milliseconds, 80) : milliseconds;

  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}
