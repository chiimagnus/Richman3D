import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { ResultsScreen } from "../../src/ui/ResultsScreen";
import { formatCash, formatMessage, messages, playerName, resultTitle } from "../../src/i18n";
import { makeSave, readSave } from "../../src/storage/snapshot";
import { builtRentDebtMatch } from "../fixtures/debt-match";
import { propertyMatchId } from "../fixtures/property-match";

afterEach(() => vi.unstubAllGlobals());

it.each(["en", "zh-CN"] as const)("%s projects the real winner, eliminated observer and actual losses without replaying settlement", (language) => {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory();
  const app = new GameApp(new GameStore(() => factory));
  app.setPreferences({ ...app.getSnapshot().preferences, language });
  const game = builtRentDebtMatch(2);
  expect(renderToStaticMarkup(<ResultsScreen app={app} snapshot={game.snapshot} onHistory={() => {}} />)).toBe("");
  for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(game.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  expect(game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const snapshot = game.snapshot;
  if (snapshot.decision.kind !== "game_over") throw new Error("Expected terminal snapshot");
  const html = renderToStaticMarkup(<ResultsScreen app={app} snapshot={snapshot} onHistory={() => {}} />);
  const copy = messages(language);
  expect(html.match(/<dialog/g)).toHaveLength(1);
  expect(html).toContain(resultTitle(language, snapshot.decision.result, snapshot.config));
  expect(html).toContain(copy.setup.last_survivor);
  expect(html).toContain(formatMessage(copy.results.yourResult, { rank: 2, assets: formatCash(language, 0) }));
  expect(html.indexOf(playerName(language, "p2", snapshot.config))).toBeLessThan(html.indexOf(playerName(language, "p1", snapshot.config)));
  for (const field of ["constructionSoldCost", "constructionRefunds", "debtWrittenOff", "rentLost"] as const) expect(html).toContain(copy.results.statistics[field]);
  expect(html).toContain(formatCash(language, 406));
  const restored = readSave(makeSave(snapshot, propertyMatchId)).snapshot;
  expect(renderToStaticMarkup(<ResultsScreen app={app} snapshot={restored} onHistory={() => {}} />)).toBe(html);
  expect(game.snapshot).toBe(snapshot);
  app.dispose();
});
