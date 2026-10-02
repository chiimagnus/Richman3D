import type { GameApp } from "../app/GameApp";
import { formatMessage, messages } from "../i18n";
import styles from "./App.module.css";

export function MainMenu({ app, onSettings, onStart, onHelp, onTransfer }: { app: GameApp; onSettings: () => void; onStart: () => void; onHelp: () => void; onTransfer: () => void }) {
  const state = app.getSnapshot();
  const copy = messages(state.preferences.language);
  return <main className={styles.menu}>
    <h1>{copy.runtime.title}</h1>
    {!state.loading && !state.loadFailed && state.stored.kind === "valid" && <button className={styles.primary} data-continue onClick={() => void app.continueSaved()}>{state.stored.record.state.decision.kind === "game_over" ? copy.storage.results : copy.storage.continue}</button>}
    {state.stored.kind === "error" && <p role="status">{copy.storage[state.stored.error === "unavailable" ? "unavailable" : "invalid"]}</p>}
    {state.stored.kind === "valid" && <p data-snapshot-time>{formatMessage(copy.storage.transfer.savedAt, { time: new Date(state.stored.record.savedAt).toLocaleString(state.preferences.language) })}</p>}
    {state.loading ? <p role="status">{copy.navigation.loading}</p> : <button className={state.stored.kind === "valid" ? undefined : styles.primary} data-start onClick={() => { if (state.loadFailed) window.location.assign(window.location.href); else onStart(); }}>{state.loadFailed ? copy.navigation.retry : copy.runtime.start}</button>}
    {state.loadFailed && <p role="alert">{copy.navigation.loadFailed}</p>}
    {state.loading || state.loadFailed ? <button onClick={() => app.leave()}>{copy.runtime.leave}</button> : <>
      <button data-settings-open onClick={onSettings}>{copy.settings.title}</button>
      <button data-help-open onClick={onHelp}>{copy.help.title}</button>
      <button data-transfer-open onClick={onTransfer}>{copy.storage.transfer.title}</button>
      <button data-tutorial-start onClick={() => void app.startTutorial()}>{state.tutorialCompleted ? copy.tutorial.review : copy.tutorial.start}</button>
      <label>{copy.settings.language}<select value={state.preferences.language} onChange={(event) => app.setPreferences({ ...state.preferences, language: event.currentTarget.value as "en" | "zh-CN" })}>
        <option value="zh-CN">{copy.settings.languageOptions["zh-CN"]}</option><option value="en">{copy.settings.languageOptions.en}</option>
      </select></label>
    </>}
  </main>;
}
