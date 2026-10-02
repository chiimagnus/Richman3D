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
import { HandoverScreen } from "./HandoverScreen";
import { PanelHost } from "./PanelHost";
import { downloadSave } from "../storage/transfer";
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
  const ended = view.displayed.decision.kind === "game_over" && !view.presenting;
  const handover = session.handoverActor;
  const saveProblem = view.save.kind === "conflict" || view.save.kind === "unsaved" && !view.save.acknowledged;
  const surface = view.error === "presentation_failed" ? "fault" : saveProblem ? panel === "transfer" ? "transfer" : "save" : ended ? "results" : panel ?? (view.mode === "paused" ? "pause" : handover ? "handover" : null);
  const pause = () => { session.pause(); setPanel("pause"); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.code === "Escape" && document.pointerLockElement) { event.preventDefault(); document.exitPointerLock(); return; }
      if (event.code === "Escape" && !surface && !document.querySelector("dialog[open]")) { event.preventDefault(); session.pause(); setPanel("pause"); return; }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || surface ||
          (event.target instanceof HTMLElement && event.target.closest("button,input,select,textarea,a[href],[contenteditable='true']"))) return;
      const kind = ({ Space: "roll", KeyB: "buy", KeyN: "skip" } as const)[event.code as "Space" | "KeyB" | "KeyN"];
      if (kind && !view.presenting && (!tutorial || tutorial.number === 2 && kind === "roll" || tutorial.number === 4 && kind !== "roll")) {
        const actor = view.displayed.decision.kind === "game_over" ? null : view.displayed.decision.actorId;
        const command = actor !== null && actor === view.viewPlayerId && playerConfig(view.displayed.config, actor).controller === "human" ? legalCommands(view.displayed, actor).find((action) => action.kind === kind) : null;
        if (command) { event.preventDefault(); void session.dispatch(command); }
      } else if (event.code === "KeyM") app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [app, session, preferences, surface, view, tutorial?.number]);
  const closeSettings = () => { setPanel(null); void session.resume(); };
  return <main className={styles.game} data-match-id={session.matchId} data-seed={view.committed.config.seed} data-purpose={session.purpose} data-view-player={view.viewPlayerId ?? ""}>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={null}>
      <Suspense fallback={<p role="status">{copy.navigation.loading}</p>}><SceneHost app={app} session={session} preferences={preferences} /></Suspense>
    </ErrorBoundary>
    {!ended && <div className={styles.tools}><button data-settings-open onClick={() => { session.pause(); setPanel("settings"); }}>{copy.settings.title}</button><button data-help-open onClick={() => { session.pause(); setPanel("help"); }}>{copy.help.title}</button><button data-pause onClick={() => { session.pause(); setPanel("pause"); }}>{copy.navigation.pause}</button></div>}
    <ErrorBoundary onError={() => session.failPresentation()} fallback={null}>
      {!ended && handover === null && surface !== "fault" && <><Hud session={session} language={preferences.language} tutorial={tutorial} onTutorialNext={() => setProgress(tutorial?.number === 1 ? { ...progress, started: true } : { ...progress, inspected: true })} onTutorialExit={onTutorialExit} /><FeedbackLayer session={session} language={preferences.language} /></>}
    </ErrorBoundary>
    {surface === "fault" ? <PanelHost title={copy.runtime.presentation_failed}>
      <p>{copy.storage.exportWarning}</p><button data-save-export onClick={() => downloadSave(session.exportRecord())}>{copy.storage.export}</button>
      {view.save.kind === "unsaved" || view.save.kind === "conflict" ? <><p>{copy.storage.discardWarning}</p><button data-unsaved-discard onClick={() => app.leave(true)}>{copy.storage.discard}</button></> : <button onClick={() => app.leave()}>{copy.runtime.leave}</button>}
    </PanelHost> : surface === "transfer" ? <TransferPanel app={app} onClose={() => setPanel("pause")} /> : surface === "save" ? <SavePanel app={app} session={session} onTransfer={() => setPanel("transfer")} /> : surface === "results" ? <ResultsScreen app={app} snapshot={view.displayed} /> : surface === "settings" ? <SettingsPanel app={app} preferences={preferences} onClose={closeSettings} /> : surface === "help" ? <HelpPanel language={preferences.language} rules={view.committed.rules} onClose={closeSettings} /> : surface === "pause" ? <PauseMenu app={app} onResume={closeSettings} onTransfer={() => setPanel("transfer")} /> : surface === "handover" && handover && <HandoverScreen session={session} actor={handover} language={preferences.language} onPause={pause} />}
  </main>;
}
