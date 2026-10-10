import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("serves the real offline LAN worker without exposing development storage APIs", async () => {
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const address = reserve.address();
  if (!address || typeof address === "string") throw new Error();
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const directory = await mkdtemp(join(tmpdir(), "richman-lan-"));
  const child = spawn(process.execPath, ["scripts/lan.mjs", "--port", String(address.port), "--inspector-port", "0", "--assets", "test/fixtures/lan-assets", "--persist-to", directory], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NODE_USE_ENV_PROXY: "0", X_LOCAL_EXPLORER: "true", X_LOCAL_OBSERVABILITY: "true" },
  });
  let output = "";
  child.stdout.on("data", (data) => { output += String(data); });
  child.stderr.on("data", (data) => { output += String(data); });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  try {
    const origin = `http://127.0.0.1:${address.port}`;
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 15000;
      const poll = async () => {
        if (child.exitCode !== null || Date.now() > deadline) { reject(new Error(output)); return; }
        try { if ((await fetch(`${origin}/api/health`)).ok) { resolve(); return; } } catch {}
        setTimeout(() => { void poll(); }, 100);
      };
      void poll();
    });
    expect(await (await fetch(`${origin}/api/health`)).json()).toEqual({ version: 1 });
    expect(await (await fetch(origin)).text()).toContain("LAN fixture");
    for (const path of ["/cdn-cgi/local/explorer/api/storage/kv/namespaces", "/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces", "/cdn-cgi/local/explorer/api/local/observability/query"]) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('"success":true');
    }
  } finally {
    child.kill("SIGTERM"); await exited; await rm(directory, { recursive: true, force: true });
  }
}, 20000);
