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
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Helium.app/Contents/MacOS/Helium" npm run test:e2e
```

浏览器回归使用已安装的 Helium，在后台构建并运行生产预览和开发服务，测试后关闭服务器，报告位于 `test-results/`。其他系统请将 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 设为实际的 Helium 可执行文件。测试使用独立临时配置，不连接日常浏览器，也无需下载 Playwright Chrome。

当前 Playwright 与 Helium 捆绑的 uBlock 后台初始化存在兼容问题，自动化仅在自己的临时测试配置中停用该扩展；不更改日常浏览器配置。此测试边界不代表已验证启用拦截器的日常环境。
