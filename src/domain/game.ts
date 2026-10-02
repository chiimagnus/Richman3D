import { BOARD, tileAt, type PropertyTile } from "./board";

export type PlayerId = "human" | "bot";

export type ChanceCardId =
  | "innovation-bonus"
  | "maintenance-cost"
  | "community-event"
  | "traffic-fine";

export type GamePhase = "awaiting_roll" | "awaiting_purchase" | "game_over";

export type PlayerState = {
  readonly id: PlayerId;
  readonly cash: number;
  readonly position: number;
};

export type GameSnapshot = {
  readonly players: readonly PlayerState[];
  readonly activePlayerId: PlayerId;
  readonly phase: GamePhase;
  readonly owners: Readonly<Record<string, PlayerId>>;
  readonly pendingPropertyId: string | null;
  readonly winnerId: PlayerId | null;
  readonly lastRoll: readonly [number, number] | null;
};

export type LandingResult =
  | { readonly kind: "start" }
  | {
      readonly kind: "property_available";
      readonly propertyId: string;
      readonly price: number;
    }
  | { readonly kind: "property_owned"; readonly propertyId: string }
  | {
      readonly kind: "rent";
      readonly propertyId: string;
      readonly ownerId: PlayerId;
      readonly amount: number;
    }
  | { readonly kind: "tax"; readonly amount: number }
  | {
      readonly kind: "chance";
      readonly amount: number;
      readonly cardId: ChanceCardId;
    };

export type RollResult = {
  readonly playerId: PlayerId;
  readonly dice: readonly [number, number];
  readonly steps: number;
  readonly from: number;
  readonly to: number;
  readonly path: readonly number[];
  readonly passedStart: boolean;
  readonly landing: LandingResult;
};

type MutablePlayer = {
  id: PlayerId;
  cash: number;
  position: number;
};

type GameOptions = {
  random?: () => number;
  startingCash?: number;
};

const PASS_START_BONUS = 200;

const CHANCE_CARDS = [
  { id: "innovation-bonus", amount: 120 },
  { id: "maintenance-cost", amount: -90 },
  { id: "community-event", amount: 60 },
  { id: "traffic-fine", amount: -50 },
] as const satisfies readonly { id: ChanceCardId; amount: number }[];

export class Game {
  private readonly random: () => number;
  private readonly players: MutablePlayer[];
  private readonly owners = new Map<string, PlayerId>();
  private activePlayerIndex = 0;
  private phase: GamePhase = "awaiting_roll";
  private pendingPropertyId: string | null = null;
  private winnerId: PlayerId | null = null;
  private lastRoll: readonly [number, number] | null = null;

  constructor(options: GameOptions = {}) {
    const startingCash = options.startingCash ?? 1500;
    this.random = options.random ?? Math.random;
    this.players = [
      {
        id: "human",
        cash: startingCash,
        position: 0,
      },
      {
        id: "bot",
        cash: startingCash,
        position: 0,
      },
    ];
  }

  get snapshot(): GameSnapshot {
    const currentPlayer = this.currentPlayer;

    return {
      players: this.players.map((player) => ({ ...player })),
      activePlayerId: currentPlayer.id,
      phase: this.phase,
      owners: Object.fromEntries(this.owners.entries()),
      pendingPropertyId: this.pendingPropertyId,
      winnerId: this.winnerId,
      lastRoll: this.lastRoll,
    };
  }

  roll(): RollResult {
    this.requirePhase("awaiting_roll");

    const player = this.currentPlayer;
    const dice = [this.rollDie(), this.rollDie()] as const;
    const steps = dice[0] + dice[1];
    const from = player.position;
    const path = Array.from(
      { length: steps },
      (_, offset) => (from + offset + 1) % BOARD.length,
    );
    const to = path[path.length - 1];

    if (to === undefined) {
      throw new Error("骰子步数必须大于 0");
    }

    const passedStart = path.includes(0);
    if (passedStart) {
      player.cash += PASS_START_BONUS;
    }

    player.position = to;
    this.lastRoll = dice;

    const landing = this.resolveLanding(player);

    return {
      playerId: player.id,
      dice,
      steps,
      from,
      to,
      path,
      passedStart,
      landing,
    };
  }

