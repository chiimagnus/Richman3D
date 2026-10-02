import { useEffect, useRef, useState } from "react";
import type { GameApp } from "../app/GameApp";
import { formatMessage, messages } from "../i18n";
import { SaveError, type SaveRecord, type StoredGame } from "../storage/snapshot";
import { downloadRawSave, importSave } from "../storage/transfer";
import { PanelHost } from "./PanelHost";

type Preview = { readonly game: StoredGame; readonly expected: unknown; readonly source: SaveRecord["source"] };

export function TransferPanel({ app, onClose }: { app: GameApp; onClose: () => void }) {
  const language = app.getSnapshot().preferences.language;
  const copy = messages(language).storage;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phase, setPhase] = useState<"ready" | "reading" | "writing">("ready");
  const [error, setError] = useState<SaveError["kind"] | "backupUnavailable" | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  const prepare = async (file?: File) => {
    const current = ++request.current;
    setPreview(null);
    setError(null);
    setPhase("reading");
    try {
      const expected = await app.store.readRaw();
      const game = file ? await importSave(file) : await app.store.read("backup");
      if (current !== request.current) return;
      if (game) setPreview({ game, expected, source: file ? "imported" : game.record.source });
      else setError("backupUnavailable");
    } catch (cause) {
      if (current === request.current) setError(!file && cause instanceof SaveError && cause.kind !== "unavailable" ? "backupUnavailable" : cause instanceof SaveError ? cause.kind : "unavailable");
    } finally { if (current === request.current) setPhase("ready"); }
  };

  const confirm = async () => {
    if (!preview || phase !== "ready") return;
    const current = ++request.current;
    setPhase("writing");
    setError(null);
    try {
      await app.replaceSaved(preview.game, preview.expected, preview.source);
      if (current === request.current) onClose();
    } catch (cause) {
      if (current === request.current) {
        setPreview(null);
        setError(cause instanceof SaveError ? cause.kind : "unavailable");
      }
    } finally { if (current === request.current) setPhase("ready"); }
  };

  const exportRaw = async () => {
    const current = ++request.current;
    setPhase("reading");
    setError(null);
    try {
      const raw = await app.store.readRaw();
      if (current === request.current) downloadRawSave(raw);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof SaveError ? cause.kind : "unavailable");
    } finally { if (current === request.current) setPhase("ready"); }
  };

  return <PanelHost title={copy.transfer.title} onClose={() => { if (phase !== "writing") onClose(); }}>
    <p>{copy.transfer.limit}</p>
    <label>{copy.transfer.file}<input data-save-import type="file" accept=".richman.json,.json,application/json" disabled={phase !== "ready"} onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void prepare(file);
    }} /></label>
    <button data-backup-preview disabled={phase !== "ready"} onClick={() => void prepare()}>{copy.transfer.backup}</button>
    <p>{copy.exportWarning}</p>
    <button data-raw-export disabled={phase !== "ready"} onClick={() => void exportRaw()}>{copy.transfer.raw}</button>
    {phase !== "ready" && <p role="status">{copy.transfer.working}</p>}
    {error && <p role="alert">{copy.transfer.errors[error]}</p>}
    {preview && <section aria-label={copy.transfer.preview}>
      <p data-snapshot-time>{formatMessage(copy.transfer.savedAt, { time: new Date(preview.game.record.savedAt).toLocaleString(language) })}</p>
      <p>{copy.transfer.replace}</p>
      {preview.source === "imported" && <p>{copy.transfer.imported}</p>}
      <button data-transfer-confirm disabled={phase !== "ready"} onClick={() => void confirm()}>{copy.transfer.confirm}</button>
    </section>}
    <button data-transfer-cancel disabled={phase === "writing"} onClick={onClose}>{copy.transfer.cancel}</button>
  </PanelHost>;
}
