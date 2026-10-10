import type { GameApp } from "../app/GameApp";
import type { GameReadSnapshot } from "../domain/types";
import { observerId } from "../domain/config";
import { formatCash, formatMessage, messages, playerName, resultTitle } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./ResultsScreen.module.css";
import { useState } from "react";
import { matchSummary } from "../domain/records";
import { summaryText } from "./RecordsPanel";

export function ResultsScreen({ app, snapshot, onHistory, onRecords, returnToRecords = false }: { app: GameApp; snapshot: GameReadSnapshot; onHistory: () => void; onRecords?: (() => void) | undefined; returnToRecords?: boolean }) {
  const [copied, setCopied] = useState<"copied" | "copyUnavailable" | null>(null);
  if (snapshot.decision.kind !== "game_over") return null;
  const result = snapshot.decision.result;
  const preferences = app.getSnapshot().preferences;
  const language = preferences.language;
  const copy = messages(language);
  const session = app.getSnapshot().session;
  const local = session?.kind !== "online";
  const challenge = session?.kind === "local" ? session.challenge : null;
  const profile = app.getSnapshot().profile;
  const save = session?.getSnapshot().save;
  const recorded = profile.kind === "ready" ? profile.records.recent.find((entry) => entry.matchId === session?.matchId) : null;
  const completed = profile.kind === "ready" && profile.challenges.active?.matchId === session?.matchId && profile.challenges.active?.completed;
  const localSnapshot = local && "seed" in snapshot.config && "random" in snapshot && "deck" in snapshot ? snapshot as import("../domain/types").GameSnapshot : null;
  const share = recorded ? summaryText(recorded, language) : localSnapshot ? summaryText(matchSummary(localSnapshot, session?.matchId ?? "", challenge ? "challenge" : "free", save?.kind === "saved" ? save.savedAt : 0), language)
    : resultTitle(language, result, snapshot.config) + "\n" + result.rankings.map((entry) => `${entry.rank}. ${playerName(language, entry.playerId, snapshot.config)} · ${formatCash(language, entry.netAssets)}`).join("\n");
  const copySummary = async () => {
    try { await navigator.clipboard.writeText(share); setCopied("copied"); }
    catch { setCopied("copyUnavailable"); }
  };
  const challengeRecord = challenge && profile.kind === "ready" ? profile.challenges.results.find((entry) => entry.challenge.id === challenge.id) : null;
  const own = !local ? result.rankings.find((entry) => entry.playerId === session?.getSnapshot().viewPlayerId) : snapshot.config.players.filter((player) => player.controller === "human").length === 1 ? result.rankings.find((entry) => entry.playerId === observerId(snapshot.config))! : null;
  return <PanelHost title={resultTitle(language, result, snapshot.config)} initialFocusId={returnToRecords ? "records-open" : undefined}>
    <p>{copy.setup[result.reason]}</p>
    {challenge && <p>{formatMessage(copy.challenges.date, { date: challenge.date })}</p>}
    {challengeRecord?.best && <p>{formatMessage(copy.challenges.best, { rank: challengeRecord.best.rank, assets: formatCash(language, challengeRecord.best.netAssets) })}</p>}
    {challengeRecord && <p>{formatMessage(copy.challenges.attempts, { attempts: challengeRecord.attempts })}</p>}
    {result.reason === "round_limit" && <p>{formatMessage(copy.setup.round, { round: snapshot.completedRounds, limit: snapshot.rules.roundLimit })}</p>}
    {own && <p>{formatMessage(copy.results.yourResult, { rank: own.rank, assets: formatCash(language, own.netAssets) })}</p>}
    <ol className={styles.rankings} aria-label={copy.results.rankings}>
      {result.rankings.map((entry) => <li key={entry.playerId} value={entry.rank}>
        <span>{playerName(language, entry.playerId, snapshot.config)}</span><strong>{formatCash(language, entry.netAssets)}</strong>
      </li>)}
    </ol>
    {local ? <button autoFocus className={styles.primary} onClick={() => void app.restart()}>{copy.feedback.restart}</button> : <button autoFocus className={styles.primary} onClick={() => void app.leave()}>{copy.network.leave}</button>}
    <details><summary>{copy.results.details}</summary>
      {result.rankings.map((entry) => {
        const player = snapshot.players.find((candidate) => candidate.id === entry.playerId)!;
        return <section key={entry.playerId}>
          <h3>{playerName(language, entry.playerId, snapshot.config)}</h3>
          <dl className={styles.finances}>
            <dt>{copy.results.cash}</dt><dd>{formatCash(language, player.cash)}</dd>
            <dt>{copy.results.propertyValue}</dt><dd>{formatCash(language, entry.propertyValue)}</dd>
            <dt>{copy.results.startingCash}</dt><dd>{formatCash(language, snapshot.rules.startingCash)}</dd>
            {Object.entries(player.statistics).map(([field, amount]) => <div className={styles.stat} key={field}>
              <dt>{copy.results.statistics[field as keyof typeof player.statistics]}</dt><dd>{formatCash(language, amount)}</dd>
            </div>)}
          </dl>
        </section>;
      })}
      {localSnapshot && <><p>{formatMessage(copy.results.seed, { seed: localSnapshot.config.seed })}</p><p>{copy.results.replayDetail}</p><button onClick={() => void app.restart(true)}>{copy.results.replay}</button></>}
    </details>
    <details><summary>{copy.records.share}</summary>
      <label>{copy.records.shareText}<textarea className={styles.share} readOnly value={share} onFocus={(event) => event.currentTarget.select()} /></label>
      <button onClick={() => void copySummary()}>{copy.records.copy}</button>
      {copied && <p role="status">{copy.records[copied]}</p>}
    </details>
    <div className={styles.secondary}>
      <button id="history-open" onClick={onHistory}>{copy.history.title}</button>
      {onRecords && <button id="records-open" onClick={onRecords}>{copy.records.title}</button>}
      {local && <button onClick={() => app.leave()}>{copy.runtime.leave}</button>}
      <label>{copy.settings.language}<select value={language} onChange={(event) => app.setPreferences({ ...preferences, language: event.currentTarget.value as "en" | "zh-CN" })}>
        <option value="zh-CN">{copy.settings.languageOptions["zh-CN"]}</option><option value="en">{copy.settings.languageOptions.en}</option>
      </select></label>
    </div>
    <p>{!local ? copy.network.notRecorded : session?.kind === "local" && session.source === "imported" ? copy.records.imported : profile.kind === "error" ? copy.records.error : recorded ? copy.records.saved : completed ? copy.records.notRetained : copy.records.notSaved}</p>
  </PanelHost>;
}
