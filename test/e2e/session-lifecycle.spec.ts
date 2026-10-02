import { expect, test } from "@playwright/test";
import { finishMatch } from "./match-actions";

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
  await page.getByRole("button", { name: "继续", exact: true }).click();
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

test("20 complete real 20-round matches return to menu with fresh state and released resources", async ({ page }, info) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } });
    Object.assign(window, { documentMarker: "same-document" });
  });
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  const matchIds = new Set<string>();
  const trend: unknown[] = [];
  const stats = async () => JSON.parse(await page.locator("#stats").innerText() || "{}");
  for (let index = 0; index < 20; index += 1) {
    await page.locator("[data-start]").click();
    await page.locator("[data-launch]").click();
    await expect(page.locator("[data-roll]")).toBeEnabled();
    await expect.poll(async () => (await stats()).revision).toBe(0);
    const fresh = await stats();
    expect(fresh.activeWorlds).toBe(1);
    expect(fresh.state.random.draws).toBe(1);
    expect(fresh.state.owners).toEqual({});
    expect(fresh.state.players.map((player: { cash: number }) => player.cash)).toEqual([1500, 1500]);
    expect(matchIds.has(fresh.matchId)).toBe(false);
    matchIds.add(fresh.matchId);
    trend.push(fresh);
    await finishMatch(page);
    await expect(page.locator("[data-round]")).toHaveText("第20 / 20轮");
    await expect.poll(async () => (await stats()).state?.decision.kind).toBe("game_over");
    const terminal = await stats();
    expect(terminal.state.completedRounds).toBe(20);
    expect(terminal.matchId).toBe(fresh.matchId);
    expect(terminal.state.revision).toBeGreaterThan(40);
    trend.push(terminal);
    await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect.poll(async () => (await stats()).activeWorlds).toBe(0);
    const released = await stats();
    expect(released.listeners).toBe(0);
    expect(released.audioNodes).toBe(0);
    expect(released.world).toMatchObject({ disposed: true, canvases: 0, geometries: 0, textures: 0, activeAnimations: 0 });
    expect(released.state).toBeUndefined();
    trend.push(released);
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => Reflect.get(window, "documentMarker"))).toBe("same-document");
  await info.attach("complete-match-resource-trend", { body: JSON.stringify(trend, null, 2), contentType: "application/json" });
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
