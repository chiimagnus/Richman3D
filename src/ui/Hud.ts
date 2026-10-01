import { tileAt, type PropertyTile } from "../domain/board";
import type { GameSnapshot, PlayerId, PlayerState } from "../domain/game";

export type HudActions = {
  readonly roll: () => void;
  readonly buy: () => void;
  readonly skip: () => void;
};

export type HudRenderOptions = {
  readonly busy: boolean;
  readonly pointerLocked: boolean;
  readonly status: string;
};

export class Hud {
  private readonly root = document.createElement("div");
  private readonly turnValue: HTMLElement;
  private readonly phaseValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly humanCard: HTMLElement;
  private readonly botCard: HTMLElement;
  private readonly tileValue: HTMLElement;
  private readonly diceValue: HTMLElement;
  private readonly logList: HTMLOListElement;
  private readonly rollButton: HTMLButtonElement;
  private readonly buyButton: HTMLButtonElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly lookHint: HTMLElement;
  private readonly previousCash = new Map<PlayerId, number>();

  constructor(container: HTMLElement, actions: HudActions) {
    this.root.className = "hud";
    this.root.innerHTML = `
      <header class="hud-top">
        <div class="brand-block">
          <span class="brand-kicker">RICHMAN / 3D</span>
          <strong>城市环线</strong>
        </div>
        <div class="turn-block" aria-live="polite">
          <span class="meta-label">当前回合</span>
          <strong data-turn>—</strong>
          <span data-phase>等待开始</span>
        </div>
      </header>

      <aside class="player-stack" aria-label="玩家资产">
        <article class="player-card" data-player="human">
          <span class="player-dot human-dot"></span>
          <div>
            <span class="meta-label">PLAYER</span>
            <strong>你</strong>
          </div>
          <span class="cash" data-human-cash>0</span>
        </article>
        <article class="player-card" data-player="bot">
          <span class="player-dot bot-dot"></span>
          <div>
            <span class="meta-label">RIVAL</span>
            <strong>城市玩家</strong>
          </div>
          <span class="cash" data-bot-cash>0</span>
        </article>
      </aside>

      <aside class="event-panel">
        <span class="meta-label">城市动态</span>
        <ol class="event-list" data-log aria-live="polite"></ol>
      </aside>

      <div class="look-hint" data-look-hint>
        点击棋盘进入第一人称环视 · Esc 退出
      </div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span></div>

      <footer class="action-dock">
        <div class="action-copy">
          <span class="meta-label">当前位置</span>
          <strong data-tile>中央起点</strong>
          <span data-status>准备掷骰</span>
        </div>
        <div class="dice-readout" aria-label="最近一次骰子">
          <span class="meta-label">DICE</span>
          <strong data-dice>— + —</strong>
        </div>
        <div class="action-buttons">
          <button class="primary-action" type="button" data-roll>
            掷骰子 <kbd>Space</kbd>
          </button>
          <button class="buy-action" type="button" data-buy hidden>购买</button>
          <button class="secondary-action" type="button" data-skip hidden>跳过</button>
        </div>
      </footer>
    `;

    container.append(this.root);

    this.turnValue = requiredElement(this.root, "[data-turn]");
    this.phaseValue = requiredElement(this.root, "[data-phase]");
    this.statusValue = requiredElement(this.root, "[data-status]");
    this.humanCard = requiredElement(this.root, '[data-player="human"]');
    this.botCard = requiredElement(this.root, '[data-player="bot"]');
    this.tileValue = requiredElement(this.root, "[data-tile]");
    this.diceValue = requiredElement(this.root, "[data-dice]");
    this.logList = requiredElement<HTMLOListElement>(this.root, "[data-log]");
    this.rollButton = requiredElement<HTMLButtonElement>(this.root, "[data-roll]");
    this.buyButton = requiredElement<HTMLButtonElement>(this.root, "[data-buy]");
    this.skipButton = requiredElement<HTMLButtonElement>(this.root, "[data-skip]");
    this.lookHint = requiredElement(this.root, "[data-look-hint]");

    this.rollButton.addEventListener("click", actions.roll);
    this.buyButton.addEventListener("click", actions.buy);
    this.skipButton.addEventListener("click", actions.skip);
  }

