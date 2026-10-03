# Richman 3D

**中文** | [English](README.en.md)

第一人称 3D 大富翁浏览器游戏。使用 **TypeScript + Three.js + WebGL + Vite** 构建，支持2–4席同机真人与电脑对局。

**在线试玩：https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址即可开始游戏。

## 技术栈

- TypeScript
- Three.js / WebGL
- React / React DOM
- Vite
- Vitest

## 开发验证

```bash
npm run typecheck
npm test -- --run
npm run build
```

需要验证实际交互时，使用已安装的 Helium 检查真实游戏页面；不维护浏览器自动化测试。
