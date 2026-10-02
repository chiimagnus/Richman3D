import { expect, type Page } from "@playwright/test";
import type { SaveRecord } from "../../src/storage/snapshot";

export function expectedCash(value: number): string {
  return `${value < 0 ? "−" : ""}¥${Math.abs(value).toLocaleString("en-US")}`;
}

export async function saved(page: Page, key = "current"): Promise<SaveRecord | undefined> {
  return page.evaluate((key) => new Promise((resolve, reject) => {
    const opening = indexedDB.open("richman3d", 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction("games");
      const request = transaction.objectStore("games").get(key);
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), key);
}

export async function startMatch(page: Page, seed: number) {
  await page.addInitScript((seed) => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(seed); return array; } }), seed);
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-launch]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
}

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

export async function startLocal(page: Page, seats = 2, seed = 940, humans = 2) {
  await page.addInitScript((seed) => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(seed); return array; } }), seed);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-seats]").selectOption(String(seats));
  await page.locator("[data-humans]").selectOption(String(humans));
  await page.locator('[data-name="p1"]').fill("Alex<&>");
  await page.locator('[data-name="p2"]').fill("中文玩家");
  await page.locator("[data-launch]").click();
}

export async function expectHandover(page: Page, actor: string) {
  await expect(page.locator(`[data-handover-actor="${actor}"]`)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator("[data-roll],[data-buy],[data-skip],[data-status]")).toHaveCount(0);
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-view-player", "");
  await expect(page.locator("canvas")).toHaveAttribute("data-observer", "");
  await expect(page.locator("canvas")).toHaveAttribute("data-view", "overview");
}
