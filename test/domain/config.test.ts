import { expect, it } from "vitest";
import { createMatchConfig, normalizeName, observerId, SEAT_COLORS, SEAT_IDS } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { QUICK_RULES } from "../../src/domain/rules";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { chanceCardText, formatMessage, messages, playerName } from "../../src/i18n";
import { tileDetail } from "../../src/rendering/BoardView";

it("separates stable identity, controller, names and observation; snapshots do not freeze the caller", () => {
  const config = createMatchConfig(341);
  const players = config.players.map((player, index) => ({ ...player, name: index === 0 ? "<b>城市</b>" : null, controller: index === 0 ? "bot" as const : "human" as const }));
  const game = new Game({ ...config, players });
  expect(observerId(game.snapshot.config)).toBe("p2");
  expect(chooseBotCommand(game.snapshot)?.actor).toBe("p1");
  expect(playerName("en", "p1", game.snapshot.config)).toBe("<b>城市</b>");
  expect(playerName("zh-CN", "p2", game.snapshot.config)).toBe("城市玩家");
  players[0]!.name = "changed";
  expect(playerName("zh-CN", "p1", game.snapshot.config)).toBe("<b>城市</b>");
  expect(game.apply(chooseBotCommand(game.snapshot)!).ok).toBe(true);
  expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
  expect(chooseBotCommand(game.snapshot)?.kind).toBe("buy");
});

it("uses grapheme length, whitespace defaults and text names", () => {
  expect(normalizeName("  ")).toBeNull();
  expect(normalizeName("  中<&文  ")).toBe("中<&文");
  expect(normalizeName("👨‍👩‍👧‍👦".repeat(16))).toBe("👨‍👩‍👧‍👦".repeat(16));
  expect(() => normalizeName("👨‍👩‍👧‍👦".repeat(17))).toThrow();
});

it("constructs stable 2–4 seat contracts without exposing unimplemented product choices", () => {
  for (const size of [2, 3, 4]) {
    const base = createMatchConfig();
    const players = SEAT_IDS.slice(0, size).map((id, index) => ({ id, defaultNameKey: id, controller: index === 0 ? "human" as const : "bot" as const, name: null, color: SEAT_COLORS[index]! }));
    expect(new Game({ ...base, players }).snapshot.players.map((player) => player.id)).toEqual(SEAT_IDS.slice(0, size));
  }
  const config = createMatchConfig();
  expect(() => new Game({ ...config, players: config.players.map((player) => ({ ...player, id: "p1" })) })).toThrow();
  expect(() => new Game({ ...config, rulesVersion: "unknown" })).toThrow();
  expect(() => new Game({ ...config, mapVersion: 2 })).toThrow();
});

it("RuleSet amounts reach actual cash, structured results and both locale projections", () => {
  const rules = { ...QUICK_RULES, startingCash: 2100, passStartBonus: 333, chanceCards: QUICK_RULES.chanceCards.map((card) => ({ ...card, amount: 17 })) };
  const chance = new Game(createMatchConfig(101), rules);
  expect(chance.apply(legalCommands(chance.snapshot, "p1")[0]!).ok).toBe(true);
  expect(chance.snapshot.players[0]?.cash).toBe(2117);
  for (const language of ["en", "zh-CN"] as const) {
    expect(chanceCardText(language, "innovation-bonus", rules.chanceCards[0]!.amount)).toContain("17");
    expect(formatMessage(messages(language).setup.moneyRules, { cash: rules.startingCash, bonus: rules.passStartBonus })).toContain("333");
    expect(tileDetail(chance.snapshot.map.tiles[0]!, language, chance.snapshot.rules)).toContain("333");
  }
  const lap = new Game(createMatchConfig(2210), rules);
  for (const kind of ["roll", "skip", "roll", "roll"] as const) {
    const result = lap.apply({ kind, actor: lap.snapshot.activePlayerId, expectedRevision: lap.snapshot.revision });
    expect(result.ok).toBe(true);
    if (kind === "roll" && result.ok && result.events.some((event) => event.kind === "rolled" && event.result.passedStart)) {
      expect(result.events[0]).toMatchObject({ result: { startBonus: 333 } });
    }
  }
  expect(lap.snapshot.players[0]?.cash).toBe(2353);
  expect(new Game(createMatchConfig()).snapshot.rules.passStartBonus).toBe(200);
});
