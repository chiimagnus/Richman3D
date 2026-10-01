# Plan P1 - Minimal HUD

**Goal:** 删除重复常驻卡片，把 HUD 收敛为轻量资产栏 + 紧凑操作条，并让 Pointer Lock 状态下的键盘操作清楚且完整。

**Non-goals:** 不改游戏规则、3D 场景、AI、音效内容或事件系统；不新增 HUD 配置体系。

**Approach:** 直接收敛现有 `Hud`，不增加新 UI 模块。删除被 FeedbackLayer 取代的品牌/回合/事件日志路径，把双方资金改成单行轻量显示；底部只保留当前地块、骰子与当前动作。Pointer Lock 快捷键提示由 `Hud.render` 根据既有 snapshot/locked 状态生成，GameApp 只补 M 键入口。

**Acceptance:**
- 常驻 HUD 面积显著缩小且无重复信息卡。
- Pointer Lock 下所有必要操作都有可见键位并真实可用。
- 桌面和窄屏均无横向溢出。
- 现有反馈、音效、规则与后台回合不回归。

**Rules:**
- 删除优于折叠：没有持续价值的面板直接移除，不为它们新增展开状态。
- 不新增第二套状态或快捷键管理器。
- 快捷键只复用 GameApp 现有全局 keydown 路径。
- 普通按钮仍需保持可访问性和键盘原生行为。

---

## P1-T1 收敛常驻 HUD

**Files:**
- Modify: `src/ui/Hud.ts`
- Modify: `src/style.css`

**Step 1: 删除重复常驻信息**

从 Hud 移除：
- brand-block；
- turn-block 与 phase 文本；
- player-stack / player-card 大卡片；
- event-panel / event-list 常驻历史；
- 对应的 turnValue / phaseValue / logList / renderEvents / updatePlayerCard 死路径。

保留 GameSnapshot.events 本身，不改 domain。

**Step 2: 建立轻量资产栏**

用单个 balance-bar 显示：
- 你：当前资金；
- 城市玩家：当前资金。

继续复用 previousCash 产生 +¥ / -¥ 瞬时 delta，但 delta 锚定在紧凑 balance item 上。

声音按钮独立放在右上角，不再包在回合卡内。

**Step 3: 缩小底部操作条**

底部 action dock 改为居中、内容宽度自适应的紧凑条：
- 当前地块；
- 最近骰子；
- 当前动作按钮。

状态文字保留但降低视觉权重；不再占满整屏宽度。

**Step 4: 收轻瞬时提示外观**

保留 FeedbackLayer 功能不变，只降低 turn-banner / look-hint 的卡片感，避免常驻 UI 收敛后瞬时反馈仍显得厚重。

**Step 5: 验证**

- 实际截图对比首屏占用；
- DOM 确认被删除面板不再存在；
- `npm run typecheck && npm test -- --run && npm run build && git diff --check`；
- 桌面与 <=760px 宽度无横向溢出。

**Step 6: 原子提交**

`体验: P1-T1 收敛常驻 HUD`

---

## P1-T2 补全 Pointer Lock 快捷键交互

**Files:**
- Modify: `src/ui/Hud.ts`
- Modify: `src/app/GameApp.ts`
- Modify: `src/style.css`

**Step 1: 补声音快捷键**

在现有 `handleKeydown` 增加 `KeyM`，直接复用 `toggleSound()`。

不复制 Pointer Lock 退出逻辑；Esc 继续使用浏览器原生行为。

**Step 2: 明示购买快捷键**

购买与跳过按钮直接显示：
- 购买：`B`
- 跳过：`N`

避免用户必须读文档才知道已有快捷键。

**Step 3: Pointer Lock 下显示上下文快捷键**

Hud 根据 snapshot + pointerLocked 输出一条 compact shortcut hint：
- 等待玩家掷骰：`Space 掷骰 · M 声音 · Esc 退出`
- 等待玩家买地：`B 购买 · N 跳过 · M 声音 · Esc 退出`
- 电脑行动：`M 声音 · Esc 退出`

未锁定时只显示极轻的“点击画面进入第一人称”，不持续罗列快捷键。

**Step 4: 真实交互验证**

在真实 Pointer Lock 中验证：
- Space 能掷骰；
- 遇到可购买地产后 B 能购买；
- N 能跳过；
- M 能切换声音；
- Esc 能解除 Pointer Lock；
- 鼠标未锁定时按钮仍可点击。

**Step 5: 原子提交**

`体验: P1-T2 完善第一人称快捷键`

---

## P1-T3 更新玩法说明并完整回归

**Files:**
- Modify: `docs/how-to-play.md`

**Step 1: 更新说明**

简洁同步 M 快捷键与 Pointer Lock 状态下的操作方式，不增加实现细节。

**Step 2: 完整回归**

- typecheck / tests / build / diff check；
- 首屏视觉检查；
- 玩家 → 电脑 → 玩家完整回合；
- 一次购买或跳过；
- Pointer Lock 键盘操作；
- 声音开关；
- FeedbackLayer 临时反馈自动消失；
- 无 runtime error / horizontal overflow。

**Step 3: 原子提交**

`文档: P1-T3 更新极简 HUD 与快捷键说明`

---

## Phase Audit

- Audit file: `audit-p1.md`
- Rule: 完成本 phase 全部 tasks 后按 plan-task-auditor 做完整审计闭环。
