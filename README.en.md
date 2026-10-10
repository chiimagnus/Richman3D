# Richman 3D

[中文](README.md) | **English**

A 3D Richman-style browser board game with first-person and board-overview views, built with **TypeScript + Three.js + WebGL + Vite**. Play 2–4 seats with local humans and computers on one device. View, total mute, effect/music volumes, language, mouse sensitivity, animation speed and first-person head bob preferences are stored locally, separately from rule saves.

**Play online: https://chiimagnus.github.io/Richman3D/**

**Remote multiplayer: https://richman3d-multiplayer.chiimagnus.workers.dev/**

![Richman 3D gameplay](public/og-image.png)

Currently intended for PC desktop browsers with mouse, keyboard, and on-screen buttons. Mobile phones and tablets are not supported targets.

## Local Development

```bash
npm install
npm run dev
```

Open the local address shown by Vite in a modern desktop browser.

## Multiplayer Development and Deployment

Multiplayer uses the same Cloudflare Worker and SQLite Durable Object backend locally and remotely, supporting 2–4 human players on separate computers. The server owns the rules; each browser receives its own view and hand. Existing hotseat, bots, local saves and challenges remain available. GitHub Pages and the Vite development server have no room backend: their multiplayer entry opens the independent Worker service. Use the LAN commands to develop multiplayer.

On the host computer, install Node.js 22.12+ and dependencies, then build and start:

```bash
npm ci
npm run lan
```

Every computer, including the host, opens `http://HOST_LAN_IP:8787/` and uses the multiplayer entry. Do not share invitations using `localhost` or `127.0.0.1`: those addresses refer to each visitor's own computer. The launcher disables Wrangler's local development storage/observability APIs. The game server listens on LAN interfaces; the debugger listens only on loopback. Your firewall may require allowing Node's LAN access. Router port forwarding is not needed.

Once dependencies and `dist-worker/` are prepared, start while offline without Cloudflare login:

```bash
npm run lan:start
```

Local rooms persist in `.wrangler/state/`; keep the host server running. Restarting can recover unexpired rooms. Plain HTTP is only for trusted LANs, not public exposure. Remote rooms use HTTPS/WSS and server storage. Seat credentials are kept in the current tab's `sessionStorage`; refreshing or reconnecting restores the seat, but closing the tab or clearing data can lose credentials. New players cannot replace seats after a match starts. Rooms expire 24 hours after the last accepted operation; the UI displays the expiry.

Deploy the independent service (this creates or updates the Worker named in `wrangler.jsonc`; verify the account and ownership of any existing service first):

```bash
npx wrangler whoami
npm run deploy:worker
```

Pages still uses `npm run build` → `dist/`. Worker/LAN uses a root-path build, `npm run build:worker` → `dist-worker/`; do not mix these outputs. Workers Free supports the SQLite Durable Objects used here. WebSockets hibernate and static assets bypass the room Worker. Free quotas are account-wide, not unlimited: exhausting them stops service; this project does not automatically enable a paid plan. Existing paid accounts remain subject to their subscription. Confirm Workers Free in the dashboard before deploying; current limits are in [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Tech Stack

- TypeScript
- Three.js / WebGL
- React / React DOM
- Vite
- Vitest

## Validation

Ambient music is synthesized at runtime from three 110/165/220Hz sine tones in `src/audio/GameAudio.ts`, with no external recording, downloaded track or additional asset file (0 new audio-asset bytes). It uses the repository `LICENSE` with the source code. Web Audio is enabled only by start or audio-button gestures; settings offer an explicit retry when playback is blocked, without affecting the match.

```bash
npm run typecheck
npm test -- --run
npm run build
```

When actual interaction needs checking, use the installed Helium browser on the real game page. This project does not maintain browser automation tests.

Separate economic simulation (excluded from the default unit tests):

```bash
npm run test:balance -- -t smoke
npm run test:balance
```

The full batch runs 1,000 fixed seeds for each built-in map and each 2/3/4-seat quick and standard group, checking cash, card entities, bounded progress and restoration, and comparing rounds, cash and group completion. Its untracked report is `test-results/balance/maps-report.json`. Repeating the same configuration compares all non-timing statistics. These are computer-policy simulations, not evidence of human duration, enjoyment or game balance. Preserve and move an older report out of the way before generating a new baseline after rules or policy changes.
