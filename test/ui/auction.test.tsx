import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { AuctionPanel } from "../../src/ui/AuctionPanel";
import { auctionView } from "../../src/ui/viewModel";
import { messages, formatCash } from "../../src/i18n";
import { eventText } from "../../src/ui/eventText";

it.each(["en", "zh-CN"] as const)("%s renders one native bidding form for the confirmed actor and distinguishes input blocking from affordability", (language) => {
  const config = createMatchConfig(940);
  const game = new Game({ ...config, players: config.players.map((player) => ({ ...player, controller: "human" })) });
  for (const kind of ["roll", "skip"] as const) expect(game.apply({ kind, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  expect(session.handoverActor).toBe("p2");
  expect(auctionView(session.getSnapshot())!.commands).toEqual([]);
  session.confirmHandover("p2");
  const before = game.snapshot;
  const view = session.getSnapshot();
  const model = auctionView(view)!;
  expect(model.commands).toMatchObject([{ kind: "auction_bid", actor: "p2", expectedRevision: before.revision }, { kind: "auction_pass", actor: "p2" }]);
  const submit = vi.fn();
  const html = renderToStaticMarkup(<AuctionPanel model={model} snapshot={before} language={language} onCommand={submit} onPause={() => {}} />);
  expect(html.match(/<dialog/g)).toHaveLength(1);
  expect(html.match(/<form/g)).toHaveLength(1);
  expect(html).toContain('type="number"');
  expect(html).toContain('min="10"');
  expect(html).toContain('step="10"');
  expect(html).toContain('max="1500"');
  expect(html).toContain(formatCash(language, 1490));
  expect(html).toContain(messages(language).auction.passEffect);
  for (const blocked of [{ ...view, mode: "paused" as const }, { ...view, save: { kind: "saving" as const } }, { ...view, presenting: true }, { ...view, viewPlayerId: "p1" as const }]) {
    const blockedModel = auctionView(blocked)!;
    expect(blockedModel.commands).toEqual([]);
    expect(blockedModel.minimum).toBe(10);
    expect(blockedModel.cash).toBe(1500);
  }
  for (const entry of before.history) expect(eventText(language, entry.event, before)).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  expect(game.snapshot).toBe(before);
  session.dispose();
});
