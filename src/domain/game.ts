import { tileAt, validateMap, type MapDefinition } from "./board";
import { mapFor } from "./maps";
import { rulesFor, validateRules, type RuleSet } from "./rules";
import { createMatchConfig, validateConfig } from "./config";
import { initialTurnOrder, nextTurn } from "./turns";
import { RuleRandom } from "./random";
import { legalCommands, matchResult, pendingProperty } from "./selectors";
import { restoreSnapshot } from "./restore";
import { initialProperties, netAssets, rentFor } from "./economy";
import type { ApplyResult, Command, Decision, FinancialStats, GameEvent, GameSnapshot, LandingResult, MatchConfig, PlayerId } from "./types";
import { HISTORY_LIMIT } from "./types";

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

  constructor(config: MatchConfig = createMatchConfig(), rules: RuleSet = rulesFor(config.rulesVersion), map: MapDefinition = mapFor(config.mapId, config.mapVersion)) {
    validateConfig(config);
    validateRules(rules);
    validateMap(map);
    if (config.rulesVersion !== rules.version || config.mapId !== map.id || config.mapVersion !== map.version) throw new Error("配置版本不匹配");
    const random = new RuleRandom(config.seed);
    const turnOrder = initialTurnOrder(config, random);
    this.state = freeze({
      revision: 0,
      config: { ...config, players: config.players.map((player) => ({ ...player })) },
      rules: { ...rules, rentMultipliers: [...rules.rentMultipliers], chanceCards: rules.chanceCards.map((card) => ({ ...card })) },
      map: { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), path: map.path.map((point) => ({ ...point })) },
      completedRounds: 0,
      turnOrder,
      players: config.players.map((player) => ({ id: player.id, cash: rules.startingCash, position: 0, bankrupt: false,
        statistics: { startBonus: 0, rentReceived: 0, rentPaid: 0, taxesPaid: 0, chanceIncome: 0, chanceExpense: 0, purchases: 0 },
      })),
      turnPlayerId: turnOrder[0]!,
      decision: { kind: "awaiting_roll", actorId: turnOrder[0]! },
      properties: initialProperties(map), lastRoll: null,
      random: random.snapshot,
      history: [],
    });
  }

  get snapshot(): GameSnapshot { return this.state; }

  static restore(value: unknown): Game {
    const snapshot = restoreSnapshot(value);
    const game = new Game(snapshot.config);
    game.state = freeze(snapshot);
    return game;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(command: Command): ApplyResult {
    if (!command || !this.state.config.players.some((player) => player.id === command.actor) ||
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
      const players = before.players.map((player) => ({ ...player, statistics: { ...player.statistics } }));
      const properties = { ...before.properties };
      const random = new RuleRandom(before.random);
      const player = players.find((candidate) => candidate.id === command.actor);
      if (!player) throw new Error("玩家不存在");
      let decision: Decision = { kind: "awaiting_roll", actorId: player.id };
      let turnPlayerId = before.turnPlayerId;
      let completedRounds = before.completedRounds;
      let lastRoll = before.lastRoll;
      const events: GameEvent[] = [];

      if (command.kind === "roll") {
        const dice = [random.integer(6) + 1, random.integer(6) + 1] as const;
        const steps = dice[0] + dice[1];
        const from = player.position;
        const path = Array.from({ length: steps }, (_, offset) => (from + offset + 1) % before.map.tiles.length);
        const to = path.at(-1);
        if (to === undefined) throw new Error("移动路径为空");
        const passedStart = path.includes(0);
        const startBonus = passedStart ? before.rules.passStartBonus : 0;
        if (passedStart) player.cash = cashAfterChange(player.cash, startBonus);
        player.position = to;
        lastRoll = dice;
        const tile = tileAt(before.map, to);
        let landing: LandingResult;
        switch (tile.type) {
          case "start": landing = { kind: "start" }; break;
          case "tax":
            player.cash = cashAfterChange(player.cash, -tile.amount);
            landing = { kind: "tax", amount: tile.amount };
            break;
          case "chance": {
            const card = before.rules.chanceCards[random.integer(before.rules.chanceCards.length)];
            if (!card) throw new Error("机会卡无效");
            player.cash = cashAfterChange(player.cash, card.amount);
            landing = { kind: "chance", amount: card.amount, cardId: card.id };
            break;
          }
          case "property": {
            const ownerId = properties[tile.id]!.ownerId;
            if (!ownerId) {
              decision = { kind: "awaiting_purchase", actorId: player.id, propertyId: tile.id };
              landing = { kind: "property_available", propertyId: tile.id, price: tile.price };
            } else if (ownerId === player.id) {
              landing = { kind: "property_owned", propertyId: tile.id };
            } else {
              const owner = players.find((candidate) => candidate.id === ownerId);
              if (!owner) throw new Error("产权玩家不存在");
              const amount = rentFor(before, tile.id);
              player.cash = cashAfterChange(player.cash, -amount);
              owner.cash = cashAfterChange(owner.cash, amount);
              landing = { kind: "rent", propertyId: tile.id, ownerId, amount };
            }
            break;
          }
        }
        events.push({ kind: "rolled", result: { playerId: player.id, dice, steps, from, to, path, passedStart, startBonus, landing } });
      } else {
        const property = pendingProperty(before);
        if (!property) throw new Error("待购地产不存在");
        if (command.kind === "buy") {
          player.cash = cashAfterChange(player.cash, -property.price);
          properties[property.id] = { ...properties[property.id]!, ownerId: player.id };
          events.push({ kind: "purchased", actor: player.id, propertyId: property.id, price: property.price });
        } else {
          events.push({ kind: "skipped", actor: player.id, propertyId: property.id });
        }
      }

      const record = (id: PlayerId, field: keyof FinancialStats, amount: number) => {
        const target = players.find((entry) => entry.id === id);
        if (!target) throw new Error("财务玩家不存在");
        target.statistics[field] = cashAfterChange(target.statistics[field], amount);
      };
      for (const event of events) {
        if (event.kind === "purchased") record(event.actor, "purchases", event.price);
        if (event.kind === "rolled") {
          const action = event.result;
          record(action.playerId, "startBonus", action.startBonus);
          const landing = action.landing;
          if (landing.kind === "tax") record(action.playerId, "taxesPaid", landing.amount);
          if (landing.kind === "chance") record(action.playerId, landing.amount >= 0 ? "chanceIncome" : "chanceExpense", Math.abs(landing.amount));
          if (landing.kind === "rent") {
            record(action.playerId, "rentPaid", landing.amount);
            record(landing.ownerId, "rentReceived", landing.amount);
          }
        }
      }
      if (player.cash < 0) {
        player.bankrupt = true;
        for (const [propertyId, property] of Object.entries(properties)) if (property.ownerId === player.id) properties[propertyId] = { ownerId: null, level: 0, mortgagePrincipal: 0, constructionCosts: [] };
        decision = { kind: "awaiting_roll", actorId: player.id };
      }
      const candidate = { ...before, players, properties, decision, lastRoll, random: random.snapshot };
      for (const entry of players) netAssets(candidate, entry.id);
      if (players.filter((entry) => !entry.bankrupt).length === 1) {
        const result = matchResult(candidate, "last_survivor");
        decision = { kind: "game_over", result };
        events.push({ kind: "ended", result });
      } else if (decision.kind === "awaiting_roll") {
        ({ turnPlayerId, completedRounds } = nextTurn(candidate));
        if (completedRounds >= before.rules.roundLimit) {
          const result = matchResult(candidate, "round_limit");
          decision = { kind: "game_over", result };
          events.push({ kind: "ended", result });
        } else {
          decision = { kind: "awaiting_roll", actorId: turnPlayerId };
          events.push({ kind: "turn", actor: turnPlayerId });
        }
      }
      if (!Number.isSafeInteger(before.revision + 1) || !Number.isSafeInteger(random.snapshot.draws)) throw new RangeError("版本超出整数范围");
      const revision = before.revision + 1;
      const history = [...before.history, ...events.map((event) => ({ revision, event }))].slice(-HISTORY_LIMIT);
      const snapshot = freeze({ ...before, revision, players, properties, turnPlayerId, completedRounds, decision, lastRoll, random: random.snapshot, history });
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
