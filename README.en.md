# Richman 3D

[中文](README.md) | **English**

A first-person 3D Richman-style browser board game built with **TypeScript + Three.js + WebGL + Vite**. Play 2–4 seats with local humans and computers on one device.

**Play online: https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

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
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Helium.app/Contents/MacOS/Helium" npm run test:e2e
```

Browser tests use the installed Helium browser and run the production preview and development server in the background, then shut down the servers. Reports are in `test-results/`. On other systems, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the actual Helium executable. Tests use isolated temporary profiles, not your everyday session; no Playwright Chrome download is needed.

Playwright currently has an initialization compatibility issue with Helium's bundled uBlock background page. Automation disables it only in its own temporary test profile, without changing your everyday browser configuration. These tests do not verify an everyday session with the blocker enabled.
