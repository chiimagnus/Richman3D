import type { GameApp } from "../app/GameApp";
import { formatMessage, messages, playerName } from "../i18n";
import { PanelHost } from "./PanelHost";
import { downloadSave } from "../storage/transfer";

export function PauseMenu({ app, onResume, onTransfer, onHistory }: { app: GameApp; onResume: () => void; onTransfer: () => void; onHistory: () => void }) {
  const copy = messages(app.getSnapshot().preferences.language);
  const session = app.getSnapshot().session!;
  const snapshot = session.getSnapshot().committed;
  return <PanelHost title={copy.navigation.pause} onClose={onResume}>
    <p>{formatMessage(copy.setup.turnOrder, { players: snapshot.turnOrder.map((id) => playerName(app.getSnapshot().preferences.language, id, snapshot.config)).join(copy.setup.nameSeparator) })}</p>
    <button onClick={onResume}>{copy.runtime.resume}</button>
    <button id="history-open" onClick={onHistory}>{copy.history.title}</button>
    <p>{app.getSnapshot().session?.getSnapshot().save.kind === "saved" ? copy.storage.preserved : copy.storage.unsaved}</p>
    {app.getSnapshot().session?.getSnapshot().save.kind === "unsaved" && <button onClick={() => void app.getSnapshot().session?.retrySave()}>{copy.storage.retry}</button>}
    <p>{copy.storage.exportWarning}</p><button onClick={() => downloadSave(session.exportRecord())}>{copy.storage.export}</button>
    <button id="transfer-open" onClick={onTransfer}>{copy.storage.transfer.title}</button>
    <button onClick={() => void app.restart()}>{copy.feedback.restart}</button>
    <button onClick={() => app.leave()}>{copy.runtime.leave}</button>
  </PanelHost>;
}
