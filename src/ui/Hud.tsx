import type { GameSession } from "../app/GameSession";
import { useEffect, useRef, type ReactNode } from "react";
import type { PlayerId } from "../domain/types";
import type { ItemCardId } from "../domain/types";
import { cardType } from "../domain/cards";
import { TileDetails } from "./PropertyDetails";
import { useGameView } from "./useGameView";
import { actionView } from "./viewModel";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import styles from "./Hud.module.css";

export function Hud({ session, language, onAssets, onHand, assetPanel, inspectedTileId, onInspect }: { session: GameSession; language: Language; onAssets: (playerId: PlayerId) => void; onHand?: (() => void) | undefined; assetPanel: ReactNode; inspectedTileId: string | null; onInspect: (tileId: string | null) => void }) {
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
  const inspectedTile = view.displayed.map.tiles.find((tile) => tile.id === inspectedTileId) ?? model.property ?? model.tile;
  const dice = view.settledRoll?.result.dice ?? view.displayed.lastRoll;
  return <>
    <aside className={styles.balances} aria-label={copy.hud.balancesAria}>
      {view.displayed.players.map((player) => <button key={player.id} id={`assets-open-${player.id}`} aria-current={player.id === view.displayed.turnPlayerId ? "true" : undefined} aria-label={formatMessage(copy.assets.open, { player: playerName(language, player.id, view.displayed.config) })} onClick={() => onAssets(player.id)}>
        <span>{playerName(language, player.id, view.displayed.config)}</span><strong>{formatCash(language, player.cash)}</strong>
      </button>)}
      <span className={styles.round}>{formatMessage(copy.setup.round, { round: Math.min(view.displayed.completedRounds + 1, view.displayed.rules.roundLimit), limit: view.displayed.rules.roundLimit })}</span>
    </aside>
    <footer className={styles.dock}>
      <div className={styles.copy}><strong>{tileName(language, model.tile)}</strong><span>{model.status}</span></div>
      <div ref={actions} className={styles.actions}>
        <span className={styles.dice} role="img" aria-label={`${copy.hud.recentDiceAria}: ${dice ? dice.join(" + ") : "— + —"}`}>
          {(dice ?? [null, null]).map((value, index) => <span key={index} aria-hidden="true">{value ?? "—"}</span>)}
        </span>
        {buying ? <>
          <button className={styles.primary} aria-keyshortcuts="B" disabled={!model.commands.some((action) => action.kind === "buy")} onClick={() => execute("buy")}>{model.property ? formatMessage(copy.hud.buyWithPrice, { price: formatCash(language, model.property.price) }) : copy.hud.buy}<kbd aria-hidden="true">B</kbd></button>
          <button aria-keyshortcuts="N" disabled={!model.commands.some((action) => action.kind === "skip")} onClick={() => execute("skip")}>{copy.hud.skip}<kbd aria-hidden="true">N</kbd></button>
          {model.insufficientFunds && <span className={styles.reason}>{copy.status.insufficientFunds}</span>}
        </> : <button className={styles.primary} aria-keyshortcuts="Space" disabled={!model.commands.some((action) => action.kind === "roll")} onClick={() => execute("roll")}>{copy.hud.roll}<kbd aria-hidden="true">{copy.hud.rollKey}</kbd></button>}
        {view.presenting && <button onClick={() => session.skipPresentation()}>{copy.runtime.skipAnimation}</button>}
        {onHand && <button id="hand-open" disabled={view.presenting} onClick={onHand}>{formatMessage(copy.items.open, { count: view.displayed.players.find((player) => player.id === view.viewPlayerId)!.hand.length })}</button>}
      </div>
      <details className={styles.property} open={inspectedTileId !== null} onToggle={(event) => {
        if (event.currentTarget.open && inspectedTileId === null) onInspect(inspectedTile.id);
        else if (!event.currentTarget.open && inspectedTileId !== null) onInspect(null);
      }}>
        <summary>{copy.assets.details}</summary>
        <label className={styles.tilePicker}>{copy.assets.tile}<select value={inspectedTile.id} onChange={(event) => onInspect(event.currentTarget.value)}>
          {view.displayed.map.tiles.map((tile, index) => <option key={tile.id} value={tile.id}>{formatMessage(copy.assets.tileOption, { number: index + 1, tile: tileName(language, tile) })}</option>)}
        </select></label>
        <TileDetails snapshot={view.displayed} tile={inspectedTile} language={language} />
      </details>
      {view.displayed.players.find((player) => player.id === view.viewPlayerId)?.bankrupt && <p className={styles.notice}>{copy.setup.spectating}</p>}
      {view.displayed.activeItem?.actorId === view.viewPlayerId && !view.presenting && <p className={styles.notice} role="status">{formatMessage(copy.items.active, { card: copy.items.names[cardType(view.displayed.activeItem.instanceId) as ItemCardId] })}{view.displayed.activeItem.total !== null && " " + formatMessage(copy.items.controlled, { total: view.displayed.activeItem.total })}</p>}
      {view.save.kind === "unsaved" && view.save.acknowledged && <span className={styles.notice} role="status">{copy.storage.unsaved}</span>}
      {assetPanel && <div className={styles.assets}>{assetPanel}</div>}
    </footer>
  </>;
}
