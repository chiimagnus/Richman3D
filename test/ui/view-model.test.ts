import { expect, it } from "vitest";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { GameSession } from "../../src/app/GameSession";
import { actionView } from "../../src/ui/viewModel";
import { formatCash, formatMessage } from "../../src/i18n";

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
