# Richman 3D

**中文** | [English](README.en.md)

支持第一人称与棋盘总览的 3D 大富翁浏览器游戏。使用 **TypeScript + Three.js + WebGL + Vite** 构建，支持2–4席同机真人与电脑对局。视角、总静音、音效/音乐音量、语言、鼠标灵敏度、动画速度和第一人称晃动保存在本地偏好中，不写入规则存档。

**在线试玩：https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

当前仅面向 PC 桌面浏览器，使用鼠标、键盘和界面按钮操作；不提供手机或平板适配。

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

环境音乐由`src/audio/GameAudio.ts`中的三个110/165/220Hz正弦音在运行时合成，没有外部录音、下载音轨或额外素材文件（新增音频素材0字节），与源代码一同使用仓库`LICENSE`。Web Audio只在开始或声音按钮手势中启用；播放被拒绝时设置提供明确重试按钮，不影响对局。

```bash
npm run typecheck
npm test -- --run
npm run build
```

需要验证实际交互时，使用已安装的 Helium 检查真实游戏页面；不维护浏览器自动化测试。

独立经济模拟（不包含在默认单测中）：

```bash
npm run test:balance -- -t smoke
npm run test:balance
```

完整批次对每张内置地图、2/3/4席的快速和标准模式各运行1,000个固定种子，核对资金、牌总量、推进边界和可恢复性，并比较局长、现金与整组完成率；报告在 `test-results/balance/maps-report.json`，不提交。重复相同配置会核对全部非耗时统计。报告只反映电脑策略模拟，不证明真人时长、体验或平衡性；此前不同规则/策略的报告应先保留后移走再生成新基线。
