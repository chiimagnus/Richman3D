import { useEffect, useState, useSyncExternalStore } from "react";
import type { GameApp } from "../app/GameApp";
import { ACHIEVEMENTS } from "../domain/achievements";
import { MATCH_RECORD_LIMIT, type MatchSummary } from "../domain/records";
import { CHALLENGE_DAYS } from "../domain/challenges";
import { formatCash, formatMessage, messages } from "../i18n";
import type { Language } from "../i18n/language";
import { downloadRawProfile } from "../storage/transfer";
import { PanelHost } from "./PanelHost";
import styles from "./ResultsScreen.module.css";

export function summaryText(summary: MatchSummary, language: Language): string {
  const copy = messages(language);
  const seat = (id: string) => formatMessage(copy.records.seat, { seat: id.slice(1) });
  return [
    formatMessage(copy.records.shareHeader, { map: copy.maps.definitions[summary.mapId as keyof typeof copy.maps.definitions].name, mode: copy.records[summary.mode], rounds: summary.rounds, limit: summary.roundLimit }),
    copy.setup[summary.reason],
    ...[...summary.players].sort((first, second) => first.rank - second.rank).map((player) => formatMessage(copy.records.ranking, { seat: seat(player.id), rank: player.rank, cash: formatCash(language, player.cash), assets: formatCash(language, player.netAssets) })),
    formatMessage(copy.records.conditions, { rules: summary.rulesVersion, mapVersion: summary.mapVersion, seed: summary.seed }),
    ...summary.players.map((player) => formatMessage(copy.records.controller, { seat: seat(player.id), controller: player.controller === "human" ? copy.records.human : formatMessage(copy.records.bot, { difficulty: copy.ai.difficulties[player.difficulty] }) })),
    copy.records.replayWarning,
  ].join("\n");
}

export function RecordsPanel({ app, onClose }: { app: GameApp; onClose: () => void }) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot, app.getSnapshot);
  useEffect(() => { void app.refreshProfile(); }, [app]);
  const language = state.preferences.language;
  const copy = messages(language);
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const manage = async (clear: boolean) => {
    setWorking(true); setError(false);
    try {
      if (clear) { await app.store.clearRecords(); await app.refreshProfile(); setConfirm(false); }
      else downloadRawProfile(await app.store.readRawProfile());
    } catch { setError(true); }
    finally { setWorking(false); }
  };
  return <PanelHost title={copy.records.title} onClose={onClose} action={<button aria-keyshortcuts="Escape" onClick={onClose}>{copy.settings.returnToGame}<kbd aria-hidden="true">Esc</kbd></button>}>
    {state.profile.kind === "loading" && <p role="status">{copy.records.loading}</p>}
    {(state.profile.kind === "error" || error) && <><p role="alert">{copy.records.error}</p><button disabled={working} onClick={() => void app.refreshProfile()}>{copy.storage.retry}</button></>}
    {state.profile.kind === "ready" && <>
      <h3>{formatMessage(copy.records.recent, { limit: MATCH_RECORD_LIMIT })}</h3>
      {state.profile.records.recent.length === 0 && <p>{copy.records.empty}</p>}
      {state.profile.records.recent.map((record) => <details key={record.matchId}>
        <summary>{formatMessage(copy.records.summary, { date: new Date(record.endedAt).toISOString().slice(0, 10), map: copy.maps.definitions[record.mapId as keyof typeof copy.maps.definitions].name, mode: copy.records[record.mode], rounds: record.rounds, limit: record.roundLimit })}</summary>
        <p className={styles.summary}>{summaryText(record, language)}</p>
        {record.players.map((player) => <section key={player.id}>
          <h4>{formatMessage(copy.records.seat, { seat: player.id.slice(1) })}</h4>
          <dl className={styles.finances}>{Object.entries(player.statistics).map(([field, amount]) => <div className={styles.stat} key={field}>
            <dt>{copy.results.statistics[field as keyof typeof player.statistics]}</dt><dd>{formatCash(language, amount)}</dd>
          </div>)}</dl>
        </section>)}
      </details>)}
      <details><summary>{copy.records.achievements}</summary><ul>{ACHIEVEMENTS.map((id) => <li key={id}>{copy.records.achievementNames[id]} · {state.profile.kind === "ready" && state.profile.records.achievements.includes(id) ? copy.records.unlocked : copy.records.locked}</li>)}</ul></details>
      <details><summary>{formatMessage(copy.records.challengeHistory, { days: CHALLENGE_DAYS })}</summary>
        <p>{copy.challenges.localOnly}</p>
        {state.profile.challenges.results.length === 0 && <p>{copy.records.empty}</p>}
        {state.profile.challenges.results.map((record) => <section key={record.challenge.id}>
          <h4>{formatMessage(copy.challenges.date, { date: record.challenge.date })}</h4>
          <p>{formatMessage(copy.challenges.identity, { id: record.challenge.id, mapVersion: record.challenge.mapVersion, seed: record.challenge.seed })}</p>
          <p>{formatMessage(copy.challenges.attempts, { attempts: record.attempts })}</p>
          {record.first && <p>{formatMessage(copy.challenges.first, { rank: record.first.rank, assets: formatCash(language, record.first.netAssets) })}</p>}
          {record.best && <p>{formatMessage(copy.challenges.best, { rank: record.best.rank, assets: formatCash(language, record.best.netAssets) })}</p>}
        </section>)}
      </details>
    </>}
    <div className={styles.secondary}>
      <button disabled={working} onClick={() => void manage(false)}>{copy.records.exportRaw}</button>
      {confirm ? <><p>{copy.records.clearWarning}</p><button disabled={working} onClick={() => void manage(true)}>{copy.records.confirmClear}</button><button disabled={working} onClick={() => setConfirm(false)}>{copy.setup.cancel}</button></> : <button disabled={working || state.profile.kind === "loading"} onClick={() => setConfirm(true)}>{copy.records.clear}</button>}
    </div>
  </PanelHost>;
}
