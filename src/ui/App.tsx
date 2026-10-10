import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { AppView, GameApp } from "../app/GameApp";
import type { GamePreferences } from "../settings/preferences";
import type { CameraView } from "../rendering/CameraRig";
import type { SceneControls } from "./SceneHost";
import { playerAssets } from "../domain/selectors";
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
import { TradeDraft, TradePanel } from "./TradePanel";
import { HistoryPanel } from "./HistoryPanel";
import { HandPanel } from "./HandPanel";
import { eventText } from "./eventText";
import { PanelHost } from "./PanelHost";
import { downloadSave } from "../storage/transfer";
import { ErrorBoundary } from "./ErrorBoundary";
import { useGameView } from "./useGameView";
import { assetManagementView, availableCommands, debtView, handCommands, tradeView } from "./viewModel";
import styles from "./App.module.css";
import { dailyChallenge, type DailyChallenge } from "../domain/challenges";
import { ChallengePanel } from "./ChallengePanel";
import { RecordsPanel } from "./RecordsPanel";
import { RoomPanel } from "./RoomPanel";

const SceneHost = lazy(() => import("./SceneHost").then((module) => ({ default: module.SceneHost })));

export function App({ app }: { app: GameApp }) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot);
  const [panel, setPanel] = useState<"settings" | "setup" | "transfer" | "records" | "room" | { kind: "challenge"; challenge: DailyChallenge } | null>(() => typeof window !== "undefined" && new URLSearchParams(window.location.hash.slice(1)).has("room") ? "room" : null);
  const lastPanel = useRef(panel);
  useEffect(() => { if (state.session) setPanel(null); }, [state.session]);
  useEffect(() => {
    if (lastPanel.current === "transfer" && panel === "settings") document.querySelector<HTMLButtonElement>("#transfer-open")?.focus({ preventScroll: true });
    lastPanel.current = panel;
  }, [panel]);
  return state.session ? <GamePlay key={state.session.matchId} app={app} session={state.session} preferences={state.preferences} /> : <>
    <MainMenu app={app} onSettings={() => setPanel("settings")} onStart={() => setPanel("setup")} onNetwork={() => setPanel("room")} onChallenge={() => setPanel({ kind: "challenge", challenge: dailyChallenge(new Date().toISOString().slice(0, 10)) })} />
    {(state.room || panel === "room") && <RoomPanel app={app} onClose={() => setPanel(null)} />}
    {typeof panel === "object" && panel && <ChallengePanel app={app} challenge={panel.challenge} onClose={() => setPanel(null)} onRecover={() => setPanel("transfer")} />}
    {panel === "records" ? <RecordsPanel app={app} onClose={() => setPanel("settings")} /> : panel === "transfer" ? <TransferPanel app={app} onClose={() => setPanel("settings")} /> : panel === "settings" ? <SettingsPanel app={app} initialFocusId={lastPanel.current === "records" ? "records-open" : undefined} preferences={state.preferences} onClose={() => setPanel(null)}><button id="transfer-open" onClick={() => setPanel("transfer")}>{messages(state.preferences.language).storage.transfer.title}</button><button id="records-open" onClick={() => setPanel("records")}>{messages(state.preferences.language).records.title}</button></SettingsPanel> : panel === "setup" && <MatchSetup app={app} onClose={() => setPanel(null)} />}
  </>;
}

