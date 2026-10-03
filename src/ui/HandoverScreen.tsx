import type { GameSession } from "../app/GameSession";
import { useEffect, useRef } from "react";
import type { PlayerId } from "../domain/types";
import { playerConfig } from "../domain/config";
import { formatMessage, messages, playerName } from "../i18n";
import type { Language } from "../i18n/language";
import { PanelHost } from "./PanelHost";

export function HandoverScreen({ session, actor, language, onPause }: { session: GameSession; actor: PlayerId; language: Language; onPause: () => void }) {
  const config = session.getSnapshot().committed.config;
  const copy = messages(language);
  const confirm = useRef<HTMLButtonElement>(null);
  const ready = session.getSnapshot().attached && session.getSnapshot().save.kind !== "saving";
  useEffect(() => { if (ready) confirm.current?.focus({ preventScroll: true }); }, [ready]);
  return <PanelHost title={copy.handover.title} onClose={onPause}>
    <p>{copy.handover.instruction}</p>
    <p><span aria-hidden="true" style={{ color: playerConfig(config, actor).color }}>● </span>{copy.handover.pawn} <strong>{playerName(language, actor, config)}</strong> · {formatMessage(copy.handover.seat, { number: config.players.findIndex((player) => player.id === actor) + 1 })}</p>
    <button ref={confirm} autoFocus disabled={!ready} onClick={() => session.confirmHandover(actor)}>{copy.handover.confirm}</button>
    <button onClick={onPause}>{copy.navigation.pause}</button>
  </PanelHost>;
}
