import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameSession } from "../../src/app/GameSession";
import { playerAssets } from "../../src/domain/selectors";
import { AssetPanel } from "../../src/ui/AssetPanel";
import { assetManagementView } from "../../src/ui/viewModel";
import { formatCash, formatMessage, messages } from "../../src/i18n";
import { propertyMatch } from "../fixtures/property-match";

it.each(["en", "zh-CN"] as const)("%s projects domain rent/cost/cash and captured commands without acting during render or exposing opponent actions", (language) => {
  const game = propertyMatch();
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const view = session.getSnapshot();
  const management = assetManagementView(view)!;
  const option = management.properties["neon-avenue"]!.upgrade;
  expect(option).toMatchObject({ cost: 90, currentRent: 48, nextRent: 96, remainingCash: 1690, reason: null, command: { kind: "upgrade", propertyId: "neon-avenue", expectedRevision: 40 } });
  expect(management.properties["skyline-road"]).toBeUndefined();
  expect(JSON.stringify(management)).not.toMatch(/random|draws|statistics|history/);
  const assets = game.snapshot.players.map((player) => playerAssets(game.snapshot, player.id));
  const onCommand = vi.fn();
  const html = renderToStaticMarkup(<AssetPanel assets={assets} initialPlayer="p1" language={language} management={management} onCommand={onCommand} onClose={() => {}} />);
  const copy = messages(language).construction;
  expect(html.match(/<button\b/g)).toHaveLength(3);
  expect(html.match(/<select\b/g)).toHaveLength(3);
  for (const label of Object.values(messages(language).liquidity.choices)) expect(html).toContain(label);
  expect(html).toContain(formatMessage(copy.rentChange, { current: formatCash(language, 48), next: formatCash(language, 96) }));
  expect(html).toContain(formatCash(language, 1690));
  expect(html).toContain('name="asset-property"');
  expect(onCommand).not.toHaveBeenCalled();
  expect(game.snapshot).toBe(view.displayed);
  const opponentHtml = renderToStaticMarkup(<AssetPanel assets={assets} initialPlayer="p2" language={language} management={management} onCommand={onCommand} onClose={() => {}} />);
  expect(opponentHtml).not.toContain(copy.cost);
  for (const blocked of [{ ...view, mode: "paused" as const }, { ...view, presenting: true }, { ...view, save: { kind: "saving" as const } }, { ...view, attached: false }]) {
    const blockedOption = assetManagementView(blocked)!.properties["neon-avenue"]!.upgrade;
    expect(blockedOption.reason).toBeNull();
    expect(blockedOption.command).toBeNull();
    for (const option of Object.values(assetManagementView(blocked)!.properties["neon-avenue"]!)) expect(option.command).toBeNull();
  }
  expect(assetManagementView({ ...view, viewPlayerId: null })).toBeNull();
  session.dispose();
});

it.each(["en", "zh-CN"] as const)("%s does not promise a transaction's effects when the domain rejects it", (language) => {
  const game = propertyMatch();
  expect(game.apply({ kind: "mortgage", propertyId: "neon-avenue", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const management = assetManagementView(session.getSnapshot());
  const assets = game.snapshot.players.map((player) => playerAssets(game.snapshot, player.id));
  const html = renderToStaticMarkup(<AssetPanel assets={assets} initialPlayer="p1" language={language} management={management} onCommand={() => {}} onClose={() => {}} />);
  expect(html).toContain(messages(language).construction.reasons.mortgaged);
  expect(html).not.toContain(messages(language).liquidity.remaining);
  expect(html).not.toContain("→");
  session.dispose();
});
