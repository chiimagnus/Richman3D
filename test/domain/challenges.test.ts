import { expect, it } from "vitest";
import { challengeConfig, dailyChallenge } from "../../src/domain/challenges";
import { Game } from "../../src/domain/game";
import { QUICK_RULES } from "../../src/domain/rules";

it.each([["2026-10-08", 204970585, "city"], ["2026-10-09", 2130457846, "harbor"], ["2026-12-31", 1856825523, "harbor"], ["2027-01-01", 3169363759, "harbor"]] as const)("%s uses the published FNV-1a seed vector and fixed public configuration", (date, seed, mapId) => {
  const challenge = dailyChallenge(date);
  expect(challenge.seed).toBe(seed);
  expect(challenge.mapId).toBe(mapId);
  expect(challenge.id).toBe(`${date}|${QUICK_RULES.version}|daily-v1`);
  const config = challengeConfig(challenge);
  expect(config.players.map((player) => [player.controller, player.difficulty])).toEqual([["human", "normal"], ["bot", "normal"], ["bot", "normal"]]);
  const first = new Game(config); const second = new Game(challengeConfig(dailyChallenge(date)));
  const command = { kind: "roll" as const, actor: first.snapshot.turnPlayerId, expectedRevision: 0 };
  expect(first.apply(command)).toEqual(second.apply(command));
});

it("UTC day boundaries choose a new ID while a captured challenge remains unchanged", () => {
  const before = dailyChallenge(new Date("2026-10-08T23:59:59.999Z").toISOString().slice(0, 10));
  const config = challengeConfig(before);
  const after = dailyChallenge(new Date("2026-10-09T00:00:00.000Z").toISOString().slice(0, 10));
  expect(after.id).not.toBe(before.id); expect(after.seed).not.toBe(before.seed);
  expect(challengeConfig(before)).toEqual(config);
});

it.each(["2026-02-30", "2026-13-01", "2026-2-01", "not-a-date"])("rejects malformed date %s rather than silently choosing another day", (date) => expect(() => dailyChallenge(date)).toThrow());

it("rejects unknown rules/challenge versions rather than combining their scores", () => {
  expect(() => dailyChallenge("2026-10-09", "city-v12-quick")).toThrow();
  expect(() => dailyChallenge("2026-10-09", QUICK_RULES.version, 2)).toThrow();
});
