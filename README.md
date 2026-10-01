# Richman 3D

一个使用 TypeScript + Three.js 开发的第一人称 3D 大富翁游戏。

当前版本支持本地单机 1v1：你与电脑玩家轮流掷骰、购买地产、收取租金，直到一方破产。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址即可开始游戏。

## 怎么玩

你的目标是让电脑玩家先破产。

每回合掷两颗骰子并自动沿棋盘移动。你可以购买无主地产；踩到对手地产时需要支付租金。经过起点会获得奖金，机会格和税收格会直接改变资金。

完整规则、界面说明和快捷键见：

**[游戏玩法说明](docs/how-to-play.md)**

## 开发验证

```bash
npm run typecheck
npm test -- --run
npm run build
```

玩家规则、界面操作或快捷键发生变化时，以 `docs/how-to-play.md` 为用户文档真源并同步更新；README 只保留项目入口和启动方式。
