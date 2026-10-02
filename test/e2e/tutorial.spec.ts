import { expect, test, type Page } from "@playwright/test";

async function practice(page: Page, step: number) {
  await page.locator("[data-tutorial-start]").click();
  await expect(page.locator("[data-tutorial-step]")).toHaveAttribute("data-tutorial-step", "1");
  if (step >= 2) await page.locator("[data-tutorial-next]").click();
  if (step >= 3) { await page.locator("[data-roll]").click(); await expect(page.locator("[data-tutorial-step]")).toHaveAttribute("data-tutorial-step", "3"); }
  if (step >= 4) await page.locator("[data-tutorial-next]").click();
  if (step >= 5) { await page.locator("[data-buy]").click(); await expect(page.locator("[data-tutorial-finish]")).toBeEnabled(); }
}

test("five actual steps survive help and language changes, then a normal match has a fresh seed and finances", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(6); return array; } });
    const original = Storage.prototype.setItem;
    const writes: string[] = [];
    Object.assign(window, { storageWrites: writes });
    Storage.prototype.setItem = function (key, value) { writes.push(key); original.call(this, key, value); };
  });
  await page.goto("./");
  await practice(page, 3);
  const practiceId = await page.locator("[data-match-id]").getAttribute("data-match-id");
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-purpose", "tutorial");
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-seed", "940");
  await expect(page.locator("[data-buy]")).toHaveCount(0);
  await page.locator("canvas").focus();
  await page.keyboard.press("B");
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "1");
  await page.locator("[data-help-open]").click();
  await page.getByRole("dialog").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("B");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "1");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-help-open]")).toBeFocused();
  await expect(page.locator("[data-tutorial-step]")).toHaveAttribute("data-tutorial-step", "3");
  await page.locator("[data-settings-open]").click();
  await page.getByRole("dialog").getByRole("button", { name: "English" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-tutorial-step]")).toContainText("Read the landing space");
  await page.locator("[data-tutorial-next]").click();
  await expect(page.locator("[data-tutorial-step]")).toHaveAttribute("data-tutorial-step", "4");
  await page.locator("[data-buy]").click();
  await expect(page.locator("[data-tutorial-step]")).toHaveAttribute("data-tutorial-step", "5");
  await expect(page.locator("[data-tutorial-finish]")).toBeEnabled();
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,352");
  await expect(page.locator("[data-bot-cash]")).toHaveText("¥1,468");
  await page.locator("[data-tutorial-finish]").click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-tutorial-start]")).toHaveText("Replay tutorial");
  expect(await page.evaluate(() => localStorage.getItem("richman3d.tutorial.v1"))).toBe("completed");
  await page.locator("[data-launch]").click();
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-purpose", "match");
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-seed", "6");
  expect(await page.locator("[data-match-id]").getAttribute("data-match-id")).not.toBe(practiceId);
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,500");
  await expect(page.locator("[data-bot-cash]")).toHaveText("¥1,500");
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,420");
  expect(await page.evaluate(() => Reflect.get(window, "storageWrites"))).toEqual(["richman3d.preferences.v1", "richman3d.tutorial.v1"]);
});

for (const step of [1, 2, 3, 4, 5]) {
  test(`step ${step} can be skipped with a real keyboard activation without setting completion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await practice(page, step);
    for (let tab = 0; tab < 20; tab += 1) {
      if (await page.locator("[data-tutorial-skip]").evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.locator("[data-tutorial-skip]")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-launch]")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("richman3d.tutorial.v1"))).toBeNull();
  });
}

test("English help is available before play and restores its trigger focus", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("combobox").selectOption("en");
  await page.locator("[data-help-open]").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("20 full rounds");
  await expect(dialog).toContainText("Initial cash is ¥1500");
  await expect(dialog).toContainText("no buildings");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-help-open]")).toBeFocused();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("narrow English practice steps stay readable and buttons remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByRole("combobox").selectOption("en");
  await practice(page, 1);
  for (const step of [1, 2, 3, 4, 5]) {
    await expect(page.locator("[data-tutorial-step]")).toHaveAttribute("data-tutorial-step", String(step));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("[data-tutorial-skip]")).toBeInViewport();
    if (step === 1 || step === 3) await page.locator("[data-tutorial-next]").click();
    if (step === 2) await page.locator("[data-roll]").click();
    if (step === 4) await page.locator("[data-buy]").click();
    if (step === 5) await expect(page.locator("[data-tutorial-finish]")).toBeEnabled();
  }
  await page.screenshot({ path: "test-results/tutorial-narrow-en.png" });
});
