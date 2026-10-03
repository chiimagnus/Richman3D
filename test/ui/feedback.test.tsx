import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { FeedbackLayer } from "../../src/ui/FeedbackLayer";
import { Hud } from "../../src/ui/Hud";
import { messages } from "../../src/i18n";
import { eventText } from "../../src/ui/eventText";
import type { GameEvent } from "../../src/domain/types";

vi.mock("../../src/ui/useGameView", () => ({ useGameView: (session: GameSession) => session.getSnapshot() }));

it.each(["zh-CN", "en"] as const)("%s presents the committed dice and preserves visible action shortcuts without changing rules", async (language) => {
  const session = new GameSession(new Game(createMatchConfig(940)));
  session.bind({ sync() {}, stop() {}, present: () => new Promise(() => {}) });
  const renderHud = () => renderToStaticMarkup(<Hud session={session} language={language} onAssets={() => {}} assetPanel={null} />);
  try {
    const roll = renderHud();
    expect(roll).toContain('aria-keyshortcuts="Space"');
    expect(roll).toContain(`<kbd aria-hidden="true">${messages(language).hud.rollKey}</kbd>`);
    const work = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 });
    await vi.waitFor(() => expect(session.getSnapshot().presenting).toBe(true));
    const before = session.getSnapshot();
    const event = before.events.find((entry) => entry.kind === "rolled");
    expect(event?.kind).toBe("rolled");
    if (event?.kind !== "rolled") throw new Error("Missing roll event");
    const dice = renderToStaticMarkup(<FeedbackLayer session={session} language={language} />);
    expect(dice).toContain(`aria-label="${messages(language).hud.recentDiceAria}: ${event.result.dice.join(" + ")}"`);
    for (const value of event.result.dice) expect(dice).toContain(["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value - 1]);
    expect(session.getSnapshot()).toBe(before);
    session.pause();
    await work;
    expect(renderToStaticMarkup(<FeedbackLayer session={session} language={language} />)).not.toContain('role="img"');
    const purchase = renderHud();
    expect(purchase).toContain('aria-keyshortcuts="B"');
    expect(purchase).toContain('aria-keyshortcuts="N"');
    expect(purchase).toContain('<kbd aria-hidden="true">B</kbd>');
    expect(purchase).toContain('<kbd aria-hidden="true">N</kbd>');
    expect(purchase).not.toContain(messages(language).status.insufficientFunds);
    expect(session.getSnapshot().committed).toBe(before.committed);
  } finally { session.dispose(); }
});

it.each(["en", "zh-CN"] as const)("%s replaces only the dice overlay with the real card/extra movement, and ignores late canceled projection", async (language) => {
  const session = new GameSession(new Game(createMatchConfig(14)));
  let show: (event: GameEvent) => void = () => {};
  session.bind({ sync() {}, stop() {}, present: (_events, _signal, _settle, project) => { show = project; return new Promise(() => {}); } });
  try {
    const moving = session.dispatch({ kind: "roll", actor: "p1", expectedRevision: 0 });
    await vi.waitFor(() => expect(session.getSnapshot().presenting).toBe(true));
    const committed = session.getSnapshot().committed;
    const [rolled, card] = session.getSnapshot().events;
    if (rolled?.kind !== "rolled" || card?.kind !== "card_moved") throw new Error("Missing card chain");
    for (const event of [rolled, card]) {
      show(event);
      const html = renderToStaticMarkup(<FeedbackLayer session={session} language={language} />);
      expect(html).toContain(eventText(language, event, committed).replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("'", "&#x27;"));
      expect(html).not.toContain('role="img"');
      expect(session.getSnapshot().committed).toBe(committed);
    }
    session.pause();
    await moving;
    const paused = session.getSnapshot();
    show(card);
    expect(session.getSnapshot()).toBe(paused);
    expect(paused.presentationEvent).toBeNull();
    expect(paused.notice).toBeNull();
  } finally { session.dispose(); }
});
