import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import type { GamePreferences } from "../settings/preferences";
import type { CameraView } from "../rendering/CameraRig";
import type { SceneControls } from "./SceneHost";
import { legalCommands, playerAssets } from "../domain/selectors";
import type { PlayerId } from "../domain/types";
import { formatMessage, messages, playerName } from "../i18n";
import { playerConfig } from "../domain/config";
import { MainMenu } from "./MainMenu";
import { MatchSetup } from "./MatchSetup";
import { Hud } from "./Hud";
import { SettingsPanel } from "./SettingsPanel";
import { FeedbackLayer } from "./FeedbackLayer";
import { ResultsScreen } from "./ResultsScreen";
import { SavePanel } from "./SavePanel";
import { TransferPanel } from "./TransferPanel";
import { HandoverScreen } from "./HandoverScreen";
import { AssetPanel } from "./AssetPanel";
import { DebtPanel } from "./DebtPanel";
import { AuctionPanel } from "./AuctionPanel";
import { HistoryPanel } from "./HistoryPanel";
import { eventText } from "./eventText";
import { PanelHost } from "./PanelHost";
import { downloadSave } from "../storage/transfer";
import { ErrorBoundary } from "./ErrorBoundary";
import { useGameView } from "./useGameView";
import { assetManagementView, auctionView, debtView } from "./viewModel";
import styles from "./App.module.css";

const SceneHost = lazy(() => import("./SceneHost").then((module) => ({ default: module.SceneHost })));

export function App({ app }: { app: GameApp }) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot);
  const [panel, setPanel] = useState<"settings" | "setup" | "transfer" | null>(null);
  const lastPanel = useRef(panel);
  useEffect(() => {
    if (lastPanel.current === "transfer" && panel === "settings") document.querySelector<HTMLButtonElement>("#transfer-open")?.focus({ preventScroll: true });
    lastPanel.current = panel;
  }, [panel]);
  return state.session ? <GamePlay key={state.session.matchId} app={app} session={state.session} preferences={state.preferences} /> : <>
    <MainMenu app={app} onSettings={() => setPanel("settings")} onStart={() => setPanel("setup")} />
    {panel === "transfer" ? <TransferPanel app={app} onClose={() => setPanel("settings")} /> : panel === "settings" ? <SettingsPanel app={app} preferences={state.preferences} onClose={() => setPanel(null)}><button id="transfer-open" onClick={() => setPanel("transfer")}>{messages(state.preferences.language).storage.transfer.title}</button></SettingsPanel> : panel === "setup" && <MatchSetup app={app} onClose={() => setPanel(null)} />}
  </>;
}

