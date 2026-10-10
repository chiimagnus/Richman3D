import { build } from "esbuild";
import { Miniflare } from "miniflare";

export async function roomRuntime(directory: string): Promise<Miniflare> {
  const result = await build({ entryPoints: ["src/server/worker.ts"], bundle: true, format: "esm", platform: "neutral", external: ["cloudflare:workers"], write: false });
  return new Miniflare({ resourcePersistencePath: directory, telemetry: { enabled: false }, workers: [{ config: {
    name: "game", compatibilityDate: "2026-05-08",
    manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: result.outputFiles[0]!.text } } },
    env: { ROOMS: { type: "durable-object", worker: "game", exportName: "Room" }, ROOM_LIMIT: { type: "rate-limit", namespace: "874621009", simple: { limit: 60, period: 60 } } },
    exports: { Room: { type: "durable-object", storage: "sqlite" } },
  } }] });
}
