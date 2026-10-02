import { expect, test } from "@playwright/test";
import { saved, startLocal, expectHandover } from "./match-actions";

test.use({ headless: false });

test("handover releases actual Pointer Lock without automatically locking the next observer", async ({ page }) => {
  await startLocal(page);
  await page.bringToFront();
  await page.locator("[data-handover-confirm]").click();
  await page.getByRole("button", { name: "环视", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe("CANVAS");
  await page.locator("canvas").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("[data-skip]")).toBeEnabled();
  await page.keyboard.press("n");
  await expectHandover(page, "p2");
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.locator("[data-handover-confirm]").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-observer", "p2");
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
});

test("Esc exits actual mouse lock before it can open Pause", async ({ page }) => {
  await startLocal(page);
  await page.locator("[data-handover-confirm]").click();
  await page.getByRole("button", { name: "环视", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe("CANVAS");
  const before = (await saved(page))!;
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toContainText("固定轮序");
  expect((await saved(page))!.state).toEqual(before.state);
});
