import { expect, test } from "@playwright/test";

test("menu is light, audio unlock is in the click, one context survives match navigation", async ({ page }) => {
  await page.addInitScript(() => {
    const Original = AudioContext;
    const audit = { contexts: 0, activeAtCreate: false, resumes: 0 };
    Object.assign(window, { audioAudit: audit });
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) { super(options); audit.contexts++; audit.activeAtCreate = navigator.userActivation.isActive; }
      override resume() { audit.resumes++; return super.resume(); }
    };
  });
  await page.goto("./");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "audioAudit").contexts)).toBe(0);
  await page.locator("[data-start]").dblclick();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const first = await page.locator("[data-match-id]").getAttribute("data-match-id");
  expect(await page.evaluate(() => Reflect.get(window, "audioAudit"))).toMatchObject({ contexts: 1, activeAtCreate: true });
  await page.locator("[data-pause]").click();
  await expect(page.getByRole("dialog")).toContainText("当前尚未保存");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.locator("[data-pause]").click();
  await page.getByRole("dialog").getByRole("button", { name: "主菜单" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator("[data-start]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  expect(await page.locator("[data-match-id]").getAttribute("data-match-id")).not.toBe(first);
  expect(await page.evaluate(() => Reflect.get(window, "audioAudit").contexts)).toBe(1);
  await page.locator("[data-pause]").click();
  await page.getByRole("dialog").getByRole("button", { name: "再来一局" }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("failed dynamic scene import retries and a cancelled load cannot create a ghost match", async ({ page }) => {
  await page.route("**/assets/SceneHost-*.js", (route) => route.abort());
  await page.goto("./");
  await page.locator("[data-start]").click();
  await expect(page.getByRole("alert")).toContainText("加载失败");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.unroute("**/assets/SceneHost-*.js");
  await page.locator("[data-start]").click();
  await expect(page.locator("[data-start]")).toHaveText("开始游戏");
  await page.locator("[data-start]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.reload();
  let release = () => {};
  let routed = () => {};
  const finished = new Promise<void>((resolve) => { routed = resolve; });
  await page.route("**/assets/SceneHost-*.js", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.continue();
    routed();
  });
  await page.locator("[data-start]").click();
  await expect(page.getByRole("status")).toContainText("载入");
  await page.getByRole("button", { name: "主菜单" }).click();
  release();
  await finished;
  await page.unroute("**/assets/SceneHost-*.js");
  await expect(page.locator("[data-start]")).toBeVisible();
  await page.locator("[data-start]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("audio resume rejection is harmless and sound toggle retries in another user event", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    AudioContext.prototype.resume = function () { Object.assign(window, { resumeCalls: ++calls }); return Promise.reject(new DOMException("denied", "NotAllowedError")); };
  });
  await page.goto("./");
  await page.locator("[data-start]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.locator("[data-settings-open]").click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("checkbox").check();
  expect(await page.evaluate(() => Reflect.get(window, "resumeCalls"))).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "0");
  await expect(page.locator("[data-presenting]")).toHaveAttribute("data-presenting", "true");
});
