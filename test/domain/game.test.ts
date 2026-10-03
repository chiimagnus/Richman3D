import { QUICK_RULES } from "../../src/domain/rules";
import { createMatchConfig } from "../../src/domain/config";
import { describe, expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import type { RollResult } from "../../src/domain/types";

function act(game: Game, kind: "roll" | "buy" | "skip") {
  const snapshot = game.snapshot;
  const result = game.apply({ kind, actor: snapshot.turnPlayerId, expectedRevision: snapshot.revision });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function roll(game: Game): RollResult {
  const event = act(game, "roll").events.find((entry) => entry.kind === "rolled");
  if (!event || event.kind !== "rolled") throw new Error("缺少移动结果");
  return event.result;
}

describe("Game", () => {
  it("允许购买地产，并让后来踩中的对手支付租金", () => {
    const game = new Game(createMatchConfig(940));
    expect(roll(game).to).toBe(3);
    act(game, "buy");
    expect(game.snapshot.properties["neon-avenue"]!.ownerId).toBe("p1");
    expect(game.snapshot.players[0]?.cash).toBe(1320);
    expect(game.snapshot.turnPlayerId).toBe("p2");
    expect(roll(game).landing).toEqual({
      kind: "rent", propertyId: "neon-avenue", ownerId: "p1", amount: 32,
    });
    expect(game.snapshot.players[0]?.cash).toBe(1352);
    expect(game.snapshot.players[1]?.cash).toBe(1468);
    expect(game.snapshot.turnPlayerId).toBe("p1");
  });

  it("经过起点获得奖金，再结算落脚格", () => {
    const game = new Game(createMatchConfig(17981));
    expect(roll(game).to).toBe(12);
    act(game, "skip");
    expect(roll(game).landing).toEqual({ kind: "tax", amount: 80 });
    const result = roll(game);
    expect(result.passedStart).toBe(true);
    expect(result.to).toBe(4);
    expect(result.landing).toEqual({ kind: "tax", amount: 80 });
    expect(game.snapshot.players[0]?.cash).toBe(1620);
  });

  it("结算机会格的确定性奖励", () => {
    const game = new Game(createMatchConfig(768));
    const result = roll(game);
    expect(result.to).toBe(2);
    expect(result.landing).toEqual({ kind: "chance", amount: 120, cardId: "innovation-bonus" });
    expect(game.snapshot.players.find((player) => player.id === result.playerId)?.cash).toBe(1620);
    expect(game.snapshot.turnPlayerId).toBe("p2");
  });

  it("拒绝没有待购买地产时的购买", () => {
    const game = new Game();
    expect(game.apply({ kind: "buy", actor: "p1", expectedRevision: 0 })).toEqual({ ok: false, reason: "illegal_action" });
  });

  it("资金跌破零时结束游戏并确定胜者", () => {
    const game = new Game(createMatchConfig(6), { ...QUICK_RULES, startingCash: 50 });
    const result = roll(game);
    expect(result.to).toBe(4);
    expect(result.landing).toEqual({ kind: "tax", amount: 80 });
    expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "last_survivor", winnerIds: ["p2"] } });
    expect(game.snapshot.players[0]?.cash).toBe(-30);
  });
});
