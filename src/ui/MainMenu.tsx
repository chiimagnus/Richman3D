import type { GameApp } from "../app/GameApp";
import { formatMessage, messages } from "../i18n";
import styles from "./App.module.css";
import { MenuArtwork } from "./MenuArtwork";

export function MainMenu({ app, onSettings, onStart, onChallenge, onNetwork }: { app: GameApp; onSettings: () => void; onStart: () => void; onChallenge: () => void; onNetwork: () => void }) {
  const state = app.getSnapshot();
  const copy = messages(state.preferences.language);
  return <main className={styles.menu}>
    <div className={styles.menuContent}>
      <p className={styles.eyebrow}>{copy.menu.eyebrow}</p>
      <h1>{copy.runtime.title}</h1>
      <p className={styles.tagline}>{copy.menu.tagline}</p>
      {!state.loading && !state.loadFailed && state.stored.kind === "valid" && <button className={styles.primary} onClick={() => void app.continueSaved()}>{state.stored.record.state.decision.kind === "game_over" ? copy.storage.results : copy.storage.continue}</button>}
      {state.stored.kind === "error" && <p role="status">{copy.storage[state.stored.error === "unavailable" ? "unavailable" : "invalid"]}</p>}
      {state.stored.kind === "valid" && <p>{formatMessage(copy.storage.transfer.savedAt, { time: new Date(state.stored.record.savedAt).toLocaleString(state.preferences.language) })}</p>}
      {state.loading ? <p role="status">{copy.navigation.loading}</p> : <button className={state.stored.kind === "valid" ? undefined : styles.primary} onClick={() => { if (state.loadFailed) window.location.assign(window.location.href); else onStart(); }}>{state.loadFailed ? copy.navigation.retry : copy.runtime.start}</button>}
      {state.loadFailed && <p role="alert">{copy.navigation.loadFailed}</p>}
      {!state.loading && !state.loadFailed && <button onClick={onChallenge}>{copy.challenges.title}</button>}
      {!state.loading && !state.loadFailed && <button onClick={onNetwork}>{copy.network.title}</button>}
      {state.loading || state.loadFailed ? <button onClick={() => app.leave()}>{copy.runtime.leave}</button> : <>
        <button onClick={onSettings}>{copy.settings.title}</button>
      </>}
    </div>
    <MenuArtwork />
  </main>;
}
