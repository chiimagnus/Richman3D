# Plan P1 - Game Feedback

**Goal:** 在不改规则层的前提下，为现有完整回合增加清晰的视觉、空间、音频和结算反馈，让每个关键动作都“有回应”。

**Non-goals:** 不扩玩法规则，不引入物理引擎、粒子框架、背景音乐或额外前端框架。

**Approach:** 保持 `Game` 为唯一规则真源；反馈只消费 `RollResult`、`GameSnapshot` 和棋盘数据。DOM 反馈独立放在 FeedbackLayer，资金增减由 Hud 根据快照差值自动呈现；空间反馈继续由 rendering 层拥有；音频使用一个轻量 Web Audio 模块。GameApp 只负责把既有回合执行顺序与这些反馈串起来。

**Acceptance:**
- 掷骰、移动、落地、资金变化、买地、回合切换、胜负均有明显反馈。
- 音效可以关闭，浏览器自动播放限制下不会报错或阻塞游戏。
- reduced-motion 和后台标签仍能正确完成回合。
- domain 继续不依赖 DOM / Three.js / Web Audio。
- typecheck、tests、build、真实浏览器回归通过。

**Rules:**
- 不为反馈引入第二套游戏状态。
- 反馈失败不得阻断规则推进。
- 不使用 setInterval 驱动永久动画；所有临时反馈必须有明确结束边界。
- 任何新增表现模块必须在同一 task 接入生产路径。
- 旧的状态文字仍保留为可访问的文本反馈，不用动画替代信息本身。

---

## P1-T1 增加可感知的 UI 回合与结算反馈

**Files:**
- Create: `src/ui/FeedbackLayer.ts`
- Modify: `src/ui/Hud.ts`
- Modify: `src/app/GameApp.ts`
- Modify: `src/style.css`

**Step 1: 建立瞬时反馈层**

新增独立 FeedbackLayer，负责：
- 两颗骰子的短滚动动画与最终点数；
- 玩家 / 电脑回合切换横幅；
- 落地事件卡片；
- 购买成功提示；
- 胜利 / 失败结算层与“重新开始”按钮。

FeedbackLayer 不持有游戏状态，只播放 GameApp 传入的当前结果；reduced-motion 下立即收敛到最终状态。

**Step 2: 让资金变化自动可见**

Hud 记录上一帧双方资金，仅用于表现：
- 余额变化时在对应玩家卡片旁显示 `+¥N / -¥N`；
- 正负变化使用不同语义 class；
- 首次 render 不制造虚假变化；
- 余额文本仍以 GameSnapshot 为事实真源。

**Step 3: 接入真实回合**

调整 GameApp 的现有顺序：
- `game.roll()` 后先展示最终骰子反馈，再开始路径移动；
- 移动结束后展示对应落地事件；
- 玩家选择购买后显示购买反馈；
- 玩家 ↔ 电脑切换时显示回合横幅；
- game_over 使用完整结算层，而不是只禁用按钮。

**Step 4: 验证**

Run: `npm run typecheck && npm test -- --run && npm run build && git diff --check`

真实浏览器验证：
- 掷骰动画最终值与 HUD 的 lastRoll 一致；
- 资金变化 delta 与最终余额一致；
- 玩家/电脑回合横幅不会挡住按钮永久不退；
- 结算层可以重新开始。

**Step 5: 原子提交**

Run: `rtk git add src/ui/FeedbackLayer.ts src/ui/Hud.ts src/app/GameApp.ts src/style.css`

Run: `rtk git commit -m "体验: P1-T1 增强回合与结算反馈"`

---

## P1-T2 增加空间节奏与音效反馈

**Files:**
- Create: `src/audio/GameAudio.ts`
- Modify: `src/rendering/motion.ts`
- Modify: `src/rendering/FirstPersonRig.ts`
- Modify: `src/rendering/PlayerView.ts`
- Modify: `src/rendering/BoardView.ts`
- Modify: `src/rendering/World.ts`
- Modify: `src/ui/Hud.ts`
- Modify: `src/app/GameApp.ts`
- Modify: `src/style.css`

**Step 1: 给移动增加步进节奏**

在现有 `animatePositions` 上增加最小的帧/分段信息，而不是另写第二套动画：
- FirstPersonRig 每格有轻微上下步进；
- PlayerView 每格有轻微弹跳；
- 每进入新格只触发一次 step callback；
- reduced-motion 下不弹跳、不逐格触发音效，并直接抵达终点；
- 保留现有真实时间 fallback，后台标签不能卡住回合。

**Step 2: 给棋盘增加落地反馈**

BoardView 保存当前地块材质引用，在落地时短暂提升 emissive：
- 正向、负向、机会、普通地产用有限语义色；
- 新地产归属 marker 出现时做一次短 scale-in；
- World 仅暴露 `landOnTile` / 移动 callback 等表现 API，不持有规则状态。

**Step 3: 增加 Web Audio 音效**

新增 GameAudio，按需初始化 AudioContext，使用短 oscillator/noise 包络合成：
- 掷骰；
- 逐格移动；
- 正向收入 / 负向支出；
- 买地；
- 机会；
- 回合切换；
- 胜利 / 失败。

音频异常或浏览器拒绝恢复时静默跳过，不影响游戏流程。

**Step 4: 增加静音入口并接线**

Hud 增加一个紧凑声音开关；GameApp 将移动 step、落地结果和回合结果传给音频模块。声音状态仅存在本页，不做持久化。

**Step 5: 验证**

Run: `npm run typecheck && npm test -- --run && npm run build && git diff --check`

真实浏览器验证：
- 玩家和电脑移动均有逐格节奏；
- 落地格正确发光并自动恢复；
- 音效开启时关键事件可听；静音后不再发声；
- Pointer Lock、后台标签和 reduced-motion 不被破坏。

**Step 6: 原子提交**

Run: `rtk git add src/audio src/rendering src/ui/Hud.ts src/app/GameApp.ts src/style.css`

Run: `rtk git commit -m "体验: P1-T2 增加空间与音效反馈"`

---

## P1-T3 更新玩法文档并完成真实浏览器回归

**Files:**
- Modify: `docs/how-to-play.md`

**Step 1: 更新用户说明**

只补用户真正需要知道的新行为：
- 掷骰/落地/资金反馈会自动出现；
- 声音开关的位置与作用；
- 胜负后可直接重新开始。

不复制实现细节。

**Step 2: 完整回归**

Run: `npm run typecheck && npm test -- --run && npm run build && git diff --check`

真实浏览器至少跑完一整个“玩家 → 电脑 → 玩家”循环，并覆盖一次购买或经济事件。检查：
- 所有 overlay 都会自行结束；
- 资金 delta 与日志、余额一致；
- 键盘快捷键和按钮仍工作；
- Pointer Lock 仍可进入/退出；
- 静音可切换；
- 页面无横向溢出和 console error。

**Step 3: 原子提交**

Run: `rtk git add docs/how-to-play.md`

Run: `rtk git commit -m "文档: P1-T3 更新游戏反馈与声音说明"`

---

## Phase Audit

- Audit file: `audit-p1.md`
- Rule: 完成本 phase 全部 tasks 后，`executing-plans` 必须自动进入该文件的审计闭环
