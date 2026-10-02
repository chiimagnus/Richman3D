import { expect, test } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";
import { makeSave } from "../../src/storage/snapshot";
import { saved } from "./match-actions";

test("a validated eliminated-human snapshot can watch real computers, pause without a rule command and leave safely", async ({ page }) => {
  const game = new Game(createMatchConfig(1209, 4));
  for (const kind of ["roll", "skip"] as const) expect(game.apply(legalCommands(game.snapshot, "p1").find((command) => command.kind === kind)!).ok).toBe(true);
  const snapshot = { ...game.snapshot, players: game.snapshot.players.map((player) => player.id === "p1" ? {
    ...player, bankrupt: true, cash: -1, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash + 1 },
  } : player) };
  const record = makeSave(snapshot, "00000000-0000-4000-8000-000000000004", "imported", 1000);
  expect(snapshot.players.filter((player) => !player.bankrupt)).toHaveLength(3);
  await page.goto("./");
  await page.locator("[data-transfer-open]").click();
  await page.locator("[data-save-import]").setInputFiles({ name: "spectator.richman.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(record)) });
  await page.locator("[data-transfer-confirm]").click();
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-spectating]")).toBeVisible();
  await expect(page.locator("[data-roll]")).toBeDisabled();
  await expect.poll(async () => (await saved(page))?.revision).toBeGreaterThan(record.revision);
  await page.locator("[data-pause]").click();
  await expect(page.getByRole("dialog")).toContainText("固定轮序");
  const stopped = (await saved(page))!;
  expect(stopped.state.decision.kind).not.toBe("game_over");
  expect(stopped.state.players[0]!.cash).toBe(-1);
  await page.waitForTimeout(500);
  expect(await saved(page)).toEqual(stopped);
  await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-continue]")).toBeVisible();
  expect(await saved(page)).toEqual(stopped);
});
