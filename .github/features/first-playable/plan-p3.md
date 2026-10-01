# Plan P3 - 用户文档

**Goal:** 用最少长期文档让新用户立即知道如何运行和游玩 Richman 3D。

**Non-goals:** 不新增架构、测试、贡献指南等独立页面；不复述源码目录或实现历史。

## P3-T1 核对用户任务与文档结构

- 运行 neat-freak 机械预检。
- 用 CodeGraph 核对启动、回合、地产、税收/机会、破产、第一人称与快捷键事实。
- 确定长期文档只保留根 README 与唯一玩法指南。

## P3-T2 编写入口与玩法指南

- 新增 `README.md`：项目简介、快速开始、玩法入口、开发验证命令。
- 新增 `docs/how-to-play.md`：目标、回合、地块、界面、第一人称与快捷键、结束条件。
- 同一规则只详细写一次，README 只做摘要和导航。

## P3-T3 验证并收尾

- 重新运行 neat-freak 预检和链接检查。
- 渲染 README 与玩法指南，检查可扫读性、代码块和链接。
- 运行 `npm run typecheck`、`npm test -- --run`、`npm run build` 和 `git diff --check`。
- 原子提交长期文档。
