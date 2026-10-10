import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), "dev",
  ...args, "--local", "--ip", "0.0.0.0", ...(!args.includes("--port") ? ["--port", "8787"] : []),
  "--inspector-ip", "127.0.0.1", "--show-interactive-dev-session=false"], {
  stdio: "inherit", env: { ...process.env, X_LOCAL_EXPLORER: "false", X_LOCAL_OBSERVABILITY: "false", WRANGLER_SEND_METRICS: "false" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143); });
