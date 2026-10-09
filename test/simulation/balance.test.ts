import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { chooseBotAction, observeBot } from "../../src/domain/bot";
import { cardInstances } from "../../src/domain/cards";
import { completeGroup, netAssets } from "../../src/domain/economy";
import { MAPS } from "../../src/domain/maps";
import type { MapDefinition } from "../../src/domain/board";
import { QUICK_RULES, STANDARD_RULES } from "../../src/domain/rules";
import type { RuleSet } from "../../src/domain/rules";
import { BOT_DIFFICULTIES, type Command, type FinancialStats, type GameSnapshot } from "../../src/domain/types";
import seeds from "../fixtures/balance-seeds.json";

const output = "test-results/balance";
const commandLimit = 5000;
const receipts: readonly (keyof FinancialStats)[] = ["startBonus", "rentReceived", "chanceIncome", "tradeCashReceived", "constructionRefunds"];
const expenses: readonly (keyof FinancialStats)[] = ["rentPaid", "taxesPaid", "chanceExpense", "tradeCashPaid", "purchases", "constructionSpent"];

function assertState(snapshot: GameSnapshot, instances: readonly string[]): void {
  let rentBalance = 0;
  let tradeBalance = 0;
  let bookBalance = 0;
  for (const player of snapshot.players) {
    assert(Number.isSafeInteger(player.cash) && player.cash >= 0, "unsafe or negative cash");
    for (const value of Object.values(player.statistics)) assert(Number.isSafeInteger(value) && value >= 0, "unsafe financial flow");
    const sum = (fields: readonly (keyof FinancialStats)[]) => fields.reduce((value, field) => value + BigInt(player.statistics[field]), 0n);
    assert.equal(BigInt(player.cash), BigInt(snapshot.rules.startingCash) + sum(receipts) - sum(expenses), "cash does not reconcile with actual flows");
    assert(Number.isSafeInteger(netAssets(snapshot, player.id)), "unsafe net assets");
    rentBalance += player.statistics.rentReceived - player.statistics.rentPaid;
    tradeBalance += player.statistics.tradeCashReceived - player.statistics.tradeCashPaid;
    bookBalance += player.statistics.tradeBookValueReceived - player.statistics.tradeBookValueGiven;
    if (player.bankrupt) assert.equal(player.hand.length, 0, "eliminated hand not released");
  }
  assert.equal(rentBalance, 0, "rent collected differs from actual payment");
  assert.equal(tradeBalance, 0, "trade creates cash");
  assert.equal(bookBalance, 0, "trade duplicates property value");
  const zones = [...snapshot.deck.drawPile, ...snapshot.deck.discardPile, ...(snapshot.deck.pending ? [snapshot.deck.pending] : []),
    ...snapshot.players.flatMap((player) => player.hand), ...(snapshot.activeItem ? [snapshot.activeItem.instanceId] : [])];
  assert.equal(zones.length, instances.length, "card count changed");
  assert.equal(new Set(zones).size, instances.length, "duplicated card entity");
  assert(zones.every((instance) => instances.includes(instance)), "unknown card entity");
}

