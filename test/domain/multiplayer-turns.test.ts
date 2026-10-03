import { expect, it } from "vitest";
import { createMatchConfig } from "../../src/domain/config";
import { Game } from "../../src/domain/game";
import { nextTurn, initialTurnOrder } from "../../src/domain/turns";
import { QUICK_RULES } from "../../src/domain/rules";
import { CITY } from "../../src/domain/maps/city";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { makeSave, readSave } from "../../src/storage/snapshot";

it.each([2, 3, 4])("creates one seeded %s-seat permutation, preserving seat order and restoring it without consuming dice", (size) => {
  const permutations = new Set<string>();
  for (let seed = 0; seed < 100; seed += 1) {
    const config = createMatchConfig(seed, size);
    const game = new Game(config);
    expect(game.snapshot.turnOrder).toEqual(initialTurnOrder(config));
    expect([...game.snapshot.turnOrder].sort()).toEqual(config.players.map((player) => player.id));
    expect(game.snapshot.turnPlayerId).toBe(game.snapshot.turnOrder[0]);
    expect(game.snapshot.random.draws).toBe(size - 1);
    const record = makeSave(game.snapshot, "00000000-0000-4000-8000-000000000004");
    expect(Game.restore(readSave(JSON.parse(JSON.stringify(record))).record.state).snapshot).toEqual(game.snapshot);
    permutations.add(game.snapshot.turnOrder.join(","));
  }
  expect(permutations.size).toBe(size === 2 ? 2 : size === 3 ? 6 : 24);
});

it.each([[0], [1], [3], [1, 2], [0, 3]].map((eliminated) => ({ eliminated })))("skips eliminated fixed positions $eliminated without moving the full-round boundary", ({ eliminated }) => {
  const game = new Game(createMatchConfig(940, 4));
  const order = game.snapshot.turnOrder;
  let snapshot = { ...game.snapshot, turnPlayerId: order.find((_, index) => !eliminated.includes(index))!,
    players: game.snapshot.players.map((player) => ({ ...player, bankrupt: eliminated.includes(order.indexOf(player.id)) })) };
  const survivors = order.filter((_, index) => !eliminated.includes(index));
  for (let round = 0; round < 3; round += 1) {
    const seen = [];
    for (let turn = 0; turn < survivors.length; turn += 1) {
      seen.push(snapshot.turnPlayerId);
      snapshot = { ...snapshot, ...nextTurn(snapshot) };
      expect(snapshot.completedRounds).toBe(round + (turn === survivors.length - 1 ? 1 : 0));
    }
    expect(seen).toEqual(survivors);
  }
});

it.each([3, 4])("waits for the %s-seat final purchase before ending, then ranks all real tied survivors", (size) => {
  const rules = { ...QUICK_RULES, roundLimit: 1, passStartBonus: 0 };
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "start" ? tile : { type: "property" as const, id: tile.id, price: 100, rent: 0, group: "cyan" as const }) };
  const game = new Game(createMatchConfig(940, size), rules, map);
  const tail = game.snapshot.turnOrder.at(-1)!;
  for (let count = 0; count < 20; count += 1) {
    if (game.snapshot.turnPlayerId === tail && game.snapshot.decision.kind === "awaiting_purchase") break;
    expect(game.apply(legalCommands(game.snapshot, game.snapshot.decision.kind === "game_over" ? game.snapshot.turnPlayerId : game.snapshot.decision.actorId).at(-1)!).ok).toBe(true);
  }
  expect(game.snapshot.turnPlayerId).toBe(tail);
  expect(game.snapshot.decision.kind).toBe("awaiting_purchase");
  expect(game.snapshot.completedRounds).toBe(0);
  expect(game.apply(legalCommands(game.snapshot, tail).at(-1)!).ok).toBe(true);
  expect(game.snapshot.decision.kind).toBe("awaiting_auction");
  for (let count = 0; count < size && game.snapshot.decision.kind === "awaiting_auction"; count += 1) expect(game.apply(legalCommands(game.snapshot, game.snapshot.decision.actorId).find((command) => command.kind === "auction_pass")!).ok).toBe(true);
  expect(game.snapshot.completedRounds).toBe(1);
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "round_limit", winnerIds: game.snapshot.config.players.map((player) => player.id) } });
});

