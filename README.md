# Richman 3D

**中文** | [English](README.en.md)

第一人称 3D 大富翁浏览器游戏。使用 **TypeScript + Three.js + WebGL + Vite** 构建，支持2–4席同机真人与电脑对局。

**在线试玩：https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

## 游戏内容

- 第一人称 3D 棋盘、可选鼠标环视与棋盘总览
- 双骰移动、经过起点奖励
- 购买地产、地产归属与租金结算
- 税收格、机会事件与破产判定
- 单机2–4席：至少一名真人，其余可选真人或电脑，固定轮序与确认交接
- 中文 / English 实时切换，并保存语言设置
- 简洁操作界面、可保存设置与键盘快捷键
- 开局配置、20/40整轮排名与财务结算
- 独立五步教学与游戏内双语帮助
- 正式对局本地自动保存、刷新续玩与保存失败提示
- 受校验的文件导入导出、手动备份恢复与坏档保全

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
- React / React DOM
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

浏览器回归自动构建并启动独立的生产预览，测试后关闭服务器，报告位于 `test-results/`。原生 Pointer Lock 的两个用例使用有窗口浏览器，其余无头运行；Linux 无桌面环境需用 `xvfb-run -a npm run test:e2e`。可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chromium 内核的可执行文件；测试使用独立临时配置，不连接日常浏览器。

玩家规则、界面操作或快捷键发生变化时，以 `docs/how-to-play.md` 为用户文档真源并同步更新。
