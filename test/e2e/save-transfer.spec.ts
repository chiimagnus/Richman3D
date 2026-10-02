import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { makeSave, type SaveRecord } from "../../src/storage/snapshot";
import { saved as stored, startMatch } from "./match-actions";

async function writeRaw(page: Page, values: { current: unknown; backup: unknown }) {
  await page.evaluate((values) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("richman3d", 1);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction("games", "readwrite");
      for (const [key, value] of Object.entries(values)) transaction.objectStore("games").put(value, key);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
    opening.onerror = () => reject(opening.error);
  }), values);
}

async function upload(page: Page, content: string) {
  await page.locator("[data-save-import]").setInputFiles({ name: "match.richman.json", mimeType: "application/json", buffer: Buffer.from(content) });
}

async function download(page: Page, selector: string): Promise<SaveRecord> {
  const downloading = page.waitForEvent("download");
  await page.locator(selector).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}

async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startMatch(page, 940);
}

test("export, clear site storage, import with confirmation and continue preserves exact rules and can export again", async ({ page }) => {
  await start(page);
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  await page.locator("[data-pause]").click();
  const original = await download(page, "[data-save-export]");
  await page.getByRole("button", { name: "主菜单", exact: true }).click();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("richman3d");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));
  await page.reload();
  await expect(page.locator("[data-continue]")).toHaveCount(0);
  await page.locator("[data-transfer-open]").click();
  await upload(page, JSON.stringify(original));
  await expect(page.locator("[data-transfer-confirm]")).toBeEnabled();
  expect(await stored(page)).toBeUndefined();
  await page.locator("[data-transfer-confirm]").click();
  await expect(page.locator("[data-continue]")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  const imported = (await stored(page))!;
  expect(imported.state).toEqual(original.state);
  expect(imported.source).toBe("imported");
  expect(imported.matchId).not.toBe(original.matchId);
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  await page.locator("[data-pause]").click();
  expect((await download(page, "[data-save-export]")).state).toEqual(original.state);
});

test("invalid uploads and cancelling a valid preview preserve the current session, saved data and keyboard focus", async ({ page }) => {
  await start(page);
  const original = (await stored(page))!;
  await page.locator("[data-pause]").click();
  await page.locator("[data-transfer-open]").click();
  const invalid = ["{", " ".repeat(1_048_577),
    JSON.stringify({ ...original, schemaVersion: 99 }),
    JSON.stringify({ ...original, state: { ...original.state, players: [original.state.players[0], original.state.players[0]] } }),
    JSON.stringify({ ...original, state: { ...original.state, owners: { "neon-avenue": "missing" } } })];
  for (const content of invalid) {
    await upload(page, content);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("[data-transfer-confirm]")).toHaveCount(0);
    expect(await stored(page)).toEqual(original);
    await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", original.matchId);
  }
  await upload(page, JSON.stringify(original));
  await expect(page.locator("[data-transfer-confirm]")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-transfer-open]")).toBeFocused();
  expect(await stored(page)).toEqual(original);
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", original.matchId);
});

test("damaged current is downloadable verbatim and only confirmed valid backup recovery replaces it without replay", async ({ page }) => {
  await start(page);
  const backup = (await stored(page))!;
  const raw = { schemaVersion: 99, privateData: "原始内容 <script>not code</script>" };
  await writeRaw(page, { current: raw, backup });
  await page.reload();
  await expect(page.locator("[data-continue]")).toHaveCount(0);
  await page.locator("[data-transfer-open]").click();
  expect(await download(page, "[data-raw-export]")).toEqual(raw);
  await page.locator("[data-backup-preview]").click();
  await expect(page.locator("[data-snapshot-time]")).toBeVisible();
  expect(await stored(page)).toEqual(raw);
  await page.locator("[data-transfer-confirm]").click();
  await expect(page.locator("[data-continue]")).toBeVisible();
  const recovered = (await stored(page))!;
  expect(recovered.state).toEqual(backup.state);
  expect(recovered.matchId).not.toBe(backup.matchId);
  expect(recovered.savedAt).toBe(backup.savedAt);
  expect(await stored(page, "backup")).toEqual(backup);
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  expect(await stored(page)).toEqual(recovered);
});

test("invalid backup and a competing write during preview cannot be silently replaced", async ({ page }) => {
  await page.goto("./");
  const initial = makeSave(new Game(createMatchConfig(940)).snapshot, crypto.randomUUID());
  const raw = { schemaVersion: 99 };
  await expect(page.locator("[data-start]")).toBeVisible();
  await writeRaw(page, { current: raw, backup: raw });
  await page.reload();
  await page.locator("[data-transfer-open]").click();
  await page.locator("[data-backup-preview]").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("[data-transfer-confirm]")).toHaveCount(0);
  expect(await stored(page)).toEqual(raw);
  await upload(page, JSON.stringify(initial));
  await expect(page.locator("[data-transfer-confirm]")).toBeEnabled();
  await writeRaw(page, { current: initial, backup: raw });
  await page.locator("[data-transfer-confirm]").click();
  await expect(page.getByRole("alert")).toContainText("其他页面");
  expect(await stored(page)).toEqual(initial);
  expect(await stored(page, "backup")).toEqual(raw);
});

test("narrow English save preview keeps its file input and confirmation reachable and restores menu focus", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("./");
  await page.getByRole("combobox").selectOption("en");
  await page.locator("[data-transfer-open]").click();
  const initial = makeSave(new Game(createMatchConfig(940)).snapshot, crypto.randomUUID());
  await upload(page, JSON.stringify(initial));
  await expect(page.getByRole("dialog")).toContainText("not a formal challenge score");
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator("[data-transfer-confirm]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-transfer-confirm]")).toBeInViewport();
  await page.screenshot({ path: "test-results/save-transfer-narrow-en.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-transfer-open]")).toBeFocused();
  expect(await stored(page)).toBeUndefined();
});

test("cancelling a pending file read cannot revive a preview or dispose the current match", async ({ page }) => {
  await page.addInitScript(() => {
    const text = File.prototype.text;
    File.prototype.text = async function () {
      await new Promise<void>((resolve) => Reflect.set(window, "releaseFileRead", resolve));
      return text.call(this);
    };
  });
  await start(page);
  const initial = (await stored(page))!;
  await page.locator("[data-pause]").click();
  await page.locator("[data-transfer-open]").click();
  await upload(page, JSON.stringify(initial));
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, "releaseFileRead"))).toBe("function");
  await page.keyboard.press("Escape");
  await page.evaluate(() => Reflect.get(window, "releaseFileRead")());
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", initial.matchId);
  expect(await stored(page)).toEqual(initial);
});