function simulate(seed: number, seats: number, rules: RuleSet, sample: number, map: MapDefinition) {
  const config = createMatchConfig(seed, seats);
  const rotation = Math.floor(sample / 6) % seats;
  const game = new Game({ ...config, mapId: map.id, mapVersion: map.version, rulesVersion: rules.version, players: config.players.map((player, index) => ({ ...player,
    controller: "bot", difficulty: BOT_DIFFICULTIES[(sample % 3 + (sample % 2 === 0 ? 0 : (index + rotation) % seats)) % 3]! })) });
  const instances = cardInstances(game.snapshot.rules);
  const commands: Record<string, number> = {};
  const items: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const decisions: Record<string, number> = {};
  const bankruptcies: Record<string, number> = {};
  const history: Command[] = [];
  let conflictCount = 0;
  let used = 0;
  const completedGroups = new Set<string>();
  try {
    assertState(game.snapshot, instances);
    for (; game.snapshot.decision.kind !== "game_over" && used < commandLimit; used += 1) {
      const before = game.snapshot;
      const observation = observeBot(before);
      assert(observation, "missing nonterminal bot observation");
      const action = chooseBotAction(observation);
      assert(action, "missing legal policy exit");
      assert(observation.actions.some((command) => JSON.stringify(command) === JSON.stringify(action.command)), "policy bypasses legal candidates");
      history.push(action.command);
      if (history.length > 12) history.shift();
      commands[action.command.kind] = (commands[action.command.kind] ?? 0) + 1;
      reasons[action.reason] = (reasons[action.reason] ?? 0) + 1;
      decisions[before.decision.kind] = (decisions[before.decision.kind] ?? 0) + 1;
      if (action.command.kind === "use_item") items[action.command.instanceId.slice(0, -2)] = (items[action.command.instanceId.slice(0, -2)] ?? 0) + 1;
      const result = game.apply(action.command);
      assert(result.ok, `policy rejected: ${result.ok ? "" : result.reason}`);
      assert.equal(result.snapshot, game.snapshot, "result is not the committed snapshot");
      assert.equal(game.snapshot.revision, before.revision + 1, "command did not commit once");
      const roundDelta = game.snapshot.completedRounds - before.completedRounds;
      assert(roundDelta === 0 || roundDelta === 1, "round progress is not bounded");
      assert(game.snapshot.completedRounds <= rules.roundLimit, "round limit overrun");
      assert(game.snapshot.random.draws >= before.random.draws, "random cursor went backwards");
      assertState(game.snapshot, instances);
      for (const tile of map.tiles) if (tile.type === "property" && completeGroup(game.snapshot, tile)) completedGroups.add(tile.group);
      for (const event of result.events) {
        if (event.kind === "paid") {
          assert(event.amount + event.writtenOff === event.debt.amount, "partial payment not accounted");
          if (event.debt.source.kind === "rent") {
            const creditor = event.debt.creditorId!;
            assert.equal(game.snapshot.players.find((player) => player.id === creditor)!.cash - before.players.find((player) => player.id === creditor)!.cash,
              event.amount, "creditor did not receive actual payment");
            conflictCount += 1;
          }
        }
        if (event.kind === "trade_accepted") conflictCount += 1;
      }
      if (action.command.kind === "bankrupt") {
        assert(before.decision.kind === "awaiting_debt", "bankruptcy outside debt");
        const source = before.decision.debt.source.kind;
        bankruptcies[source] = (bankruptcies[source] ?? 0) + 1;
        conflictCount += 1;
      }
      if (roundDelta !== 0 || result.snapshot.decision.kind === "game_over") {
        const { map: _map, rules: _rules, ...state } = result.snapshot;
        assert.deepEqual(Game.restore(state).snapshot, game.snapshot, "committed round cannot restore");
      }
    }
    assert(game.snapshot.decision.kind === "game_over", "5000-command limit reached");
    if (game.snapshot.decision.result.reason === "round_limit") assert.equal(game.snapshot.completedRounds, rules.roundLimit);
    const assets = game.snapshot.players.map((player) => netAssets(game.snapshot, player.id));
    const totalAssets = assets.reduce((sum, value) => sum + value, 0);
    return { seed, seats, mapId: map.id, mapVersion: map.version, completedGroups: completedGroups.size, rulesVersion: rules.version, commands: used, rounds: game.snapshot.completedRounds, actions: commands, items, reasons, decisions, bankruptcies, conflictCount,
      roundLimit: game.snapshot.decision.result.reason === "round_limit", winners: [...game.snapshot.decision.result.winnerIds],
      players: game.snapshot.config.players.map((player) => ({ id: player.id, difficulty: player.difficulty, order: game.snapshot.turnOrder.indexOf(player.id),
        cash: game.snapshot.players.find((state) => state.id === player.id)!.cash, netAssets: netAssets(game.snapshot, player.id),
        bankrupt: game.snapshot.players.find((state) => state.id === player.id)!.bankrupt })),
      flows: game.snapshot.players.map((player) => player.statistics),
      assetConcentration: totalAssets === 0 ? 0 : Math.max(...assets) / totalAssets };
  } catch (cause) {
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/failure-${map.id}-${rules.version}-${seats}-${seed}.json`, JSON.stringify({ seed, config: game.snapshot.config, commands: used, error: String(cause), lastCommands: history, state: game.snapshot }, null, 2));
    throw new Error(`Balance failure: ${rules.version}, seats=${seats}, seed=${seed}, commands=${used}`, { cause });
  }
}

type Sample = ReturnType<typeof simulate>;

function interval(wins: number, matches: number) {
  const rate = wins / matches;
  const variance = 1.96 ** 2;
  const denominator = 1 + variance / matches;
  const center = (rate + variance / (2 * matches)) / denominator;
  const margin = 1.96 * Math.sqrt((rate * (1 - rate) + variance / (4 * matches)) / matches) / denominator;
  return { wins, matches, rate, confidence95: [Math.max(0, center - margin), Math.min(1, center + margin)] };
}

function summarize(samples: readonly Sample[]) {
  const counts = (key: "actions" | "items" | "reasons" | "decisions" | "bankruptcies") => {
    const result: Record<string, number> = {};
    for (const sample of samples) for (const [name, count] of Object.entries(sample[key])) result[name] = (result[name] ?? 0) + count;
    return result;
  };
  const distribution = (values: readonly number[]) => {
    const sorted = [...values].sort((first, second) => first - second);
    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
  };
  const wins = (predicate: (player: Sample["players"][number]) => boolean, selected: readonly Sample[] = samples) => {
    let matches = 0;
    let count = 0;
    let eliminated = 0;
    for (const sample of selected) for (const player of sample.players.filter(predicate)) {
      matches += 1;
      if (sample.winners.length === 1 && sample.winners[0] === player.id) count += 1;
      if (player.bankrupt) eliminated += 1;
    }
    return { ...interval(count, matches), bankruptcies: eliminated };
  };
  const flows: Record<string, number> = {};
  for (const sample of samples) for (const player of sample.flows) for (const [field, amount] of Object.entries(player)) flows[field] = (flows[field] ?? 0) + amount;
  const conflicts = [...samples].sort((first, second) => first.conflictCount - second.conflictCount || first.seed - second.seed);
  const representative = (sample: Sample) => ({ seed: sample.seed, conflictCount: sample.conflictCount, simulatedCommands: sample.commands, rounds: sample.rounds });
  const seats = samples[0]!.seats;
  const sameDifficulty = samples.filter((sample) => sample.players.every((player) => player.difficulty === sample.players[0]!.difficulty));
  const mixedDifficulty = samples.filter((sample) => !sameDifficulty.includes(sample));
  return { seats, mapId: samples[0]!.mapId, mapVersion: samples[0]!.mapVersion, rulesVersion: samples[0]!.rulesVersion, matches: samples.length,
    completedGroups: distribution(samples.map((sample) => sample.completedGroups)), groupCompletion: interval(samples.filter((sample) => sample.completedGroups > 0).length, samples.length),
    roundLimit: interval(samples.filter((sample) => sample.roundLimit).length, samples.length), ties: samples.filter((sample) => sample.winners.length > 1).length,
    commands: distribution(samples.map((sample) => sample.commands)), rounds: distribution(samples.map((sample) => sample.rounds)),
    finalCash: distribution(samples.flatMap((sample) => sample.players.map((player) => player.cash))),
    finalNetAssets: distribution(samples.flatMap((sample) => sample.players.map((player) => player.netAssets))),
    assetConcentration: distribution(samples.map((sample) => sample.assetConcentration)), flows,
    actions: counts("actions"), items: counts("items"), reasons: counts("reasons"), decisions: counts("decisions"), bankruptcySources: counts("bankruptcies"),
    seatWins: Object.fromEntries(samples[0]!.players.map((player) => [player.id, wins((candidate) => candidate.id === player.id)])),
    orderWins: Object.fromEntries(Array.from({ length: seats }, (_, order) => [order + 1, wins((player) => player.order === order)])),
    difficultyWins: Object.fromEntries(BOT_DIFFICULTIES.map((difficulty) => [difficulty, wins((player) => player.difficulty === difficulty)])),
    sameDifficultyOrderWins: Object.fromEntries(Array.from({ length: seats }, (_, order) => [order + 1, wins((player) => player.order === order, sameDifficulty)])),
    mixedDifficultyWins: Object.fromEntries(BOT_DIFFICULTIES.map((difficulty) => [difficulty, wins((player) => player.difficulty === difficulty, mixedDifficulty)])),
    playtestSamples: { low: representative(conflicts[0]!), middle: representative(conflicts[Math.floor(conflicts.length / 2)]!), high: representative(conflicts.at(-1)!) } };
}

async function batch(selectedSeeds: readonly number[], reportName: string) {
  const started = performance.now();
  const groups = [];
  for (const map of MAPS) for (const rules of [QUICK_RULES, STANDARD_RULES]) for (const seats of [2, 3, 4]) {
    const samples: Sample[] = [];
    for (const [index, seed] of selectedSeeds.entries()) {
      samples.push(simulate(seed, seats, rules, index, map));
      await setImmediate();
    }
    groups.push(summarize(samples));
    console.info(`${map.id}, ${rules.version}, ${seats} seats: ${samples.length} matches, max ${Math.max(...samples.map((sample) => sample.commands))} commands`);
  }
  const deterministic = { maps: MAPS.map((map) => ({ id: map.id, version: map.version })), seeds: [...selectedSeeds], commandLimit,
    sampling: "Alternating same-difficulty and mixed-difficulty games; rotate difficulty assignments every six samples. Rule-controlled initial order is never overwritten.",
    evidence: "Domain-only internal all-bot matches. Unique wins exclude ties; 95% Wilson intervals are descriptive, not a claim of fairness or stronger play. No human time, UI, device or playtest evidence.", groups };
  mkdirSync(output, { recursive: true });
  const path = `${output}/${reportName}.json`;
  let previous: { deterministic: unknown } | null = null;
  try { previous = JSON.parse(readFileSync(path, "utf8")); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  const serialized = JSON.stringify({ elapsedMs: performance.now() - started, deterministic }, null, 2);
  if (previous) {
    try { assert.deepEqual(deterministic, previous.deterministic, "identical batch changed its non-timing statistics; both runs must be investigated"); }
    catch (cause) { writeFileSync(`${path}.mismatch.json`, serialized); throw cause; }
  }
  writeFileSync(path, serialized);
  return deterministic;
}

it("smoke: detects a broken cash ledger and duplicated entities without treating a completed tool call as proof", () => {
  const snapshot = new Game(createMatchConfig(1)).snapshot;
  const instances = cardInstances(snapshot.rules);
  expect(() => assertState({ ...snapshot, players: snapshot.players.map((player) => ({ ...player, cash: player.cash - 1 })) }, instances)).toThrow("cash does not reconcile");
  expect(() => assertState({ ...snapshot, deck: { ...snapshot.deck, drawPile: [snapshot.deck.drawPile[0]!, ...snapshot.deck.drawPile.slice(0, -1)] } }, instances)).toThrow("duplicated card");
});

it("smoke: reports bounded symmetric Wilson intervals instead of calling a raw win count proof of fairness", () => {
  const none = interval(0, 10);
  const all = interval(10, 10);
  expect(none.confidence95[0]).toBeCloseTo(0);
  expect(all.confidence95[1]).toBeCloseTo(1);
  expect(none.confidence95[1]).toBeCloseTo(1 - all.confidence95[0]!);
  expect(interval(5, 10).confidence95[0]).toBeCloseTo(1 - interval(5, 10).confidence95[1]!);
});

it("smoke: rotating same-strategy identities between seats changes neither legal actions nor any committed monetary result", () => {
  for (const difficulty of BOT_DIFFICULTIES) for (const seats of [2, 3, 4]) {
    const base = createMatchConfig(31, seats);
    const config = { ...base, players: base.players.map((player, index) => ({ ...player, controller: "bot" as const, difficulty, name: `agent-${index}` })) };
    const first = new Game(config);
    const second = new Game({ ...config, players: config.players.map((player, index) => ({ ...player,
      name: config.players[(index + 1) % seats]!.name, color: config.players[(index + 1) % seats]!.color })) });
    for (let count = 0; first.snapshot.decision.kind !== "game_over" && count < commandLimit; count += 1) {
      const action = chooseBotAction(observeBot(first.snapshot))!;
      assert.deepEqual(chooseBotAction(observeBot(second.snapshot)), action);
      const result = first.apply(action.command);
      const repeated = second.apply(action.command);
      assert(result.ok && repeated.ok);
      assert.deepEqual(result.events, repeated.events);
      assert.deepEqual({ ...second.snapshot, config: first.snapshot.config }, first.snapshot);
    }
    assert.equal(first.snapshot.decision.kind, "game_over");
    assert.equal(second.snapshot.decision.kind, "game_over");
  }
});

it("smoke: finishes all six scale/mode groups with actual restored rounds and deterministic strategy actions", async () => {
  const report = await batch(seeds.slice(0, 6), "maps-smoke");
  expect(report.groups).toHaveLength(MAPS.length * 6);
  expect(report.groups.every((group) => group.matches === 6)).toBe(true);
  for (const group of report.groups) {
    expect(group.finalCash.min).toBeGreaterThanOrEqual(0);
    expect(group.finalNetAssets.mean).toBeGreaterThanOrEqual(group.finalCash.mean);
    expect(group.finalNetAssets.max).toBeGreaterThanOrEqual(group.finalCash.max!);
  }
});

it("batch: finishes and reconciles 6000 fixed-seed games per map without dropping failures", async () => {
  expect(seeds).toHaveLength(1000);
  expect(new Set(seeds).size).toBe(1000);
  expect(seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffff_ffff)).toBe(true);
  const report = await batch(seeds, "maps-report");
  expect(report.groups.every((group) => group.matches === 1000)).toBe(true);
});
