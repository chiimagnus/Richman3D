# Audit P1 - settings-ui

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p1.md`
- feature 目录：`.github/features/settings-ui/`
- 粒度：`phase`

## 任务看板

- [x] P1-T1 建立最小设置状态与运行时接入
- [x] P1-T2 实现简洁设置面板
- [x] P1-T3 更新用户文档并完整回归

## 任务到文件的映射

- P1-T1
  - `src/settings/preferences.ts`
  - `src/settings/preferences.test.ts`
  - `src/audio/GameAudio.ts`
  - `src/rendering/FirstPersonRig.ts`
  - `src/rendering/World.ts`
  - `src/app/GameApp.ts`
- P1-T2
  - `src/ui/SettingsPanel.ts`
  - `src/ui/Hud.ts`
  - `src/app/GameApp.ts`
  - `src/style.css`
- P1-T3
  - `README.md`
  - `docs/how-to-play.md`

## 发现项

## 发现 F-01

- 任务：`P1-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/settings/preferences.test.ts`
- 摘要：`未验证浏览器存储 API 抛异常时设置仍能安全回退`
- 风险：`需求明确要求本地存储不可用不能阻断游戏；实现已有 try/catch，但现有测试只覆盖空值和损坏 JSON，无法防止未来删除异常处理后无测试报警。`
- 预期修复：`增加最小回归测试：getItem 抛异常时 loadPreferences 返回默认值，setItem 抛异常时 savePreferences 不抛出。`
- 验证：`npm test -- --run src/settings/preferences.test.ts && npm run typecheck && npm run build`
- 解决证据：`8ff866f；新增 getItem/setItem 抛异常回归测试；preferences 定向 6 tests、全量 13 tests、typecheck、build 均 PASS`


## 修复日志

- `8ff866f`：补充浏览器存储 API 不可用时的回归测试，确认设置失败不会阻断游戏。

## 验证日志

- `npm test -- --run src/settings/preferences.test.ts` -> PASS（6 tests）
- `npm run typecheck` -> PASS
- `npm test -- --run` -> PASS（3 files / 13 tests）
- `npm run build` -> PASS（仅保留既有 >500 kB Vite chunk warning）
- `git diff --check` -> PASS
- CodeGraph -> PASS（SettingsPanel、load/save preferences、GameAudio.setEnabled、World.setLookSensitivity、FirstPersonRig.setPointerSpeed 均有生产调用；旧 `data-sound` / `sound-toggle` / `hud-tools` 路径不存在）
- Three.js installed contract -> PASS（PointerLockControls `pointerSpeed` 默认 1.0，实际参与 movementX / movementY 旋转计算）
- Helium 设置面板 -> PASS（原生 dialog 打开/`Esc` 关闭；声音与低/标准/高状态正确）
- Helium 快捷键隔离 -> PASS（dialog 打开时 Space/M 不触发游戏）
- Helium 持久化 -> PASS（声音与 high 灵敏度刷新后保持）
- Helium Pointer Lock -> PASS（设置入口隐藏；M 仍可切换声音；退出后设置入口恢复）
- Helium busy 状态 -> PASS（掷骰过程中设置入口 disabled）
- Helium 375px -> PASS（dialog 347px，body scrollWidth=innerWidth=375）
- GitHub Pages `cdcc19a` -> PASS（Actions deploy 成功，线上 `/Richman3D/` 已出现设置入口和 dialog）
- GitHub 渲染 `docs/how-to-play.md` -> PASS（设置章节、持久化说明、右上设置入口均可见；无内部 storage key）

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：声音与鼠标灵敏度使用单一持久化状态，设置 UI、快捷键、第一人称控制与用户文档均已接入真实路径；唯一审计发现已修复并回归通过。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：无阻塞风险。Three.js 主 bundle 的既有 >500 kB 构建警告与本 feature 无关。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

