import { tileAt, type PropertyTile } from "../domain/board";
import type { GameSnapshot, PlayerId, PlayerState } from "../domain/game";
import {
  formatCash,
  formatMessage,
  messages,
  playerName,
  tileName,
} from "../i18n";
import type { Language } from "../settings/preferences";

export type HudActions = {
  readonly roll: () => void;
  readonly buy: () => void;
  readonly skip: () => void;
};

export type HudRenderOptions = {
  readonly busy: boolean;
  readonly pointerLocked: boolean;
  readonly status: string;
  readonly language: Language;
};

export class Hud {
  private readonly root = document.createElement("div");
  private readonly balanceBar: HTMLElement;
  private readonly humanBalance: HTMLElement;
  private readonly botBalance: HTMLElement;
  private readonly humanName: HTMLElement;
  private readonly botName: HTMLElement;
  private readonly tileValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly diceValue: HTMLElement;
  private readonly rollButton: HTMLButtonElement;
  private readonly rollLabel: HTMLElement;
  private readonly buyButton: HTMLButtonElement;
  private readonly buyLabel: HTMLElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly skipLabel: HTMLElement;
  private readonly lookHint: HTMLElement;
  private readonly previousCash = new Map<PlayerId, number>();

  constructor(container: HTMLElement, actions: HudActions) {
    this.root.className = "hud";
    this.root.innerHTML = `
      <aside class="balance-bar" data-balance-bar>
        <span class="balance-item" data-player="human">
          <span class="player-dot human-dot" aria-hidden="true"></span>
          <span class="balance-name" data-human-name></span>
          <strong class="cash" data-human-cash>0</strong>
        </span>
        <span class="balance-divider" aria-hidden="true"></span>
        <span class="balance-item" data-player="bot">
          <span class="player-dot bot-dot" aria-hidden="true"></span>
          <span class="balance-name" data-bot-name></span>
          <strong class="cash" data-bot-cash>0</strong>
        </span>
      </aside>

      <div class="look-hint" data-look-hint></div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span></div>

      <footer class="action-dock">
        <div class="action-copy">
          <strong data-tile></strong>
          <span data-status></span>
        </div>
        <strong class="dice-value" data-dice>— + —</strong>
        <div class="action-buttons">
          <button class="primary-action" type="button" data-roll>
            <span data-roll-label></span> <kbd>Space</kbd>
          </button>
          <button class="buy-action" type="button" data-buy hidden>
            <span data-buy-label></span> <kbd>B</kbd>
          </button>
          <button class="secondary-action" type="button" data-skip hidden>
            <span data-skip-label></span> <kbd>N</kbd>
          </button>
        </div>
      </footer>
    `;

    container.append(this.root);

    this.balanceBar = requiredElement(this.root, "[data-balance-bar]");
    this.humanBalance = requiredElement(this.root, '[data-player="human"]');
    this.botBalance = requiredElement(this.root, '[data-player="bot"]');
    this.humanName = requiredElement(this.root, "[data-human-name]");
    this.botName = requiredElement(this.root, "[data-bot-name]");
    this.tileValue = requiredElement(this.root, "[data-tile]");
    this.statusValue = requiredElement(this.root, "[data-status]");
    this.diceValue = requiredElement(this.root, "[data-dice]");
    this.rollButton = requiredElement<HTMLButtonElement>(this.root, "[data-roll]");
    this.rollLabel = requiredElement(this.root, "[data-roll-label]");
    this.buyButton = requiredElement<HTMLButtonElement>(this.root, "[data-buy]");
    this.buyLabel = requiredElement(this.root, "[data-buy-label]");
    this.skipButton = requiredElement<HTMLButtonElement>(this.root, "[data-skip]");
    this.skipLabel = requiredElement(this.root, "[data-skip-label]");
    this.lookHint = requiredElement(this.root, "[data-look-hint]");

    this.rollButton.addEventListener("click", actions.roll);
    this.buyButton.addEventListener("click", actions.buy);
    this.skipButton.addEventListener("click", actions.skip);
  }

  render(snapshot: GameSnapshot, options: HudRenderOptions): void {
    const { language } = options;
    const copy = messages(language).hud;
    const human = playerById(snapshot, "human");
    const bot = playerById(snapshot, "bot");
    const humanTile = tileAt(human.position);
    const pendingProperty = pendingPropertyFor(snapshot);

    this.balanceBar.setAttribute("aria-label", copy.balancesAria);
    this.humanName.textContent = playerName(language, "human");
    this.botName.textContent = playerName(language, "bot");
    this.statusValue.textContent = options.status;
    this.tileValue.textContent = tileName(language, humanTile);
    this.diceValue.setAttribute("aria-label", copy.recentDiceAria);
    this.diceValue.textContent = snapshot.lastRoll
      ? `${snapshot.lastRoll[0]} + ${snapshot.lastRoll[1]}`
      : "— + —";
    this.rollLabel.textContent = copy.roll;
    this.skipLabel.textContent = copy.skip;

    this.updateCash(this.humanBalance, human, "[data-human-cash]", language);
    this.updateCash(this.botBalance, bot, "[data-bot-cash]", language);

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
      this.buyLabel.textContent = formatMessage(copy.buyWithPrice, {
        price: pendingProperty.price,
      });
      this.buyButton.disabled = !humanBuying || human.cash < pendingProperty.price;
    } else {
      this.buyLabel.textContent = copy.buy;
      this.buyButton.disabled = true;
    }

    this.root.dataset.pointerLocked = String(options.pointerLocked);
    this.lookHint.textContent = options.pointerLocked
      ? pointerLockHint(snapshot, pendingProperty, language)
      : copy.enterFirstPerson;

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
    language: Language,
  ): void {
    const value = requiredElement(container, selector);
    const previous = this.previousCash.get(player.id);
    const formattedCash = formatCash(language, player.cash);
    value.textContent = formattedCash;
    container.setAttribute(
      "aria-label",
      `${playerName(language, player.id)} ${formattedCash}`,
    );
    this.previousCash.set(player.id, player.cash);
    container.classList.toggle("is-bankrupt", player.cash < 0);

    if (previous === undefined || previous === player.cash) {
      return;
    }

    const delta = player.cash - previous;
    const badge = document.createElement("span");
    badge.className = `cash-delta ${delta > 0 ? "is-positive" : "is-negative"}`;
    badge.textContent = `${delta > 0 ? "+" : "−"}${formatCash(language, Math.abs(delta))}`;
    badge.setAttribute("aria-hidden", "true");
    container.append(badge);

    window.setTimeout(() => {
      badge.remove();
    }, 1_100);
  }
}

function playerById(snapshot: GameSnapshot, id: PlayerId): PlayerState {
  const player = snapshot.players.find((candidate) => candidate.id === id);

  if (!player) {
    throw new Error(`HUD 找不到玩家: ${id}`);
  }

  return player;
}

function pointerLockHint(
  snapshot: GameSnapshot,
  pendingProperty: PropertyTile | null,
  language: Language,
): string {
  const copy = messages(language).hud;

  if (
    snapshot.activePlayerId === "human" &&
    snapshot.phase === "awaiting_purchase" &&
    pendingProperty
  ) {
    return formatMessage(copy.pointerPurchase, { price: pendingProperty.price });
  }

  if (
    snapshot.activePlayerId === "human" &&
    snapshot.phase === "awaiting_roll"
  ) {
    return copy.pointerRoll;
  }

  return copy.pointerIdle;
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
