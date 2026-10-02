import { expect, test } from "@playwright/test";

test("current UI reference image uses actual scene and controls", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto("./");
  await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  if (process.env.UPDATE_GAMEPLAY_IMAGE === "1") await page.screenshot({ path: "public/og-image.png" });
});
