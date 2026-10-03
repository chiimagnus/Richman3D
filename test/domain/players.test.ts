import { expect, it } from "vitest";
import { createMatchConfig, observerId, SEAT_COLORS, SEAT_IDS } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { makeSave, readSave } from "../../src/storage/snapshot";

it.each([2, 3, 4])("preserves %s configured seats and controller authority through every real saved decision", (size) => {
  const config = { ...createMatchConfig(940), players: SEAT_IDS.slice(0, size).map((id, index) => ({
    id, defaultNameKey: id, controller: index === size - 1 ? "human" as const : "bot" as const,
    name: index === size - 1 ? "<b>城市</b>" : null, color: SEAT_COLORS[index]!,
  })) };
  const game = new Game(config);
  expect(observerId(config)).toBe(SEAT_IDS[size - 1]);
  const seen = new Set<string>();
  for (let count = 0; count < 400; count += 1) {
    const snapshot = game.snapshot;
    expect(snapshot.players.map((player) => player.id)).toEqual(config.players.map((player) => player.id));
    const record = makeSave(snapshot, "00000000-0000-4000-8000-000000000004", "local", 1000);
    const restored = Game.restore(readSave(JSON.parse(JSON.stringify(record))).record.state);
    expect(restored.snapshot).toEqual(snapshot);
    if (snapshot.decision.kind === "game_over") {
      expect(seen.size).toBe(size);
      expect(snapshot.decision.result.rankings).toHaveLength(size);
      return;
    }
    seen.add(snapshot.turnPlayerId);
    const actor = snapshot.decision.actorId;
    for (const player of config.players.filter((player) => player.id !== actor)) {
      expect(legalCommands(snapshot, player.id)).toEqual([]);
    }
    const command = (chooseBotAction(observeBot(snapshot), "normal")?.command ?? null) ?? legalCommands(snapshot, snapshot.decision.actorId).at(-1)!;
    expect(command).toBeDefined();
    const result = game.apply(command);
    expect(result.ok).toBe(true);
    expect(restored.apply(command)).toEqual(result);
  }
  throw new Error("Multi-seat match did not terminate");
});

it("rejects empty, singleton, oversized and duplicate seats without a two-seat fallback", () => {
  const config = createMatchConfig();
  for (const players of [[], config.players.slice(0, 1), [...config.players, ...config.players, config.players[0]!],
    config.players.map((player) => ({ ...player, id: "p1" as const }))]) {
    expect(() => new Game({ ...config, players })).toThrow();
  }
});
