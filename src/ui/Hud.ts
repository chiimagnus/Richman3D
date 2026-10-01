import { tileAt, type PropertyTile } from "../domain/board";
import type { GameSnapshot, PlayerId, PlayerState } from "../domain/game";

export type HudActions = {
  readonly roll: () => void;
  readonly buy: () => void;
  readonly skip: () => void;
  readonly toggleSound: () => void;
};

export type HudRenderOptions = {
  readonly busy: boolean;
  readonly pointerLocked: boolean;
  readonly soundEnabled: boolean;
  readonly status: string;
};

export class Hud {
  private readonly root = document.createElement("div");
  private readonly humanBalance: HTMLElement;
  private readonly botBalance: HTMLElement;
  private readonly tileValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly diceValue: HTMLElement;
  private readonly rollButton: HTMLButtonElement;
  private readonly buyButton: HTMLButtonElement;
  private readonly buyLabel: HTMLElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly lookHint: HTMLElement;
  private readonly previousCash = new Map<PlayerId, number>();

  constructor(container: HTMLElement, actions: HudActions) {
    this.root.className = "hud";
    this.root.innerHTML = `
      <aside class="balance-bar" aria-label="玩家资金">
        <span class="balance-item" data-player="human">
          <span class="player-dot human-dot" aria-hidden="true"></span>
          <span class="balance-name">你</span>
          <strong class="cash" data-human-cash>0</strong>
        </span>
        <span class="balance-divider" aria-hidden="true"></span>
        <span class="balance-item" data-player="bot">
          <span class="player-dot bot-dot" aria-hidden="true"></span>
          <span class="balance-name">城市玩家</span>
          <strong class="cash" data-bot-cash>0</strong>
        </span>
      </aside>

      <div class="hud-tools">
        <button
          class="sound-toggle"
          type="button"
          data-sound
          aria-pressed="true"
          aria-label="关闭游戏音效"
        >声音 开</button>
      </div>

      <div class="look-hint" data-look-hint>
        点击画面进入第一人称
      </div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span></div>

      <footer class="action-dock">
        <div class="action-copy">
          <strong data-tile>中央起点</strong>
          <span data-status>准备掷骰</span>
        </div>
        <strong class="dice-value" data-dice aria-label="最近一次骰子">— + —</strong>
        <div class="action-buttons">
          <button class="primary-action" type="button" data-roll>
            掷骰子 <kbd>Space</kbd>
          </button>
          <button class="buy-action" type="button" data-buy hidden>
            <span data-buy-label>购买</span> <kbd>B</kbd>
          </button>
          <button class="secondary-action" type="button" data-skip hidden>
            跳过 <kbd>N</kbd>
          </button>
        </div>
      </footer>
    `;

    container.append(this.root);

    this.humanBalance = requiredElement(this.root, '[data-player="human"]');
    this.botBalance = requiredElement(this.root, '[data-player="bot"]');
    this.tileValue = requiredElement(this.root, "[data-tile]");
    this.statusValue = requiredElement(this.root, "[data-status]");
    this.diceValue = requiredElement(this.root, "[data-dice]");
    this.rollButton = requiredElement<HTMLButtonElement>(this.root, "[data-roll]");
    this.buyButton = requiredElement<HTMLButtonElement>(this.root, "[data-buy]");
    this.buyLabel = requiredElement(this.root, "[data-buy-label]");
    this.skipButton = requiredElement<HTMLButtonElement>(this.root, "[data-skip]");
    this.soundButton = requiredElement<HTMLButtonElement>(this.root, "[data-sound]");
    this.lookHint = requiredElement(this.root, "[data-look-hint]");

    this.rollButton.addEventListener("click", actions.roll);
    this.buyButton.addEventListener("click", actions.buy);
    this.skipButton.addEventListener("click", actions.skip);
    this.soundButton.addEventListener("click", actions.toggleSound);
  }

