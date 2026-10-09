import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { MainMenu } from "../../src/ui/MainMenu";
import { SettingsPanel } from "../../src/ui/SettingsPanel";
import { messages } from "../../src/i18n";
import { MatchSetup } from "../../src/ui/MatchSetup";
import { BOT_DIFFICULTIES } from "../../src/domain/types";
import { MenuArtwork } from "../../src/ui/MenuArtwork";
import { App } from "../../src/ui/App";
import { createMatchConfig } from "../../src/domain/config";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));

afterEach(() => vi.unstubAllGlobals());

it.each(["zh-CN", "en"] as const)("%s has one settings entry and native controls without changing game state during render", async (language) => {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const app = new GameApp(new GameStore(() => new IDBFactory()));
  try {
    await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("empty"));
    app.setPreferences({ ...app.getSnapshot().preferences, language });
    const state = app.getSnapshot();
    const copy = messages(language);
    const menu = renderToStaticMarkup(<MainMenu app={app} onSettings={() => {}} onStart={() => {}} onChallenge={() => {}} />);
    expect(menu.match(/<button\b/g)).toHaveLength(3);
    expect(menu).toContain(copy.settings.title);
    expect(menu).toContain(copy.menu.eyebrow);
    expect(menu).toContain(copy.menu.tagline);
    expect(menu).toContain('aria-hidden="true" focusable="false"');
    expect(menu).not.toContain("<canvas");
    expect(menu).not.toMatch(/(?:src|href)="https?:/);
    expect(menu).not.toContain("<select");
    expect(menu).not.toContain(copy.storage.transfer.title);
    const setup = renderToStaticMarkup(<MatchSetup app={app} onClose={() => {}} />);
    expect(setup).toContain(copy.ai.choose.replace("{number}", "1"));
    for (const difficulty of BOT_DIFFICULTIES) expect(setup).toContain(copy.ai.difficulties[difficulty]);
    expect(setup).toContain('value="normal" selected=""');
    const changeView = vi.fn();
    const settings = renderToStaticMarkup(<SettingsPanel app={app} preferences={state.preferences} onClose={() => {}} cameraView="overview" onCameraChange={changeView} />);
    expect(settings.match(/<select\b/g)).toHaveLength(4);
    expect(settings.match(/<button\b/g)).toHaveLength(2);
    expect(settings).toContain('value="overview" selected=""');
    expect(settings).toContain('type="checkbox"');
    expect(settings).toContain(copy.settings.presentationSpeed);
    expect(settings).toContain(copy.settings.headBob);
    expect(settings).toContain('value="normal" selected=""');
    expect(settings.match(/type="range"/g)).toHaveLength(2);
    expect(settings).toContain(copy.settings.effectsVolume); expect(settings).toContain(copy.settings.musicVolume);
    expect(settings).toContain(copy.settings.enableAudio); expect(settings).toContain('aria-keyshortcuts="M"');
    expect(settings).toContain('<kbd aria-hidden="true">M</kbd>');
    expect(changeView).not.toHaveBeenCalled();
    const lookAround = vi.fn();
    const cameraSettings = renderToStaticMarkup(<SettingsPanel app={app} preferences={state.preferences} onClose={() => {}} cameraView="first_person" onCameraChange={changeView} onLookAround={lookAround} />);
    expect(cameraSettings).toContain(copy.settings.lookAround);
    expect(cameraSettings.match(/<button\b/g)).toHaveLength(3);
    expect(lookAround).not.toHaveBeenCalled();
    const recenter = vi.fn();
    const overviewSettings = renderToStaticMarkup(<SettingsPanel app={app} preferences={state.preferences} onClose={() => {}} cameraView="overview" onCameraChange={changeView} onRecenter={recenter} />);
    expect(overviewSettings).toContain(copy.settings.recenter);
    expect(cameraSettings).not.toContain(copy.settings.recenter);
    expect(recenter).not.toHaveBeenCalled();
    expect(app.getSnapshot()).toBe(state);
    const unbind = app.subscribe(() => {
      const session = app.getSnapshot().session;
      if (session && !session.getSnapshot().attached) session.bind({ sync() {}, stop() {}, async present() {} });
    });
    await app.start(createMatchConfig(940));
    unbind();
    expect(app.getSnapshot().session).not.toBeNull();
    const before = app.getSnapshot().session!.getSnapshot().committed;
    const game = renderToStaticMarkup(<App app={app} />);
    expect(game).toContain('aria-keyshortcuts="Escape"');
    expect(game).not.toContain(copy.settings.recenter);
    expect(game).not.toContain(copy.settings.title);
    expect(game).not.toContain(copy.setup.firstPerson);
    expect(game).not.toContain(copy.setup.overview);
    expect(game).not.toContain('aria-keyshortcuts="V"');
    expect(app.getSnapshot().session!.getSnapshot().committed).toBe(before);
  } finally { app.dispose(); }
});

it("keeps all decorative SVG references local and unique across simultaneous menu artwork instances", () => {
  const artwork = renderToStaticMarkup(<><MenuArtwork /><MenuArtwork /></>);
  const ids = [...artwork.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(ids).toHaveLength(6);
  expect(new Set(ids).size).toBe(6);
  for (const match of artwork.matchAll(/(?:href="#|url\(#)([^"\)]+)/g)) expect(ids).toContain(match[1]);
  expect(artwork).not.toContain("<button");
  expect(artwork).not.toContain("tabindex");
});
