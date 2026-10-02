import type { GameSession } from "../app/GameSession";
import { useEffect, useRef } from "react";
import { useGameView } from "./useGameView";
import { actionView } from "./viewModel";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import styles from "./Hud.module.css";
import { playerConfig } from "../domain/config";
import type { TutorialStep } from "../app/tutorial";

export function Hud({ session, language, tutorial, onTutorialNext, onTutorialExit }: { session: GameSession; language: Language; tutorial?: TutorialStep | undefined; onTutorialNext?: () => void; onTutorialExit?: (completed: boolean) => void }) {
  const view = useGameView(session);
  const model = actionView(view, language);
  const copy = messages(language);
  const actions = useRef<HTMLDivElement>(null);
  const decisionKind = view.displayed.decision.kind;
  useEffect(() => {
    if (!view.presenting && view.mode === "running" && document.activeElement === document.body) {
      actions.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    }
  }, [decisionKind, view.presenting, view.mode, view.attached, tutorial?.number]);
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
      {view.save.kind === "unsaved" && view.save.acknowledged && <span data-save-status role="status">{copy.storage.unsaved}</span>}
      <div ref={actions} className={styles.actions}>
        {tutorial && (tutorial.number === 1 || tutorial.number === 3) ? <button data-tutorial-next disabled={!tutorial.ready} onClick={onTutorialNext}>{copy.tutorial.next}</button> : tutorial?.number === 5 ? <button data-tutorial-finish disabled={!tutorial.ready} onClick={() => onTutorialExit?.(true)}>{copy.tutorial.finish}</button> : buying ? <>
          <button data-buy disabled={!model.commands.some((action) => action.kind === "buy")} onClick={() => execute("buy")}>{model.property ? formatMessage(copy.hud.buyWithPrice, { price: model.property.price }) : copy.hud.buy}</button>
          <button data-skip disabled={!model.commands.some((action) => action.kind === "skip")} onClick={() => execute("skip")}>{copy.hud.skip}</button>
          {!model.commands.some((action) => action.kind === "buy") && <span>{copy.status.insufficientFunds}</span>}
        </> : <button data-roll disabled={!model.commands.some((action) => action.kind === "roll")} onClick={() => execute("roll")}>{copy.hud.roll}</button>}
        {view.presenting && <button onClick={() => session.skipPresentation()}>{copy.runtime.skipAnimation}</button>}
      </div>
      {tutorial && <div className={styles.tutorial} data-tutorial-step={tutorial.number}>
        <strong>{formatMessage(copy.tutorial.progress, { step: tutorial.number })}</strong>
        <p>{copy.tutorial.steps[`step${tutorial.number}`]}</p>
        <button data-tutorial-skip onClick={() => onTutorialExit?.(false)}>{copy.tutorial.skip}</button>
      </div>}
    </footer>
  </>;
}
