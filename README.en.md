# Richman 3D

[中文](README.md) | **English**

A first-person 3D Richman-style browser board game built with **TypeScript + Three.js + WebGL + Vite**. Play 2–4 seats with local humans and computers on one device.

**Play online: https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

## Features

- First-person 3D board, optional mouse look and full-board overview
- Two-dice movement and rewards for passing Start
- Property purchasing, ownership, and rent settlement
- Tax spaces, chance events, and bankruptcy rules
- 2–4 seats with at least one local human, optional computers, seeded turn order and explicit hotseat handover
- Live Chinese / English switching with saved language preference
- Compact HUD, persistent settings, and keyboard shortcuts
- Match setup, 20/40 full-round rankings and financial results
- Independent five-step practice and bilingual in-game help
- Local automatic match saving, refresh continuation and visible saving failures
- Validated file import/export, explicit backup recovery and damaged-save preservation

Full current rules and controls: **[How to play](docs/how-to-play.en.md)**.

## Controls

| Action | Key |
| --- | --- |
| Roll dice | `Space` |
| Buy the current property | `B` |
| Skip the current property | `N` |
| Toggle sound | `M` |
| Exit first-person view | `Esc` |

Click **Settings** in the upper-right corner to change sound, mouse sensitivity, or language. Language changes immediately update the interface, feedback messages, and 3D board labels.

## Local Development

```bash
npm install
npm run dev
```

Open the local address shown by Vite in a modern desktop browser.

## Tech Stack

- TypeScript
- Three.js / WebGL
- React / React DOM
- Vite
- Vitest

## Validation

```bash
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests build and start an isolated production preview, then shut down the server. Reports are in `test-results/`. Two native Pointer Lock cases use a headed browser; the others run headless. On Linux without a desktop, use `xvfb-run -a npm run test:e2e`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium executable with an isolated temporary profile, never your everyday browser session.
