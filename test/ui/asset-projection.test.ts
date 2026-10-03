import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands, netAssets, playerAssets, propertyValue, publicProperty } from "../../src/domain/selectors";

it("projects actual purchases and rent through public fields without changing state or leaking rule data", () => {
  const game = new Game(createMatchConfig(940));
  for (const kind of ["roll", "buy", "roll"] as const) {
    expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((command) => command.kind === kind)!).ok).toBe(true);
  }
  const before = game.snapshot;
  const owner = playerAssets(before, "p1");
  expect(owner).toMatchObject({ cash: 1352, propertyValue: 180, netAssets: 1532, bankrupt: false, properties: [{ ownerId: "p1", tile: { id: "neon-avenue", price: 180, rent: 32 } }] });
  expect(Object.keys(owner).sort()).toEqual(["bankrupt", "cash", "netAssets", "player", "properties", "propertyValue"]);
  expect(Object.keys(owner.player).sort()).toEqual(["color", "controller", "defaultNameKey", "id", "name"]);
  expect(Object.keys(owner.properties[0]!).sort()).toEqual(["ownerId", "tile"]);
  for (const id of ["p1", "p2"] as const) {
    const assets = playerAssets(before, id);
    expect(assets.propertyValue).toBe(propertyValue(before, id));
    expect(assets.netAssets).toBe(netAssets(before, id));
    expect(JSON.stringify(assets)).not.toMatch(/random|draws|decision|statistics|history/);
  }
  expect(publicProperty(before, "river-market").ownerId).toBeNull();
  expect(() => publicProperty(before, "city-tax")).toThrow();
  expect(game.snapshot).toBe(before);
  owner.properties[0]!.tile.price = 0;
  expect(propertyValue(game.snapshot, "p1")).toBe(180);
});

it.each([2, 3, 4])("exposes each of %s public seats, not the first-human private projection", (size) => {
  const game = new Game(createMatchConfig(940, size));
  for (const player of game.snapshot.players) {
    expect(playerAssets(game.snapshot, player.id)).toMatchObject({ player: { id: player.id }, cash: 1500, properties: [], netAssets: 1500 });
  }
});
