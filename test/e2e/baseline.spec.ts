import { expect, test } from "@playwright/test";
import { cpus, platform, release } from "node:os";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

test("first screen, cash, board and a real roll reach a legal decision", async ({ page, browser }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const started = Date.now();
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
  await page.goto("./");
  await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
  await expect(page.locator("canvas")).toBeVisible();
  const roll = page.locator("[data-roll]");
  await expect(roll).toBeEnabled();
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,500");
  await expect(page.locator("[data-bot-cash]")).toHaveText("¥1,500");
  const interactiveMs = Date.now() - started;
  await roll.click();
  await expect(page.locator("[data-dice]")).toHaveText(/^[1-6] \+ [1-6]$/);
  await expect.poll(async () =>
    (await roll.isVisible() && await roll.isEnabled()) ||
    (await page.locator("[data-skip]").isVisible() && await page.locator("[data-skip]").isEnabled()),
    { timeout: 20_000 },
  ).toBe(true);
  expect(errors).toEqual([]);

  const assets = await Promise.all((await readdir("dist/assets")).map(async (name) => {
    const data = await readFile(`dist/assets/${name}`);
    return { name, bytes: data.length, gzipBytes: gzipSync(data).length };
  }));
  await info.attach("baseline", {
    body: JSON.stringify({
      os: `${platform()} ${release()}`, cpu: cpus()[0]?.model,
      browser: browser.version(), viewport: page.viewportSize(), interactiveMs,
      assets, measurement: "Local cold page, production preview; not throttled or real-device certification",
      untested: ["settings hit targets", "storage getter rejection", "dynamic language", "resource disposal"],
    }, null, 2),
    contentType: "application/json",
  });
});
