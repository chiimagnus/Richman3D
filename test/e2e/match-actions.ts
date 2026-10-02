import { expect, type Page } from "@playwright/test";

export async function finishMatch(page: Page, buying = false): Promise<void> {
  for (let command = 0; command < 200; command += 1) {
    await expect.poll(() => page.locator("[data-roll]:enabled,[data-skip]:enabled,dialog[open]").count(), { timeout: 15_000 }).toBeGreaterThan(0);
    if (await page.getByRole("dialog").isVisible()) return;
    const skip = page.locator("[data-skip]");
    const buy = page.locator("[data-buy]");
    if (buying && await buy.isVisible() && await buy.isEnabled()) await buy.click();
    else if (await skip.isVisible() && await skip.isEnabled()) await skip.click();
    else await page.locator("[data-roll]").click();
  }
  throw new Error("Real UI commands did not reach a result");
}
