import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands, playerAssets, publicProperty } from "../../src/domain/selectors";
import { netAssets, propertyValue } from "../../src/domain/economy";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PropertyDetails, TileDetails } from "../../src/ui/PropertyDetails";
import { formatCash, messages } from "../../src/i18n";
import { propertyMatch } from "../fixtures/property-match";

it("projects actual purchases and rent through public fields without changing state or leaking rule data", () => {
  const game = new Game(createMatchConfig(940));
  for (const kind of ["roll", "buy", "roll"] as const) {
    expect(game.apply(legalCommands(game.snapshot, game.snapshot.turnPlayerId).find((command) => command.kind === kind)!).ok).toBe(true);
  }
  const before = game.snapshot;
  const owner = playerAssets(before, "p1");
  expect(owner).toMatchObject({ cash: 1352, propertyValue: 180, netAssets: 1532, bankrupt: false, properties: [{ ownerId: "p1", tile: { id: "neon-avenue", price: 180, rent: 32 } }] });
  expect(Object.keys(owner).sort()).toEqual(["bankrupt", "cash", "liquidationValue", "netAssets", "player", "properties", "propertyValue"]);
  expect(Object.keys(owner.player).sort()).toEqual(["color", "controller", "defaultNameKey", "difficulty", "id", "name"]);
  expect(Object.keys(owner.properties[0]!).sort()).toEqual(["bookValue", "constructionCosts", "groupComplete", "level", "liquidationValue", "ownerId", "rent", "tile"]);
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

it.each(["en", "zh-CN"] as const)("%s renders the same actual rent and building sale projection", (language) => {
  const game = new Game(createMatchConfig(940));
  const base = game.snapshot;
  const snapshot = { ...base, properties: { ...base.properties,
    "harbor-walk": { ...base.properties["harbor-walk"]!, ownerId: "p1" as const },
    "neon-avenue": { ...base.properties["neon-avenue"]!, ownerId: "p1" as const },
  } };
  const property = publicProperty(snapshot, "neon-avenue");
  const html = renderToStaticMarkup(createElement(PropertyDetails, { property, players: snapshot.config.players, language }));
  expect(html).toContain(messages(language).assets.rent);
  expect(html).toContain("¥48");
  expect(html).toContain(messages(language).assets.liquidation);
  expect(html).toContain("¥0");
  expect(html).toContain(messages(language).assets.groupBonus);
  expect(html).toContain(messages(language).assets.groupActive);
  property.constructionCosts.push(90);
  property.tile.price = 0;
  expect(snapshot.properties["neon-avenue"]!.constructionCosts).toEqual([]);
  expect(publicProperty(snapshot, "neon-avenue").bookValue).toBe(180);
  expect(game.snapshot).toBe(base);
});

it.each(["en", "zh-CN"] as const)("%s derives group status and an unambiguous owner seat after real upgrade and sale", (language) => {
  const game = propertyMatch();
  for (const kind of ["upgrade", "sell_building"] as const) {
    expect(game.apply({ kind, actor: "p1", propertyId: "neon-avenue", expectedRevision: game.snapshot.revision }).ok).toBe(true);
    for (const id of ["harbor-walk", "neon-avenue"]) {
      const property = publicProperty(game.snapshot, id);
      const html = renderToStaticMarkup(createElement(PropertyDetails, { property, players: game.snapshot.config.players, language }));
      expect(html).toContain(messages(language).assets.groupActive);
      expect(html).toContain(language === "en" ? "Seat 1" : "席位1");
      expect(property.groupComplete).toBe(true);
    }
  }
});

it.each(["en", "zh-CN"] as const)("%s inspects every real board tile using the shared property projection and correct non-property consequences", (language) => {
  const game = propertyMatch();
  const before = game.snapshot;
  for (const tile of before.map.tiles) {
    const html = renderToStaticMarkup(createElement(TileDetails, { snapshot: before, tile, language }));
    if (tile.type === "property") {
      expect(html).toBe(renderToStaticMarkup(createElement(PropertyDetails, { property: publicProperty(before, tile.id), players: before.config.players, language })));
    } else if (tile.type === "chance") expect(html).toContain(messages(language).board.chanceDetail);
    else {
      expect(html).toContain(tile.type === "start" ? messages(language).board.startReward : messages(language).board.fixedFee);
      expect(html).toContain(formatCash(language, tile.type === "start" ? before.rules.passStartBonus : tile.amount));
      expect(html).not.toContain(messages(language).construction.cost);
    }
    expect(html).not.toContain("<button");
    expect(game.snapshot).toBe(before);
  }
});
