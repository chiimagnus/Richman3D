import { expect, test } from "@playwright/test";

test("view remount neither reannounces nor revives an expired settlement", async ({ page }) => {
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByRole("button", { name: "Start fixture" }).click();
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-announcement]")).toContainText("支付费用 80");
  await page.getByRole("button", { name: "Unmount view" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Bind view" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("[data-announcement]")).toBeEmpty();
  await expect(page.locator("[data-feedback-event]")).toHaveCount(0, { timeout: 3000 });
  await page.getByRole("button", { name: "Unmount view" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Bind view" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("[data-feedback-event]")).toHaveCount(0);
  await expect(page.locator("[data-announcement]")).toBeEmpty();
});

test("20 actual scene/session entries release canvas, global listeners, audio and GPU resources", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  const trend: unknown[] = [];
  for (let index = 0; index < 20; index += 1) {
    await page.getByRole("button", { name: "Start fixture" }).click();
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText() || "{}").world?.canvases).toBe(1);
    trend.push(JSON.parse(await page.locator("#stats").innerText()));
    expect(JSON.parse(await page.locator("#stats").innerText()).activeWorlds).toBe(1);
    expect(JSON.parse(await page.locator("#stats").innerText()).revision).toBe(0);
    await page.locator("[data-roll]").click();
    await page.getByRole("button", { name: "Dispose fixture" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).world.canvases).toBe(0);
    const released = JSON.parse(await page.locator("#stats").innerText());
    expect(released.listeners).toBe(0);
    expect(released.audioNodes).toBe(0);
    expect(released.world.activeAnimations).toBe(0);
    expect(released.world.disposed).toBe(true);
    expect(released.world.geometries).toBe(0);
    expect(released.world.textures).toBe(0);
    expect(released.activeWorlds).toBe(0);
    trend.push(released);
  }
  expect(errors).toEqual([]);
  await info.attach("resource-trend", { body: JSON.stringify(trend, null, 2), contentType: "application/json" });
});

test("StrictMode view remount during motion preserves match, committed cash and RNG without replay", async ({ page }) => {
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByRole("button", { name: "Start fixture" }).click();
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-presenting]")).toHaveAttribute("data-presenting", "true");
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,500");
  await page.getByRole("button", { name: "Unmount view" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).activeWorlds).toBe(0);
  const stopped = JSON.parse(await page.locator("#stats").innerText());
  expect(stopped.state.revision).toBe(1);
  expect(stopped.state.players[0].cash).toBe(1420);
  await page.getByRole("button", { name: "Bind view" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).activeWorlds).toBe(1);
  const rebuilt = JSON.parse(await page.locator("#stats").innerText());
  expect(rebuilt.matchId).toBe(stopped.matchId);
  expect(rebuilt.state).toEqual(stopped.state);
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,420");
  await expect(page.locator("[data-roll]")).toBeDisabled();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "3", { timeout: 10_000 });
  await expect(page.locator("[data-roll]")).toBeEnabled();
});
