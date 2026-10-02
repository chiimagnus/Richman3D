import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readSave } from "../../src/storage/snapshot";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
});

test("denied localStorage getter does not prevent starting or changing preferences", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.locator("[data-settings-open]").click();
  await page.getByRole("dialog").getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText("Settings");
});

test("WebGL initialization failure has a readable exit and no playable ghost session", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
  await expect(page.getByRole("dialog")).toContainText("3D 画面不可用");
  await expect(page.locator("[data-roll]")).toHaveCount(0);
  await expect(page.locator("[data-save-export]")).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "主菜单" }).click();
  await expect(page.locator("[data-start]")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("Pointer Lock rejection is caught and ordinary buttons remain usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
  await page.getByRole("button", { name: "环视", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("鼠标锁定被拒绝");
  await expect(page.locator("[data-roll]")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a rendering failure with unavailable storage still exports the committed match and offers explicit discard", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException("denied", "SecurityError"); };
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return kind.startsWith("webgl") ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-launch]").click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText("3D 画面不可用");
  await expect(page.locator("[data-unsaved-discard]")).toBeEnabled();
  const downloading = page.waitForEvent("download");
  await page.locator("[data-save-export]").click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error("Missing real exported file");
  const exported = readSave(JSON.parse(await readFile(path, "utf8")));
  expect(exported.snapshot.revision).toBe(0);
  expect(exported.snapshot.players.map((player) => player.cash)).toEqual([1500, 1500]);
  await page.locator("[data-unsaved-discard]").click();
  await expect(page.locator("[data-start]")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
