# Richman 3D

[中文](README.md) | **English**

A 3D Richman-style browser board game with first-person and board-overview views, built with **TypeScript + Three.js + WebGL + Vite**. Play 2–4 seats with local humans and computers on one device. View, sound, language, mouse sensitivity, animation speed and first-person head bob preferences are stored locally, separately from rule saves.

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
```

When actual interaction needs checking, use the installed Helium browser on the real game page. This project does not maintain browser automation tests.

Separate economic simulation (excluded from the default unit tests):

```bash
npm run test:balance -- -t smoke
npm run test:balance
```

The full batch runs 1,000 fixed seeds for each 2/3/4-seat quick and standard group, checking cash, card entities, bounded progress and restoration. Its untracked report is `test-results/balance/report.json`. Repeating the same configuration compares all non-timing statistics. These are computer-policy simulations, not evidence of human duration, enjoyment or game balance. Preserve and move an older report out of the way before generating a new baseline after rules or policy changes.
