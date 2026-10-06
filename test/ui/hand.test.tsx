import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameSession } from "../../src/app/GameSession";
import { legalCommands } from "../../src/domain/selectors";
import { cardType, CONTROLLED_TOTALS, HAND_LIMIT } from "../../src/domain/cards";
import { HandPanel } from "../../src/ui/HandPanel";
import { FeedbackLayer } from "../../src/ui/FeedbackLayer";
import { handCommands } from "../../src/ui/viewModel";
import { chanceCardText, formatMessage, messages } from "../../src/i18n";
import { fullHandCheckpoint, itemCheckpoint } from "../fixtures/items";
import type { GameEvent } from "../../src/domain/types";

vi.mock("../../src/ui/useGameView", () => ({ useGameView: (session: GameSession) => session.getSnapshot() }));

it.each(["en", "zh-CN"] as const)("%s renders one selected detail/action and blocks commands during save, presentation, pause and local handover", (language) => {
  const game = itemCheckpoint("controlled-dice");
  const before = game.snapshot;
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const onCommand = vi.fn();
  const html = renderToStaticMarkup(<HandPanel snapshot={before} actor="p1" commands={handCommands(session.getSnapshot())} language={language} onCommand={onCommand} onClose={() => {}} />);
  expect(html.match(/<dialog\b/g)).toHaveLength(1);
  expect(html.match(/<select\b/g)).toHaveLength(1);
  expect(html.match(/<option\b/g)).toHaveLength(before.players[0]!.hand.length);
  expect(html.match(/<button\b/g)).toHaveLength(2);
  expect(html).toContain(messages(language).items.use);
  const first = cardType(before.players[0]!.hand[0]!);
  expect(html).toContain(chanceCardText(language, first, 0, 0, first === "tax-discount" ? before.rules.taxDiscountPercent : before.rules.constructionDiscountPercent));
  for (const blocked of [{ mode: "paused" as const }, { presenting: true }, { save: { kind: "saving" as const } }, { viewPlayerId: null }, { attached: false }]) expect(handCommands({ ...session.getSnapshot(), ...blocked })).toEqual([]);
  expect(onCommand).not.toHaveBeenCalled();
  expect(game.snapshot).toBe(before);
  session.dispose();
});

it.each(["en", "zh-CN"] as const)("%s a full hand has one four-option discard surface with no second use action", (language) => {
  const game = fullHandCheckpoint();
  const before = game.snapshot;
  const html = renderToStaticMarkup(<HandPanel snapshot={before} actor="p1" commands={legalCommands(before, "p1")} language={language} onCommand={() => {}} onClose={() => {}} />);
  expect(html.match(/<option\b/g)).toHaveLength(4);
  expect(html.match(/<dialog\b/g)).toHaveLength(1);
  expect(html).toContain(formatMessage(messages(language).items.discardReason, { limit: HAND_LIMIT, next: HAND_LIMIT + 1 }));
  expect(html).toContain(messages(language).items.discard);
  expect(html).toContain(messages(language).items.newItem);
  expect(html).not.toContain(messages(language).items.use);
  expect(game.snapshot).toBe(before);
});

it.each(["p1", "p2"] as const)("reveals a drawn item only to its local owner, not the observer of %s", (viewer) => {
  const game = fullHandCheckpoint();
  const session = new GameSession(game);
  const event = game.snapshot.history.at(-1)!.event;
  if (event.kind !== "rolled") throw new Error("Missing actual item receipt");
  const snapshot = session.getSnapshot();
  vi.spyOn(session, "getSnapshot").mockReturnValue({ ...snapshot, viewPlayerId: viewer, displayed: itemCheckpoint("controlled-dice").snapshot, presenting: true, presentationEvent: event as GameEvent });
  const html = renderToStaticMarkup(<FeedbackLayer session={session} language="en" />);
  const id = game.snapshot.players[0]!.hand.at(-1)!;
  const description = chanceCardText("en", cardType(id), 0, 0, 0, CONTROLLED_TOTALS);
  if (viewer === "p1") expect(html).toContain(description);
  else expect(html).not.toContain(description);
  session.dispose();
});
