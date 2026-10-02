import { useEffect, useState, useSyncExternalStore } from "react";
import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import type { GamePreferences } from "../settings/preferences";
import { legalCommands } from "../domain/selectors";
import { formatMessage, messages, playerName } from "../i18n";
import { SceneHost } from "./SceneHost";
import { Hud } from "./Hud";
import { SettingsPanel } from "./SettingsPanel";
import { FeedbackLayer } from "./FeedbackLayer";
import { PanelHost } from "./PanelHost";
import { ErrorBoundary } from "./ErrorBoundary";
import { useGameView } from "./useGameView";
import styles from "./App.module.css";

export function App({ app }: { app: GameApp }) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot);
  return state.session ? <GamePlay key={state.session.matchId} app={app} session={state.session} preferences={state.preferences} /> : <main className={styles.menu}>
    <h1>{messages(state.preferences.language).runtime.title}</h1>
    <button data-start onClick={() => app.start()}>{messages(state.preferences.language).runtime.start}</button>
  </main>;
}

function GamePlay({ app, session, preferences }: { app: GameApp; session: GameSession; preferences: GamePreferences }) {
  const [panel, setPanel] = useState<"settings" | null>(null);
  const view = useGameView(session);
  const copy = messages(preferences.language);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || panel ||
          (event.target instanceof HTMLElement && event.target.closest("button,input,select,textarea,a[href],[contenteditable='true']"))) return;
      const kind = ({ Space: "roll", KeyB: "buy", KeyN: "skip" } as const)[event.code as "Space" | "KeyB" | "KeyN"];
      if (kind && !view.presenting) {
        const command = legalCommands(view.displayed, "human").find((action) => action.kind === kind);
        if (command) { event.preventDefault(); void session.dispatch(command); }
      } else if (event.code === "KeyM") app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [app, session, preferences, panel, view]);
  const ended = view.displayed.decision.kind === "game_over" && !view.presenting;
  const closeSettings = () => { setPanel(null); void session.resume(); };
  return <main className={styles.game} data-match-id={session.matchId}>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={<div role="alert">{copy.runtime.presentation_failed}<button onClick={() => app.leave()}>{copy.runtime.leave}</button></div>}>
      <SceneHost app={app} session={session} preferences={preferences} />
    </ErrorBoundary>
    <div className={styles.tools}><button data-settings-open onClick={() => { session.pause(); setPanel("settings"); }}>{copy.settings.title}</button><button onClick={() => app.leave()}>{copy.runtime.leave}</button></div>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={<p role="alert">{copy.runtime.presentation_failed}</p>}>
      <Hud session={session} language={preferences.language} />
      <FeedbackLayer session={session} language={preferences.language} />
    </ErrorBoundary>
    {ended ? <PanelHost title={formatMessage(copy.status.winner, { playerName: playerName(preferences.language, view.displayed.decision.kind === "game_over" ? view.displayed.decision.winnerId : "human") })}>
      <p>{copy.feedback.gameOverDetail}</p><button onClick={() => app.start()}>{copy.feedback.restart}</button><button onClick={() => app.leave()}>{copy.runtime.leave}</button>
    </PanelHost> : panel === "settings" && <SettingsPanel app={app} preferences={preferences} onClose={closeSettings} />}
  </main>;
}
