# P2 — 房间界面与交付

**Goal:** 菜单进入房间，与其他电脑完成同一对局。

**Non-goals:** 教学、重复常驻入口、混合 bot 联机、未批准部署。

**Approach:** GameApp 拥有 RoomClient 与固定席位 OnlineSession，单机 GameSession 不变。两个实际实现共享最小展示 Session 契约和 GameView，查询/World 接受无私有数据的只读投影，不填假 seed/deck/random。复用 PresentationQueue/SceneHost 动画。

**Acceptance:**
- 创建/加入/等待/开始/重连/离开；经营和交易响应；双语/键盘/缩放；骰子移动与声音保留；基础验证和真实 UI 验收。

**Rules:**
- 客户端不 Game.apply；动画/待确认/断线禁用经济动作；设置只暂停自己；销毁不重新激活旧局；不把联机状态写单机 IndexedDB；联机不提供种子分享/本地导入或重开。

---

## P2-T1 接入房间与完整游戏交互

**Files:**
- `GameApp.start/leave/dispose`、`GameSession.getSnapshot/bind/dispatch`、`PresentationQueue`、`App/GamePlay`、`MainMenu`、`SceneHost`、`useGameView/Hud/FeedbackLayer`、`viewModel/ResultsScreen`、`domain/types/selectors/cards/economy/market` 只读查询、`World/BoardView`；新增 `network/RoomClient`、`app/OnlineSession`、`ui/RoomPanel`、CSS/双语及 test/ 回归。

**Step 1: 实现功能**

区分完整快照与展示快照，未知手牌用 null。RoomClient 单连接管理认证、身份保存、显式重连；命令仅发一次，失去确认后重连读最新状态，不重发经济命令。OnlineSession 串行呈现，解绑/暂停/重连同步最新投影，不重放副作用。菜单一个联机入口，原生房间表单与房主开始；邀请无令牌。仅本机决策操作者显示债务/交易/弃牌提交，其余玩家等待；联机隐藏单机导入、重开，结算不虚报战绩。

**Step 2: 验证**

Run: network/session/app/UI 针对测试、`npm run typecheck`、`npm test -- --run`、`npm run build`；后台 Helium 多页面创建加入开始掷骰/买地/交易，重连、设置、双语、缩放和按键。

Expected: 客户端独立视角且最终同状态，断线/重复进入退出不会越权；未测项明确记录。

**Step 3: 原子提交**

由 `executing-plans` 按仓库 Git 规则提交本 task 已验证的改动。

---

## Phase Audit

- Audit file: `audit-p2.md`
- Rule: 完成本 phase 全部 tasks 后，`executing-plans` 必须自动进入该文件的审计闭环

## P2-T2 局域网启动与远程交付
**Files:** package scripts、`scripts/lan.mjs`、保留 `vite.config.ts` Pages base、App 静态站联机导航、tsconfig Vite 环境类型、README 中英文开发/部署入口、wrangler/忽略项及 test/network/fixtures 运行验证；服务器 HTTP 限量读取为审计同 task 修复。
**Steps:** 同一 Worker `--local --ip 0.0.0.0` 服务静态资源/API；启动时关闭开发存储/观测 API，调试仅监听 loopback；保留 Pages base，CF/LAN 使用根路径与独立产物。尝试非 localhost LAN IP HTTP/WS，环境拒绝时记录证据边界，不改系统权限、不把 loopback 当物理 LAN 通过；准备离线启动命令。官方文档核对免费上限。授权部署后先检查现有资源/订阅（现有 OAuth 无账单读权限时由用户在控制台确认 Free），另建不冲突 Worker/SQLite DO，不开启付费、不覆盖其他项目。
**Verify:** 全部基础验证、Worker dry-run、本地 LAN 地址实际联机；获授权后远端静态/API/多人验收，批准未到则记录阻塞。
**Commit:** 中文原子提交，计划不入库。
