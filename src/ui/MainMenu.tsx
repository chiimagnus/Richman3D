import type { GameApp } from "../app/GameApp";
import { messages } from "../i18n";
import styles from "./App.module.css";

export function MainMenu({ app, onSettings }: { app: GameApp; onSettings: () => void }) {
  const state = app.getSnapshot();
  const copy = messages(state.preferences.language);
  return <main className={styles.menu}>
    <h1>{copy.runtime.title}</h1>
    {state.loading ? <p role="status">{copy.navigation.loading}</p> : <button data-start onClick={() => { if (state.loadFailed) window.location.assign(window.location.href); else void app.start(); }}>{state.loadFailed ? copy.navigation.retry : copy.runtime.start}</button>}
    {state.loadFailed && <p role="alert">{copy.navigation.loadFailed}</p>}
    {state.loading || state.loadFailed ? <button onClick={() => app.leave()}>{copy.runtime.leave}</button> : <>
      <button data-settings-open onClick={onSettings}>{copy.settings.title}</button>
      <label>{copy.settings.language}<select value={state.preferences.language} onChange={(event) => app.setPreferences({ ...state.preferences, language: event.currentTarget.value as "en" | "zh-CN" })}>
        <option value="zh-CN">{copy.settings.languageOptions["zh-CN"]}</option><option value="en">{copy.settings.languageOptions.en}</option>
      </select></label>
    </>}
  </main>;
}
