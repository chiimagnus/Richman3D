# Audit P4 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p4.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P4-T1 席位模型及所有二人假设的原子迁移
- [x] P4-T2 轮序、淘汰与整轮终局
- [x] P4-T3 同机交接与决策操作者
- [x] P4-T4 地产检查、资产抽屉和可追溯事件
- [x] P4-T5 移除玩法说明与实操教学
- [x] P4-T6 完整移除E2E自动化与专用测试残留
- [x] P4-T7 合并局内设置与暂停并收敛镜头入口

## 任务到文件的映射

- P4-T1
  - `src/domain/config.ts`、`src/domain/types.ts`、`src/rendering/PlayerView.ts`、`test/domain/players.test.ts`：固定席位、身份与四格偏移；真实消费者为Game/Session/World/Hud。
- P4-T2
  - `src/domain/turns.ts`、`src/domain/game.ts`、`src/domain/restore.ts`、`src/ui/MatchSetup.tsx`、`src/ui/ResultsScreen.tsx`、`test/domain/multiplayer-turns.test.ts`：同一随机游标、固定轮界、淘汰产权清理、实际多人入口。
- P4-T3
  - `src/app/GameSession.ts`、`src/ui/App.tsx`、`src/ui/HandoverScreen.tsx`、`src/ui/SceneHost.tsx`、`src/rendering/World.ts`、`test/app/hotseat.test.ts`：decision.actorId输入、会话viewPlayerId、先收敛表现后交接、恢复不继承授权。
- P4-T4
  - `src/domain/selectors.ts`、`src/domain/game.ts`、`src/domain/restore.ts`、`src/ui/AssetPanel.tsx`、`src/ui/PropertyDetails.tsx`、`src/ui/HistoryPanel.tsx`、`src/ui/eventText.ts`、`test/domain/history.test.ts`、`test/ui/asset-projection.test.ts`：只读公开投影与原子有界历史。
- P4-T5
  - `src/app/GameApp.ts`、`src/app/GameSession.ts`、`src/ui/App.tsx`、`src/ui/MainMenu.tsx`、`src/ui/Hud.tsx`、双语locale、README：删除教学/帮助/文档，不保留门控与兼容入口。
- P4-T6
  - `package.json`、`package-lock.json`、`test/vitest.config.ts`、`.github/workflows/`、`src/rendering/World.ts`：删除Playwright/E2E/fixture/测试标记，保留生产释放和单元测试。
- P4-T7
  - `src/ui/App.tsx`、`src/ui/SettingsPanel.tsx`、`src/ui/PanelHost.tsx`、`src/ui/SceneHost.tsx`、`src/rendering/FirstPersonRig.ts`、相关CSS、`src/ui/viewModel.ts`、`src/ui/FeedbackLayer.tsx`、`test/ui/settings-panel.test.tsx`、`test/ui/feedback.test.tsx`：单设置/暂停入口、只读镜头选择、原生锁定、骰子反馈与经济原因分离。

## 发现项

## 发现 F-01

- 任务：`P4-T7`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`src/i18n/locales/en.json:91`
- 摘要：`淘汰旁观提示仍指向已删除的Pause入口`
- 风险：`旁观者在新设置入口中找不到文案所说的暂停菜单`
- 预期修复：`两种语言改为设置入口，保持观看/返回/跳过表现语义`
- 验证：`npm test -- --run test/i18n.test.ts；typecheck/build`
- 解决证据：`7项i18n单测/typecheck/build通过；中文英文均要求旁观提示包含实际设置标题，删除旧Pause菜单文案。`


本轮按入口→Session→Game/Store和入口→SceneHost→World/FirstPersonRig逐任务只读复核，没有发现尚未解决的P4验收缺陷。T7执行中复现的主菜单存档返回焦点、窄屏英文视角截断已在阶段审计前修复；不把P5尚未实施的债务/建筑算作P4遗留bug，也不为理论风险增加兜底。

## 修复日志

- T7实现`b3075d6745c15df5e8b6abe4d20a616bae302b3e`；执行收尾修复`1adf486c56b47cdad3e7d16f0e61119ee2609392`。后台复验主菜单与局内存档返回焦点分别为`transfer-open`；历史返回`history-open`且对局展开区仍打开。
- 后台验收规范`17fdf55`写入AGENTS；此后不再激活页面或浏览器，不改变后台权限。计划/本审计不入库。
- F-01在P5前置复核时发现并回到P4闭环：两种语言的旁观提示统一指向实际设置入口，7项i18n测试与typecheck/build通过；未带着发现项推进经济改动。

## 验证日志

- `npm test -- --run test/ui/settings-panel.test.tsx test/ui/feedback.test.tsx test/ui/view-model.test.ts test/ui/asset-projection.test.ts test/domain/history.test.ts` → PASS：5文件32测试。
- `npm test -- --run` → PASS：30文件207测试，包含2/3/4席逐命令保存恢复、整轮/淘汰、交接授权、100条历史及坏数据拒绝。
- `npm run typecheck` → PASS：应用与无DOM领域边界；`npm run build` → PASS：93模块。SceneHost 505.04kB的既有警告仍真实保留，P11性能任务处理，不提高阈值掩盖。
- `git diff --check`与`git diff --cached --check` → PASS。源码/测试/README/CI搜索tutorial、HelpPanel、PauseMenu、锁定镜像订阅、Playwright和测试专用DOM标记无命中。
- 后台Helium生产页`127.0.0.1:4323`：seed940实际掷骰1+2→霓虹大道购买180；N按钮获焦时按B仍买入一次；电脑实际收租后revision3、真人现金1352、电脑1468，产权p1。刷新后正式菜单继续，余额/产权保留，资产现金1352/估值180/净资产1532一致。
- 后台只读检查：买地决策内打开资产没有额外dialog；语言切换、资产、历史、存档、暂停/恢复前后完整已保存state相同，revision1、规则RNG draws3不变；不是仅检查页面文案。
- 后台实际Esc暂停、鼠标环视按钮拒绝后仍可B买入；未锁定且有明确非阻塞错误。V切换在此前窗口检查真实生效；不再为重验抢焦点。掷骰显示已提交⚀/⚁，暂停不重掷；单测确认暂停无骰子动效、禁用不伪造资金不足。
- 英文390×844设置/购买页面截图已目检，完整视角选项、180费用、32租金、B/N及关闭均可达，无横溢；390×422、2倍像素布局模拟仍可滚动，无dialog横溢。截图`/tmp/richman-p4-t7-background-purchase-390.png`、`/tmp/richman-p4-t7-settings-390-fixed.png`、`/tmp/richman-p4-t7-settings-scaled-layout.png`；模拟不冒充真机或浏览器原生缩放。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：P4多人、同机操作者、公开资产/历史及精简入口均接入真实链路且验证通过；后续经济功能仍由P5承担，用户暂缺的真机验收保留原阶段归属。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：原生前台Pointer Lock成功/双Esc退出不在本轮后台重验；保留P4-T3既有真实窗口证据，不把后台拒绝当成功。原生200%浏览器缩放、真实触屏、屏幕阅读器及首次试玩仍待P11/P12，不虚构结果。新鼠标环视入口的后台拒绝保全已测；不会为补证抢占用户焦点。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
