import { expect, test } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { legalCommands } from "../../src/domain/selectors";
import { chooseBotCommand } from "../../src/domain/bot";
import { finishMatch, saved, startMatch as start } from "./match-actions";
import { readFile } from "node:fs/promises";

test("real initial and purchase saves survive refresh, preserving state and the next actual random result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, 940);
  const initial = (await saved(page))!;
  expect(initial.revision).toBe(0);
  const matchId = await page.locator("[data-match-id]").getAttribute("data-match-id");
  expect(initial.matchId).toBe(matchId);
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  const pending = (await saved(page))!;
  expect(pending.state.decision).toEqual({ kind: "awaiting_purchase", actorId: "p1", propertyId: "neon-avenue" });
  expect((await saved(page, "backup"))?.state).toEqual(initial.state);
  await page.reload();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", matchId!);
  expect((await saved(page))!).toEqual(pending);
  await page.locator("[data-buy]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const afterBuy = (await saved(page))!;
  expect(afterBuy.state.owners).toEqual({ "neon-avenue": "p1" });
  expect(afterBuy.state.players[0]?.cash).toBe(1352);
  const expected = Game.restore(afterBuy.state);
  expected.apply(legalCommands(expected.snapshot, "p1")[0]!);
  await page.reload();
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await page.locator("[data-roll]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBeGreaterThan(afterBuy.revision);
  const rolled = (await saved(page))!;
  expect(rolled.state.lastRoll).toEqual(expected.snapshot.lastRoll);
  expect(rolled.state.players[0]?.position).toBe(expected.snapshot.players[0]?.position);
  expect(rolled.state.players[0]?.cash).toBe(expected.snapshot.players[0]?.cash);
});

test("refresh during real dice presentation resumes the committed landing, not its payment or RNG", async ({ page }) => {
  await start(page, 6);
  await page.locator("[data-roll]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBe(1);
  await expect(page.locator("[data-presenting]")).toHaveAttribute("data-presenting", "true");
  const mid = (await saved(page))!;
  expect(mid.state.players[0]?.cash).toBe(1420);
  const expected = Game.restore(mid.state);
  for (let count = 0; count < 4; count += 1) {
    const command = chooseBotCommand(expected.snapshot);
    if (!command) break;
    expected.apply(command);
  }
  await page.reload();
  await expect(page.locator("[data-continue]")).toBeVisible();
  expect((await saved(page))!).toEqual(mid);
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-human-cash]")).toHaveText("¥1,420");
  await expect(page.locator("[data-roll]")).toBeEnabled({ timeout: 15_000 });
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect((await saved(page))?.state).toEqual(state);
});

test("real storage refusal requires explicit unsaved play and then retries the latest state without another rule action", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.assign(window, { denyStorage: false });
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      if (Reflect.get(window, "denyStorage")) throw new DOMException("denied", "SecurityError");
      return original.apply(this, args);
    };
  });
  await start(page, 940);
  const initial = (await saved(page))!;
  const expected = Game.restore(initial.state);
  await page.evaluate(() => Reflect.set(window, "denyStorage", true));
  await page.locator("[data-roll]").click();
  expected.apply(legalCommands(expected.snapshot, "p1")[0]!);
  await expect(page.getByRole("dialog")).toContainText("尚未保存");
  const firstDownload = page.waitForEvent("download");
  await page.locator("[data-save-export]").click();
  const exported = await firstDownload;
  expect(exported.suggestedFilename()).toMatch(/\.richman\.json$/);
  const failedRecord = JSON.parse(await readFile((await exported.path())!, "utf8"));
  const { rules: _initialRules, map: _initialMap, ...failedState } = expected.snapshot;
  expect(failedRecord.state).toEqual(failedState);
  await page.locator("[data-unsaved-continue]").click();
  for (let commandCount = 0; commandCount < 3; commandCount += 1) {
    await expect.poll(() => page.locator("[data-roll]:enabled,[data-skip]:enabled").count()).toBeGreaterThan(0);
    const command = legalCommands(expected.snapshot, "p1").at(-1)!;
    expected.apply(command);
    await page.locator(command.kind === "skip" ? "[data-skip]" : "[data-roll]").click();
    for (let count = 0; count < 4; count += 1) {
      const computer = chooseBotCommand(expected.snapshot);
      if (!computer) break;
      expected.apply(computer);
    }
    await expect.poll(() => page.locator("[data-roll]:enabled,[data-skip]:enabled").count()).toBeGreaterThan(0);
  }
  await expect(page.locator("[data-save-status]")).toBeVisible();
  await expect.poll(async () => Number(await page.locator("[data-revision]").getAttribute("data-revision"))).toBeGreaterThan(0);
  await page.locator("[data-pause]").click();
  const before = await page.locator("[data-revision]").getAttribute("data-revision");
  const cash = await page.locator("[data-human-cash]").innerText();
  await page.evaluate(() => Reflect.set(window, "denyStorage", false));
  expect((await saved(page))!).toEqual(initial);
  await page.locator("[data-save-retry]").click();
  await expect.poll(async () => (await saved(page))?.revision).toBe(Number(before));
  await expect(page.locator("[data-human-cash]")).toHaveText(cash);
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", before!);
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect((await saved(page))!.state).toEqual(state);
  expect((await saved(page, "backup"))!).toEqual(initial);
});

test("saved terminal results survive refresh and leaving without creating another rule turn", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, 940);
  await finishMatch(page);
  const terminal = (await saved(page))!;
  expect(terminal.state.decision.kind).toBe("game_over");
  await page.reload();
  await expect(page.locator("[data-continue]")).toHaveText("查看已保存结算");
  await page.locator("[data-continue]").click();
  await expect(page.getByRole("dialog")).toContainText("已完成整轮上限");
  await expect(page.locator("[data-roll]")).toHaveCount(0);
  expect((await saved(page))!).toEqual(terminal);
  await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await saved(page))!).toEqual(terminal);
});

test("a different browser storage context has no continuation from the first context", async ({ page, browser }) => {
  await start(page, 940);
  expect((await saved(page))!.revision).toBe(0);
  const other = await browser.newContext();
  try {
    const separate = await other.newPage();
    await separate.goto("http://127.0.0.1:4317/Richman3D/");
    await expect(separate.locator("[data-start]")).toBeVisible();
    await expect(separate.locator("[data-continue]")).toHaveCount(0);
    expect(await saved(separate)).toBeUndefined();
  } finally { await other.close(); }
});

test("a real browser pending old save and leave cannot cancel the new match or overwrite its current key", async ({ page }) => {
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByRole("button", { name: "Start fixture", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const initial = (await saved(page))!;
  await page.getByRole("button", { name: "Hold next save", exact: true }).click();
  await page.locator("[data-roll]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).save?.kind).toBe("saving");
  await page.getByRole("button", { name: "Dispose fixture", exact: true }).click();
  await page.keyboard.press("F8");
  await page.keyboard.press("F10");
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const current = (await saved(page))!;
  expect(current.matchId).not.toBe(initial.matchId);
  expect(current.revision).toBe(0);
  expect(current.state.players.map((player) => player.cash)).toEqual([1500, 1500]);
  expect((await saved(page, "backup"))!).toMatchObject({ matchId: initial.matchId, revision: 1 });
  await expect(page.locator("[data-match-id]")).toHaveAttribute("data-match-id", current.matchId);
  await expect(page.locator("canvas")).toHaveCount(1);
});
