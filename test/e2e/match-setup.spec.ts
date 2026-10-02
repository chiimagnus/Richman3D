import { expect, test } from "@playwright/test";
import { finishMatch } from "./match-actions";

test("names, effective rules and camera choices reach a real match and rent settlement", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator('[data-name="p1"]').fill("  <b>中文</b>  ");
  await page.locator('[data-name="p2"]').fill("LongOpponentName");
  await page.locator("[data-length]").selectOption("city-v2-standard");
  await expect(page.getByRole("dialog")).toContainText("初始资金1500，经过起点获得200");
  await page.locator("[data-launch]").click();
  await expect(page.locator('[data-player="p1"]')).toContainText("<b>中文</b>");
  await expect(page.locator('[data-player="p1"] b')).toHaveCount(0);
  await expect(page.locator('[data-player="p2"]')).toContainText("LongOpponentName");
  await expect(page.locator("[data-round]")).toHaveText("第1 / 40轮");
  await page.locator("[data-view-toggle]").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-view", "overview");
  await page.screenshot({ path: "test-results/overview-desktop.png" });
  await expect(page.getByRole("button", { name: "环视", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "0");
  await page.locator("[data-view-toggle]").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-view", "first_person");
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-feedback-dice]")).toContainText("<b>中文</b>");
  await expect(page.locator("[data-buy]")).toBeEnabled({ timeout: 10_000 });
  await page.locator("[data-buy]").click();
  await expect(page.locator("[data-bot-cash]")).toHaveText("¥1,468", { timeout: 10_000 });
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,352");
  await expect(page.locator("[data-feedback-event]")).toContainText("LongOpponentName");
  await page.locator("[data-settings-open]").click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator('[data-player="p1"]')).toContainText("<b>中文</b>");
  await expect(page.locator("[data-round]")).toHaveText("Round 2 / 40");
});

test("name validation counts visible graphemes and cancel restores the start focus", async ({ page }) => {
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator('[data-name="p1"]').fill("👨‍👩‍👧‍👦".repeat(17));
  await page.locator("[data-launch]").click();
  await expect(page.getByRole("alert")).toContainText("16");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-start]")).toBeFocused();
  await page.locator("[data-start]").click();
  await page.locator('[data-name="p1"]').fill("👨‍👩‍👧‍👦".repeat(16));
  await page.locator("[data-launch]").click();
  await expect(page.locator('[data-player="p1"]')).toContainText("👨‍👩‍👧‍👦".repeat(16));
});

test("coarse pointer starts in a full overview with accessible game buttons", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4317/Richman3D/");
  await page.locator("[data-start]").click();
  await page.locator("[data-launch]").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-view", "overview");
  await page.screenshot({ path: "test-results/overview-mobile-emulation.png" });
  await expect(page.locator("[data-roll]")).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

for (const [version, rounds] of [["city-v2-quick", 20], ["city-v2-standard", 40]] as const) {
  test(`real configured ${rounds}-round match reaches the actual terminal UI`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
    await page.goto("./");
    await page.locator("[data-start]").click();
    await page.locator("[data-length]").selectOption(version);
    await page.locator("[data-launch]").click();
    await finishMatch(page);
    await expect(page.getByRole("dialog")).toContainText("已完成整轮上限");
    await expect(page.locator("[data-round]")).toHaveText(`第${rounds} / ${rounds}轮`);
    await expect(page.getByRole("dialog").getByRole("button", { name: "再来一局" })).toHaveCount(1);
  });
}
