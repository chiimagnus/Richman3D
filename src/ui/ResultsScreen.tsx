import type { GameApp } from "../app/GameApp";
import type { GameSnapshot } from "../domain/types";
import { observerId } from "../domain/config";
import { formatCash, formatMessage, messages, playerName, resultTitle } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./ResultsScreen.module.css";

export function ResultsScreen({ app, snapshot }: { app: GameApp; snapshot: GameSnapshot }) {
  if (snapshot.decision.kind !== "game_over") return null;
  const result = snapshot.decision.result;
  const preferences = app.getSnapshot().preferences;
  const language = preferences.language;
  const copy = messages(language);
  const own = snapshot.config.players.filter((player) => player.controller === "human").length === 1 ? result.rankings.find((entry) => entry.playerId === observerId(snapshot.config))! : null;
  return <PanelHost title={resultTitle(language, result, snapshot.config)}>
    <p>{copy.setup[result.reason]}</p>
    {result.reason === "round_limit" && <p data-round>{formatMessage(copy.setup.round, { round: snapshot.completedRounds, limit: snapshot.rules.roundLimit })}</p>}
    {own && <p>{formatMessage(copy.results.yourResult, { rank: own.rank, assets: formatCash(language, own.netAssets) })}</p>}
    <ol className={styles.rankings} aria-label={copy.results.rankings}>
      {result.rankings.map((entry) => <li key={entry.playerId} data-result-player={entry.playerId} value={entry.rank}>
        <span>{playerName(language, entry.playerId, snapshot.config)}</span><strong data-net-assets>{formatCash(language, entry.netAssets)}</strong>
      </li>)}
    </ol>
    <button data-restart autoFocus className={styles.primary} onClick={() => void app.restart()}>{copy.feedback.restart}</button>
    <details data-result-details><summary>{copy.results.details}</summary>
      {result.rankings.map((entry) => {
        const player = snapshot.players.find((candidate) => candidate.id === entry.playerId)!;
        return <section key={entry.playerId} data-detail-player={entry.playerId}>
          <h3>{playerName(language, entry.playerId, snapshot.config)}</h3>
          <dl className={styles.finances}>
            <dt>{copy.results.cash}</dt><dd data-final-cash>{formatCash(language, player.cash)}</dd>
            <dt>{copy.results.propertyValue}</dt><dd data-property-value>{formatCash(language, entry.propertyValue)}</dd>
            <dt>{copy.results.startingCash}</dt><dd>{formatCash(language, snapshot.rules.startingCash)}</dd>
            {Object.entries(player.statistics).map(([field, amount]) => <div className={styles.stat} key={field}>
              <dt>{copy.results.statistics[field as keyof typeof player.statistics]}</dt><dd data-finance={field}>{formatCash(language, amount)}</dd>
            </div>)}
          </dl>
        </section>;
      })}
      <p data-result-seed>{formatMessage(copy.results.seed, { seed: snapshot.config.seed })}</p>
      <p>{copy.results.replayDetail}</p>
      <button data-replay onClick={() => void app.restart(true)}>{copy.results.replay}</button>
    </details>
    <div className={styles.secondary}>
      <button onClick={() => app.leave()}>{copy.runtime.leave}</button>
      <label>{copy.settings.language}<select data-result-language value={language} onChange={(event) => app.setPreferences({ ...preferences, language: event.currentTarget.value as "en" | "zh-CN" })}>
        <option value="zh-CN">{copy.settings.languageOptions["zh-CN"]}</option><option value="en">{copy.settings.languageOptions.en}</option>
      </select></label>
    </div>
    <p>{copy.results.notRecorded}</p>
  </PanelHost>;
}