function GamePlay({ app, session, preferences }: { app: GameApp; session: GameSession; preferences: GamePreferences }) {
  const [panel, setPanel] = useState<"pause" | "transfer" | "history" | { kind: "assets"; playerId: PlayerId } | null>(null);
  const [cameraView, setCameraView] = useState<CameraView>(() => window.matchMedia("(pointer: coarse)").matches ? "overview" : "first_person");
  const [matchOptionsOpen, setMatchOptionsOpen] = useState(false);
  const scene = useRef<SceneControls>(null);
  const lastPanel = useRef(panel);
  useEffect(() => {
    if (lastPanel.current === "transfer" && panel !== "transfer") document.querySelector<HTMLButtonElement>("#transfer-open")?.focus();
    if (lastPanel.current === "history" && (panel === "pause" || panel === null)) document.querySelector<HTMLButtonElement>("#history-open")?.focus();
    lastPanel.current = panel;
  }, [panel]);
  const view = useGameView(session);
  const copy = messages(preferences.language);
  const ended = view.displayed.decision.kind === "game_over" && !view.presenting;
  const handover = session.handoverActor;
  const saveProblem = view.save.kind === "conflict" || view.save.kind === "unsaved" && !view.save.acknowledged;
  const requested = typeof panel === "object" && panel ? panel.kind : panel;
  const inspecting = requested === "assets" || requested === "history";
  const inlineAssets = requested === "assets" && !view.presenting && view.displayed.decision.kind === "awaiting_purchase" && view.displayed.decision.actorId === view.viewPlayerId;
  let surface: string | null = requested;
  if (view.error === "presentation_failed") surface = "fault";
  else if (saveProblem) surface = panel === "transfer" ? "transfer" : "save";
  else if (ended) surface = requested === "history" ? "history" : "results";
  else if (view.displayed.decision.kind === "awaiting_debt" && !view.presenting && view.mode === "running") surface = handover ? "handover" : "debt";
  else if (view.displayed.decision.kind === "awaiting_auction" && !view.presenting && view.mode === "running") surface = handover ? "handover" : "auction";
  else if (view.mode === "paused" && requested === "assets") surface = "pause";
  else if (handover && view.mode === "running" && inspecting) surface = "handover";
  else if (inlineAssets) surface = "inline_assets";
  else if (!requested) surface = view.mode === "paused" ? "pause" : handover ? "handover" : null;
  useEffect(() => { if (handover && view.mode === "running" && inspecting) setPanel(null); }, [handover, view.mode, inspecting]);
  const closeAssets = () => {
    const playerId = typeof panel === "object" && panel ? panel.playerId : null;
    setPanel(null);
    if (playerId) document.querySelector<HTMLButtonElement>(`#assets-open-${playerId}`)?.focus({ preventScroll: true });
  };
  const assets = view.displayed.players.map((player) => playerAssets(view.displayed, player.id));
  const assetPanel = typeof panel === "object" && panel ? <AssetPanel key={panel.playerId} assets={assets} initialPlayer={panel.playerId} language={preferences.language} management={assetManagementView(view)} onCommand={(command) => { void session.dispatch(command); }} onClose={closeAssets} /> : null;
  const pause = () => { session.pause(); setPanel("pause"); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.code === "Escape" && document.pointerLockElement) { event.preventDefault(); document.exitPointerLock(); return; }
      if (event.code === "Escape" && surface === "inline_assets") { event.preventDefault(); closeAssets(); return; }
      if (event.code === "Escape" && !surface && !document.querySelector("dialog[open]")) { event.preventDefault(); session.pause(); setPanel("pause"); return; }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || surface ||
          (event.target instanceof HTMLElement && event.target.closest("input,select,textarea,a[href],[contenteditable='true']"))) return;
      if (event.code === "Space" && event.target instanceof HTMLElement && event.target.closest("button")) return;
      const kind = ({ Space: "roll", KeyB: "buy", KeyN: "skip" } as const)[event.code as "Space" | "KeyB" | "KeyN"];
      if (kind && !view.presenting) {
        const actor = view.displayed.decision.kind === "game_over" ? null : view.displayed.decision.actorId;
        const command = actor !== null && actor === view.viewPlayerId && playerConfig(view.displayed.config, actor).controller === "human" ? legalCommands(view.displayed, actor).find((action) => action.kind === kind) : null;
        if (command) { event.preventDefault(); void session.dispatch(command); }
      } else if (event.code === "KeyM") app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled });
      else if (event.code === "KeyV" && view.viewPlayerId !== null) { event.preventDefault(); setCameraView((current) => current === "overview" ? "first_person" : "overview"); }
      else if (event.code === "KeyL" && view.viewPlayerId !== null) { event.preventDefault(); flushSync(() => setCameraView("first_person")); scene.current?.lookAround(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [app, session, preferences, surface, view, panel]);
  const closeSettings = () => { setPanel(null); void session.resume(); };
  const lookAround = () => {
    flushSync(() => { setPanel(null); setCameraView("first_person"); });
    scene.current?.lookAround();
    void session.resume();
  };
  return <main className={styles.game}>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={null}>
      <Suspense fallback={<p role="status">{copy.navigation.loading}</p>}><SceneHost ref={scene} app={app} session={session} preferences={preferences} cameraView={cameraView} interactive={!surface} /></Suspense>
    </ErrorBoundary>
    {!ended && <div className={styles.tools}><button aria-keyshortcuts="Escape" onClick={pause}>{copy.settings.title}<kbd aria-hidden="true">Esc</kbd></button></div>}
    <ErrorBoundary onError={() => session.failPresentation()} fallback={null}>
      {!ended && handover === null && surface !== "fault" && <><Hud session={session} language={preferences.language} onAssets={(playerId) => { if (document.pointerLockElement) document.exitPointerLock(); setPanel({ kind: "assets", playerId }); }} assetPanel={surface === "inline_assets" ? assetPanel : null} /><FeedbackLayer session={session} language={preferences.language} /></>}
    </ErrorBoundary>
    {surface === "fault" ? <PanelHost title={copy.runtime.presentation_failed}>
      <p>{copy.storage.exportWarning}</p><button onClick={() => downloadSave(session.exportRecord())}>{copy.storage.export}</button>
      {view.save.kind === "unsaved" || view.save.kind === "conflict" ? <><p>{copy.storage.discardWarning}</p><button onClick={() => app.leave(true)}>{copy.storage.discard}</button></> : <button onClick={() => app.leave()}>{copy.runtime.leave}</button>}
    </PanelHost> : surface === "debt" ? <DebtPanel model={debtView(view)!} snapshot={view.displayed} language={preferences.language} onCommand={(command) => { void session.dispatch(command); }} onPause={pause} /> : surface === "auction" ? <AuctionPanel key={`${view.displayed.revision}:${view.displayed.decision.kind === "awaiting_auction" ? view.displayed.decision.actorId : ""}`} model={auctionView(view)!} snapshot={view.displayed} language={preferences.language} onCommand={(command) => { void session.dispatch(command); }} onPause={pause} /> : surface === "transfer" ? <TransferPanel app={app} onClose={() => setPanel("pause")} /> : surface === "save" ? <SavePanel app={app} session={session} onTransfer={() => setPanel("transfer")} /> : surface === "results" ? <ResultsScreen app={app} snapshot={view.displayed} onHistory={() => setPanel("history")} /> : surface === "pause" ? <SettingsPanel app={app} preferences={preferences} onClose={closeSettings} cameraView={cameraView} onCameraChange={setCameraView} {...(view.viewPlayerId !== null ? { onLookAround: lookAround } : {})}>
      <details open={matchOptionsOpen}><summary onClick={(event) => { event.preventDefault(); setMatchOptionsOpen((open) => !open); }}>{copy.settings.match}</summary>
        <p>{formatMessage(copy.setup.turnOrder, { players: view.displayed.turnOrder.map((id) => playerName(preferences.language, id, view.displayed.config)).join(copy.setup.nameSeparator) })}</p>
        <button id="history-open" onClick={() => setPanel("history")}>{copy.history.title}</button>
        <button id="transfer-open" onClick={() => setPanel("transfer")}>{copy.storage.transfer.title}</button>
        <button onClick={() => void app.restart()}>{copy.feedback.restart}</button>
        <button onClick={() => void app.leave()}>{copy.runtime.leave}</button>
      </details>
    </SettingsPanel> : surface === "history" ? <HistoryPanel entries={view.displayed.history.map((entry) => ({ revision: entry.revision, text: eventText(preferences.language, entry.event, view.displayed) }))} language={preferences.language} onClose={() => setPanel(ended ? null : "pause")} /> : surface === "assets" ? <PanelHost title={copy.assets.title} onClose={closeAssets}>{assetPanel}</PanelHost> : surface === "handover" && handover && <HandoverScreen session={session} actor={handover} language={preferences.language} onPause={pause} />}
  </main>;
}
