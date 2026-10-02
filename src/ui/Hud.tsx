import type { GameSession } from "../app/GameSession";
import { useEffect, useRef } from "react";
import { useGameView } from "./useGameView";
import { actionView } from "./viewModel";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import styles from "./Hud.module.css";
import { playerConfig } from "../domain/config";

export function Hud({ session, language }: { session: GameSession; language: Language }) {
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
  const buying = view.displayed.decision.kind === "awaiting_purchase" && playerConfig(view.displayed.config, view.displayed.activePlayerId).controller === "human" && !view.presenting;
  return <>
    <aside className={styles.balances} aria-label={copy.hud.balancesAria}>
      {view.displayed.players.map((player) => <span key={player.id} data-player={player.id}>
        {playerName(language, player.id, view.displayed.config)} <strong {...(playerConfig(view.displayed.config, player.id).controller === "human" ? { "data-human-cash": true } : { "data-bot-cash": true })}>{formatCash(language, player.cash)}</strong>
      </span>)}
      <span data-round>{formatMessage(copy.setup.round, { round: Math.min(view.displayed.completedRounds + 1, view.displayed.rules.roundLimit), limit: view.displayed.rules.roundLimit })}</span>
    </aside>
    <footer className={styles.dock} data-revision={view.displayed.revision} data-presenting={view.presenting}>
      <div className={styles.copy}><strong data-tile>{tileName(language, model.tile)}</strong><span data-status>{model.status}</span></div>
      <span data-dice aria-label={copy.hud.recentDiceAria}>{view.displayed.lastRoll ? view.displayed.lastRoll.join(" + ") : "— + —"}</span>
      <div ref={actions} className={styles.actions}>
        {buying ? <>
          <button data-buy disabled={!model.commands.some((action) => action.kind === "buy")} onClick={() => execute("buy")}>{model.property ? formatMessage(copy.hud.buyWithPrice, { price: model.property.price }) : copy.hud.buy}</button>
          <button data-skip disabled={!model.commands.some((action) => action.kind === "skip")} onClick={() => execute("skip")}>{copy.hud.skip}</button>
          {!model.commands.some((action) => action.kind === "buy") && <span>{copy.status.insufficientFunds}</span>}
        </> : <button data-roll disabled={!model.commands.some((action) => action.kind === "roll")} onClick={() => execute("roll")}>{copy.hud.roll}</button>}
        {view.presenting && <button onClick={() => session.skipPresentation()}>{copy.runtime.skipAnimation}</button>}
      </div>
    </footer>
  </>;
}
