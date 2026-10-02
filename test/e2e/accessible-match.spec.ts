import { expect, test, type Locator, type Page } from "@playwright/test";

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

for (const input of ["keyboard", "touch"] as const) {
  test(`complete match at narrow English reflow using ${input} controls`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: input === "keyboard" ? { width: 640, height: 360 } : { width: 360, height: 640 },
      hasTouch: input === "touch",
      isMobile: input === "touch",
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
      const activate = async (target: Locator) => {
        if (input === "keyboard") {
          await tabTo(page, target);
          await expect(target).toBeInViewport();
          await page.keyboard.press("Enter");
        } else {
          await target.scrollIntoViewIfNeeded();
          await expect(target).toBeInViewport();
          await target.tap();
        }
      };
      await page.goto("http://127.0.0.1:4317/Richman3D/");
      const language = page.getByRole("combobox");
      if (input === "keyboard") {
        await tabTo(page, language);
        await page.keyboard.press("E");
        await page.keyboard.press("Tab");
      } else await language.selectOption("en");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await activate(page.locator("[data-start]"));
      for (const [seat, name] of [["p1", "LongEnglishHuman"], ["p2", "LongOpponentName"]]) {
        const field = page.locator(`[data-name="${seat}"]`);
        if (input === "keyboard") { await tabTo(page, field); await page.keyboard.type(name!); }
        else await field.fill(name!);
      }
      await activate(page.locator("[data-launch]"));
      await expect(page.locator("[data-roll]")).toBeEnabled();
      await expect(page.locator('[data-player="p1"]')).toContainText("LongEnglishHuman");
      await expect(page.locator('[data-player="p2"]')).toContainText("LongOpponentName");
      await page.screenshot({ path: `test-results/match-start-${input}-en.png` });
      let purchasesOffered = 0;
      let reachedResult = false;
      for (let command = 0; command < 200; command += 1) {
        await expect.poll(() => page.locator("[data-roll]:enabled,[data-skip]:enabled,dialog[open]").count(), { timeout: 15_000 }).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (await page.getByRole("dialog").isVisible()) { reachedResult = true; break; }
        await expect(page.locator("[data-human-cash]")).toBeInViewport();
        await expect(page.locator("[data-bot-cash]")).toBeInViewport();
        await expect(page.locator("[data-tile]")).toBeInViewport();
        const skip = page.locator("[data-skip]");
        if (await skip.isVisible() && await skip.isEnabled()) {
          purchasesOffered += 1;
          await expect(page.locator("[data-buy]")).toContainText(/\d+/);
          if (purchasesOffered === 1) await page.screenshot({ path: `test-results/match-purchase-${input}-en.png` });
          await activate(skip);
        } else await activate(page.locator("[data-roll]"));
      }
      expect(reachedResult).toBe(true);
      expect(purchasesOffered).toBeGreaterThan(0);
      await expect(page.getByRole("dialog")).toContainText("full round limit");
      await expect(page.locator("[data-round]")).toHaveText("Round 20 / 20");
      await expect(page.locator("[data-restart]")).toBeFocused();
      await page.screenshot({ path: `test-results/complete-match-${input}-en.png` });
      await info.attach("interaction-boundary", { body: input === "keyboard" ? "640x360 CSS viewport: reflow equivalent to a 1280x720 viewport at 200%; actual Tab/Enter commands. Not an OS/browser zoom test." : "360x640 Chromium touch emulation: actual touchscreen taps. Not a physical-device acceptance.", contentType: "text/plain" });
      await activate(page.getByRole("dialog").getByRole("button", { name: "Main Menu", exact: true }));
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.locator("[data-start]")).toBeVisible();
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
