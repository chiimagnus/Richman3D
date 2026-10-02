import { expect, test } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { finishMatch } from "./match-actions";

function expectedCash(value: number) { return `${value < 0 ? "−" : ""}¥${Math.abs(value).toLocaleString("en-US")}`; }

function expectedMatch() {
  const config = createMatchConfig(341);
  const game = new Game({ ...config, players: config.players.map((player, index) => ({ ...player, name: index === 0 ? "Alex" : "Taylor" })) });
  for (let count = 0; game.snapshot.decision.kind !== "game_over" && count < 200; count += 1) {
    const snapshot = game.snapshot;
    const kind = snapshot.decision.kind === "awaiting_purchase" ? count === 1 ? "buy" : "skip" : "roll";
    const command = chooseBotCommand(snapshot) ?? legalCommands(snapshot, snapshot.activePlayerId).find((action) => action.kind === kind)!;
    const result = game.apply(command);
    if (!result.ok) throw new Error(result.reason);
  }
  return game.snapshot;
}

test("real terminal UI reconciles the ledger, preserves numbers across languages, replays and restarts without reload", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    let seed = 341;
    Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(seed++); return array; } });
    Object.assign(window, { documentMarker: "same-document" });
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator('[data-name="p1"]').fill("Alex");
  await page.locator('[data-name="p2"]').fill("Taylor");
  await page.locator("[data-launch]").click();
  const firstId = await page.locator("[data-match-id]").getAttribute("data-match-id");
  await page.locator("[data-roll]").click();
  await page.locator("[data-buy]").click();
  await finishMatch(page);
  const expected = expectedMatch();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(page.locator("[data-restart]")).toBeFocused();
  await expect(page.locator("[data-feedback-event],[data-announcement],[data-roll]")).toHaveCount(0);
  if (expected.decision.kind !== "game_over") throw new Error("Expected real terminal result");
  for (const entry of expected.decision.result.rankings) await expect(page.locator(`[data-result-player="${entry.playerId}"] [data-net-assets]`)).toHaveText(expectedCash(entry.netAssets));
  await page.locator("[data-result-details] summary").click();
  for (const player of expected.players) {
    const detail = page.locator(`[data-detail-player="${player.id}"]`);
    await expect(detail.locator("[data-final-cash]")).toHaveText(expectedCash(player.cash));
    for (const [field, value] of Object.entries(player.statistics)) await expect(detail.locator(`[data-finance="${field}"]`)).toHaveText(expectedCash(value));
  }
  await page.locator("[data-result-language]").selectOption("en");
  await expect(dialog).toContainText("Alex");
  await expect(dialog).toContainText("Rent received");
  await page.locator("[data-result-language]").selectOption("zh-CN");
  await page.locator("[data-result-language]").selectOption("en");
  for (const player of expected.players) await expect(page.locator(`[data-detail-player="${player.id}"] [data-final-cash]`)).toHaveText(expectedCash(player.cash));
  await page.locator("[data-replay]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-seed", "341");
  const replayId = await page.locator("[data-match-id]").getAttribute("data-match-id");
  expect(replayId).not.toBe(firstId);
  await page.locator("[data-roll]").click();
  await page.locator("[data-buy]").click();
  await finishMatch(page);
  for (const entry of expected.decision.result.rankings) await expect(page.locator(`[data-result-player="${entry.playerId}"] [data-net-assets]`)).toHaveText(expectedCash(entry.netAssets));
  await page.locator("[data-restart]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-seed", "342");
  expect(await page.locator("[data-match-id]").getAttribute("data-match-id")).not.toBe(replayId);
  await expect(page.locator('[data-player="p1"]')).toContainText("Alex");
  await expect(page.locator("[data-round]")).toHaveText("Round 1 / 20");
  expect(await page.evaluate(() => Reflect.get(window, "documentMarker"))).toBe("same-document");
});

test("real bankruptcy terminal explains the survivor even when the bankrupt player has more book assets", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(108); return array; } }));
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-launch]").click();
  await finishMatch(page, true);
  await expect(page.getByRole("dialog")).toContainText("只剩一名未破产玩家");
  await expect(page.getByRole("dialog").getByRole("heading", { level: 2 })).toHaveText("城市玩家获胜。");
  await expect(page.locator('[data-result-player="p1"] [data-net-assets]')).toHaveText("¥1,858");
  await expect(page.locator('[data-result-player="p2"] [data-net-assets]')).toHaveText("¥1,802");
  await page.locator("[data-result-details] summary").click();
  await expect(page.locator('[data-detail-player="p1"] [data-final-cash]')).toHaveText("−¥2");
  await page.getByRole("dialog").getByRole("button", { name: "主菜单" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-start]")).toBeVisible();
});
