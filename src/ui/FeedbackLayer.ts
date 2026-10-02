import { tileAt, type PropertyTile } from "../domain/board";
import type { PlayerId, RollResult } from "../domain/game";
import {
  chanceCardText,
  formatMessage,
  messages,
  playerName,
  tileName,
} from "../i18n";
import type { Language } from "../settings/preferences";

type FeedbackTone = "neutral" | "positive" | "negative" | "chance" | "property";

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] as const;

export class FeedbackLayer {
  private readonly root = document.createElement("div");
  private readonly turnBanner: HTMLElement;
  private readonly turnKicker: HTMLElement;
  private readonly turnTitle: HTMLElement;
  private readonly diceStage: HTMLElement;
  private readonly diceActor: HTMLElement;
  private readonly diceLeft: HTMLElement;
  private readonly diceRight: HTMLElement;
  private readonly diceAnnouncement: HTMLElement;
  private readonly eventCard: HTMLElement;
  private readonly eventKicker: HTMLElement;
  private readonly eventTitle: HTMLElement;
  private readonly eventDetail: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly gameOverKicker: HTMLElement;
  private readonly gameOverTitle: HTMLElement;
  private readonly gameOverDetail: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private turnTimer: number | null = null;
  private eventTimer: number | null = null;

  constructor(
    container: HTMLElement,
    private language: Language,
    restart: () => void,
  ) {
    this.root.className = "feedback-layer";
    this.root.innerHTML = `
      <div class="turn-banner" data-feedback-turn hidden>
        <span class="feedback-kicker" data-turn-kicker></span>
        <strong data-turn-title></strong>
      </div>

      <div class="dice-stage" data-feedback-dice hidden>
        <span class="feedback-kicker" data-dice-actor></span>
        <div class="dice-pair" aria-hidden="true">
          <span class="feedback-die" data-die-left>⚀</span>
          <span class="feedback-die" data-die-right>⚀</span>
        </div>
        <span class="sr-only" data-dice-announcement aria-live="polite"></span>
      </div>

      <div class="event-card" data-feedback-event hidden aria-live="polite">
        <span class="feedback-kicker" data-event-kicker></span>
        <strong data-event-title></strong>
        <span data-event-detail></span>
      </div>

      <div class="game-over-layer" data-feedback-game-over hidden role="dialog" aria-modal="true" aria-labelledby="game-over-title">
        <div class="game-over-card">
          <span class="feedback-kicker" data-game-over-kicker></span>
          <strong id="game-over-title" data-game-over-title></strong>
          <p data-game-over-detail></p>
          <button type="button" data-restart></button>
        </div>
      </div>
    `;

    container.append(this.root);

    this.turnBanner = requiredElement(this.root, "[data-feedback-turn]");
    this.turnKicker = requiredElement(this.root, "[data-turn-kicker]");
    this.turnTitle = requiredElement(this.root, "[data-turn-title]");
    this.diceStage = requiredElement(this.root, "[data-feedback-dice]");
    this.diceActor = requiredElement(this.root, "[data-dice-actor]");
    this.diceLeft = requiredElement(this.root, "[data-die-left]");
    this.diceRight = requiredElement(this.root, "[data-die-right]");
    this.diceAnnouncement = requiredElement(this.root, "[data-dice-announcement]");
    this.eventCard = requiredElement(this.root, "[data-feedback-event]");
    this.eventKicker = requiredElement(this.root, "[data-event-kicker]");
    this.eventTitle = requiredElement(this.root, "[data-event-title]");
    this.eventDetail = requiredElement(this.root, "[data-event-detail]");
    this.gameOver = requiredElement(this.root, "[data-feedback-game-over]");
    this.gameOverKicker = requiredElement(this.root, "[data-game-over-kicker]");
    this.gameOverTitle = requiredElement(this.root, "[data-game-over-title]");
    this.gameOverDetail = requiredElement(this.root, "[data-game-over-detail]");
    this.restartButton = requiredElement<HTMLButtonElement>(this.root, "[data-restart]");

    this.restartButton.addEventListener("click", restart);
    this.setLanguage(language);
  }

  setLanguage(language: Language): void {
    this.language = language;
    this.restartButton.textContent = messages(language).feedback.restart;
  }

  showTurn(playerId: PlayerId): void {
    if (this.turnTimer !== null) {
      window.clearTimeout(this.turnTimer);
    }

    const humanTurn = playerId === "human";
    const copy = messages(this.language).feedback;
    this.turnKicker.textContent = humanTurn
      ? copy.yourTurnKicker
      : copy.rivalTurnKicker;
    this.turnTitle.textContent = humanTurn
      ? copy.yourTurnTitle
      : copy.rivalTurnTitle;
    this.turnBanner.dataset.player = playerId;
    this.turnBanner.hidden = false;
    restartAnimation(this.turnBanner, "is-showing");

    this.turnTimer = window.setTimeout(() => {
      this.turnBanner.hidden = true;
      this.turnTimer = null;
    }, 850);
  }

