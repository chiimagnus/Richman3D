import { expect, test } from "@playwright/test";

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
  await expect(page.getByRole("alert")).toContainText("3D 画面不可用");
  await expect(page.locator("[data-roll]")).toBeDisabled();
  await page.getByRole("alert").getByRole("button", { name: "主菜单" }).click();
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
