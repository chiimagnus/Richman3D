import type { GameApp } from "../app/GameApp";
import { messages } from "../i18n";
import { PanelHost } from "./PanelHost";

export function PauseMenu({ app, onResume }: { app: GameApp; onResume: () => void }) {
  const copy = messages(app.getSnapshot().preferences.language);
  return <PanelHost title={copy.navigation.pause} onClose={onResume}>
    <button onClick={onResume}>{copy.runtime.resume}</button>
    <p>{copy.navigation.discard}</p>
    <button onClick={() => void app.start()}>{copy.feedback.restart}</button>
    <button onClick={() => app.leave()}>{copy.runtime.leave}</button>
  </PanelHost>;
}
