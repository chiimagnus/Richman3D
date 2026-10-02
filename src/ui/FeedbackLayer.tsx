import { useEffect, useRef, useState } from "react";
import type { GameSession } from "../app/GameSession";
import type { Language } from "../i18n/language";
import { formatMessage, messages, playerName } from "../i18n";
import { useGameView } from "./useGameView";
import { eventText } from "./eventText";
import styles from "./FeedbackLayer.module.css";

export function FeedbackLayer({ session, language }: { session: GameSession; language: Language }) {
  const view = useGameView(session);
  const [expired, setExpired] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef<number | null>(null);
  const lastLanguage = useRef(language);
  const notice = view.notice;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setExpired(notice.id), Math.max(notice.expiresAt - Date.now(), 0));
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (lastLanguage.current !== language) {
      lastLanguage.current = language;
      setAnnouncement("");
    }
    if (notice && announced.current !== notice.id) {
      announced.current = notice.id;
      setAnnouncement(eventText(language, notice.event));
    }
  }, [notice, language]);
  const rolled = view.presenting ? view.events.find((event) => event.kind === "rolled") : null;
  return <div className={styles.layer}>
    {rolled?.kind === "rolled" ? <div className={styles.dice} data-feedback-dice>
      <span>{formatMessage(messages(language).feedback.diceActor, { actor: playerName(language, rolled.result.playerId) })}</span>
      <strong>{rolled.result.dice.join(" + ")}</strong>
    </div> : notice && expired !== notice.id && <p className={styles.event} data-feedback-event>{eventText(language, notice.event)}</p>}
    <span className={styles.srOnly} aria-live="polite" aria-atomic="true" data-announcement>{announcement}</span>
  </div>;
}
