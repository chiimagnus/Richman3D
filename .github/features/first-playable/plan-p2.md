# Plan P2 - 第一人称 Three.js 可玩切片

**Goal:** 把 P1 规则内核接成完整可玩的第一人称 3D 单机对战。

**Non-goals:** 不做联机、存档、复杂美术资产、房屋升级、自由 WASD 脱离棋盘移动。

**Approach:** 3D 层只负责把棋盘状态映射为 Scene/Object3D，并以独立第一人称相机控制器管理 Pointer Lock 与路径动画；应用协调层负责把 Game、World 与 HUD 串起来。电脑玩家复用与人类相同的 Game API，只在应用层决定自动购买策略。

**Acceptance:**
- 20 格棋盘、中心场景、灯光、地块标签、地产归属和电脑棋子均可见。
- 人类玩家镜头在自身格位上，以第一人称沿骰子路径平滑移动。
- Pointer Lock 后可鼠标环视，但不允许自由移动破坏棋盘状态。
- HUD 可完成掷骰、购买/跳过，并正确展示回合、资金、位置与事件。
- 电脑玩家自动完成整回合并有可见移动。
- typecheck/test/build 全部通过，并完成一次真实浏览器 smoke test。

**Rules:**
- `src/domain/**` 不得 import Three.js 或 DOM。
- World 只渲染状态，不拥有规则状态；HUD 只发出用户意图。
- 第一人称相机移动逻辑与棋盘 Mesh 构建分离。
- 不引入物理引擎、全局状态库或额外 UI 框架。

---

## P2-T1 建立职责分离的 Three.js 世界与第一人称视角

**Files:**
- Create: `src/rendering/boardGeometry.ts`
- Create: `src/rendering/BoardView.ts`
- Create: `src/rendering/PlayerView.ts`
- Create: `src/rendering/FirstPersonRig.ts`
- Create: `src/rendering/World.ts`

**Step 1: 棋盘空间映射**

实现一个纯函数把 0..19 棋盘索引映射到 6×6 方形外围路径坐标，并提供沿移动步数生成世界路径的方法。它只负责几何映射，不处理规则。

**Step 2: 棋盘与环境**

`BoardView` 构建地块、文字标签、中心广场/简化城市装饰以及地产归属标记；`PlayerView` 管理电脑棋子位置与平滑移动；`World` 只负责 Renderer/Scene/Camera、灯光、resize、render loop 和组合这些 view。

**Step 3: 第一人称控制**

`FirstPersonRig` 使用 Three.js PointerLockControls 管理鼠标环视，并实现人类玩家沿棋盘路径的镜头移动。不给 WASD 自由位移，避免视觉位置与 Game 状态分叉。

**Step 4: 验证**

Run: `npm run typecheck && npm test -- --run && npm run build`

Expected: 编译通过且 domain 不新增渲染依赖。

**Step 5: 原子提交**

Run: `rtk git add src/rendering`

Run: `rtk git commit -m "渲染: P2-T1 建立第一人称 Three.js 棋盘世界"`

---

## P2-T2 接通 HUD、回合协调和电脑玩家

**Files:**
- Create: `src/ui/Hud.ts`
- Create: `src/app/GameApp.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `index.html`

**Step 1: HUD**

HUD 负责展示当前玩家、双方资金、当前位置、骰子、事件记录、Pointer Lock 提示，并暴露掷骰/购买/跳过按钮回调；不直接修改 Game 状态。

**Step 2: 应用协调**

`GameApp` 作为组合根：
- 人类回合点击掷骰 → Game 返回结果 → 第一人称相机沿路径移动 → 更新地块效果/购买动作；
- 电脑回合自动掷骰 → 电脑棋子沿路径移动 → 若可购买且保留最低现金则自动购买 → 结束回合；
- 每次状态变化同步 HUD 与地产归属；
- 游戏结束时禁用动作并展示胜者。

**Step 3: 视觉与交互收尾**

完成全屏 canvas、玻璃 HUD、响应式布局、键盘焦点可见性和 reduced-motion 基础适配。页面首次进入即可理解“点击场景环视 / 点击按钮掷骰”。

**Step 4: 验证**

Run: `npm run typecheck && npm test -- --run && npm run build`

Expected: 全部通过。

随后运行本地 Vite 并用真实浏览器 smoke test：
- 页面无 console error；
- 人类至少完成一回合；
- 电脑至少完成一回合；
- Pointer Lock 可进入/退出；
- 地产购买后棋盘归属标记出现。

**Step 5: 原子提交**

Run: `rtk git add src/ui src/app src/main.ts src/style.css index.html`

Run: `rtk git commit -m "游戏: P2-T2 接通 HUD 与完整人机回合"`

---

## Phase Audit

- Audit file: `audit-p2.md`
- Rule: 完成本 phase 全部 tasks 后，`executing-plans` 必须自动进入该文件的审计闭环