  buyCurrentProperty(): void {
    this.requirePhase("awaiting_purchase");

    const property = this.pendingProperty();
    const player = this.currentPlayer;

    if (this.owners.has(property.id)) {
      throw new Error("该地产已经有主人");
    }

    if (player.cash < property.price) {
      throw new Error("资金不足，无法购买该地产");
    }

    player.cash -= property.price;
    this.owners.set(property.id, player.id);
    this.pendingPropertyId = null;
    this.advanceTurn();
  }

  skipPurchase(): void {
    this.requirePhase("awaiting_purchase");

    this.pendingProperty();
    this.pendingPropertyId = null;
    this.advanceTurn();
  }

  private resolveLanding(player: MutablePlayer): LandingResult {
    const tile = tileAt(player.position);

    switch (tile.type) {
      case "start": {
        this.advanceTurn();
        return { kind: "start" };
      }

      case "property":
        return this.resolveProperty(player, tile);

      case "tax": {
        player.cash -= tile.amount;
        const gameEnded = this.checkBankruptcy(player);
        if (!gameEnded) {
          this.advanceTurn();
        }
        return { kind: "tax", amount: tile.amount };
      }

      case "chance": {
        const cardIndex = Math.floor(this.random() * CHANCE_CARDS.length);
        const card = CHANCE_CARDS[cardIndex];

        if (!card) {
          throw new Error("机会卡随机源返回了无效值");
        }

        player.cash += card.amount;
        const gameEnded = this.checkBankruptcy(player);
        if (!gameEnded) {
          this.advanceTurn();
        }

        return {
          kind: "chance",
          amount: card.amount,
          cardId: card.id,
        };
      }
    }
  }

  private resolveProperty(
    player: MutablePlayer,
    property: PropertyTile,
  ): LandingResult {
    const ownerId = this.owners.get(property.id);

    if (!ownerId) {
      this.phase = "awaiting_purchase";
      this.pendingPropertyId = property.id;
      return {
        kind: "property_available",
        propertyId: property.id,
        price: property.price,
      };
    }

    if (ownerId === player.id) {
      this.advanceTurn();
      return { kind: "property_owned", propertyId: property.id };
    }

    const owner = this.playerById(ownerId);
    player.cash -= property.rent;
    owner.cash += property.rent;

    const gameEnded = this.checkBankruptcy(player);
    if (!gameEnded) {
      this.advanceTurn();
    }

    return {
      kind: "rent",
      propertyId: property.id,
      ownerId,
      amount: property.rent,
    };
  }

  private pendingProperty(): PropertyTile {
    const tile = tileAt(this.currentPlayer.position);

    if (
      tile.type !== "property" ||
      !this.pendingPropertyId ||
      tile.id !== this.pendingPropertyId
    ) {
      throw new Error("当前没有待处理的地产购买");
    }

    return tile;
  }

  private checkBankruptcy(player: MutablePlayer): boolean {
    if (player.cash >= 0) {
      return false;
    }

    this.phase = "game_over";
    this.pendingPropertyId = null;
    this.winnerId = this.players.find((candidate) => candidate.id !== player.id)?.id ?? null;
    return true;
  }

  private advanceTurn(): void {
    if (this.phase === "game_over") {
      return;
    }

    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    this.phase = "awaiting_roll";
    this.pendingPropertyId = null;
  }

  private requirePhase(expected: GamePhase): void {
    if (this.phase !== expected) {
      throw new Error(`当前阶段为 ${this.phase}，不能执行需要 ${expected} 的操作`);
    }
  }

  private rollDie(): number {
    const value = this.random();

    if (value < 0 || value >= 1) {
      throw new RangeError("随机源必须返回 [0, 1) 范围内的数字");
    }

    return Math.floor(value * 6) + 1;
  }

  private playerById(id: PlayerId): MutablePlayer {
    const player = this.players.find((candidate) => candidate.id === id);

    if (!player) {
      throw new Error(`找不到玩家: ${id}`);
    }

    return player;
  }

  private get currentPlayer(): MutablePlayer {
    const player = this.players[this.activePlayerIndex];

    if (!player) {
      throw new Error("当前玩家索引无效");
    }

    return player;
  }

}
