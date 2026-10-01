# Audit P2 - first-playable

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p2.md`
- feature 目录：`.github/features/first-playable/`
- 粒度：`phase`

## 任务看板

- [x] P2-T1 建立职责分离的 Three.js 世界与第一人称视角
- [x] P2-T2 接通 HUD、回合协调和电脑玩家

## 任务到文件的映射

- P2-T1
  - `src/rendering/boardGeometry.ts`
  - `src/rendering/boardGeometry.test.ts`
  - `src/rendering/motion.ts`
  - `src/rendering/BoardView.ts`
  - `src/rendering/PlayerView.ts`
  - `src/rendering/FirstPersonRig.ts`
  - `src/rendering/World.ts`
- P2-T2
  - `src/ui/Hud.ts`
  - `src/app/GameApp.ts`
  - `src/main.ts`
  - `src/style.css`
  - `index.html`
  - `src/rendering/motion.ts`（后台标签动画修复）
  - `src/rendering/FirstPersonRig.ts`（拐角朝向修复）
  - `src/rendering/World.ts`（删除未使用公共入口）
  - `src/domain/game.ts`（审计收敛领域快照边界）

## 发现项

## 发现 F-04

- 任务：`P2-T1`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`src/rendering/FirstPersonRig.ts:19; src/rendering/boardGeometry.ts:7`
- 摘要：`渲染层保留无调用者公共 API`
- 风险：`isLocked getter 与 BOARD_GRID_SIZE export 没有外部调用者，BoardView/PlayerView 的 object 也无需公开，扩大了无意义公共表面。`
- 预期修复：`删除 isLocked，收回 BOARD_GRID_SIZE 与仅类内 object 字段的可见性。`
- 验证：`rtk codegraph sync; rtk npm run typecheck; rtk npm test -- --run; rtk npm run build`
- 解决证据：`b78dabd；删除 FirstPersonRig.isLocked export、收回 BOARD_GRID_SIZE 与 BoardView/PlayerView object 可见性；CodeGraph + typecheck/test/build PASS`


## 发现 F-03

- 任务：`P2-T2`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/domain/game.ts:7-24`
- 摘要：`领域快照混入未使用表现字段与重复状态`
- 风险：`PlayerState.color 属于渲染表现，GameSnapshot.currentTile 又可从 activePlayer.position 推导且无调用者；两者破坏规则层单一职责并制造额外状态表面。`
- 预期修复：`删除 color 与 currentTile，渲染颜色继续由 rendering 层自己拥有。`
- 验证：`rtk codegraph callers currentTile; rtk npm run typecheck; rtk npm test -- --run; rtk npm run build`
- 解决证据：`b78dabd；删除 PlayerState.color 与 GameSnapshot.currentTile；CodeGraph 当前无消费方；typecheck、7 tests、build PASS`


## 发现 F-02

- 任务：`P2-T2`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`index.html:14`
- 摘要：`应用根节点 aria-live 与 HUD 精确 live region 重叠`
- 风险：`资金、按钮、日志等任意界面变化都可能触发额外播报，造成重复和噪声`
- 预期修复：`移除 #app 根节点 aria-live，仅保留 HUD 内具体 live region`
- 验证：`构建后 DOM 中 #app 不再包含 aria-live，HUD 回合/事件 live region 仍存在`
- 解决证据：`b24c191；Helium DOM: #app aria-live=null，仅保留 turn/event 两个 polite live region；build PASS`


## 发现 F-01

- 任务：`P2-T2`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/app/GameApp.ts:46`
- 摘要：`全局 Space 快捷键会拦截已聚焦按钮的原生键盘激活`
- 风险：`购买/跳过等按钮获得焦点后按 Space 被 preventDefault，键盘操作语义被破坏`
- 预期修复：`对原生交互元素不处理游戏全局快捷键`
- 验证：`真实浏览器聚焦按钮后按 Space，确认事件不被全局快捷键拦截且按钮原生行为仍可发生`
- 解决证据：`b24c191；Helium 聚焦按钮后 Space KeyboardEvent defaultPrevented=false；typecheck/test/build PASS`


- F-01 / F-02 / F-03 / F-04 均已解决，无剩余 Open finding。

## 修复日志

- `243a518`：完成 Three.js 棋盘、第一人称相机、电脑棋子、地产归属与路径动画。
- `d827181`：接通 HUD 和完整人机回合；真实浏览器测试期间修复后台 rAF 导致回合卡住、拐角后相机朝场外、HUD“当前位置”语义不一致，并删除 `World` 未使用公共入口。
- `b24c191`：修复全局 Space 抢占按钮原生键盘行为，并移除根节点过宽的 `aria-live`。
- `b78dabd`：删除领域层表现字段与重复快照状态，收回渲染层无调用者公共 API。

## 验证日志

- `rtk codegraph explore "P2 FirstPersonRig BoardView PlayerView World GameApp Hud movement purchase bot turn pointer lock"` -> PASS（GameApp 为唯一协调层）
- `rtk codegraph explore "domain 层依赖边界 Three.js DOM GameSnapshot 当前状态"` -> PASS（domain 只依赖自身 board/game；无 Three.js/DOM/表现字段）
- `rtk npm run typecheck` -> PASS
- `rtk npm test -- --run` -> PASS（2 files / 7 tests）
- `rtk npm run build` -> PASS（17 modules；仅有 Three.js 单包体积 >500 kB 的非阻塞 warning，gzip 约 130 kB）
- `rtk npm audit --omit=dev` -> PASS（0 production vulnerabilities）
- Helium：完整人类回合 → 地产决策 → 电脑自动回合 → 回到人类 -> PASS
- Helium：购买“艺术街区”320 后事件、资金与后续电脑回合 -> PASS
- Helium：Pointer Lock 在 `focus=true`、`visibility=visible` 的前台标签点击进入 -> PASS（`pointerLockElement===canvas`，无 `pointerlockerror`）；退出并恢复 HUD -> PASS
- Helium：聚焦按钮的 Space 事件 `defaultPrevented=false`；非交互区域 Space `defaultPrevented=true` 且触发掷骰 -> PASS
- Helium：`#app aria-live=null`，仅保留回合与事件两个 `polite` live region -> PASS

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：P2 的 3D 第一人称可玩切片、完整人机回合、地产交互、Pointer Lock、层边界与可访问性验收均已有当前代码和真实浏览器证据。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：Three.js 首屏 JS 约 509 kB（gzip 约 130 kB）触发 Vite 默认 chunk warning，但首版只有单场景且没有可独立延迟加载的产品模块；当前不为消除 warning 引入额外分包复杂度。CDP 合成 `Escape` 不会触发 Chromium 浏览器级 Pointer Lock 退出，但标准退出 API 已验证，物理 Esc 属于浏览器内建行为。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