function GamePlay({ app, session, preferences }: { app: GameApp; session: NonNullable<AppView["session"]>; preferences: GamePreferences }) {
  const [panel, setPanel] = useState<"pause" | "transfer" | "history" | "records" | "trade_draft" | "hand" | { kind: "assets"; playerId: PlayerId } | null>(null);
  const cameraView = preferences.cameraView ?? "first_person";
  const setCameraView = (cameraView: CameraView) => app.setPreferences({ ...preferences, cameraView });
  const [inspectedTileId, setInspectedTileId] = useState<string | null>(null);
  const [matchOptionsOpen, setMatchOptionsOpen] = useState(false);
  const scene = useRef<SceneControls>(null);
  const lastPanel = useRef(panel);
  useEffect(() => {
    if (lastPanel.current === "transfer" && panel !== "transfer") document.querySelector<HTMLButtonElement>("#transfer-open")?.focus();
    if (lastPanel.current === "history" && (panel === "pause" || panel === null)) document.querySelector<HTMLButtonElement>("#history-open")?.focus();
    if (lastPanel.current === "trade_draft" && typeof panel === "object" && panel) document.querySelector<HTMLButtonElement>("#trade-open")?.focus({ preventScroll: true });
    lastPanel.current = panel;
  }, [panel]);
  const view = useGameView(session);
  useEffect(() => { if (view.viewPlayerId === null) setInspectedTileId(null); }, [view.viewPlayerId]);
  const copy = messages(preferences.language);
  const ended = view.displayed.decision.kind === "game_over" && !view.presenting;
  const local = session.kind === "local";
  const handover = local ? session.handoverActor : null;
  const room = app.getSnapshot().room?.getSnapshot();
  const ownsDecision = local || view.displayed.decision.kind !== "game_over" && view.displayed.decision.actorId === view.viewPlayerId;
  const saveProblem = view.save.kind === "conflict" || view.save.kind === "unsaved" && !view.save.acknowledged;
  const requested = typeof panel === "object" && panel ? panel.kind : panel;
  const inspecting = requested === "assets" || requested === "history" || requested === "trade_draft" || requested === "hand";
  const inlineAssets = requested === "assets" && !view.presenting && view.displayed.decision.kind === "awaiting_purchase" && view.displayed.decision.actorId === view.viewPlayerId;
  let surface: string | null = requested;
  if (view.error === "presentation_failed") surface = "fault";
  else if (view.network && !view.network.connected) surface = "connection";
  else if (saveProblem) surface = panel === "transfer" || panel === "records" ? panel : "save";
  else if (ended) surface = requested === "history" || requested === "records" ? requested : "results";
  else if (ownsDecision && view.displayed.decision.kind === "awaiting_debt" && !view.presenting && view.mode === "running") surface = handover ? "handover" : "debt";
  else if (ownsDecision && view.displayed.decision.kind === "awaiting_trade" && !view.presenting && view.mode === "running") surface = handover ? "handover" : "trade";
  else if (ownsDecision && view.displayed.decision.kind === "awaiting_discard" && !view.presenting && view.mode === "running") surface = handover ? "handover" : "discard";
  else if (view.mode === "paused" && (requested === "assets" || requested === "trade_draft" || requested === "hand")) surface = "pause";
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
  const assetPanel = typeof panel === "object" && panel ? <AssetPanel key={panel.playerId} assets={assets} initialPlayer={panel.playerId} language={preferences.language} management={assetManagementView(view)} onCommand={(command) => { void session.dispatch(command); }} onClose={closeAssets} onTrade={tradeView(view).canPropose ? () => setPanel("trade_draft") : undefined} /> : null;
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
        const command = actor !== null && actor === view.viewPlayerId && playerConfig(view.displayed.config, actor).controller === "human" ? availableCommands(view).find((action) => action.kind === kind) : null;
        if (command) { event.preventDefault(); void session.dispatch(command); }
      } else if (event.code === "KeyM") app.setPreferences({ ...preferences, soundEnabled: !preferences.soundEnabled });
      else if (event.code === "KeyV" && view.viewPlayerId !== null) { event.preventDefault(); setCameraView(cameraView === "overview" ? "first_person" : "overview"); }
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
  return <main className={styles.game} aria-keyshortcuts="Escape">
    <ErrorBoundary onError={() => session.failPresentation()} fallback={null}>
      <Suspense fallback={<p role="status">{copy.navigation.loading}</p>}><SceneHost ref={scene} app={app} session={session} preferences={preferences} cameraView={cameraView} interactive={!surface} selectedTileId={view.viewPlayerId === null ? null : inspectedTileId} onInspect={setInspectedTileId} /></Suspense>
    </ErrorBoundary>
    <ErrorBoundary onError={() => session.failPresentation()} fallback={null}>
      {!ended && handover === null && surface !== "fault" && <><Hud session={session} language={preferences.language} onAssets={(playerId) => { if (document.pointerLockElement) document.exitPointerLock(); setPanel({ kind: "assets", playerId }); }} onHand={view.viewPlayerId !== null && !view.displayed.players.find((player) => player.id === view.viewPlayerId)!.bankrupt ? () => { if (document.pointerLockElement) document.exitPointerLock(); setPanel("hand"); } : undefined} inspectedTileId={inspectedTileId} onInspect={setInspectedTileId} assetPanel={surface === "inline_assets" ? assetPanel : null} /><FeedbackLayer session={session} language={preferences.language} /></>}
    </ErrorBoundary>
    {(surface === "hand" || surface === "discard") && view.viewPlayerId !== null && <HandPanel key={view.displayed.revision} snapshot={view.displayed} actor={view.viewPlayerId} commands={handCommands(view)} language={preferences.language} onCommand={(command) => { setPanel(null); void session.dispatch(command); }} onClose={() => { if (surface === "discard") pause(); else { setPanel(null); document.querySelector<HTMLButtonElement>("#hand-open")?.focus({ preventScroll: true }); } }} />}
    {surface === "fault" ? <PanelHost title={copy.runtime.presentation_failed}>
      {local && <><p>{copy.storage.exportWarning}</p><button onClick={() => downloadSave(session.exportRecord())}>{copy.storage.export}</button></>}
      {view.save.kind === "unsaved" || view.save.kind === "conflict" ? <><p>{copy.storage.discardWarning}</p><button onClick={() => app.leave(true)}>{copy.storage.discard}</button></> : <button onClick={() => app.leave()}>{copy.runtime.leave}</button>}
    </PanelHost> : surface === "connection" ? <PanelHost title={copy.network.title}>
      <p>{copy.network.code} · {room?.room?.code}</p>
      <p role="alert">{room?.status === "connecting" ? copy.network.connecting : copy.network.errors[view.network?.error ?? "unavailable"]}</p>
      <button disabled={room?.status === "connecting"} onClick={() => app.getSnapshot().room?.reconnect()}>{copy.network.reconnect}</button>
      <button onClick={() => void app.leave()}>{copy.network.leave}</button>
    </PanelHost> : surface === "debt" ? <DebtPanel model={debtView(view)!} snapshot={view.displayed} language={preferences.language} onCommand={(command) => { void session.dispatch(command); }} onPause={pause} /> : surface === "trade" ? <TradePanel snapshot={view.displayed} language={preferences.language} commands={tradeView(view).commands} onCommand={(command) => { void session.dispatch(command); }} onPause={pause} /> : surface === "trade_draft" ? <TradeDraft key={view.displayed.revision} snapshot={view.displayed} language={preferences.language} enabled={tradeView(view).canPropose} onCommand={(command) => { setPanel(null); void session.dispatch(command); }} onClose={() => setPanel({ kind: "assets", playerId: view.displayed.turnPlayerId })} /> : surface === "transfer" && local ? <TransferPanel app={app} onClose={() => setPanel("pause")} /> : surface === "save" && local ? <SavePanel app={app} session={session} onTransfer={() => setPanel("transfer")} onRecords={() => setPanel("records")} /> : surface === "records" ? <RecordsPanel app={app} onClose={() => setPanel(ended ? null : "pause")} /> : surface === "results" ? <ResultsScreen app={app} snapshot={view.displayed} onHistory={() => setPanel("history")} onRecords={local ? () => setPanel("records") : undefined} returnToRecords={lastPanel.current === "records"} /> : surface === "pause" ? <SettingsPanel app={app} initialFocusId={lastPanel.current === "records" ? "records-open" : undefined} preferences={preferences} onClose={view.attached ? closeSettings : undefined} cameraView={cameraView} onCameraChange={setCameraView} {...(view.attached && view.viewPlayerId !== null ? { onLookAround: lookAround, onRecenter: () => { scene.current?.centerCurrent(); closeSettings(); } } : {})}>
      {!local && <p>{copy.network.localPause}</p>}
      <details open={matchOptionsOpen}><summary onClick={(event) => { event.preventDefault(); setMatchOptionsOpen((open) => !open); }}>{copy.settings.match}</summary>
        <p>{formatMessage(copy.setup.turnOrder, { players: view.displayed.turnOrder.map((id) => playerName(preferences.language, id, view.displayed.config)).join(copy.setup.nameSeparator) })}</p>
        {local && <button id="records-open" onClick={() => setPanel("records")}>{copy.records.title}</button>}
        <button id="history-open" onClick={() => setPanel("history")}>{copy.history.title}</button>
        {local ? <><button id="transfer-open" onClick={() => setPanel("transfer")}>{copy.storage.transfer.title}</button><button onClick={() => void app.restart()}>{copy.feedback.restart}</button></> : <>
          <p>{copy.network.code} · {room?.room?.code}</p>
          {room?.room && <p>{formatMessage(copy.network.expiry, { time: new Date(room.room.expiresAt).toLocaleString(preferences.language) })}</p>}
          {room?.room?.members.map((member) => <p key={member.id}>{playerName(preferences.language, member.id, view.committed.config)} · {member.connected ? copy.network.connected : copy.network.disconnected}</p>)}
        </>}
        <button onClick={() => void app.leave()}>{copy.runtime.leave}</button>
      </details>
    </SettingsPanel> : surface === "history" ? <HistoryPanel entries={view.displayed.history.map((entry) => ({ revision: entry.revision, text: eventText(preferences.language, entry.event, view.displayed) }))} language={preferences.language} onClose={() => setPanel(ended ? null : "pause")} /> : surface === "assets" ? <PanelHost title={copy.assets.title} onClose={closeAssets}>{assetPanel}</PanelHost> : surface === "handover" && handover && local && <HandoverScreen session={session} actor={handover} language={preferences.language} onPause={pause} />}
  </main>;
}
