import type { GameApp } from "../app/GameApp";
import { useSyncExternalStore, type ReactNode } from "react";
import type { GamePreferences, LookSensitivity, PresentationSpeed } from "../settings/preferences";
import type { CameraView } from "../rendering/CameraRig";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./SettingsPanel.module.css";

export function SettingsPanel({ app, preferences, onClose, cameraView, onCameraChange, onLookAround, children }: { app: GameApp; preferences: GamePreferences; onClose: () => void; cameraView?: CameraView; onCameraChange?: (view: CameraView) => void; onLookAround?: () => void; children?: ReactNode }) {
  const text = messages(preferences.language);
  const copy = text.settings;
  const audioStatus = useSyncExternalStore(app.audio.subscribe, app.audio.getSnapshot, app.audio.getSnapshot);
  return <PanelHost title={copy.title} onClose={onClose} action={<button className={styles.done} aria-keyshortcuts="Escape" onClick={onClose}>{copy.returnToGame}<kbd aria-hidden="true">Esc</kbd></button>}>
    <label className={styles.row}>{copy.sound}<kbd aria-hidden="true">M</kbd><input type="checkbox" aria-keyshortcuts="M" checked={preferences.soundEnabled} onChange={(event) => app.setPreferences({ ...preferences, soundEnabled: event.currentTarget.checked })} onKeyDown={(event) => {
      if (event.code === "KeyM" && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled }); }
    }} /></label>
    {preferences.soundEnabled && audioStatus !== "ready" && <div className={styles.audioStatus}><p role="status">{audioStatus === "blocked" ? copy.audioBlocked : copy.audioLocked}</p><button onClick={() => app.audio.unlock()}>{copy.enableAudio}</button></div>}
    <label className={styles.row}>{copy.effectsVolume}<output>{Math.round(preferences.effectsVolume * 100)}%</output><input type="range" min="0" max="100" step="1" value={Math.round(preferences.effectsVolume * 100)} onChange={(event) => app.setPreferences({ ...preferences, effectsVolume: Number(event.currentTarget.value) / 100 })} /></label>
    <label className={styles.row}>{copy.musicVolume}<output>{Math.round(preferences.musicVolume * 100)}%</output><input type="range" min="0" max="100" step="1" value={Math.round(preferences.musicVolume * 100)} onChange={(event) => app.setPreferences({ ...preferences, musicVolume: Number(event.currentTarget.value) / 100 })} /></label>
    <label className={styles.row}>{copy.language}<select value={preferences.language} onChange={(event) => app.setPreferences({ ...preferences, language: event.currentTarget.value as "en" | "zh-CN" })}>
      <option value="zh-CN">{copy.languageOptions["zh-CN"]}</option><option value="en">{copy.languageOptions.en}</option>
    </select></label>
    <label className={styles.row}>{copy.presentationSpeed}<select value={preferences.presentationSpeed} onChange={(event) => app.setPreferences({ ...preferences, presentationSpeed: event.currentTarget.value as PresentationSpeed })}>
      <option value="normal">{copy.normalSpeed}</option><option value="fast">{copy.fastSpeed}</option>
    </select></label>
    <label className={styles.row}>{copy.headBob}<input type="checkbox" checked={preferences.headBobEnabled} onChange={(event) => app.setPreferences({ ...preferences, headBobEnabled: event.currentTarget.checked })} /></label>
    <label className={styles.row}>{copy.sensitivity}<select value={preferences.lookSensitivity} onChange={(event) => app.setPreferences({ ...preferences, lookSensitivity: event.currentTarget.value as LookSensitivity })}>
      {(["low", "standard", "high"] as const).map((value) => <option key={value} value={value}>{copy[value]}</option>)}
    </select></label>
    {onCameraChange && <label className={styles.row}>{copy.view}<select value={cameraView} aria-keyshortcuts="V" onChange={(event) => onCameraChange(event.currentTarget.value as CameraView)} onKeyDown={(event) => {
      if (event.code === "KeyV" && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); onCameraChange(cameraView === "overview" ? "first_person" : "overview"); }
    }}>
      <option value="overview">{text.setup.overview}</option><option value="first_person">{text.setup.firstPerson}</option>
    </select></label>}
    {onLookAround && <button className={styles.look} aria-keyshortcuts="L" onClick={onLookAround} onKeyDown={(event) => {
      if (event.code === "KeyL" && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); onLookAround(); }
    }}>{copy.lookAround}</button>}
    {children && <div className={styles.more}>{children}</div>}
  </PanelHost>;
}
