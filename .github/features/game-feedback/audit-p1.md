# Audit P1 - game-feedback

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p1.md`
- feature 目录：`.github/features/game-feedback/`
- 粒度：`phase`

## 任务看板

- [x] P1-T1 增加可感知的 UI 回合与结算反馈
- [x] P1-T2 增加空间节奏与音效反馈
- [x] P1-T3 更新玩法文档并完成真实浏览器回归

## 任务到文件的映射

- P1-T1
  - `src/ui/FeedbackLayer.ts`
  - `src/ui/Hud.ts`
  - `src/app/GameApp.ts`
  - `src/style.css`
- P1-T2
  - `src/audio/GameAudio.ts`
  - `src/rendering/motion.ts`
  - `src/rendering/FirstPersonRig.ts`
  - `src/rendering/PlayerView.ts`
  - `src/rendering/BoardView.ts`
  - `src/rendering/World.ts`
  - `src/ui/Hud.ts`
  - `src/app/GameApp.ts`
  - `src/style.css`
- P1-T3
  - `docs/how-to-play.md`

## 发现项

## 发现 F-02

- 任务：`P1-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/ui/FeedbackLayer.ts:37,109-124,228-234`
- 摘要：`骰子 live region 会播报滚动中的临时假点数`
- 风险：`dice-stage 使用 aria-live，滚动期间 setDice 多次改写 aria-label，读屏可能把动画帧当作真实结果连续播报，造成错误反馈。`
- 预期修复：`将视觉骰子保持 aria-hidden；新增独立 live announcement，仅在最终点数确定后更新一次。`
- 验证：`DOM 检查 live region 在滚动期间不变化，最终只包含一次真实结果；npm run typecheck && npm run build`
- 解决证据：`0c4d2bf；视觉骰子与 live announcement 分离。强制拉长滚动窗口时 announcement 为空，最终仅播报一次真实 4+6=10；typecheck/build PASS`


## 发现 F-01

- 任务：`P1-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/ui/FeedbackLayer.ts:95-98,122-124,222-225`
- 摘要：`reduced-motion 把反馈展示时间缩到几乎不可读`
- 风险：`开启 prefers-reduced-motion 后回合横幅仅 80ms、事件卡 120ms、最终骰子约 40ms，用户几乎无法读取，直接违背本 feature 的 reduced-motion 验收。`
- 预期修复：`只取消滚动/位移动画，不缩短信号本身的可读停留时间；骰子直接显示最终值但保持短暂可见。`
- 验证：`真实浏览器覆盖 matchMedia reduced-motion；确认 turn/event/dice 信息仍可感知；npm run typecheck && npm test -- --run && npm run build`
- 解决证据：`0c4d2bf；reduced-motion 不再缩短 turn/event 信息展示；骰子直接显示最终值并保持 360ms。真实浏览器 200ms 后 turn/event 均仍可见；typecheck、7 tests、build PASS`


## 修复日志

- `0c4d2bf`：reduced-motion 只取消动画，不再缩短信号停留时间；骰子读屏播报与视觉滚动分离。

## 验证日志

- `npm run typecheck` -> PASS
- `npm test -- --run` -> PASS（2 files / 7 tests）
- `npm run build` -> PASS（仅保留既有 >500 kB Vite chunk warning）
- `git diff --check` -> PASS
- CodeGraph production callers -> PASS（FeedbackLayer、GameAudio、landOnTile、animatePositions 均有生产消费者；domain 未引入 DOM / Three.js / AudioContext）
- Helium 前台完整回合 -> PASS（骰子、落地事件、资金 delta、玩家→电脑→玩家）
- Helium Pointer Lock -> PASS（进入后 HUD 状态更新；`document.exitPointerLock()` 后恢复）
- Helium 音频 instrumentation -> PASS（声音开启时创建 oscillator；静音后计数不再增加）
- Helium 后台标签 -> PASS（`visibility=hidden` 下完整回合仍返回玩家，不被 rAF 暂停卡住）
- Helium reduced-motion -> PASS（200ms 后 turn/event 信息仍可见）
- Helium dice live region -> PASS（强制拉长滚动窗口时 announcement 为空；最终只播报一次真实结果）
- 页面布局 -> PASS（`body.scrollWidth === innerWidth`，无运行期 `error` / `unhandledrejection`）

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：计划中的 UI、空间、音频和结算反馈均已接入真实回合；两项审计发现已修复，正常路径与已知边界验证通过。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：无阻塞风险。音效音色属于主观体验，自动化已证明音频节点实际创建、静音有效，但不能替代人工听感评价。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

