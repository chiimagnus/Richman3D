import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { HelpPanel } from "./HelpPanel";
import { SavePanel } from "./SavePanel";
import { TransferPanel } from "./TransferPanel";
import { tutorialStep, type TutorialProgress } from "../app/tutorial";
import { ErrorBoundary } from "./ErrorBoundary";
import { useGameView } from "./useGameView";
import styles from "./App.module.css";

const SceneHost = lazy(() => import("./SceneHost").then((module) => ({ default: module.SceneHost })));

export function App({ app }: { app: GameApp }) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot);
  const [panel, setPanel] = useState<"settings" | "setup" | "help" | "transfer" | null>(null);
  return state.session ? <GamePlay key={state.session.matchId} app={app} session={state.session} preferences={state.preferences} onTutorialExit={(completed) => { app.finishTutorial(completed); setPanel("setup"); }} /> : <>
    <MainMenu app={app} onSettings={() => setPanel("settings")} onStart={() => setPanel("setup")} onHelp={() => setPanel("help")} onTransfer={() => setPanel("transfer")} />
    {panel === "transfer" ? <TransferPanel app={app} onClose={() => setPanel(null)} /> : panel === "settings" ? <SettingsPanel app={app} preferences={state.preferences} onClose={() => setPanel(null)} /> : panel === "setup" ? <MatchSetup app={app} onClose={() => setPanel(null)} /> : panel === "help" && <HelpPanel language={state.preferences.language} onClose={() => setPanel(null)} onTutorial={() => { setPanel(null); void app.startTutorial(); }} />}
  </>;
}

function GamePlay({ app, session, preferences, onTutorialExit }: { app: GameApp; session: GameSession; preferences: GamePreferences; onTutorialExit: (completed: boolean) => void }) {
  const [panel, setPanel] = useState<"settings" | "pause" | "help" | "transfer" | null>(null);
  const lastPanel = useRef(panel);
  useEffect(() => {
    if (lastPanel.current === "transfer" && panel !== "transfer") document.querySelector<HTMLButtonElement>("[data-transfer-open]")?.focus();
    lastPanel.current = panel;
  }, [panel]);
  const [progress, setProgress] = useState<TutorialProgress>({ started: false, inspected: false });
  const view = useGameView(session);
  const tutorial = session.purpose === "tutorial" ? tutorialStep(view, progress) : undefined;
  const copy = messages(preferences.language);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !document.pointerLockElement && !panel && !document.querySelector("dialog[open]")) { session.pause(); setPanel("pause"); return; }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || panel ||
          (event.target instanceof HTMLElement && event.target.closest("button,input,select,textarea,a[href],[contenteditable='true']"))) return;
      const kind = ({ Space: "roll", KeyB: "buy", KeyN: "skip" } as const)[event.code as "Space" | "KeyB" | "KeyN"];
      if (kind && !view.presenting && (!tutorial || tutorial.number === 2 && kind === "roll" || tutorial.number === 4 && kind !== "roll")) {
        const command = playerConfig(view.displayed.config, view.displayed.activePlayerId).controller === "human" ? legalCommands(view.displayed, view.displayed.activePlayerId).find((action) => action.kind === kind) : null;
        if (command) { event.preventDefault(); void session.dispatch(command); }
      } else if (event.code === "KeyM") app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [app, session, preferences, panel, view, tutorial?.number]);
  const ended = view.displayed.decision.kind === "game_over" && !view.presenting;
  const saveProblem = view.save.kind === "conflict" || view.save.kind === "unsaved" && !view.save.acknowledged;
  const closeSettings = () => { setPanel(null); void session.resume(); };
  return <main className={styles.game} data-match-id={session.matchId} data-seed={view.committed.config.seed} data-purpose={session.purpose}>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={<div role="alert">{copy.runtime.presentation_failed}<button onClick={() => app.leave()}>{copy.runtime.leave}</button></div>}>
      <Suspense fallback={<p role="status">{copy.navigation.loading}</p>}><SceneHost app={app} session={session} preferences={preferences} /></Suspense>
    </ErrorBoundary>
    {!ended && <div className={styles.tools}><button data-settings-open onClick={() => { session.pause(); setPanel("settings"); }}>{copy.settings.title}</button><button data-help-open onClick={() => { session.pause(); setPanel("help"); }}>{copy.help.title}</button><button data-pause onClick={() => { session.pause(); setPanel("pause"); }}>{copy.navigation.pause}</button></div>}
    <ErrorBoundary onError={() => session.failPresentation()} fallback={<p role="alert">{copy.runtime.presentation_failed}</p>}>
      {!ended && <><Hud session={session} language={preferences.language} tutorial={tutorial} onTutorialNext={() => setProgress(tutorial?.number === 1 ? { ...progress, started: true } : { ...progress, inspected: true })} onTutorialExit={onTutorialExit} /><FeedbackLayer session={session} language={preferences.language} /></>}
    </ErrorBoundary>
    {panel === "transfer" ? <TransferPanel app={app} onClose={() => setPanel("pause")} /> : saveProblem ? <SavePanel app={app} session={session} onTransfer={() => setPanel("transfer")} /> : ended ? <ResultsScreen app={app} snapshot={view.displayed} /> : panel === "settings" ? <SettingsPanel app={app} preferences={preferences} onClose={closeSettings} /> : panel === "help" ? <HelpPanel language={preferences.language} rules={view.committed.rules} onClose={closeSettings} /> : (panel === "pause" || view.mode === "paused" && !view.error) && <PauseMenu app={app} onResume={closeSettings} onTransfer={() => setPanel("transfer")} />}
  </main>;
}
