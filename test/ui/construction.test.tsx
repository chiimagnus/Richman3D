import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Game } from "../../src/domain/game";
import { makeSave } from "../../src/storage/snapshot";
import { GameSession } from "../../src/app/GameSession";
import { playerAssets } from "../../src/domain/selectors";
import { AssetPanel } from "../../src/ui/AssetPanel";
import { Hud } from "../../src/ui/Hud";
import { actionView, assetManagementView } from "../../src/ui/viewModel";
import { formatCash, formatMessage, messages } from "../../src/i18n";
import { propertyMatch, propertyMatchId, visitOwnedProperty } from "../fixtures/property-match";

vi.mock("../../src/ui/useGameView", () => ({ useGameView: (session: GameSession) => session.getSnapshot() }));

it.each(["en", "zh-CN"] as const)("%s exposes construction only in the current visit's decision with real prices, rents and permission guards", (language) => {
  const game = visitOwnedProperty(propertyMatch(), "neon-avenue");
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const view = session.getSnapshot();
  const model = actionView(view, language);
  expect(model.upgrade).toMatchObject({ cost: 90, currentRent: 48, nextRent: 96, remainingCash: game.snapshot.players[0]!.cash - 90, reason: null });
  expect(model.commands).toMatchObject([{ kind: "upgrade", propertyId: "neon-avenue", expectedRevision: view.displayed.revision }, { kind: "skip" }]);
  const onCommand = vi.fn();
  const html = renderToStaticMarkup(<Hud session={session} language={language} onAssets={onCommand} assetPanel={null} inspectedTileId={null} onInspect={() => {}} />);
  const copy = messages(language).construction;
  expect(html).toContain(formatMessage(copy.upgrade, { cost: formatCash(language, 90) }));
  expect(html).toContain(renderToStaticMarkup(<>{copy.skip}</>));
  expect(html).toContain('aria-keyshortcuts="B"');
  expect(html).toContain('aria-keyshortcuts="N"');
  expect(html).toContain(formatMessage(copy.rentChange, { current: formatCash(language, 48), next: formatCash(language, 96) }));
  expect(html).toContain(formatCash(language, model.upgrade!.remainingCash));
  const management = assetManagementView(view)!;
  expect(Object.keys(management.properties["neon-avenue"]!)).toEqual(["sell_building"]);
  expect(management.properties["skyline-road"]).toBeUndefined();
  expect(JSON.stringify(management)).not.toMatch(/random|draws|statistics|history/);
  const assets = game.snapshot.players.map((player) => playerAssets(game.snapshot, player.id));
  const panel = renderToStaticMarkup(<AssetPanel assets={assets} initialPlayer="p1" language={language} management={management} onCommand={onCommand} onClose={() => {}} />);
  expect(panel).not.toContain('aria-keyshortcuts="B"');
  expect(panel).not.toContain(formatMessage(copy.upgrade, { cost: formatCash(language, 90) }));
  for (const blocked of [{ ...view, mode: "paused" as const }, { ...view, presenting: true }, { ...view, save: { kind: "saving" as const } }, { ...view, attached: false }, { ...view, viewPlayerId: "p2" as const }]) {
    expect(actionView(blocked, language).upgrade!.reason).toBeNull();
    expect(actionView(blocked, language).commands).toEqual([]);
  }
  expect(assetManagementView({ ...view, viewPlayerId: null })).toBeNull();
  expect(onCommand).not.toHaveBeenCalled();
  expect(game.snapshot).toBe(view.displayed);
  session.dispose();
});

it.each(["en", "zh-CN"] as const)("%s explains an unaffordable upgrade without promising its effects or calling a permission block insufficient funds", (language) => {
  const state = makeSave(visitOwnedProperty(propertyMatch(), "neon-avenue").snapshot, propertyMatchId).state;
  const game = Game.restore({ ...state, players: state.players.map((player) => player.id === "p1" ? { ...player, cash: 0, statistics: { ...player.statistics, taxesPaid: player.statistics.taxesPaid + player.cash } } : player) });
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const html = renderToStaticMarkup(<Hud session={session} language={language} onAssets={() => {}} assetPanel={null} inspectedTileId={null} onInspect={() => {}} />);
  expect(html).toContain(messages(language).construction.reasons.insufficient_cash);
  expect(html).not.toContain(messages(language).construction.remaining);
  expect(html).not.toContain("→");
  expect(actionView(session.getSnapshot(), language).commands.map((command) => command.kind)).toEqual(["skip"]);
  session.dispose();
});
