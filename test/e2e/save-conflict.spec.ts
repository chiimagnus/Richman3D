import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Game } from "../../src/domain/game";
import { chooseBotCommand } from "../../src/domain/bot";
import { saved, startMatch } from "./match-actions";

for (const change of ["progress", "new match"] as const) {
  test(`same-origin pages refuse stale writes after ${change}, export local progress and explicitly load latest`, async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startMatch(page, 940);
    const initial = (await saved(page))!;
    const other = await context.newPage();
    await other.emulateMedia({ reducedMotion: "reduce" });
    await other.goto("./");
    await other.locator("[data-continue]").click();
    await expect(other.locator("[data-roll]")).toBeEnabled();
    if (change === "progress") {
      await page.locator("[data-roll]").click();
      await page.locator("[data-buy]").click();
      await expect(page.locator("[data-roll]")).toBeEnabled();
    } else {
      await page.locator("[data-pause]").click();
      await page.getByRole("button", { name: "再来一局", exact: true }).click();
      await expect(page.locator("[data-roll]")).toBeEnabled();
    }
    const latest = (await saved(page))!;
    const backup = await saved(page, "backup");
    if (change === "new match") { expect(latest.revision).toBe(initial.revision); expect(latest.matchId).not.toBe(initial.matchId); }
    else expect(latest.revision).toBeGreaterThan(initial.revision);
    await other.locator("[data-roll]").click();
    await expect(other.getByRole("dialog")).toContainText("另一页面");
    await expect(other.locator("[data-unsaved-continue]")).toHaveCount(0);
    expect(await saved(other)).toEqual(latest);
    expect(await saved(other, "backup")).toEqual(backup);
    const downloading = other.waitForEvent("download");
    await other.locator("[data-save-export]").click();
    const file = await downloading;
    const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(exported.matchId).toBe(initial.matchId);
    expect(exported.revision).toBe(1);
    expect(exported.state.decision.kind).toBe("awaiting_purchase");
    await other.locator("[data-load-latest]").click();
    await expect(other.locator("[data-roll]")).toBeEnabled();
    await expect(other.locator("[data-match-id]")).toHaveAttribute("data-match-id", latest.matchId);
    expect(await saved(other)).toEqual(latest);
    expect(await saved(other, "backup")).toEqual(backup);
  });
}

test("emulated visibility cancels real presentation, preserves the committed save and needs explicit foreground resume", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, "testHidden", false);
    Object.defineProperty(document, "hidden", { get: () => Reflect.get(window, "testHidden") });
  });
  await startMatch(page, 6);
  await page.locator("[data-roll]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBe(1);
  const committed = (await saved(page))!;
  await page.evaluate(() => { Reflect.set(window, "testHidden", true); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(3000);
  expect(await saved(page)).toEqual(committed);
  await page.evaluate(() => { Reflect.set(window, "testHidden", false); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await saved(page)).toEqual(committed);
  const expected = Game.restore(committed.state);
  for (let count = 0; count < 4; count += 1) {
    const command = chooseBotCommand(expected.snapshot);
    if (!command) break;
    expected.apply(command);
  }
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled({ timeout: 15_000 });
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect((await saved(page))!.state).toEqual(state);
  expect((await saved(page))!.state.players[0]?.cash).toBe(1420);
});

test("closing and relaunching a real browser with the same isolated profile restores committed purchase without replay", async ({ baseURL }) => {
  test.setTimeout(60_000);
  if (!baseURL) throw new Error("Browser restart test requires the configured app URL");
  const directory = await mkdtemp(join(tmpdir(), "richman-save-restart-"));
  let context: BrowserContext | undefined;
  const options = { baseURL, reducedMotion: "reduce" as const,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) };
  try {
    context = await chromium.launchPersistentContext(directory, options);
    const first = context.pages()[0]!;
    await startMatch(first, 940);
    await first.locator("[data-roll]").click();
    await expect(first.locator("[data-buy]")).toBeEnabled();
    const committed = (await saved(first))!;
    await context.close();
    context = undefined;
    context = await chromium.launchPersistentContext(directory, options);
    const restored = context.pages()[0]!;
    await restored.goto("./");
    await expect(restored.locator("[data-continue]")).toBeVisible();
    await expect(restored.locator("canvas")).toHaveCount(0);
    expect(await saved(restored)).toEqual(committed);
    await restored.locator("[data-continue]").click();
    await expect(restored.locator("[data-buy]")).toBeEnabled();
    await expect(restored.locator("[data-match-id]")).toHaveAttribute("data-match-id", committed.matchId);
    expect(await saved(restored)).toEqual(committed);
  } finally {
    try { await context?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
