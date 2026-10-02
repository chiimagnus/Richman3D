# Richman 3D

**中文** | [English](README.en.md)

第一人称 3D 大富翁浏览器游戏。使用 **TypeScript + Three.js + WebGL + Vite** 构建，可直接在浏览器中与电脑玩家进行 1v1 对战。

**在线试玩：https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

## 游戏内容

- 第一人称 3D 棋盘与鼠标环视
- 双骰移动、经过起点奖励
- 购买地产、地产归属与租金结算
- 税收格、机会事件与破产判定
- 单机 1v1：玩家对战电脑
- 中文 / English 实时切换，并保存语言设置
- 简洁操作界面、可保存设置与键盘快捷键

完整规则与操作方式见 **[游戏玩法说明](docs/how-to-play.md)**。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址即可开始游戏。

## 技术栈

- TypeScript
- Three.js / WebGL
- Vite
- Vitest

## 开发验证

```bash
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
npm run test:e2e
```

浏览器回归自动构建并启动独立的生产预览，测试后关闭服务器，报告位于 `test-results/`。可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chromium 内核的可执行文件；测试使用独立临时配置，不连接日常浏览器。

玩家规则、界面操作或快捷键发生变化时，以 `docs/how-to-play.md` 为用户文档真源并同步更新。
