import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { makeSave } from "../../src/storage/snapshot";
import { MATCH_RECORD_LIMIT, matchSummary } from "../../src/domain/records";
import { CHALLENGE_DAYS } from "../../src/domain/challenges";
import { RecordsPanel, summaryText } from "../../src/ui/RecordsPanel";
import { formatMessage, messages } from "../../src/i18n";
import { finishMatch } from "../fixtures/record-match";
import { GameSession } from "../../src/app/GameSession";
import { SavePanel } from "../../src/ui/SavePanel";

afterEach(() => vi.unstubAllGlobals());

it.each(["zh-CN", "en"] as const)("%s records UI reads the actual transaction and renders without writes; share text excludes private names", async (language) => {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const config = createMatchConfig(); const privateName = "Private-name";
  const game = new Game({ ...config, players: config.players.map((player) => ({ ...player, name: privateName })) });
  const initial = await store.save(makeSave(game.snapshot, crypto.randomUUID()), null);
  const earned = finishMatch(game); await store.save(makeSave(game.snapshot, initial.matchId), initial, { earned });
  const app = new GameApp(store);
  try {
    await app.refreshProfile(); app.setPreferences({ ...app.getSnapshot().preferences, language });
    const before = await store.readRawProfile(); const state = app.getSnapshot();
    const html = renderToStaticMarkup(<RecordsPanel app={app} onClose={() => {}} />);
    const copy = messages(language);
    expect(html).toContain(formatMessage(copy.records.recent, { limit: MATCH_RECORD_LIMIT }));
    expect(html).toContain(formatMessage(copy.records.challengeHistory, { days: CHALLENGE_DAYS }));
    expect(html).toContain(copy.records.achievementNames["first-match"]); expect(html).toContain(copy.records.unlocked);
    expect(html).toContain(copy.records.clear); expect(html).toContain(copy.results.statistics.purchases);
    expect(html).not.toContain(copy.records.empty + "</p><details");
    expect(html).not.toContain(privateName); expect(html.match(/<dialog/g)).toHaveLength(1);
    const text = summaryText(matchSummary(game.snapshot, initial.matchId, "free", 100), language);
    expect(text).toContain(config.rulesVersion); expect(text).toContain(copy.records.replayWarning);
    expect(text).not.toContain(privateName); expect(text).not.toContain(initial.matchId);
    expect(text).not.toMatch(/"properties"|"random"|"hand"/);
    expect(app.getSnapshot()).toBe(state); expect(await store.readRawProfile()).toEqual(before);
    await store.clearRecords(); await app.refreshProfile();
    expect(renderToStaticMarkup(<RecordsPanel app={app} onClose={() => {}} />)).toContain(copy.records.empty);
    expect((await store.read())!.record.matchId).toBe(initial.matchId);
  } finally { app.dispose(); }
});

it("corrupt records offer a records-only recovery from the actual failed-save UI and retry preserves the accepted command", async () => {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const app = new GameApp(store);
  const game = new Game(createMatchConfig(940)); const session = new GameSession(game, crypto.randomUUID(), { store, expected: null, source: "local" });
  try {
    await session.initializeSave(); session.bind({ sync() {}, stop() {}, async present() {} });
    const request = factory.open("richman3d"); const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const transaction = database.transaction("profile", "readwrite"); transaction.objectStore("profile").put({ keep: "bad-records" }, "records");
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); }); database.close();
    await session.dispatch({ kind: "roll", actor: "p1", expectedRevision: game.snapshot.revision });
    expect(session.getSnapshot().save).toMatchObject({ kind: "unsaved", error: "invalid" });
    const committed = game.snapshot; const copy = messages(app.getSnapshot().preferences.language);
    expect(renderToStaticMarkup(<SavePanel app={app} session={session} onTransfer={() => {}} onRecords={() => {}} />)).toContain(copy.records.title);
    await app.refreshProfile();
    const html = renderToStaticMarkup(<RecordsPanel app={app} onClose={() => {}} />);
    expect(html).toContain(copy.records.error); expect(html).toContain(copy.records.exportRaw); expect(html).not.toContain(copy.records.empty);
    expect((await store.readRawProfile()).records).toEqual({ keep: "bad-records" });
    await store.clearRecords(); await app.refreshProfile(); await session.retrySave();
    expect(session.getSnapshot().save.kind).toBe("saved"); expect(game.snapshot).toBe(committed); expect((await store.read())!.snapshot).toEqual(committed);
  } finally { session.dispose(); app.dispose(); }
});
