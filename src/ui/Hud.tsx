import type { GameSession } from "../app/GameSession";
import { useEffect, useRef, type ReactNode } from "react";
import type { PlayerId } from "../domain/types";
import { publicProperty } from "../domain/selectors";
import { PropertyDetails } from "./PropertyDetails";
import { useGameView } from "./useGameView";
import { actionView } from "./viewModel";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import styles from "./Hud.module.css";
import { playerConfig } from "../domain/config";

export function Hud({ session, language, onAssets, assetPanel }: { session: GameSession; language: Language; onAssets: (playerId: PlayerId) => void; assetPanel: ReactNode }) {
  const view = useGameView(session);
  const model = actionView(view, language);
  const copy = messages(language);
  const actions = useRef<HTMLDivElement>(null);
  const decisionKind = view.displayed.decision.kind;
  useEffect(() => {
    if (!view.presenting && view.mode === "running" && document.activeElement === document.body) {
      actions.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    }
  }, [decisionKind, view.presenting, view.mode, view.attached]);
  const execute = (kind: "roll" | "buy" | "skip") => {
    const command = model.commands.find((action) => action.kind === kind);
    if (command) void session.dispatch(command);
  };
  const buying = view.displayed.decision.kind === "awaiting_purchase" && view.displayed.decision.actorId === view.viewPlayerId && !view.presenting;
  return <>
    <aside className={styles.balances} aria-label={copy.hud.balancesAria}>
      {view.displayed.players.map((player) => <button key={player.id} data-player={player.id} data-assets-open={player.id} aria-label={formatMessage(copy.assets.open, { player: playerName(language, player.id, view.displayed.config) })} onClick={() => onAssets(player.id)}>
        {playerName(language, player.id, view.displayed.config)} <strong {...(playerConfig(view.displayed.config, player.id).controller === "human" ? { "data-human-cash": true } : { "data-bot-cash": true })}>{formatCash(language, player.cash)}</strong>
      </button>)}
      <span data-round>{formatMessage(copy.setup.round, { round: Math.min(view.displayed.completedRounds + 1, view.displayed.rules.roundLimit), limit: view.displayed.rules.roundLimit })}</span>
    </aside>
    <footer className={styles.dock} data-revision={view.displayed.revision} data-presenting={view.presenting}>
      <div className={styles.copy}><strong data-tile>{tileName(language, model.tile)}</strong><span data-status>{model.status}</span></div>
      <span data-dice aria-label={copy.hud.recentDiceAria}>{view.displayed.lastRoll ? view.displayed.lastRoll.join(" + ") : "— + —"}</span>
      {buying && model.property && <details className={styles.property} data-purchase-details key={model.property.id}>
        <summary>{copy.assets.details}</summary><PropertyDetails property={publicProperty(view.displayed, model.property.id)} players={view.displayed.config.players} language={language} />
      </details>}
      {view.displayed.players.find((player) => player.id === view.viewPlayerId)?.bankrupt && <p data-spectating>{copy.setup.spectating}</p>}
      {view.save.kind === "unsaved" && view.save.acknowledged && <span data-save-status role="status">{copy.storage.unsaved}</span>}
      <div ref={actions} className={styles.actions}>
        {buying ? <>
          <button data-buy disabled={!model.commands.some((action) => action.kind === "buy")} onClick={() => execute("buy")}>{model.property ? formatMessage(copy.hud.buyWithPrice, { price: model.property.price }) : copy.hud.buy}</button>
          <button data-skip disabled={!model.commands.some((action) => action.kind === "skip")} onClick={() => execute("skip")}>{copy.hud.skip}</button>
          {!model.commands.some((action) => action.kind === "buy") && <span>{copy.status.insufficientFunds}</span>}
        </> : <button data-roll disabled={!model.commands.some((action) => action.kind === "roll")} onClick={() => execute("roll")}>{copy.hud.roll}</button>}
        {view.presenting && <button onClick={() => session.skipPresentation()}>{copy.runtime.skipAnimation}</button>}
      </div>
      {assetPanel && <div className={styles.assets}>{assetPanel}</div>}
    </footer>
  </>;
}
