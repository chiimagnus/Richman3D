# Plan P1 - 规则内核与项目基础

**Goal:** 建立可独立运行和测试的 TypeScript 游戏规则内核，不让 Three.js/DOM 渗入领域逻辑。

**Non-goals:** 本阶段不创建 3D 场景、不实现 HUD、不处理第一人称控制。

**Approach:** 先建立最小 Vite/TypeScript/Vitest 工程，再用数据驱动棋盘与一个单一 Game 状态拥有者实现首版规则。渲染需要的动画路径通过规则方法返回的数据表达，而不是把动画概念写入领域层。

**Acceptance:**
- 工程可 typecheck/test/build。
- 两名玩家能够完整轮转。
- 移动、过起点、地产购买/租金、税收、机会、破产有自动化测试。
- `src/domain/**` 不依赖 Three.js 或浏览器 DOM。

**Rules:**
- 不为单一实现新增 interface/factory/event bus。
- 领域规则是唯一状态真源；UI/Three.js 后续只能调用公开行为。
- 新实现没有兼容历史包袱，不保留无用 fallback。

---

## P1-T1 建立最小现代 TypeScript 工程

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/style.css`
- Create: `.gitignore`

**Step 1: 工程骨架**

建立 Vite + TypeScript + Three.js + Vitest 工程。入口只负责应用挂载占位，不提前写规则或 3D 抽象。增加 `dev`、`build`、`typecheck`、`test` 脚本。

**Step 2: 验证**

Run: `npm install && npm run typecheck && npm test -- --run && npm run build`

Expected: 依赖可安装，空测试集策略明确，类型检查与生产构建通过。

**Step 3: 原子提交**

Run: `rtk git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts src/style.css .gitignore`

Run: `rtk git commit -m "工程: P1-T1 建立 Three.js TypeScript 项目基础"`

---

## P1-T2 实现可测试的大富翁规则内核

**Files:**
- Create: `src/domain/board.ts`
- Create: `src/domain/game.ts`
- Create: `src/domain/game.test.ts`

**Step 1: 棋盘与状态模型**

用数据定义 20 格方形环路所需的 start/property/tax/chance 地块。定义玩家、地产归属、回合 phase 和公开快照类型；不包含世界坐标、Mesh、HTMLElement 等渲染概念。

**Step 2: 规则行为**

在单一 `Game` 状态拥有者中实现：
- 双骰掷骰与环路移动；
- 经过起点奖励；
- 税收、机会奖励/扣款；
- 无主地产的购买/跳过决策；
- 他人地产租金；
- 回合结束与玩家切换；
- 资金低于 0 后游戏结束。

掷骰和机会随机源通过构造参数注入函数，默认使用 `Math.random`，避免测试依赖真实随机。

**Step 3: 针对性测试**

覆盖：
- 掷骰移动与经过起点；
- 地产购买及归属；
- 踩中他人地产支付租金；
- 税收/机会金额变化；
- 非法购买被拒绝；
- 破产与胜者。

Run: `npm run typecheck && npm test -- --run && npm run build`

Expected: 全部通过。

**Step 4: 原子提交**

Run: `rtk git add src/domain`

Run: `rtk git commit -m "玩法: P1-T2 实现可测试的大富翁规则内核"`

---

## Phase Audit

- Audit file: `audit-p1.md`
- Rule: 完成本 phase 全部 tasks 后，`executing-plans` 必须自动进入该文件的审计闭环
