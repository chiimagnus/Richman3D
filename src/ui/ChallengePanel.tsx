import type { GameApp } from "../app/GameApp";
import { challengeConfig, type DailyChallenge } from "../domain/challenges";
import { rulesFor } from "../domain/rules";
import { formatCash, formatMessage, messages } from "../i18n";
import { downloadRawProfile, downloadSave } from "../storage/transfer";
import { PanelHost } from "./PanelHost";
import { useState } from "react";

export function ChallengePanel({ app, challenge, onClose, onRecover }: { app: GameApp; challenge: DailyChallenge; onClose: () => void; onRecover: () => void }) {
  const state = app.getSnapshot();
  const language = state.preferences.language;
  const copy = messages(language);
  const config = challengeConfig(challenge);
  const [confirmReset, setConfirmReset] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const manageProfile = async (reset: boolean) => {
    setWorking(true); setError(false);
    try {
      if (reset) { await app.store.resetChallenges(); await app.refreshProfile(); setConfirmReset(false); }
      else downloadRawProfile(await app.store.readRawProfile());
    } catch { setError(true); }
    finally { setWorking(false); }
  };
  const record = state.profile.kind === "ready" ? state.profile.challenges.results.find((entry) => entry.challenge.id === challenge.id) : null;
  const blocked = state.loading || state.stored.kind === "loading" || state.stored.kind === "error" || state.profile.kind !== "ready";
  return <PanelHost title={copy.challenges.title} onClose={onClose}>
    <p>{formatMessage(copy.challenges.date, { date: challenge.date })}</p>
    <p>{formatMessage(copy.challenges.configuration, { map: copy.maps.definitions[challenge.mapId as keyof typeof copy.maps.definitions].name, rounds: rulesFor(config.rulesVersion).roundLimit, seats: config.players.length, bots: config.players.filter((player) => player.controller === "bot").length, difficulty: copy.ai.difficulties.normal })}</p>
    <p>{copy.challenges.localOnly}</p>
    <p>{formatMessage(copy.challenges.identity, { id: challenge.id, mapVersion: challenge.mapVersion, seed: challenge.seed })}</p>
    {record && <>
      <p>{formatMessage(copy.challenges.attempts, { attempts: record.attempts })}</p>
      {record.first && <p>{formatMessage(copy.challenges.first, { rank: record.first.rank, assets: formatCash(language, record.first.netAssets) })}</p>}
      {record.best && <p>{formatMessage(copy.challenges.best, { rank: record.best.rank, assets: formatCash(language, record.best.netAssets) })}</p>}
    </>}
    {state.stored.kind === "valid" && <><p>{copy.storage.replaceWarning}</p><button onClick={() => { if (state.stored.kind === "valid") downloadSave(state.stored.record); }}>{copy.storage.export}</button></>}
    {(state.stored.kind === "error" || state.profile.kind === "error") && <><p role="alert">{copy.challenges.storageError}</p><button onClick={onRecover}>{copy.storage.transfer.title}</button><button disabled={working} onClick={() => void app.refreshProfile()}>{copy.storage.retry}</button></>}
    {state.profile.kind === "error" && <>
      <button disabled={working} onClick={() => void manageProfile(false)}>{copy.challenges.exportRaw}</button>
      {confirmReset ? <><p>{copy.challenges.resetWarning}</p><button disabled={working} onClick={() => void manageProfile(true)}>{copy.challenges.confirmReset}</button><button disabled={working} onClick={() => setConfirmReset(false)}>{copy.setup.cancel}</button></> : <button disabled={working} onClick={() => setConfirmReset(true)}>{copy.challenges.reset}</button>}
    </>}
    {error && <p role="alert">{copy.challenges.storageError}</p>}
    <button disabled={blocked || working || confirmReset} onClick={() => { void app.startChallenge(challenge); onClose(); }}>{state.stored.kind === "valid" ? copy.challenges.replaceStart : copy.challenges.start}</button>
    <button onClick={onClose}>{copy.setup.cancel}</button>
  </PanelHost>;
}
