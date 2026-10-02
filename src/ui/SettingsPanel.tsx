import type { GameApp } from "../app/GameApp";
import type { GamePreferences, LookSensitivity } from "../settings/preferences";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./SettingsPanel.module.css";

export function SettingsPanel({ app, preferences, onClose }: { app: GameApp; preferences: GamePreferences; onClose: () => void }) {
  const copy = messages(preferences.language).settings;
  return <PanelHost title={copy.title} onClose={onClose}>
    <button onClick={onClose}>{copy.returnToGame}</button>
    <label className={styles.row}>{copy.sound}<input type="checkbox" checked={preferences.soundEnabled} onChange={(event) => app.setPreferences({ ...preferences, soundEnabled: event.currentTarget.checked })} /></label>
    <fieldset className={styles.group}><legend>{copy.sensitivity}</legend>
      {(["low", "standard", "high"] as const).map((value: LookSensitivity) => <button key={value} aria-pressed={preferences.lookSensitivity === value} onClick={() => app.setPreferences({ ...preferences, lookSensitivity: value })}>{copy[value]}</button>)}
    </fieldset>
    <fieldset className={styles.group}><legend>{copy.language}</legend>
      {(["zh-CN", "en"] as const).map((language) => <button key={language} aria-pressed={preferences.language === language} onClick={() => app.setPreferences({ ...preferences, language })}>{copy.languageOptions[language]}</button>)}
    </fieldset>
  </PanelHost>;
}
