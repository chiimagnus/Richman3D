# Richman 3D

[中文](README.md) | **English**

A 3D Richman-style board game built with TypeScript, React, Three.js and Vite, for PC desktop browsers.

**[Play online](https://chiimagnus.github.io/Richman3D/)**: single-player and remote multiplayer stay on this page.

- 2–4 seats with humans and bots on one computer, or human players on separate computers.
- Daily challenges, local saves, and save import/export.
- First-person and board-overview views; Chinese and English interfaces.

## Local Development

Requires Node.js 22.12+. Run from the repository root:

```bash
npm ci
npm run dev
```

Open the address printed in the terminal. This starts only the frontend; use local deployment below to develop multiplayer.

## Local Deployment

After installing dependencies, run on the host computer:

```bash
npm run lan
```

- Every computer opens `http://HOST_LAN_IP:8787/`; do not share `localhost` or `127.0.0.1` addresses.
- Local rooms do not connect to Cloudflare. Keep the host server running and allow LAN access to its port through the firewall.
- Plain HTTP is for trusted LANs only. Do not expose this server to the public internet.

With an existing build, use `npm run lan:start`. Room data lives in `.wrangler/state/`; retain it if you need to recover rooms.

## Remote Deployment

GitHub Pages serves the game; Cloudflare Worker and SQLite Durable Object provide rooms. Before deploying, verify the account and service name in [wrangler.jsonc](wrangler.jsonc) to avoid overwriting another service:

```bash
npx wrangler whoami
npm run deploy:worker
```

- Pages: `npm run build` produces `dist/`; GitHub Actions publishes it when `main` is pushed.
- Worker and local deployment: `npm run build:worker` produces `dist-worker/`. The two builds use different URL paths; do not mix them.
- When changing Pages or Worker addresses, update the [address configuration](src/network/endpoints.ts). Deploy backend Origin authorization changes before publishing Pages.

For free-only hosting, confirm Workers Free in the dashboard first. Free usage is limited; paid accounts are billed under their subscriptions. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Room Recovery

- After refreshing, return to your seat from “Multiplayer room”; use reconnect after a connection loss. Confirmed actions will not be replayed.
- Connecting the same seat in another page replaces the old connection; close duplicate pages before reconnecting. Closing the tab or clearing browser data can lose your seat. New players cannot replace seats in a started match.
- Rooms expire 24 hours after the last accepted operation; the UI displays the expiry.

## Validation

```bash
npm run typecheck
npm test -- --run
npm run build
```

Development constraints and manual checks are in [AGENTS.md](AGENTS.md); asset sources and regeneration are in [Scene assets](src/assets/scenery/README.md). Update both READMEs when public features, entry points or development procedures change, and keep [page metadata](index.html) in sync with public descriptions; update the asset notes when sources or conversion logic change.

Economic simulation is separate from the default tests:

```bash
npm run test:balance -- -t smoke
npm run test:balance
```

The full report is `test-results/balance/maps-report.json` and is not committed. Back up and move the old report before generating a new baseline after rules or bot-policy changes; identical configurations compare non-timing statistics on reruns. Simulation does not replace human experience or balance checks.
