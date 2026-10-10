import { useState, useSyncExternalStore } from "react";
import type { GameApp } from "../app/GameApp";
import { readRoomCredential, roomCredential, type RoomView } from "../network/RoomClient";
import { ROOM_CODE } from "../network/protocol";
import { createMatchConfig, SEAT_COLORS } from "../domain/config";
import { MAPS } from "../domain/maps";
import { QUICK_RULES, STANDARD_RULES } from "../domain/rules";
import { formatMessage, messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import { MapPreview } from "./MapPreview";
import styles from "./RoomPanel.module.css";

const EMPTY: RoomView = { status: "disconnected", room: null, error: null, pending: false, remembered: false, message: null };
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

export function RoomPanel({ app, onClose }: { app: GameApp; onClose: () => void }) {
  const state = app.getSnapshot();
  const client = state.room;
  const view = useSyncExternalStore(client?.subscribe ?? noopSubscribe, client?.getSnapshot ?? emptySnapshot);
  const language = state.preferences.language;
  const copy = messages(language);
  const text = copy.network;
  const [action, setAction] = useState<"create" | "join">(() => ROOM_CODE.test(new URLSearchParams(window.location.hash.slice(1)).get("room") ?? "") ? "join" : "create");
  const [code, setCode] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("room") ?? "");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(2);
  const [mapId, setMapId] = useState(createMatchConfig().mapId);
  const [standard, setStandard] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<"copied" | "copyUnavailable" | null>(null);
  const [remembered] = useState(() => { try { return readRoomCredential(window.sessionStorage); } catch { return { kind: "unavailable" as const }; } });
  const room = view.room;
  const map = MAPS.find((candidate) => candidate.id === mapId)!;
  const rules = standard ? STANDARD_RULES : QUICK_RULES;
  const invite = new URL(window.location.href);
  invite.hash = `room=${room?.code ?? client?.credential.code ?? ""}`;
  const close = () => { if (client) void app.leave(); onClose(); };
  return <PanelHost title={text.title} onClose={close}>
    {!client ? <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      try { const credential = roomCredential(action, name, code, { seats, mapId, rulesVersion: rules.version }); setError(false); void app.enterRoom(credential); }
      catch { setError(true); }
    }}>
      <fieldset className={styles.mode}><legend>{text.title}</legend>
        {(["create", "join"] as const).map((kind) => <label key={kind}><input type="radio" name="room-action" checked={action === kind} onChange={() => { setAction(kind); setError(false); }} />{text[kind]}</label>)}
      </fieldset>
      <label>{text.name}<input autoComplete="nickname" value={name} onChange={(event) => { setName(event.currentTarget.value); setError(false); }} /></label>
      {action === "join" ? <label>{text.code}<input autoComplete="off" spellCheck={false} minLength={8} maxLength={8} required value={code} onChange={(event) => { setCode(event.currentTarget.value.toUpperCase()); setError(false); }} /></label> : <>
        <label>{copy.setup.seats}<select value={seats} onChange={(event) => setSeats(Number(event.currentTarget.value))}>{[2, 3, 4].map((count) => <option key={count} value={count}>{formatMessage(copy.setup.seatOption, { count })}</option>)}</select></label>
        <label>{copy.maps.choose}<select value={mapId} onChange={(event) => setMapId(event.currentTarget.value)}>{MAPS.map((candidate) => <option key={candidate.id} value={candidate.id}>{copy.maps.definitions[candidate.id as keyof typeof copy.maps.definitions].name}</option>)}</select></label>
        <label>{copy.setup.length}<select value={standard ? "standard" : "quick"} onChange={(event) => setStandard(event.currentTarget.value === "standard")}><option value="quick">{formatMessage(copy.setup.quick, { rounds: QUICK_RULES.roundLimit })}</option><option value="standard">{formatMessage(copy.setup.standard, { rounds: STANDARD_RULES.roundLimit })}</option></select></label>
        <MapPreview map={map} rules={rules} language={language} />
      </>}
      {error && <p role="alert">{text.errors.invalid_request}</p>}
      <button className={styles.primary} type="submit" disabled={state.loading}>{text[action]}</button>
      {remembered.kind === "valid" && <button type="button" disabled={state.loading} onClick={() => void app.enterRoom(remembered.credential)}>{text.resume} · {remembered.credential.code}</button>}
      {remembered.kind === "invalid" && <p role="status">{text.invalidCredential}</p>}
    </form> : <section className={styles.form}>
      <label>{text.code}<input readOnly value={room?.code ?? client.credential.code} onFocus={(event) => event.currentTarget.select()} /></label>
      <p role="status">{view.status === "connecting" ? text.connecting : view.pending ? text.pending : view.status === "connected" ? text.connected : text.disconnected}</p>
      {view.error && <p role="alert">{text.errors[view.error]}</p>}
      {view.status === "disconnected" && <button className={styles.primary} onClick={() => client.reconnect()}>{text.reconnect}</button>}
      {room && <>
        <label>{text.invite}<input readOnly value={invite.href} onFocus={(event) => event.currentTarget.select()} /></label>
        <button onClick={() => { void navigator.clipboard?.writeText(invite.href).then(() => setCopied("copied"), () => setCopied("copyUnavailable")); if (!navigator.clipboard) setCopied("copyUnavailable"); }}>{text.copy}</button>
        {copied && <p role="status">{text[copied]}</p>}
        <ol className={styles.members}>{room.members.map((member, index) => <li key={member.id}>
          <span className={styles.seat} style={{ background: SEAT_COLORS[index] }} aria-hidden="true">{index + 1}</span>
          <strong>{member.name ?? copy.players[member.id]}{member.id === room.playerId ? ` · ${text.you}` : ""}{member.id === "p1" ? ` · ${text.host}` : ""}</strong>
          <span>{member.connected ? text.connected : text.disconnected}</span>
        </li>)}</ol>
        {room.members.length < room.options.seats ? <p>{formatMessage(text.waitingPlayers, { count: room.options.seats - room.members.length })}</p> : room.members.some((member) => !member.connected) ? <p>{text.errors.not_ready}</p> : null}
        {room.playerId === "p1" ? <button className={styles.primary} disabled={view.status !== "connected" || view.pending || room.members.length !== room.options.seats || room.members.some((member) => !member.connected)} onClick={() => client.start()}>{text.start}</button> : <p>{text.hostOnly}</p>}
        <p>{formatMessage(text.expiry, { time: new Date(room.expiresAt).toLocaleString(language) })}</p>
      </>}
      {!view.remembered && <p role="alert">{text.notRemembered}</p>}
    </section>}
    <div className={styles.footer}>
      <label>{copy.settings.language}<select value={language} onChange={(event) => app.setPreferences({ ...state.preferences, language: event.currentTarget.value as "en" | "zh-CN" })}><option value="zh-CN">{copy.settings.languageOptions["zh-CN"]}</option><option value="en">{copy.settings.languageOptions.en}</option></select></label>
      <button onClick={close}>{client ? text.leave : copy.setup.cancel}</button>
    </div>
  </PanelHost>;
}
