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
    if (notice && session.claimAnnouncement(notice.id)) {
      setAnnouncement(eventText(language, notice.event, view.committed));
    }
  }, [notice, language, session]);
  const rolled = view.mode === "running" && view.presenting && view.save.kind !== "saving" && view.displayed !== view.committed ? view.events.find((event) => event.kind === "rolled") : null;
  return <div className={styles.layer}>
    {rolled?.kind === "rolled" ? <div key={view.committed.revision} className={styles.dice}>
      <span>{formatMessage(messages(language).feedback.diceActor, { actor: playerName(language, rolled.result.playerId, view.displayed.config) })}</span>
      <span className={styles.pair} role="img" aria-label={`${messages(language).hud.recentDiceAria}: ${rolled.result.dice.join(" + ")}`}>
        {rolled.result.dice.map((value, index) => <span key={index} className={styles.die} aria-hidden="true">{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value - 1]}</span>)}
      </span>
    </div> : notice && expired !== notice.id && notice.expiresAt > Date.now() && <p className={styles.event}>{eventText(language, notice.event, view.displayed)}</p>}
    <span className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}
