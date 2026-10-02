import { expect, test } from "@playwright/test";

for (const entry of ["http://127.0.0.1:4317/Richman3D/", "http://127.0.0.1:4318/Richman3D/"]) {
  test(`real settings, focus and keyboard interaction: ${entry}`, async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
    await page.goto(entry);
    await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
    await expect(page.locator("[data-roll]")).toBeEnabled();
    const matchId = await page.locator("[data-match-id]").getAttribute("data-match-id");
    await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "0");
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.locator("[data-settings-open]").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("auto");
    const sound = dialog.getByRole("checkbox");
    await sound.uncheck();
    await expect(sound).not.toBeChecked();
    await dialog.getByRole("button", { name: "高", exact: true }).click();
    await dialog.getByRole("button", { name: "English", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "High", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("heading")).toHaveText("Settings");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-settings-open]")).toBeFocused();
    await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", matchId!);
    await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "0");
    await page.locator("canvas").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("[data-presenting]")).toHaveAttribute("data-presenting", "true");
    await expect(page.locator("[data-roll]")).toBeDisabled();
    await expect(page.locator("[data-human-cash]")).toHaveText("¥1,500");
  });
}

test("normal settlement shows its cause before the bot and changes language without restarting expiry", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(6); return array; } });
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,420");
  await expect(page.locator("[data-feedback-event]")).toContainText("支付费用 80");
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "1");
  await expect(page.locator("[data-roll]")).toBeDisabled();
  await expect(page.locator("[data-feedback-dice]")).toHaveCount(0);
  await page.locator("[data-settings-open]").click();
  await page.getByRole("dialog").getByRole("button", { name: "English" }).click();
  await expect(page.locator("[data-feedback-event]")).toContainText("paid ¥80");
  await expect(page.locator("[data-announcement]")).toBeEmpty();
  await expect(page.locator("[data-feedback-event]")).toHaveCount(0, { timeout: 3000 });
});
