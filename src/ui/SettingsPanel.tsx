import type { GameApp } from "../app/GameApp";
import type { ReactNode } from "react";
import type { GamePreferences, LookSensitivity } from "../settings/preferences";
import type { CameraView } from "../rendering/CameraRig";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./SettingsPanel.module.css";

export function SettingsPanel({ app, preferences, onClose, cameraView, onCameraChange, onLookAround, children }: { app: GameApp; preferences: GamePreferences; onClose: () => void; cameraView?: CameraView; onCameraChange?: (view: CameraView) => void; onLookAround?: () => void; children?: ReactNode }) {
  const text = messages(preferences.language);
  const copy = text.settings;
  return <PanelHost title={copy.title} onClose={onClose} action={<button className={styles.done} aria-keyshortcuts="Escape" onClick={onClose}>{copy.returnToGame}<kbd aria-hidden="true">Esc</kbd></button>}>
    <label className={styles.row}>{copy.sound}<input type="checkbox" checked={preferences.soundEnabled} onChange={(event) => app.setPreferences({ ...preferences, soundEnabled: event.currentTarget.checked })} /></label>
    <label className={styles.row}>{copy.language}<select value={preferences.language} onChange={(event) => app.setPreferences({ ...preferences, language: event.currentTarget.value as "en" | "zh-CN" })}>
      <option value="zh-CN">{copy.languageOptions["zh-CN"]}</option><option value="en">{copy.languageOptions.en}</option>
    </select></label>
    <label className={styles.row}>{copy.sensitivity}<select value={preferences.lookSensitivity} onChange={(event) => app.setPreferences({ ...preferences, lookSensitivity: event.currentTarget.value as LookSensitivity })}>
      {(["low", "standard", "high"] as const).map((value) => <option key={value} value={value}>{copy[value]}</option>)}
    </select></label>
    {onCameraChange && <label className={styles.row}>{copy.view}<select value={cameraView} aria-keyshortcuts="V" onChange={(event) => onCameraChange(event.currentTarget.value as CameraView)}>
      <option value="overview">{text.setup.overview}</option><option value="first_person">{text.setup.firstPerson}</option>
    </select></label>}
    {onLookAround && <button className={styles.look} aria-keyshortcuts="L" onClick={onLookAround}>{copy.lookAround}</button>}
    {children && <div className={styles.more}>{children}</div>}
  </PanelHost>;
}
