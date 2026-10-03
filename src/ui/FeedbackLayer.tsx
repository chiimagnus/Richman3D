import { useEffect, useRef, useState } from "react";
import type { GameSession } from "../app/GameSession";
import type { Language } from "../i18n/language";
import { chanceCardText, formatMessage, messages, playerName } from "../i18n";
import { cardType, CONTROLLED_TOTALS } from "../domain/cards";
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
  const inMotion = view.mode === "running" && view.presenting && view.save.kind !== "saving" && view.displayed !== view.committed;
  const current = inMotion ? view.presentationEvent : null;
  const rolled = inMotion && !current ? view.events.find((event) => event.kind === "rolled") : null;
  const receipt = current?.kind === "rolled" && current.result.landing.kind === "item_received" && current.result.playerId === view.viewPlayerId
    ? view.committed.players.find((player) => player.id === view.viewPlayerId)!.hand.at(-1) : null;
  return <div className={styles.layer}>
    {current ? <p className={styles.event}>{eventText(language, current, view.committed)}{receipt && " " + chanceCardText(language, cardType(receipt), 0, 0, cardType(receipt) === "tax-discount" ? view.committed.rules.taxDiscountPercent : view.committed.rules.constructionDiscountPercent, CONTROLLED_TOTALS)}</p> : rolled?.kind === "rolled" && rolled.result.controlledBy ? <p className={styles.event}>{formatMessage(messages(language).items.controlled, { total: rolled.result.steps })}</p> : rolled?.kind === "rolled" ? <div key={view.committed.revision} className={styles.dice}>
      <span>{formatMessage(messages(language).feedback.diceActor, { actor: playerName(language, rolled.result.playerId, view.displayed.config) })}</span>
      <span className={styles.pair} role="img" aria-label={`${messages(language).hud.recentDiceAria}: ${rolled.result.dice.join(" + ")}`}>
        {rolled.result.dice.map((value, index) => <span key={index} className={styles.die} aria-hidden="true">{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value - 1]}</span>)}
      </span>
    </div> : notice && expired !== notice.id && notice.expiresAt > Date.now() && <p className={styles.event}>{eventText(language, notice.event, view.displayed)}</p>}
    <span className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}
