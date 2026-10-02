import type { GameApp } from "../app/GameApp";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";

export function PauseMenu({ app, onResume }: { app: GameApp; onResume: () => void }) {
  const copy = messages(app.getSnapshot().preferences.language);
  return <PanelHost title={copy.navigation.pause} onClose={onResume}>
    <button onClick={onResume}>{copy.runtime.resume}</button>
    <p>{app.getSnapshot().session?.getSnapshot().save.kind === "saved" ? copy.storage.preserved : copy.storage.unsaved}</p>
    {app.getSnapshot().session?.getSnapshot().save.kind === "unsaved" && <button data-save-retry onClick={() => void app.getSnapshot().session?.retrySave()}>{copy.storage.retry}</button>}
    <button onClick={() => void app.restart()}>{copy.feedback.restart}</button>
    <button onClick={() => app.leave()}>{copy.runtime.leave}</button>
  </PanelHost>;
}
