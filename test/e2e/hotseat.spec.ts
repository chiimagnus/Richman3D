import { expect, test } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { chooseBotCommand } from "../../src/domain/bot";
import { saved, startLocal, expectHandover } from "./match-actions";

test("two real humans confirm once per change, with blocked shortcuts and actual rent settlement", async ({ page }) => {
  await startLocal(page);
  await expectHandover(page, "p1");
  await expect(page.locator("[data-handover-actor]")).toContainText("Alex<&>");
  await expect(page.locator("[data-handover-confirm]")).toBeFocused();
  const initial = (await saved(page))!;
  await page.getByRole("dialog").focus();
  for (const key of ["Space", "b", "n"]) await page.keyboard.press(key);
  expect((await saved(page))!.state).toEqual(initial.state);
  await page.locator("[data-handover-confirm]").dblclick();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("canvas")).toHaveAttribute("data-observer", "p1");
  expect((await saved(page))!.revision).toBe(0);
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  await expect(page.locator("[data-handover-actor]")).toHaveCount(0);
  await page.locator("[data-buy]").click();
  await expectHandover(page, "p2");
  const beforeConfirm = (await saved(page))!;
  expect(beforeConfirm.state.decision).toEqual({ kind: "awaiting_roll", actorId: "p2" });
  await page.locator("[data-handover-confirm]").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-observer", "p2");
  expect((await saved(page))!.state).toEqual(beforeConfirm.state);
  await page.locator("[data-roll]").click();
  await expectHandover(page, "p1");
  const rent = (await saved(page))!;
  expect(rent.state.players[0]).toMatchObject({ cash: 1352, statistics: { rentReceived: 32 } });
  expect(rent.state.players[1]).toMatchObject({ cash: 1468, statistics: { rentPaid: 32 } });
});

test("refresh and menu continuation require authorization again before showing the saved purchase", async ({ page }) => {
  await startLocal(page);
  await page.locator("[data-handover-confirm]").click();
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  const pending = (await saved(page))!;
  await page.reload();
  await page.locator("[data-continue]").click();
  await expectHandover(page, "p1");
  expect((await saved(page))!.state).toEqual(pending.state);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toContainText("固定轮序");
  await expect(page.locator("[data-handover-confirm],[data-buy]")).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "继续", exact: true }).click();
  await expectHandover(page, "p1");
  await page.locator("[data-handover-confirm]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  expect((await saved(page))!.state).toEqual(pending.state);
  await page.locator("[data-pause]").click();
  await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
  await page.locator("[data-continue]").click();
  await expectHandover(page, "p1");
  expect((await saved(page))!.state).toEqual(pending.state);
});

test("two humans and one computer execute the real computer-first turn without a computer handover", async ({ page }) => {
  await startLocal(page, 3, 48);
  await expectHandover(page, "p1");
  const base = createMatchConfig(48, 3);
  const game = new Game({ ...base, players: base.players.map((player, index) => ({ ...player, controller: index < 2 ? "human" : "bot", name: index === 0 ? "Alex<&>" : index === 1 ? "中文玩家" : null })) });
  expect(game.snapshot.turnPlayerId).toBe("p3");
  for (let count = 0; count < 3; count += 1) {
    const command = chooseBotCommand(game.snapshot);
    if (!command) break;
    expect(game.apply(command).ok).toBe(true);
  }
  expect(game.snapshot.turnPlayerId).toBe("p1");
  expect(game.snapshot.revision).toBeGreaterThan(0);
  const { rules: _rules, map: _map, ...state } = game.snapshot;
  expect((await saved(page))!.state).toEqual(state);
});

test("actual pawn visibility follows local authorization and survives a StrictMode view rebind", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.locator("#human").selectOption("all");
  await page.locator("#start").click();
  await expectHandover(page, "p1");
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.every((pawn: { visible: boolean }) => pawn.visible)).toBe(true);
  await page.locator("[data-handover-confirm]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.filter((pawn: { visible: boolean }) => !pawn.visible).map((pawn: { id: string }) => pawn.id)).toEqual(["p1"]);
  await page.locator("[data-roll]").click();
  await page.locator("[data-skip]").click();
  await expectHandover(page, "p2");
  await page.locator("[data-handover-confirm]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.filter((pawn: { visible: boolean }) => !pawn.visible).map((pawn: { id: string }) => pawn.id)).toEqual(["p2"]);
  const before = (await saved(page))!;
  await page.locator("#unmount").click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator("#bind").click();
  await expect(page.locator("[data-handover-confirm]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-observer", "p2");
  expect((await saved(page))!.state).toEqual(before.state);
});

test("four local humans can each finish a real turn on a narrow screen without a duplicate handover", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await startLocal(page, 4, 940, 4);
  for (const actor of ["p3", "p4", "p1", "p2"]) {
    await expectHandover(page, actor);
    await expect(page.locator("[data-handover-confirm]")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("[data-handover-confirm]").click();
    await page.locator("[data-roll]").click();
    await expect.poll(() => page.locator("[data-skip]:enabled,[data-handover-confirm]").count()).toBeGreaterThan(0);
    if (await page.locator("[data-skip]").count()) await page.locator("[data-skip]").click();
  }
  await expectHandover(page, "p3");
  expect((await saved(page))!.state.completedRounds).toBe(1);
});

test("duplicate local names and colors retain distinct seat labels", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint32Array) => { array.fill(940); return array; } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.locator("[data-start]").click();
  await page.locator("[data-humans]").selectOption("2");
  for (const actor of ["p1", "p2"]) await page.locator(`[data-name="${actor}"]`).fill("同名玩家");
  await page.getByText("更多选项", { exact: true }).click();
  await page.locator('[data-color="1"]').selectOption(await page.locator('[data-color="0"]').inputValue());
  await page.locator("[data-launch]").click();
  await expectHandover(page, "p1");
  await expect(page.locator("[data-handover-actor]")).toContainText("席位1");
  await page.locator("[data-handover-confirm]").click();
  await page.locator("[data-roll]").click();
  await page.locator("[data-skip]").click();
  await expectHandover(page, "p2");
  await expect(page.locator("[data-handover-actor]")).toContainText("席位2");
});
