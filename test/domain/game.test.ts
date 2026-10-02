import { describe, expect, it } from "vitest";

import { Game } from "../../src/domain/game";

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;

  return () => {
    const value = values[index];
    index += 1;

    if (value === undefined) {
      throw new Error("测试随机序列已耗尽");
    }

    return value;
  };
}

describe("Game", () => {
  it("允许购买地产，并让后来踩中的对手支付租金", () => {
    const game = new Game({
      random: sequenceRandom([0, 0.2, 0, 0.2]),
    });

    const humanRoll = game.roll();
    expect(humanRoll.to).toBe(3);
    expect(humanRoll.landing.kind).toBe("property_available");

    game.buyCurrentProperty();

    expect(game.snapshot.owners["neon-avenue"]).toBe("human");
    expect(game.snapshot.players[0]?.cash).toBe(1320);
    expect(game.snapshot.activePlayerId).toBe("bot");

    const botRoll = game.roll();
    expect(botRoll.landing).toEqual({
      kind: "rent",
      propertyId: "neon-avenue",
      ownerId: "human",
      amount: 32,
    });
    expect(game.snapshot.players[0]?.cash).toBe(1352);
    expect(game.snapshot.players[1]?.cash).toBe(1468);
    expect(game.snapshot.activePlayerId).toBe("human");
  });

  it("经过起点获得奖金，再结算落脚格", () => {
    const game = new Game({
      random: sequenceRandom([
        0.99,
        0.99,
        0.2,
        0.2,
        0.99,
        0.99,
      ]),
    });

    const firstHumanRoll = game.roll();
    expect(firstHumanRoll.to).toBe(12);
    game.skipPurchase();

    const botRoll = game.roll();
    expect(botRoll.to).toBe(4);
    expect(botRoll.landing).toEqual({ kind: "tax", amount: 80 });

    const secondHumanRoll = game.roll();
    expect(secondHumanRoll.passedStart).toBe(true);
    expect(secondHumanRoll.to).toBe(4);
    expect(secondHumanRoll.landing).toEqual({ kind: "tax", amount: 80 });
    expect(game.snapshot.players[0]?.cash).toBe(1620);
  });

  it("结算机会格的确定性奖励", () => {
    const game = new Game({
      random: sequenceRandom([0, 0, 0]),
    });

    const result = game.roll();

    expect(result.to).toBe(2);
    expect(result.landing).toEqual({
      kind: "chance",
      amount: 120,
      cardId: "innovation-bonus",
    });
    expect(game.snapshot.players[0]?.cash).toBe(1620);
    expect(game.snapshot.activePlayerId).toBe("bot");
  });

  it("拒绝没有待购买地产时的购买", () => {
    const game = new Game();

    expect(() => game.buyCurrentProperty()).toThrow(
      "当前阶段为 awaiting_roll",
    );
  });

  it("资金跌破零时结束游戏并确定胜者", () => {
    const game = new Game({
      startingCash: 50,
      random: sequenceRandom([0.2, 0.2]),
    });

    const result = game.roll();

    expect(result.to).toBe(4);
    expect(result.landing).toEqual({ kind: "tax", amount: 80 });
    expect(game.snapshot.phase).toBe("game_over");
    expect(game.snapshot.winnerId).toBe("bot");
    expect(game.snapshot.players[0]?.cash).toBe(-30);
  });
});
