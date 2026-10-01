import { tileAt, type PropertyTile } from "../domain/board";
import { Game, type GameSnapshot, type RollResult } from "../domain/game";
import { World } from "../rendering/World";
import { Hud } from "../ui/Hud";

const BOT_CASH_RESERVE = 260;

export class GameApp {
  private readonly game = new Game();
  private readonly world: World;
  private readonly hud: Hud;
  private busy = false;
  private pointerLocked = false;
  private status = "你的回合，掷骰开始。";

  constructor(private readonly root: HTMLElement) {
    this.root.className = "game-root";
    this.root.replaceChildren();

    const worldLayer = document.createElement("div");
    worldLayer.className = "world-layer";
    this.root.append(worldLayer);

    this.world = new World(worldLayer);
    this.hud = new Hud(this.root, {
      roll: () => void this.rollHuman(),
      buy: () => this.buyHumanProperty(),
      skip: () => this.skipHumanProperty(),
    });

    this.world.sync(this.game.snapshot);
    this.world.canvas.addEventListener("click", this.enterFirstPerson);
    this.world.onPointerLockChange((locked) => {
      this.pointerLocked = locked;
      this.render();
    });
    window.addEventListener("keydown", this.handleKeydown);

    this.render();
  }

  private readonly enterFirstPerson = (): void => {
    this.world.lockFirstPerson();
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
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
    }
  };

  private async rollHuman(): Promise<void> {
    const snapshot = this.game.snapshot;
    if (
      this.busy ||
      snapshot.phase !== "awaiting_roll" ||
      snapshot.activePlayerId !== "human"
    ) {
      return;
    }

    this.busy = true;
    this.status = "正在掷骰…";
    this.render();

    const result = this.game.roll();
    this.status = rollStatus("你", result);
    await this.world.moveHuman(result.path);
    this.world.syncOwnership(this.game.snapshot);

    this.busy = false;
    this.render();

    if (this.game.snapshot.phase === "game_over") {
      this.finishGame();
      return;
    }

    if (this.game.snapshot.activePlayerId === "bot") {
      await this.runBotTurn();
    }
  }

  private buyHumanProperty(): void {
    const snapshot = this.game.snapshot;
    const property = this.pendingProperty(snapshot);

    if (
      this.busy ||
      snapshot.phase !== "awaiting_purchase" ||
      snapshot.activePlayerId !== "human" ||
      !property
    ) {
      return;
    }

    const human = snapshot.players.find((player) => player.id === "human");
    if (!human || human.cash < property.price) {
      this.status = "资金不足，无法购买这块地产。";
      this.render();
      return;
    }

    this.game.buyCurrentProperty();
    this.world.syncOwnership(this.game.snapshot);
    this.status = `已购买「${property.name}」。`;
    this.render();
    void this.runBotTurn();
  }

  private skipHumanProperty(): void {
    const snapshot = this.game.snapshot;
    const property = this.pendingProperty(snapshot);

    if (
      this.busy ||
      snapshot.phase !== "awaiting_purchase" ||
      snapshot.activePlayerId !== "human" ||
      !property
    ) {
      return;
    }

    this.game.skipPurchase();
    this.status = `已跳过「${property.name}」。`;
    this.render();
    void this.runBotTurn();
  }

  private async runBotTurn(): Promise<void> {
    const before = this.game.snapshot;
    if (
      this.busy ||
      before.phase === "game_over" ||
      before.activePlayerId !== "bot"
    ) {
      return;
    }

    this.busy = true;
    this.status = "城市玩家正在行动…";
    this.render();
    await pause(520);

    const result = this.game.roll();
    await this.world.moveBot(result.path);
    this.world.syncOwnership(this.game.snapshot);

    if (
      this.game.snapshot.phase === "awaiting_purchase" &&
      this.game.snapshot.activePlayerId === "bot"
    ) {
      this.resolveBotPurchase();
    }

    this.busy = false;

    if (this.game.snapshot.phase === "game_over") {
      this.finishGame();
      return;
    }

    this.status = "轮到你了。";
    this.render();
  }

  private resolveBotPurchase(): void {
    const snapshot = this.game.snapshot;
    const property = this.pendingProperty(snapshot);

    if (!property) {
      throw new Error("电脑购买阶段缺少地产");
    }

    const bot = snapshot.players.find((player) => player.id === "bot");
    if (!bot) {
      throw new Error("找不到电脑玩家");
    }

    if (bot.cash - property.price >= BOT_CASH_RESERVE) {
      this.game.buyCurrentProperty();
      this.world.syncOwnership(this.game.snapshot);
      this.status = `城市玩家购买了「${property.name}」。`;
    } else {
      this.game.skipPurchase();
      this.status = `城市玩家跳过了「${property.name}」。`;
    }
  }

  private pendingProperty(snapshot: GameSnapshot): PropertyTile | null {
    if (!snapshot.pendingPropertyId) {
      return null;
    }

    const active = snapshot.players.find(
      (player) => player.id === snapshot.activePlayerId,
    );

    if (!active) {
      return null;
    }

    const tile = tileAt(active.position);
    return tile.type === "property" && tile.id === snapshot.pendingPropertyId
      ? tile
      : null;
  }

  private finishGame(): void {
    this.busy = false;
    this.world.unlockFirstPerson();

    const snapshot = this.game.snapshot;
    const winner = snapshot.players.find(
      (player) => player.id === snapshot.winnerId,
    );
    this.status = winner ? `${winner.name} 获胜。刷新页面可重新开始。` : "游戏结束。";
    this.render();
  }

  private render(): void {
    this.hud.render(this.game.snapshot, {
      busy: this.busy,
      pointerLocked: this.pointerLocked,
      status: this.status,
    });
  }
}

function rollStatus(actor: string, result: RollResult): string {
  const landing = result.landing;

  switch (landing.kind) {
    case "property_available":
      return `${actor}移动 ${result.steps} 格，这块地产可以购买。`;
    case "rent":
      return `${actor}移动 ${result.steps} 格，支付租金 ${landing.amount}。`;
    case "tax":
      return `${actor}移动 ${result.steps} 格，支付费用 ${landing.amount}。`;
    case "chance":
      return `${actor}移动 ${result.steps} 格：${landing.message}`;
    case "property_owned":
      return `${actor}移动 ${result.steps} 格，回到自己的地产。`;
    case "start":
      return `${actor}移动 ${result.steps} 格，回到起点。`;
  }
}

function pause(milliseconds: number): Promise<void> {
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const duration = reduceMotion ? Math.min(milliseconds, 80) : milliseconds;

  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}
