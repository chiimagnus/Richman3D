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

afterEach(() => vi.unstubAllGlobals());

it.each(["zh-CN", "en"] as const)("%s has one settings entry and native controls without changing game state during render", async (language) => {
  vi.stubGlobal("document", { documentElement: { lang: "" }, addEventListener() {}, removeEventListener() {} });
  const app = new GameApp(new GameStore(() => new IDBFactory()));
  try {
    await vi.waitFor(() => expect(app.getSnapshot().stored.kind).toBe("empty"));
    app.setPreferences({ ...app.getSnapshot().preferences, language });
    const state = app.getSnapshot();
    const copy = messages(language);
    const menu = renderToStaticMarkup(<MainMenu app={app} onSettings={() => {}} onStart={() => {}} />);
    expect(menu.match(/<button\b/g)).toHaveLength(2);
    expect(menu).toContain(copy.settings.title);
    expect(menu).not.toContain("<select");
    expect(menu).not.toContain(copy.storage.transfer.title);
    const setup = renderToStaticMarkup(<MatchSetup app={app} onClose={() => {}} />);
    expect(setup).toContain(copy.ai.choose.replace("{number}", "1"));
    for (const difficulty of BOT_DIFFICULTIES) expect(setup).toContain(copy.ai.difficulties[difficulty]);
    expect(setup).toContain('value="normal" selected=""');
    const changeView = vi.fn();
    const settings = renderToStaticMarkup(<SettingsPanel app={app} preferences={state.preferences} onClose={() => {}} cameraView="overview" onCameraChange={changeView} />);
    expect(settings.match(/<select\b/g)).toHaveLength(4);
    expect(settings.match(/<button\b/g)).toHaveLength(1);
    expect(settings).toContain('value="overview" selected=""');
    expect(settings).toContain('type="checkbox"');
    expect(settings).toContain(copy.settings.presentationSpeed);
    expect(settings).toContain(copy.settings.headBob);
    expect(settings).toContain('value="normal" selected=""');
    expect(changeView).not.toHaveBeenCalled();
    const lookAround = vi.fn();
    const cameraSettings = renderToStaticMarkup(<SettingsPanel app={app} preferences={state.preferences} onClose={() => {}} cameraView="first_person" onCameraChange={changeView} onLookAround={lookAround} />);
    expect(cameraSettings).toContain(copy.settings.lookAround);
    expect(cameraSettings.match(/<button\b/g)).toHaveLength(2);
    expect(lookAround).not.toHaveBeenCalled();
    expect(app.getSnapshot()).toBe(state);
  } finally { app.dispose(); }
});
