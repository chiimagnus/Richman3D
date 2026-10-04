import { expect, it, vi } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { actionView } from "../../src/ui/viewModel";
import { formatCash, formatMessage, messages, playerName } from "../../src/i18n";
import { QUICK_RULES } from "../../src/domain/rules";
import { propertyMatch } from "../fixtures/property-match";

it.each(["en", "zh-CN"] as const)("%s reports an already committed upgrade as presentation, not a pawn movement or a new actionable turn", async (language) => {
  const game = propertyMatch(); const before = game.snapshot; const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, present: () => new Promise(() => {}) });
  try {
    const work = session.dispatch({ actor: "p1", kind: "upgrade", propertyId: "neon-avenue", expectedRevision: before.revision });
    await vi.waitFor(() => expect(session.getSnapshot().presenting).toBe(true));
    const view = session.getSnapshot(); const model = actionView(view, language);
    expect(model.status).toBe(formatMessage(messages(language).runtime.presenting, { actor: playerName(language, "p1", before.config) }));
    expect(model.status).not.toMatch(/moving|移动/);
    expect(model.commands).toEqual([]);
    expect(view.committed.properties["neon-avenue"]!.level).toBe(1);
    expect(view.displayed.properties["neon-avenue"]!.level).toBe(0);
    expect(view.committed.players.map((player) => player.position)).toEqual(before.players.map((player) => player.position));
    session.pause(); await work;
    expect(game.snapshot.players[0]!.cash).toBe(before.players[0]!.cash - 90);
    expect(game.snapshot.random).toEqual(before.random);
  } finally { session.dispose(); }
});

it("does not offer commands without a scene or while paused and reprojects language", () => {
  const session = new GameSession(new Game(createMatchConfig(940)));
  expect(actionView(session.getSnapshot(), "en").commands).toEqual([]);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const before = session.getSnapshot();
  expect(actionView(before, "en").commands[0]?.expectedRevision).toBe(0);
  expect(actionView(before, "zh-CN").status).not.toEqual(actionView(before, "en").status);
  expect(session.getSnapshot()).toBe(before);
  session.pause();
  expect(actionView(session.getSnapshot(), "en").commands).toEqual([]);
});

it("formats zero and names as text, not as fallback values", () => {
  expect(formatCash("en", 0)).toBe("¥0");
  expect(formatMessage("{name}: {cash}", { name: "<script>&中文", cash: 0 })).toBe("<script>&中文: 0");
});

it("projects only the confirmed decision actor, never the ordinary-turn identity alone", () => {
  const base = createMatchConfig(940);
  const session = new GameSession(new Game({ ...base, players: base.players.map((player) => ({ ...player, controller: "human" })) }));
  session.bind({ sync() {}, stop() {}, async present() {} });
  expect(actionView(session.getSnapshot(), "en").commands).toEqual([]);
  session.confirmHandover("p1");
  const view = session.getSnapshot();
  expect(actionView(view, "en").commands).toMatchObject([{ actor: "p1", kind: "roll" }]);
  expect(actionView({ ...view, viewPlayerId: "p2" }, "en").commands).toEqual([]);
});

it.each([50, 180, 1500])("projects affordability independently of input availability with %i cash", (cash) => {
  const game = new Game(createMatchConfig(940), { ...QUICK_RULES, startingCash: cash });
  expect(game.apply({ kind: "roll", actor: "p1", expectedRevision: 0 }).ok).toBe(true);
  const session = new GameSession(game);
  try {
    const view = session.getSnapshot();
    expect(view.displayed.decision.kind).toBe("awaiting_purchase");
    for (const blocked of [view, { ...view, mode: "paused" as const }, { ...view, save: { kind: "saving" as const } }, { ...view, viewPlayerId: "p2" as const }]) {
      const model = actionView(blocked, "en");
      expect(model.commands).toEqual([]);
      expect(model.insufficientFunds).toBe(cash < 180);
    }
  } finally { session.dispose(); }
});
