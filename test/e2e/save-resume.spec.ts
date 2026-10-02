import { expect, test, type Page } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import type { SaveRecord } from "../../src/storage/snapshot";

async function saved(page: Page, key = "current"): Promise<SaveRecord | undefined> {
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

async function start(page: Page, seed: number) {
  await page.addInitScript((seed) => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(seed); return array; } }), seed);
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-launch]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
}

test("real initial and purchase saves survive refresh, preserving state and the next actual random result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, 341);
  const initial = (await saved(page))!;
  expect(initial.revision).toBe(0);
  const matchId = await page.locator("[data-match-id]").getAttribute("data-match-id");
  expect(initial.matchId).toBe(matchId);
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  const pending = (await saved(page))!;
  expect(pending.state.decision).toEqual({ kind: "awaiting_purchase", propertyId: "neon-avenue" });
  expect((await saved(page, "backup"))?.state).toEqual(initial.state);
  await page.reload();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", matchId!);
  expect((await saved(page))!).toEqual(pending);
  await page.locator("[data-buy]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const afterBuy = (await saved(page))!;
  expect(afterBuy.state.owners).toEqual({ "neon-avenue": "p1" });
  expect(afterBuy.state.players[0]?.cash).toBe(1352);
  const expected = Game.restore(afterBuy.state);
  expected.apply(legalCommands(expected.snapshot, "p1")[0]!);
  await page.reload();
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.locator("[data-roll]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBeGreaterThan(afterBuy.revision);
  const rolled = (await saved(page))!;
  expect(rolled.state.lastRoll).toEqual(expected.snapshot.lastRoll);
  expect(rolled.state.players[0]?.position).toBe(expected.snapshot.players[0]?.position);
  expect(rolled.state.players[0]?.cash).toBe(expected.snapshot.players[0]?.cash);
});

test("refresh during real dice presentation resumes the committed landing, not its payment or RNG", async ({ page }) => {
  await start(page, 1);
  await page.locator("[data-roll]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBe(1);
  await expect(page.locator("[data-presenting]")).toHaveAttribute("data-presenting", "true");
  const mid = (await saved(page))!;
  expect(mid.state.players[0]?.cash).toBe(1420);
  const expected = Game.restore(mid.state);
  for (let count = 0; count < 4; count += 1) {
    const command = chooseBotCommand(expected.snapshot);
    if (!command) break;
    expected.apply(command);
  }
  await page.reload();
  await expect(page.locator("[data-continue]")).toBeVisible();
  expect((await saved(page))!).toEqual(mid);
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,420");
  await expect(page.locator("[data-roll]")).toBeEnabled({ timeout: 15_000 });
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect((await saved(page))?.state).toEqual(state);
});

test("real storage refusal requires explicit unsaved play and then retries the latest state without another rule action", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.assign(window, { denyStorage: true });
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      if (Reflect.get(window, "denyStorage")) throw new DOMException("denied", "SecurityError");
      return original.apply(this, args);
    };
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-launch]").click();
  await expect(page.getByRole("dialog")).toContainText("尚未保存");
  await page.locator("[data-unsaved-continue]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-save-status]")).toBeVisible();
  await expect.poll(async () => Number(await page.locator("[data-revision]").getAttribute("data-revision"))).toBeGreaterThan(0);
  await page.locator("[data-pause]").click();
  const before = await page.locator("[data-revision]").getAttribute("data-revision");
  const cash = await page.locator("[data-human-cash]").innerText();
  await page.evaluate(() => Reflect.set(window, "denyStorage", false));
  await page.locator("[data-save-retry]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBe(Number(before));
  await expect(page.locator("[data-human-cash]")).toHaveText(cash);
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", before!);
});