  render(snapshot: GameSnapshot, options: HudRenderOptions): void {
    const activePlayer = playerById(snapshot, snapshot.activePlayerId);
    const human = playerById(snapshot, "human");
    const bot = playerById(snapshot, "bot");
    const humanTile = tileAt(human.position);
    const pendingProperty = pendingPropertyFor(snapshot);

    this.turnValue.textContent = activePlayer.name;
    this.phaseValue.textContent = phaseLabel(snapshot);
    this.statusValue.textContent = options.status;
    this.tileValue.textContent = humanTile.name;
    this.diceValue.textContent = snapshot.lastRoll
      ? `${snapshot.lastRoll[0]} + ${snapshot.lastRoll[1]}`
      : "— + —";

    this.updatePlayerCard(this.humanCard, human, snapshot.activePlayerId === "human");
    this.updatePlayerCard(this.botCard, bot, snapshot.activePlayerId === "bot");

    this.updateCash(this.humanCard, human, "[data-human-cash]");
    this.updateCash(this.botCard, bot, "[data-bot-cash]");

    this.renderEvents(snapshot);

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
      this.buyButton.textContent = `购买 · ${pendingProperty.price}`;
      this.buyButton.disabled = !humanBuying || human.cash < pendingProperty.price;
    } else {
      this.buyButton.textContent = "购买";
      this.buyButton.disabled = true;
    }

    this.root.dataset.pointerLocked = String(options.pointerLocked);
    this.lookHint.textContent = options.pointerLocked
      ? "第一人称环视中 · Esc 退出"
      : "点击棋盘进入第一人称环视 · Esc 退出";

    if (snapshot.phase === "game_over") {
      this.rollButton.hidden = false;
      this.rollButton.disabled = true;
      this.buyButton.hidden = true;
      this.skipButton.hidden = true;
    }
  }

  private updatePlayerCard(
    card: HTMLElement,
    player: PlayerState,
    active: boolean,
  ): void {
    card.classList.toggle("is-active", active);
    card.classList.toggle("is-bankrupt", player.cash < 0);
  }

  private updateCash(
    card: HTMLElement,
    player: PlayerState,
    selector: string,
  ): void {
    const value = requiredElement(card, selector);
    const previous = this.previousCash.get(player.id);
    value.textContent = formatCash(player.cash);
    this.previousCash.set(player.id, player.cash);

    if (previous === undefined || previous === player.cash) {
      return;
    }

    const delta = player.cash - previous;
    const badge = document.createElement("span");
    badge.className = `cash-delta ${delta > 0 ? "is-positive" : "is-negative"}`;
    badge.textContent = `${delta > 0 ? "+" : "−"}¥${Math.abs(delta).toLocaleString("zh-CN")}`;
    badge.setAttribute("aria-hidden", "true");
    card.append(badge);

    window.setTimeout(() => {
      badge.remove();
    }, 1_100);
  }

  private renderEvents(snapshot: GameSnapshot): void {
    const fragment = document.createDocumentFragment();

    for (const message of [...snapshot.events].reverse().slice(0, 5)) {
      const item = document.createElement("li");
      item.textContent = message;
      fragment.append(item);
    }

    this.logList.replaceChildren(fragment);
  }
}

function playerById(
  snapshot: GameSnapshot,
  id: "human" | "bot",
): PlayerState {
  const player = snapshot.players.find((candidate) => candidate.id === id);

  if (!player) {
    throw new Error(`HUD 找不到玩家: ${id}`);
  }

  return player;
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

function phaseLabel(snapshot: GameSnapshot): string {
  if (snapshot.phase === "game_over") {
    const winner = snapshot.winnerId
      ? playerById(snapshot, snapshot.winnerId).name
      : "无人";
    return `游戏结束 · ${winner} 获胜`;
  }

  if (snapshot.phase === "awaiting_purchase") {
    return "等待地产决策";
  }

  return snapshot.activePlayerId === "human" ? "等待掷骰" : "电脑行动";
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
