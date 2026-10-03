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
```

When actual interaction needs checking, use the installed Helium browser on the real game page. This project does not maintain browser automation tests.
