import { expect, test } from "@playwright/test";

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
    await page.locator("[data-roll]").click();
    await page.getByRole("button", { name: "Dispose fixture" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    const released = JSON.parse(await page.locator("#stats").innerText());
    expect(released.listeners).toBe(0);
    expect(released.audioNodes).toBe(0);
    expect(released.world.activeAnimations).toBe(0);
    expect(released.world.disposed).toBe(true);
    trend.push(released);
  }
  expect(errors).toEqual([]);
  await info.attach("resource-trend", { body: JSON.stringify(trend, null, 2), contentType: "application/json" });
});
