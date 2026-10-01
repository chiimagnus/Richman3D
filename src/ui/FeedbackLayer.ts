import { tileAt } from "../domain/board";
import type { PlayerId, RollResult } from "../domain/game";

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

  constructor(container: HTMLElement, restart: () => void) {
    this.root.className = "feedback-layer";
    this.root.innerHTML = `
      <div class="turn-banner" data-feedback-turn hidden>
        <span class="feedback-kicker" data-turn-kicker>TURN</span>
        <strong data-turn-title>你的回合</strong>
      </div>

      <div class="dice-stage" data-feedback-dice hidden aria-live="polite">
        <span class="feedback-kicker" data-dice-actor>你掷骰</span>
        <div class="dice-pair" aria-hidden="true">
          <span class="feedback-die" data-die-left>⚀</span>
          <span class="feedback-die" data-die-right>⚀</span>
        </div>
      </div>

      <div class="event-card" data-feedback-event hidden aria-live="polite">
        <span class="feedback-kicker" data-event-kicker>EVENT</span>
        <strong data-event-title>事件</strong>
        <span data-event-detail></span>
      </div>

      <div class="game-over-layer" data-feedback-game-over hidden role="dialog" aria-modal="true" aria-labelledby="game-over-title">
        <div class="game-over-card">
          <span class="feedback-kicker" data-game-over-kicker>GAME OVER</span>
          <strong id="game-over-title" data-game-over-title>游戏结束</strong>
          <p data-game-over-detail></p>
          <button type="button" data-restart>再来一局</button>
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
  }

  showTurn(playerId: PlayerId): void {
    if (this.turnTimer !== null) {
      window.clearTimeout(this.turnTimer);
    }

    const humanTurn = playerId === "human";
    this.turnKicker.textContent = humanTurn ? "YOUR TURN" : "RIVAL TURN";
    this.turnTitle.textContent = humanTurn ? "轮到你了" : "城市玩家行动";
    this.turnBanner.dataset.player = playerId;
    this.turnBanner.hidden = false;
    restartAnimation(this.turnBanner, "is-showing");

    this.turnTimer = window.setTimeout(() => {
      this.turnBanner.hidden = true;
      this.turnTimer = null;
    }, reducedMotion() ? 80 : 850);
  }

  async showDice(
    dice: readonly [number, number],
    actor: string,
  ): Promise<void> {
    this.diceActor.textContent = `${actor}掷骰`;
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
    this.diceStage.classList.remove("is-rolling");
    this.diceStage.classList.add("is-settled");
    await wait(reducedMotion() ? 40 : 260);
    this.diceStage.classList.remove("is-settled");
    this.diceStage.hidden = true;
  }

  showRollResult(actor: string, result: RollResult): void {
    const tile = tileAt(result.to);
    const passStart = result.passedStart ? "经过起点 +¥200 · " : "";
    let tone: FeedbackTone = "neutral";
    let kicker = tile.name;
    let title = `${actor}移动 ${result.steps} 格`;
    let detail = passStart;

    switch (result.landing.kind) {
      case "property_available":
        tone = "property";
        title = `「${tile.name}」待售`;
        detail += `售价 ¥${result.landing.price}`;
        break;
      case "property_owned":
        tone = "positive";
        title = `回到「${tile.name}」`;
        detail += "这是自己的地产";
        break;
      case "rent":
        tone = "negative";
        title = `支付租金 -¥${result.landing.amount}`;
        detail += `停在「${tile.name}」`;
        break;
      case "tax":
        tone = "negative";
        title = `支付费用 -¥${result.landing.amount}`;
        detail += tile.name;
        break;
      case "chance":
        tone = result.landing.amount >= 0 ? "positive" : "chance";
        title = result.landing.message;
        detail += result.landing.amount >= 0
          ? `资金 +¥${result.landing.amount}`
          : `资金 -¥${Math.abs(result.landing.amount)}`;
        break;
      case "start":
        tone = "positive";
        title = "回到中央起点";
        detail += "继续下一回合";
        break;
    }

    this.showEvent(kicker, title, detail || `${actor}完成移动`, tone);
  }

  showPurchase(actor: string, propertyName: string, price: number): void {
    this.showEvent(
      "PROPERTY ACQUIRED",
      `${actor}买下「${propertyName}」`,
      `成交价 ¥${price}`,
      "property",
    );
  }

  showSkipped(actor: string, propertyName: string): void {
    this.showEvent(
      "PROPERTY",
      `${actor}跳过「${propertyName}」`,
      "地产保持无主状态",
      "neutral",
    );
  }

  showGameOver(winnerId: PlayerId | null): void {
    const humanWon = winnerId === "human";
    this.gameOverKicker.textContent = humanWon ? "VICTORY" : "GAME OVER";
    this.gameOverTitle.textContent = humanWon ? "你赢了" : "城市玩家获胜";
    this.gameOverDetail.textContent = humanWon
      ? "对手已经破产。"
      : winnerId === "bot"
        ? "你的资金已经跌破 0。"
        : "本局已经结束。";
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
    }, reducedMotion() ? 120 : 1750);
  }

  private setDice(left: number, right: number): void {
    this.diceLeft.textContent = diceFace(left);
    this.diceRight.textContent = diceFace(right);
    this.diceStage.setAttribute(
      "aria-label",
      `${this.diceActor.textContent ?? "掷骰"}：${left} 加 ${right}，共 ${left + right}`,
    );
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
