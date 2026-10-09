import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { ChallengePanel } from "../../src/ui/ChallengePanel";
import { Game } from "../../src/domain/game";
import { challengeConfig, dailyChallenge } from "../../src/domain/challenges";
import { makeSave } from "../../src/storage/snapshot";
import { messages } from "../../src/i18n";

afterEach(() => vi.unstubAllGlobals());

it.each(["zh-CN", "en"] as const)("%s challenge UI reads committed attempts and requires an explicit saved-game replacement without writing during render", async (language) => {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const factory = new IDBFactory(); const store = new GameStore(() => factory); const challenge = dailyChallenge("2026-10-09");
  await store.save(makeSave(new Game(challengeConfig(challenge)).snapshot, crypto.randomUUID()), null, { challenge });
  const app = new GameApp(store);
  try {
    await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("valid")); await app.refreshProfile();
    app.setPreferences({ ...app.getSnapshot().preferences, language });
    const before = await store.readRaw(); const state = app.getSnapshot();
    const html = renderToStaticMarkup(<ChallengePanel app={app} challenge={challenge} onClose={() => {}} onRecover={() => {}} />);
    const copy = messages(language);
    expect(html).toContain(copy.challenges.replaceStart);
    expect(html).toContain(copy.challenges.localOnly);
    expect(html).toContain(challenge.date); expect(html).toContain(String(challenge.seed));
    expect(html).toContain(copy.challenges.attempts.replace("{attempts}", "1"));
    expect(app.getSnapshot()).toBe(state); expect(await store.readRaw()).toEqual(before);
  } finally { app.dispose(); }
});