it("eliminates only the debtor, keeps multiple opponents playing and ends only with one survivor", () => {
  const map = { ...CITY, tiles: CITY.tiles.map((tile) => tile.type === "start" ? tile : { type: "tax" as const, id: tile.id, amount: 2000 }) };
  const game = new Game(createMatchConfig(6, 4), { ...QUICK_RULES, passStartBonus: 0 }, map);
  const order = game.snapshot.turnOrder;
  for (let index = 0; index < 3; index += 1) {
    expect(game.snapshot.turnPlayerId).toBe(order[index]);
    expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId)[0]!).ok).toBe(true);
    expect(game.snapshot.decision.kind).toBe("awaiting_debt");
    expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((command) => command.kind === "bankrupt")!).ok).toBe(true);
    expect(game.snapshot.players.filter((player) => !player.bankrupt)).toHaveLength(3 - index);
    if (index < 2) expect(game.snapshot.decision.kind).toBe("awaiting_roll");
  }
  expect(game.snapshot.decision).toMatchObject({ kind: "game_over", result: { reason: "last_survivor", winnerIds: [order[3]] } });
});

it("runs four internal computer seats through the same commands without adding a product mode", () => {
  const base = createMatchConfig(940, 4);
  const game = new Game({ ...base, players: base.players.map((player) => ({ ...player, controller: "bot" })) });
  for (let count = 0; count < 400 && game.snapshot.decision.kind !== "game_over"; count += 1) {
    const command = chooseBotCommand(game.snapshot);
    expect(command).not.toBeNull();
    expect(game.apply(command!).ok).toBe(true);
  }
  expect(game.snapshot.decision.kind).toBe("game_over");
});

it("a real elimination from a validated low-cash checkpoint stops future rent and preserves every subsequent save", () => {
  const game = new Game(createMatchConfig(36, 3));
  for (const kind of ["roll", "buy"] as const) expect(game.apply(legalCommands(game.snapshot, "p1").find((command) => command.kind === kind)!).ok).toBe(true);
  const record = makeSave(game.snapshot, "00000000-0000-4000-8000-000000000004");
  const management = Game.restore({ ...record.state, turnPlayerId: "p1", decision: { kind: "awaiting_roll", actorId: "p1" } });
  expect(management.apply({ kind: "mortgage", propertyId: "river-market", actor: "p1", expectedRevision: management.snapshot.revision }).ok).toBe(true);
  const mortgaged = makeSave(management.snapshot, record.matchId);
  const restored = Game.restore({ ...mortgaged.state, players: mortgaged.state.players.map((player) => player.id === "p1" ? {
    ...player, cash: 0, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash },
  } : player) });
  expect(restored.apply(legalCommands(restored.snapshot, "p1")[0]!).ok).toBe(true);
  expect(restored.apply(legalCommands(restored.snapshot, "p1").find((command) => command.kind === "bankrupt")!).ok).toBe(true);
  expect(restored.snapshot.players[0]).toMatchObject({ bankrupt: true, cash: 0, statistics: { purchases: 200, debtWrittenOff: 50, mortgagePrincipalReleased: 100 } });
  expect(Object.values(restored.snapshot.properties).map((property) => property.ownerId)).not.toContain("p1");
  const invalid = makeSave(restored.snapshot, record.matchId);
  const ghostEstate = { ...invalid.state, properties: { ...invalid.state.properties, "river-market": { ...invalid.state.properties["river-market"]!, ownerId: "p1" as const } } };
  expect(() => Game.restore(ghostEstate)).toThrow("产权引用无效");
  expect(() => readSave({ ...invalid, state: ghostEstate })).toThrow("invalid");
  const eliminated = restored.snapshot.players[0]!;
  for (let count = 0; count < 200; count += 1) {
    expect(readSave(makeSave(restored.snapshot, record.matchId)).snapshot).toEqual(restored.snapshot);
    expect(restored.snapshot.players[0]).toEqual(eliminated);
    if (restored.snapshot.decision.kind === "game_over") return;
    expect(restored.apply(chooseBotCommand(restored.snapshot)!).ok).toBe(true);
  }
  throw new Error("Surviving computers did not terminate");
});
