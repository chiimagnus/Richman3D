import type { GameApp } from "../app/GameApp";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import { downloadSave } from "../storage/transfer";

export function PauseMenu({ app, onResume, onTransfer }: { app: GameApp; onResume: () => void; onTransfer: () => void }) {
  const copy = messages(app.getSnapshot().preferences.language);
  const session = app.getSnapshot().session!;
  return <PanelHost title={copy.navigation.pause} onClose={onResume}>
    <button onClick={onResume}>{copy.runtime.resume}</button>
    <p>{app.getSnapshot().session?.getSnapshot().save.kind === "saved" ? copy.storage.preserved : copy.storage.unsaved}</p>
    {app.getSnapshot().session?.getSnapshot().save.kind === "unsaved" && <button data-save-retry onClick={() => void app.getSnapshot().session?.retrySave()}>{copy.storage.retry}</button>}
    {session.purpose === "match" && <><p>{copy.storage.exportWarning}</p><button data-save-export onClick={() => downloadSave(session.exportRecord())}>{copy.storage.export}</button></>}
    {session.purpose === "match" && <button data-transfer-open onClick={onTransfer}>{copy.storage.transfer.title}</button>}
    <button onClick={() => void app.restart()}>{copy.feedback.restart}</button>
    <button onClick={() => app.leave()}>{copy.runtime.leave}</button>
  </PanelHost>;
}
