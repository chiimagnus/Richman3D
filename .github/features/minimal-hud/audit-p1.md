# Audit P1 - minimal-hud

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p1.md`
- feature 目录：`.github/features/minimal-hud/`
- 粒度：`phase`

## 任务看板

- [x] P1-T1 收敛常驻 HUD
- [x] P1-T2 补全 Pointer Lock 快捷键交互
- [x] P1-T3 更新玩法说明并完整回归

## 任务到文件的映射

- P1-T1
  - `src/ui/Hud.ts`
  - `src/style.css`
- P1-T2
  - `src/app/GameApp.ts`
  - `src/ui/Hud.ts`
  - `src/style.css`
- P1-T3
  - `docs/how-to-play.md`

## 发现项

## 发现 F-03

- 任务：`P1-T2`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`src/style.css .hud[data-pointer-locked=true] .hud-tools`
- 摘要：`Pointer Lock 下声音按钮透明但仍可能进入键盘焦点`
- 风险：`当前仅 opacity:0 + pointer-events:none，按钮视觉隐藏但没有从焦点导航中移除，可能让键盘用户聚焦到不可见控件。`
- 预期修复：`锁定时同时 visibility:hidden；M 快捷键继续负责声音切换。`
- 验证：`Pointer Lock 下 computed visibility=hidden 且 M 仍能切换声音；退出后 visibility 恢复`
- 解决证据：`6a0c9cf；Pointer Lock 下 hud-tools visibility=hidden，M 仍可切换声音；退出锁定后 visibility 恢复 visible`


## 发现 F-02

- 任务：`P1-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/ui/Hud.ts balance items; src/style.css max-width:480px`
- 摘要：`窄屏隐藏玩家名称后资金归属对读屏不再明确`
- 风险：`375px 模式下 balance-name 使用 display:none，两个余额只剩金额；视觉用户还能依赖颜色顺序，但辅助技术无法可靠知道每个金额属于谁。`
- 预期修复：`为两个 balance item 动态设置包含玩家名与当前余额的 aria-label，不增加视觉内容。`
- 验证：`375px iframe DOM 检查 balance item aria-label；无横向溢出；typecheck/build`
- 解决证据：`6a0c9cf；balance item 动态 aria-label 包含玩家名与余额；375px iframe 实测为“你 ¥1,500 / 城市玩家 ¥1,500”，无横向溢出`


## 发现 F-01

- 任务：`P1-T1`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`src/domain/game.ts:14-23,78-363`
- 摘要：`删除事件日志 UI 后 domain 仍维护无人消费的 events 历史`
- 风险：`GameSnapshot.events 没有任何调用者，但每次规则动作仍 pushEvent 并维护数组，形成旧 UI 遗留的死状态和无意义公共快照字段。`
- 预期修复：`删除 GameSnapshot.events、events 数组、pushEvent 及其所有调用；保留 RollResult/GameSnapshot 当前实际被 UI 使用的字段。`
- 验证：`rtk codegraph callers events; rtk npm run typecheck; rtk npm test -- --run; rtk npm run build`
- 解决证据：`6a0c9cf；删除 GameSnapshot.events、events 数组、pushEvent 及全部写入；CodeGraph 已无 events/pushEvent 符号；typecheck、7 tests、build 与真实完整回合 PASS`


## 修复日志

- `6a0c9cf`：删除旧事件历史状态；恢复窄屏余额的辅助技术语义；Pointer Lock 下彻底隐藏不可点击声音控件。

## 验证日志

- `npm run typecheck` -> PASS
- `npm test -- --run` -> PASS（2 files / 7 tests）
- `npm run build` -> PASS（仅保留既有 >500 kB Vite chunk warning）
- `git diff --check` -> PASS
- CodeGraph -> PASS（旧 `events` / `pushEvent` 已不存在；HUD/快捷键均接入生产路径）
- Helium 桌面首屏 -> PASS（无 brand/turn/player-card/event-panel；操作条 640px；无横向溢出）
- Helium 375px iframe -> PASS（scrollWidth=innerWidth=375；操作条 351px；余额 aria-label 明确）
- Helium 普通鼠标完整回合 -> PASS（声音按钮、掷骰、购买/跳过、反馈自动结束）
- Helium Pointer Lock -> PASS（Space/B/N/M 实际生效；锁定时操作按钮隐藏、上下文提示正确；退出后按钮恢复）
- Helium Pointer Lock 声音控件 -> PASS（visibility=hidden；M 仍可切换；退出后 visible）

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：常驻 HUD 已显著收敛，第一人称键盘操作完整；三个审计发现均已修复并通过桌面、窄屏与真实 Pointer Lock 回归。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：无阻塞风险。Vite 仍有既有的 Three.js 单 chunk >500 kB 警告，与本次 HUD 改动无关。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

