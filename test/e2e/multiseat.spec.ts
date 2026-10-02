import { expect, test } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { expectedCash, finishMatch, saved } from "./match-actions";
import { createMatchConfig } from "../../src/domain/config";

for (const size of [3, 4]) test(`production menu ${size}-seat match preserves fixed order on continuation and reaches exact terminal rankings`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
  const expected = new Game(createMatchConfig(940, size));
  const advanceBots = () => {
    for (let count = 0; count < 400; count += 1) {
      const command = chooseBotCommand(expected.snapshot);
      if (!command) return;
      expect(expected.apply(command).ok).toBe(true);
    }
    throw new Error("Computer commands did not yield");
  };
  advanceBots();
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-seats]").selectOption(String(size));
  await expect(page.locator("[data-name]")).toHaveCount(size);
  await page.locator("[data-launch]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator("[data-player]")).toHaveCount(size);
  const initial = (await saved(page))!;
  const { rules: _initialRules, map: _initialMap, ...initialState } = expected.snapshot;
  expect(initial.state).toEqual(initialState);
  await page.reload();
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  expect(await saved(page)).toEqual(initial);
  for (let count = 0; expected.snapshot.decision.kind !== "game_over" && count < 400; count += 1) {
    const command = chooseBotCommand(expected.snapshot) ?? legalCommands(expected.snapshot, "p1").at(-1)!;
    expect(expected.apply(command).ok).toBe(true);
  }
  expect(expected.snapshot.decision.kind).toBe("game_over");
  await finishMatch(page);
  const terminal = (await saved(page))!;
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect(terminal.state).toEqual(state);
  expect(terminal.matchId).toBe(initial.matchId);
  await expect(page.locator("[data-result-player]")).toHaveCount(size);
  if (expected.snapshot.decision.kind !== "game_over") throw new Error("Missing result");
  for (const entry of expected.snapshot.decision.result.rankings) {
    await expect(page.locator(`[data-result-player="${entry.playerId}"] [data-net-assets]`)).toHaveText(expectedCash(entry.netAssets));
  }
  await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await saved(page))!.state).toEqual(terminal.state);
});

test("four-seat English setup and balances preserve long names and reachable actions at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
  await page.goto("./");
  await page.getByRole("combobox").selectOption("en");
  await page.locator("[data-start]").click();
  await page.locator("[data-seats]").selectOption("4");
  const names = ["LongLocalName<&>", "LongComputerName", "另一位城市经营玩家", "FourthPlayerName"];
  for (const [index, name] of names.entries()) await page.locator(`[data-name="p${index + 1}"]`).fill(name);
  await page.locator("[data-launch]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled({ timeout: 15_000 });
  for (const [index, name] of names.entries()) {
    await expect(page.locator(`[data-player="p${index + 1}"]`)).toContainText(name);
    await expect(page.locator(`[data-player="p${index + 1}"] strong`)).toBeInViewport();
  }
  await expect(page.locator("[data-roll]")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const balances = await page.getByRole("complementary").boundingBox();
  const feedback = await page.locator("[data-feedback-event]").boundingBox();
  const camera = await page.locator("[data-view-toggle]").boundingBox();
  if (!balances || !camera) throw new Error("Missing actual layout bounds");
  if (feedback) expect(feedback.y).toBeGreaterThanOrEqual(balances.y + balances.height);
  expect(camera.y).toBeGreaterThanOrEqual(balances.y + balances.height);
  await page.screenshot({ path: "test-results/four-seat-narrow-en.png" });
});

for (const size of [3, 4]) test(`${size}-seat fixture projects every actual pawn and restores the same purchase after refresh`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByLabel("Fixture seats").selectOption(String(size));
  await page.getByRole("button", { name: "Start fixture", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("[data-player]")).toHaveCount(size);
  const initial = (await saved(page))!;
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  const pending = (await saved(page))!;
  expect(pending.state.decision.kind).toBe("awaiting_purchase");
  await page.reload();
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  expect(await saved(page)).toEqual(pending);
  const expected = Game.restore(pending.state);
  expect(expected.apply(legalCommands(expected.snapshot, "p1").find((command) => command.kind === "buy")!).ok).toBe(true);
  for (let count = 0; count < 10; count += 1) {
    const command = chooseBotCommand(expected.snapshot);
    if (!command) break;
    expect(expected.apply(command).ok).toBe(true);
  }
  await page.locator("[data-buy]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect((await saved(page))!.state).toEqual(state);
  expect(state.owners["neon-avenue"]).toBe("p1");
  expect(state.players[0]!.statistics.rentReceived).toBeGreaterThan(0);
  await page.locator("[data-pause]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.length).toBe(size);
  const projection = JSON.parse(await page.locator("#stats").innerText());
  expect(projection.state).toEqual(expected.snapshot);
  for (const [index, player] of state.players.entries()) {
    const point = expected.snapshot.map.path[player.position]!;
    expect(projection.pawns[index]).toMatchObject({ id: player.id, position: [point.x + (index % 2 === 0 ? -0.72 : 0.72), 0.18, point.z + (index < 2 ? -0.72 : 0.72)] });
  }
  expect((await saved(page))!.matchId).toBe(initial.matchId);
  await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).activeWorlds).toBe(0);
});

test("four-seat fixture gives the second human input authority without treating the first pawn as local", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByLabel("Fixture seats").selectOption("4");
  await page.getByLabel("Fixture human").selectOption("1");
  await page.getByRole("button", { name: "Start fixture", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const current = (await saved(page))!;
  expect(current.state.activePlayerId).toBe("p2");
  expect(current.state.owners["neon-avenue"]).toBe("p1");
  await expect(page.locator('[data-player="p2"] [data-human-cash]')).toHaveText("¥1,500");
  await expect(page.locator('[data-player="p1"] [data-bot-cash]')).toHaveText(expectedCash(current.state.players[0]!.cash));
  await page.locator("[data-pause]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.filter((pawn: { visible: boolean }) => !pawn.visible).map((pawn: { id: string }) => pawn.id)).toEqual(["p2"]);
  expect((await saved(page))!.state).toEqual(current.state);
});
