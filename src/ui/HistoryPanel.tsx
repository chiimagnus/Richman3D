import { HISTORY_LIMIT } from "../domain/types";
import { formatMessage, messages } from "../i18n";
import type { Language } from "../i18n/language";
import { PanelHost } from "./PanelHost";
import styles from "./Inspection.module.css";

export function HistoryPanel({ entries, language, onClose }: { entries: readonly { readonly revision: number; readonly text: string }[]; language: Language; onClose: () => void }) {
  const copy = messages(language).history;
  return <PanelHost title={copy.title} onClose={onClose}>
    <button onClick={onClose}>{copy.back}</button>
    <p>{formatMessage(copy.count, { limit: HISTORY_LIMIT, count: entries.length })}</p>
    {entries.length ? <ol className={styles.history}>
      {[...entries].reverse().map((entry, index) => <li key={index}><strong>{formatMessage(copy.revision, { revision: entry.revision })}</strong><p>{entry.text}</p></li>)}
    </ol> : <p>{copy.empty}</p>}
  </PanelHost>;
}
