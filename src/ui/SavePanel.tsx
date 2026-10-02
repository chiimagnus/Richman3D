import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import { downloadSave } from "../storage/transfer";

export function SavePanel({ app, session, onTransfer }: { app: GameApp; session: GameSession; onTransfer: () => void }) {
  const copy = messages(app.getSnapshot().preferences.language).storage;
  const save = session.getSnapshot().save;
  const conflict = save.kind === "conflict";
  return <PanelHost title={copy.problemTitle}>
    <p role="alert">{conflict ? copy.conflict : copy.unsaved}</p>
    {conflict ? <button data-load-latest onClick={() => void app.continueSaved()}>{copy.loadLatest}</button> : <>
      <button data-save-retry onClick={() => void session.retrySave()}>{copy.retry}</button>
      <button data-unsaved-continue disabled={!session.getSnapshot().attached} onClick={() => void session.continueUnsaved()}>{copy.continueUnsaved}</button>
    </>}
    <p>{copy.exportWarning}</p>
    <button data-save-export onClick={() => downloadSave(session.exportRecord())}>{copy.export}</button>
    <button data-transfer-open onClick={onTransfer}>{copy.transfer.title}</button>
    <p>{copy.discardWarning}</p>
    <button data-unsaved-discard onClick={() => void app.leave(true)}>{copy.discard}</button>
  </PanelHost>;
}
