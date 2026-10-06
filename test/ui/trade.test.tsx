import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameSession } from "../../src/app/GameSession";
import { TradeDraft, TradePanel } from "../../src/ui/TradePanel";
import { tradeView } from "../../src/ui/viewModel";
import { formatCash, messages } from "../../src/i18n";
import { propertyMatch } from "../fixtures/property-match";

it.each(["en", "zh-CN"] as const)("%s renders a single draft form and a recipient-only response with both cash/group previews", (language) => {
  const game = propertyMatch();
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const before = game.snapshot;
  const command = vi.fn();
  const draft = renderToStaticMarkup(<TradeDraft snapshot={before} enabled={true} language={language} onCommand={command} onClose={() => {}} />);
  expect(draft.match(/<dialog/g)).toHaveLength(1);
  expect(draft.match(/<form/g)).toHaveLength(1);
  expect(draft).toContain(messages(language).trade.cancel);
  expect(draft).toContain('type="checkbox"');
  expect(game.snapshot).toBe(before);
  expect(command).not.toHaveBeenCalled();
  expect(game.apply({ kind: "trade_propose", actor: "p1", expectedRevision: before.revision, terms: { recipientId: "p2", givePropertyIds: ["neon-avenue"], receivePropertyIds: [], cash: { payerId: "p2", amount: 180 } } }).ok).toBe(true);
  const snapshot = game.snapshot;
  const html = renderToStaticMarkup(<TradePanel snapshot={snapshot} language={language} commands={[]} onCommand={command} onPause={() => {}} />);
  expect(html.match(/<dialog/g)).toHaveLength(1);
  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).not.toContain(messages(language).trade.cancel);
  expect(html).toContain(messages(language).trade.groupsBefore);
  expect(html).toContain(messages(language).trade.groupsAfter);
  expect(html).toContain(formatCash(language, before.players[0]!.cash + 180));
  expect(html).toContain(formatCash(language, before.players[1]!.cash - 180));
  for (const blocked of [{ mode: "paused" as const }, { save: { kind: "saving" as const } }, { presenting: true }, { viewPlayerId: "p1" as const }]) {
    const view = { ...session.getSnapshot(), committed: snapshot, displayed: snapshot, viewPlayerId: "p2" as const, ...blocked };
    expect(tradeView(view).commands).toEqual([]);
    expect(tradeView(view).canPropose).toBe(false);
  }
  session.dispose();
});