  async showDice(
    dice: readonly [number, number],
    actorId: PlayerId,
  ): Promise<void> {
    const copy = messages(this.language).feedback;
    const actor = playerName(this.language, actorId);
    this.diceActor.textContent = formatMessage(copy.diceActor, { actor });
    this.diceAnnouncement.textContent = "";
    this.diceStage.hidden = false;
    this.diceStage.classList.add("is-rolling");

    if (!reducedMotion()) {
      for (let frame = 0; frame < 4; frame += 1) {
        this.setDice(
          ((dice[0] + frame * 2) % 6) + 1,
          ((dice[1] + frame * 3 + 1) % 6) + 1,
        );
        await wait(78);
      }
    }

    this.setDice(dice[0], dice[1]);
    this.diceAnnouncement.textContent = formatMessage(copy.diceAnnouncement, {
      actor,
      left: dice[0],
      right: dice[1],
      total: dice[0] + dice[1],
    });
    this.diceStage.classList.remove("is-rolling");
    this.diceStage.classList.add("is-settled");
    await wait(reducedMotion() ? 360 : 260);
    this.diceStage.classList.remove("is-settled");
    this.diceStage.hidden = true;
  }

  showRollResult(actorId: PlayerId, result: RollResult): void {
    const copy = messages(this.language).feedback;
    const actor = playerName(this.language, actorId);
    const tile = tileAt(result.to);
    const localizedTileName = tileName(this.language, tile);
    const passStart = result.passedStart ? copy.passedStart : "";
    let tone: FeedbackTone = "neutral";
    let kicker = localizedTileName;
    let title = formatMessage(copy.moved, {
      actor,
      steps: result.steps,
    });
    let detail = passStart;

    switch (result.landing.kind) {
      case "property_available":
        tone = "property";
        title = formatMessage(copy.propertyAvailable, {
          propertyName: localizedTileName,
        });
        detail += formatMessage(copy.salePrice, { price: result.landing.price });
        break;
      case "property_owned":
        tone = "positive";
        title = formatMessage(copy.propertyOwned, {
          propertyName: localizedTileName,
        });
        detail += copy.ownProperty;
        break;
      case "rent":
        tone = "negative";
        title = formatMessage(copy.rentPaid, { amount: result.landing.amount });
        detail += formatMessage(copy.landedOn, {
          propertyName: localizedTileName,
        });
        break;
      case "tax":
        tone = "negative";
        title = formatMessage(copy.feePaid, { amount: result.landing.amount });
        detail += localizedTileName;
        break;
      case "chance":
        tone = result.landing.amount >= 0 ? "positive" : "chance";
        title = chanceCardText(this.language, result.landing.cardId);
        detail +=
          result.landing.amount >= 0
            ? formatMessage(copy.fundsGain, { amount: result.landing.amount })
            : formatMessage(copy.fundsLoss, {
                amount: Math.abs(result.landing.amount),
              });
        break;
      case "start":
        tone = "positive";
        title = copy.backToStart;
        detail += copy.continueNextTurn;
        break;
    }

    this.showEvent(
      kicker,
      title,
      detail || formatMessage(copy.moveCompleted, { actor }),
      tone,
    );
  }

  showPurchase(actorId: PlayerId, property: PropertyTile, price: number): void {
    const copy = messages(this.language).feedback;
    const actor = playerName(this.language, actorId);
    this.showEvent(
      copy.propertyAcquiredKicker,
      formatMessage(copy.bought, {
        actor,
        propertyName: tileName(this.language, property),
      }),
      formatMessage(copy.dealPrice, { price }),
      "property",
    );
  }

  showSkipped(actorId: PlayerId, property: PropertyTile): void {
    const copy = messages(this.language).feedback;
    const actor = playerName(this.language, actorId);
    this.showEvent(
      copy.propertyKicker,
      formatMessage(copy.skipped, {
        actor,
        propertyName: tileName(this.language, property),
      }),
      copy.propertyUnowned,
      "neutral",
    );
  }

  showGameOver(winnerId: PlayerId | null): void {
    const copy = messages(this.language).feedback;
    const humanWon = winnerId === "human";
    this.gameOverKicker.textContent = humanWon
      ? copy.victoryKicker
      : copy.gameOverKicker;
    this.gameOverTitle.textContent = humanWon
      ? copy.humanWonTitle
      : copy.botWonTitle;
    this.gameOverDetail.textContent = humanWon
      ? copy.humanWonDetail
      : winnerId === "bot"
        ? copy.botWonDetail
        : copy.gameOverDetail;
    this.gameOver.dataset.result = humanWon ? "win" : "lose";
    this.gameOver.hidden = false;
    this.restartButton.focus({ preventScroll: true });
  }

  private showEvent(
    kicker: string,
    title: string,
    detail: string,
    tone: FeedbackTone,
  ): void {
    if (this.eventTimer !== null) {
      window.clearTimeout(this.eventTimer);
    }

    this.eventKicker.textContent = kicker;
    this.eventTitle.textContent = title;
    this.eventDetail.textContent = detail;
    this.eventCard.dataset.tone = tone;
    this.eventCard.hidden = false;
    restartAnimation(this.eventCard, "is-showing");

    this.eventTimer = window.setTimeout(() => {
      this.eventCard.hidden = true;
      this.eventTimer = null;
    }, 1750);
  }

  private setDice(left: number, right: number): void {
    this.diceLeft.textContent = diceFace(left);
    this.diceRight.textContent = diceFace(right);
  }
}

function diceFace(value: number): string {
  return DICE_FACES[value - 1] ?? "⚀";
}

function restartAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function requiredElement<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`反馈层缺少元素: ${selector}`);
  }
  return element;
}