  render(snapshot: GameSnapshot, options: HudRenderOptions): void {
    const human = playerById(snapshot, "human");
    const bot = playerById(snapshot, "bot");
    const humanTile = tileAt(human.position);
    const pendingProperty = pendingPropertyFor(snapshot);

    this.statusValue.textContent = options.status;
    this.tileValue.textContent = humanTile.name;
    this.diceValue.textContent = snapshot.lastRoll
      ? `${snapshot.lastRoll[0]} + ${snapshot.lastRoll[1]}`
      : "— + —";

    this.updateCash(this.humanBalance, human, "[data-human-cash]");
    this.updateCash(this.botBalance, bot, "[data-bot-cash]");

    const humanCanRoll =
      snapshot.phase === "awaiting_roll" &&
      snapshot.activePlayerId === "human" &&
      !options.busy;
    const humanBuying =
      snapshot.phase === "awaiting_purchase" &&
      snapshot.activePlayerId === "human" &&
      pendingProperty !== null &&
      !options.busy;

    this.rollButton.hidden = humanBuying;
    this.rollButton.disabled = !humanCanRoll;

    this.buyButton.hidden = !humanBuying;
    this.skipButton.hidden = !humanBuying;
    this.skipButton.disabled = !humanBuying;

    if (pendingProperty) {
      this.buyLabel.textContent = `购买 · ${pendingProperty.price}`;
      this.buyButton.disabled = !humanBuying || human.cash < pendingProperty.price;
    } else {
      this.buyLabel.textContent = "购买";
      this.buyButton.disabled = true;
    }

    this.root.dataset.pointerLocked = String(options.pointerLocked);
    this.soundButton.textContent = options.soundEnabled ? "声音 开" : "声音 关";
    this.soundButton.setAttribute("aria-pressed", String(options.soundEnabled));
    this.soundButton.setAttribute(
      "aria-label",
      options.soundEnabled ? "关闭游戏音效" : "开启游戏音效",
    );
    this.lookHint.textContent = options.pointerLocked
      ? pointerLockHint(snapshot, pendingProperty)
      : "点击画面进入第一人称";

    if (snapshot.phase === "game_over") {
      this.rollButton.hidden = false;
      this.rollButton.disabled = true;
      this.buyButton.hidden = true;
      this.skipButton.hidden = true;
    }
  }

  private updateCash(
    container: HTMLElement,
    player: PlayerState,
    selector: string,
  ): void {
    const value = requiredElement(container, selector);
    const previous = this.previousCash.get(player.id);
    const formattedCash = formatCash(player.cash);
    value.textContent = formattedCash;
    container.setAttribute("aria-label", `${player.name} ${formattedCash}`);
    this.previousCash.set(player.id, player.cash);
    container.classList.toggle("is-bankrupt", player.cash < 0);

    if (previous === undefined || previous === player.cash) {
      return;
    }

    const delta = player.cash - previous;
    const badge = document.createElement("span");
    badge.className = `cash-delta ${delta > 0 ? "is-positive" : "is-negative"}`;
    badge.textContent = `${delta > 0 ? "+" : "−"}¥${Math.abs(delta).toLocaleString("zh-CN")}`;
    badge.setAttribute("aria-hidden", "true");
    container.append(badge);

    window.setTimeout(() => {
      badge.remove();
    }, 1_100);
  }
}

function playerById(
  snapshot: GameSnapshot,
  id: PlayerId,
): PlayerState {
  const player = snapshot.players.find((candidate) => candidate.id === id);

  if (!player) {
    throw new Error(`HUD 找不到玩家: ${id}`);
  }

  return player;
}

function pointerLockHint(
  snapshot: GameSnapshot,
  pendingProperty: PropertyTile | null,
): string {
  if (
    snapshot.activePlayerId === "human" &&
    snapshot.phase === "awaiting_purchase" &&
    pendingProperty
  ) {
    return `B 购买 ¥${pendingProperty.price} · N 跳过 · M 声音 · Esc 退出`;
  }

  if (
    snapshot.activePlayerId === "human" &&
    snapshot.phase === "awaiting_roll"
  ) {
    return "Space 掷骰 · M 声音 · Esc 退出";
  }

  return "M 声音 · Esc 退出";
}

function pendingPropertyFor(snapshot: GameSnapshot): PropertyTile | null {
  if (!snapshot.pendingPropertyId) {
    return null;
  }

  const activePlayer = playerById(snapshot, snapshot.activePlayerId);
  const tile = tileAt(activePlayer.position);

  return tile.type === "property" && tile.id === snapshot.pendingPropertyId
    ? tile
    : null;
}

function formatCash(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}¥${Math.abs(value).toLocaleString("zh-CN")}`;
}

function requiredElement<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`HUD 缺少元素: ${selector}`);
  }

  return element;
}
