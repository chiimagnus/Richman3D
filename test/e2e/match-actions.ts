import { expect, type Page } from "@playwright/test";
import type { SaveRecord } from "../../src/storage/snapshot";

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
