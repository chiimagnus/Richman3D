import { BOARD, tileAt } from "./board";
import { RuleRandom } from "./random";
import { legalCommands, pendingProperty } from "./selectors";
import type { ApplyResult, ChanceCardId, Command, Decision, GameEvent, GameSnapshot, LandingResult, PlayerId } from "./types";

export const PASS_START_BONUS = 200;
const CHANCE_CARDS = [
  { id: "innovation-bonus", amount: 120 },
  { id: "maintenance-cost", amount: -90 },
  { id: "community-event", amount: 60 },
  { id: "traffic-fine", amount: -50 },
] as const satisfies readonly { id: ChanceCardId; amount: number }[];

function cashAfterChange(cash: number, amount: number): number {
  const next = cash + amount;
  if (!Number.isSafeInteger(next)) throw new RangeError("资金超出整数范围");
  return next;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export class Game {
  private state: GameSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(options: { seed?: number; startingCash?: number } = {}) {
    const cash = options.startingCash ?? 1500;
    if (!Number.isSafeInteger(cash) || cash < 0) throw new RangeError("初始资金无效");
    this.state = freeze({
      revision: 0,
      players: [{ id: "human", cash, position: 0 }, { id: "bot", cash, position: 0 }],
      activePlayerId: "human",
      decision: { kind: "awaiting_roll" },
      owners: {}, lastRoll: null,
      random: new RuleRandom(options.seed ?? 1).snapshot,
    });
  }

  get snapshot(): GameSnapshot { return this.state; }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(command: Command): ApplyResult {
    if (!command || !["human", "bot"].includes(command.actor) ||
        !["roll", "buy", "skip"].includes(command.kind) ||
        !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
      return { ok: false, reason: "invalid_command" };
    }
    const before = this.state;
    if (command.expectedRevision !== before.revision) return { ok: false, reason: "stale_revision" };
    if (!legalCommands(before, command.actor).some((action) => action.kind === command.kind)) {
      return { ok: false, reason: "illegal_action" };
    }

    let result: Extract<ApplyResult, { ok: true }>;
    try {
      const players = before.players.map((player) => ({ ...player }));
      const owners = { ...before.owners };
      const random = new RuleRandom(before.random);
      const player = players.find((candidate) => candidate.id === command.actor);
      if (!player) throw new Error("玩家不存在");
      let decision: Decision = { kind: "awaiting_roll" };
      let activePlayerId: PlayerId = before.activePlayerId;
      let lastRoll = before.lastRoll;
      const events: GameEvent[] = [];

      if (command.kind === "roll") {
        const dice = [random.integer(6) + 1, random.integer(6) + 1] as const;
        const steps = dice[0] + dice[1];
        const from = player.position;
        const path = Array.from({ length: steps }, (_, offset) => (from + offset + 1) % BOARD.length);
        const to = path.at(-1);
        if (to === undefined) throw new Error("移动路径为空");
        const passedStart = path.includes(0);
        if (passedStart) player.cash = cashAfterChange(player.cash, PASS_START_BONUS);
        player.position = to;
        lastRoll = dice;
        const tile = tileAt(to);
        let landing: LandingResult;
        switch (tile.type) {
          case "start": landing = { kind: "start" }; break;
          case "tax":
            player.cash = cashAfterChange(player.cash, -tile.amount);
            landing = { kind: "tax", amount: tile.amount };
            break;
          case "chance": {
            const card = CHANCE_CARDS[random.integer(CHANCE_CARDS.length)];
            if (!card) throw new Error("机会卡无效");
            player.cash = cashAfterChange(player.cash, card.amount);
            landing = { kind: "chance", amount: card.amount, cardId: card.id };
            break;
          }
          case "property": {
            const ownerId = owners[tile.id];
            if (!ownerId) {
              decision = { kind: "awaiting_purchase", propertyId: tile.id };
              landing = { kind: "property_available", propertyId: tile.id, price: tile.price };
            } else if (ownerId === player.id) {
              landing = { kind: "property_owned", propertyId: tile.id };
            } else {
              const owner = players.find((candidate) => candidate.id === ownerId);
              if (!owner) throw new Error("产权玩家不存在");
              player.cash = cashAfterChange(player.cash, -tile.rent);
              owner.cash = cashAfterChange(owner.cash, tile.rent);
              landing = { kind: "rent", propertyId: tile.id, ownerId, amount: tile.rent };
            }
            break;
          }
        }
        events.push({ kind: "rolled", result: { playerId: player.id, dice, steps, from, to, path, passedStart, landing } });
      } else {
        const property = pendingProperty(before);
        if (!property) throw new Error("待购地产不存在");
        if (command.kind === "buy") {
          player.cash = cashAfterChange(player.cash, -property.price);
          owners[property.id] = player.id;
          events.push({ kind: "purchased", actor: player.id, propertyId: property.id, price: property.price });
        } else {
          events.push({ kind: "skipped", actor: player.id, propertyId: property.id });
        }
      }

      if (player.cash < 0) {
        const winnerId = players.find((candidate) => candidate.id !== player.id)?.id;
        if (!winnerId) throw new Error("胜者不存在");
        decision = { kind: "game_over", winnerId };
        events.push({ kind: "ended", winnerId });
      } else if (decision.kind === "awaiting_roll") {
        const next = players[(players.findIndex((candidate) => candidate.id === player.id) + 1) % players.length];
        if (!next) throw new Error("下一玩家不存在");
        activePlayerId = next.id;
        events.push({ kind: "turn", actor: next.id });
      }
      if (!Number.isSafeInteger(before.revision + 1) || !Number.isSafeInteger(random.snapshot.draws)) throw new RangeError("版本超出整数范围");
      const snapshot = freeze({ revision: before.revision + 1, players, owners, activePlayerId, decision, lastRoll, random: random.snapshot });
      result = freeze({ ok: true, snapshot, events });
    } catch {
      return { ok: false, reason: "calculation_failed" };
    }
    this.state = result.snapshot;
    for (const listener of this.listeners) {
      try { listener(); } catch { }
    }
    return result;
  }
}
