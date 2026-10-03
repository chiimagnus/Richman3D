import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { FeedbackLayer } from "../../src/ui/FeedbackLayer";
import { Hud } from "../../src/ui/Hud";
import { messages } from "../../src/i18n";

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
