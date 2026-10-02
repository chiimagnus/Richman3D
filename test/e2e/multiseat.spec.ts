import { expect, test } from "@playwright/test";
import { Game } from "../../src/domain/game";
import { chooseBotCommand } from "../../src/domain/bot";
import { legalCommands } from "../../src/domain/selectors";
import { saved } from "./match-actions";

for (const size of [3, 4]) test(`${size}-seat fixture projects every actual pawn and restores the same purchase after refresh`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByLabel("Fixture seats").selectOption(String(size));
  await page.getByRole("button", { name: "Start fixture", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  await expect(page.locator("[data-player]")).toHaveCount(size);
  const initial = (await saved(page))!;
  await page.locator("[data-roll]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  const pending = (await saved(page))!;
  expect(pending.state.decision.kind).toBe("awaiting_purchase");
  await page.reload();
  await page.locator("[data-continue]").click();
  await expect(page.locator("[data-buy]")).toBeEnabled();
  expect(await saved(page)).toEqual(pending);
  const expected = Game.restore(pending.state);
  expect(expected.apply(legalCommands(expected.snapshot, "p1").find((command) => command.kind === "buy")!).ok).toBe(true);
  for (let count = 0; count < 10; count += 1) {
    const command = chooseBotCommand(expected.snapshot);
    if (!command) break;
    expect(expected.apply(command).ok).toBe(true);
  }
  await page.locator("[data-buy]").click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const { rules: _rules, map: _map, ...state } = expected.snapshot;
  expect((await saved(page))!.state).toEqual(state);
  expect(state.owners["neon-avenue"]).toBe("p1");
  expect(state.players[0]!.statistics.rentReceived).toBeGreaterThan(0);
  await page.locator("[data-pause]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.length).toBe(size);
  const projection = JSON.parse(await page.locator("#stats").innerText());
  expect(projection.state).toEqual(expected.snapshot);
  for (const [index, player] of state.players.entries()) {
    const point = expected.snapshot.map.path[player.position]!;
    expect(projection.pawns[index]).toMatchObject({ id: player.id, position: [point.x + (index % 2 === 0 ? -0.72 : 0.72), 0.18, point.z + (index < 2 ? -0.72 : 0.72)] });
  }
  expect((await saved(page))!.matchId).toBe(initial.matchId);
  await page.getByRole("dialog").getByRole("button", { name: "主菜单", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).activeWorlds).toBe(0);
});

test("four-seat fixture gives the second human input authority without treating the first pawn as local", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4318/Richman3D/test/fixtures/lifecycle.html");
  await page.getByLabel("Fixture seats").selectOption("4");
  await page.getByLabel("Fixture human").selectOption("1");
  await page.getByRole("button", { name: "Start fixture", exact: true }).click();
  await expect(page.locator("[data-roll]")).toBeEnabled();
  const current = (await saved(page))!;
  expect(current.state.activePlayerId).toBe("p2");
  expect(current.state.owners["neon-avenue"]).toBe("p1");
  await expect(page.locator('[data-player="p2"] [data-human-cash]')).toHaveText("¥1,500");
  await expect(page.locator('[data-player="p1"] [data-bot-cash]')).toHaveText("¥1,320");
  await page.locator("[data-pause]").click();
  await expect.poll(async () => JSON.parse(await page.locator("#stats").innerText()).pawns?.filter((pawn: { visible: boolean }) => !pawn.visible).map((pawn: { id: string }) => pawn.id)).toEqual(["p2"]);
  expect((await saved(page))!.state).toEqual(current.state);
});
