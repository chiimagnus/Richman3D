import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import type { GamePreferences } from "../settings/preferences";
import { legalCommands } from "../domain/selectors";
import { messages } from "../i18n";
import { playerConfig } from "../domain/config";
import { MainMenu } from "./MainMenu";
import { PauseMenu } from "./PauseMenu";
import { MatchSetup } from "./MatchSetup";
import { Hud } from "./Hud";
import { SettingsPanel } from "./SettingsPanel";
import { FeedbackLayer } from "./FeedbackLayer";
import { ResultsScreen } from "./ResultsScreen";
import { ErrorBoundary } from "./ErrorBoundary";
import { useGameView } from "./useGameView";
import styles from "./App.module.css";

const SceneHost = lazy(() => import("./SceneHost").then((module) => ({ default: module.SceneHost })));

export function App({ app }: { app: GameApp }) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot);
  const [panel, setPanel] = useState<"settings" | "setup" | null>(null);
  return state.session ? <GamePlay key={state.session.matchId} app={app} session={state.session} preferences={state.preferences} /> : <>
    <MainMenu app={app} onSettings={() => setPanel("settings")} onStart={() => setPanel("setup")} />
    {panel === "settings" ? <SettingsPanel app={app} preferences={state.preferences} onClose={() => setPanel(null)} /> : panel === "setup" && <MatchSetup app={app} onClose={() => setPanel(null)} />}
  </>;
}

function GamePlay({ app, session, preferences }: { app: GameApp; session: GameSession; preferences: GamePreferences }) {
  const [panel, setPanel] = useState<"settings" | "pause" | null>(null);
  const view = useGameView(session);
  const copy = messages(preferences.language);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !document.pointerLockElement && !panel && !document.querySelector("dialog[open]")) { session.pause(); setPanel("pause"); return; }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || panel ||
          (event.target instanceof HTMLElement && event.target.closest("button,input,select,textarea,a[href],[contenteditable='true']"))) return;
      const kind = ({ Space: "roll", KeyB: "buy", KeyN: "skip" } as const)[event.code as "Space" | "KeyB" | "KeyN"];
      if (kind && !view.presenting) {
        const command = playerConfig(view.displayed.config, view.displayed.activePlayerId).controller === "human" ? legalCommands(view.displayed, view.displayed.activePlayerId).find((action) => action.kind === kind) : null;
        if (command) { event.preventDefault(); void session.dispatch(command); }
      } else if (event.code === "KeyM") app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [app, session, preferences, panel, view]);
  const ended = view.displayed.decision.kind === "game_over" && !view.presenting;
  const closeSettings = () => { setPanel(null); void session.resume(); };
  return <main className={styles.game} data-match-id={session.matchId} data-seed={view.committed.config.seed}>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={<div role="alert">{copy.runtime.presentation_failed}<button onClick={() => app.leave()}>{copy.runtime.leave}</button></div>}>
      <Suspense fallback={<p role="status">{copy.navigation.loading}</p>}><SceneHost app={app} session={session} preferences={preferences} /></Suspense>
    </ErrorBoundary>
    {!ended && <div className={styles.tools}><button data-settings-open onClick={() => { session.pause(); setPanel("settings"); }}>{copy.settings.title}</button><button data-pause onClick={() => { session.pause(); setPanel("pause"); }}>{copy.navigation.pause}</button></div>}
    <ErrorBoundary onError={() => session.failPresentation()} fallback={<p role="alert">{copy.runtime.presentation_failed}</p>}>
      {!ended && <><Hud session={session} language={preferences.language} /><FeedbackLayer session={session} language={preferences.language} /></>}
    </ErrorBoundary>
    {ended ? <ResultsScreen app={app} snapshot={view.displayed} /> : panel === "settings" ? <SettingsPanel app={app} preferences={preferences} onClose={closeSettings} /> : (panel === "pause" || view.mode === "paused" && !view.error) && <PauseMenu app={app} onResume={closeSettings} />}
  </main>;
}
