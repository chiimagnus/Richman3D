# Audit P2 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p2.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P2-T1 应用菜单与按需创建对局
- [x] P2-T2 对局设置与明确的终局规则
- [x] P2-T3 有解释的结算页和重开路径
- [x] P2-T4 可跳过的实操教学与游戏内规则

## 任务到文件的映射

- P2-T1
  - `src/app/GameApp.ts`, `GameSession.ts`, `src/audio/GameAudio.ts`, `src/ui/App.tsx`, `MainMenu.tsx`, `PauseMenu.tsx`, `PanelHost.tsx`, `SceneHost.tsx`; `test/e2e/navigation.spec.ts`, `session-lifecycle.spec.ts`。
- P2-T2
  - `src/domain/{types,config,rules,board,game,selectors,turns,bot}.ts`, `maps/{city,index}.ts`; `src/rendering/{World,BoardView,boardGeometry,CameraRig,FirstPersonRig,PlayerView}.ts`; `src/ui/MatchSetup.tsx`, `Hud.tsx`, `viewModel.ts`, `eventText.ts`, `src/i18n/index.ts` 和两份 locale JSON；`test/domain/{config,maps,turns}.test.ts`, `test/rendering/{boardGeometry,camera}.test.ts`, `test/e2e/match-setup.spec.ts`。
- P2-T3
  - `src/domain/game.ts` 的原子事件财务合计、`selectors.ts` 的资产与排名、`src/ui/ResultsScreen.tsx`, `FeedbackLayer.tsx`, `App.tsx`; `test/domain/results.test.ts`, `test/e2e/results.spec.ts`。
- P2-T4
  - `src/app/tutorial.ts`, `GameApp.ts`, `GameSession.ts`; `src/ui/{Hud,HelpPanel,MainMenu,SettingsPanel,App}.tsx` 与相关样式、两份 locale JSON；`test/app/tutorial.test.ts`, `test/e2e/tutorial.spec.ts`; `docs/how-to-play.md`, `docs/how-to-play.en.md`, `README.md`, `README.en.md`。

### 只读审查结论

- 已沿入口→应用→会话→领域命令→串行表现→真实 DOM 决策追读。P1 的 settle 在落地提交显示与原因、同 MotionClock 等待后才电脑，以及会话公告去重保持原有不变量。
- 配置席位与 controller 分离，观察者通过首个人类席位查询；地图坐标所有生产消费者改为显式地图。RuleSet 修改实际影响付款和双语投影；20/40 最后购买与并列单测验证完整规则边界。
- 财务统计只在候选领域状态内由事件累计，与现金一起提交；拒绝/计算失败不改 RNG/统计。Results 是唯一终局决策面，重玩/新种子均创建新会话而非重放 UI 副作用。
- 教学使用固定种子真实 Game，完成标记与对局独立；五步跳过、帮助焦点和语言覆盖已有真实点击证据。正常重开不刷新；加载失败菜单重载属于已取证的 Chromium import 缓存约束，已明确记录到 plan。
- A01 当前 20 次资源循环未走终局，A08 尚缺完整键盘/缩放与触屏整局回归，先记录验证缺口，再补最小生产链路检查。

## 发现项

## 发现 F-03

- 任务：`P2-T4`
- 严重级别：`High`
- 状态：`Resolved`
- 位置：`src/ui/App.module.css:1`
- 摘要：`480px 场景最小高度使 640x360 重排视口的落点与行动区完全位于屏幕外`
- 风险：`200% 等效重排下关键费用和经营操作不可见，键盘整局验收失败`
- 预期修复：`移除场景固定最小高度，让已有自适应 HUD 使用真实视口；保持文字与操作而不缩小字体`
- 验证：`npm run test:e2e -- --grep "complete match at"`
- 解决证据：`024c8cf；删除场景480px固定最小高度，原失败断言保持并通过；实际键盘整局及开局/购买截图目检，typecheck/84单测/build通过。`


## 发现 F-02

- 任务：`P2-T4`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`test/e2e/tutorial.spec.ts:99`
- 摘要：`A08 已验证键盘教学退出和窄屏阅读，尚无键盘、200% 等效重排、触屏完成整局的证据`
- 风险：`完整对局费用和最终决策在辅助交互下是否可达尚未由生产 UI 验证`
- 预期修复：`增加长英文名、200% 等效 CSS 视口下真实 Tab/Enter 整局，以及触屏屏幕按钮整局回归`
- 验证：`npm run test:e2e -- --grep "complete match at"`
- 解决证据：`024c8cf；长英文名640x360等效200%重排纯Tab/Enter、360x640触屏模拟完整20轮均通过；关键金额/落点/实际购买费用可见且无横向溢出；实际触屏硬件未测。`


## 发现 F-01

- 任务：`P2-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`test/e2e/session-lifecycle.spec.ts:24`
- 摘要：`A01 的 20 次循环只开局掷骰后销毁，没有终局返回菜单完整循环`
- 风险：`终局资源与旧局回调路径没有重复进入的回归证据`
- 预期修复：`保留现有中断与重挂载检查，增加真实 20 轮对局到终局回菜单 20 次，记录状态与资源回落`
- 验证：`npm run test:e2e -- --grep "20 complete"`
- 解决证据：`024c8cf；20个真实20轮终局循环通过，60个开始/终局/释放样本，20个唯一matchId及20轮，全部资源归零；/tmp/richman-p2-full-cycle-results.json及/tmp/richman-p2-audit-e2e.log。最终布局修改后额外重挂载/导航通过。`


<在此之下由 `finding add` 命令追加发现项，不要手工照抄模板>

## 修复日志

- `024c8cf`：补齐20次完整终局资源回归及键盘/触屏模拟整局；实际发现并删除短视口场景的固定480px最小高度。不放宽费用/落点/操作可见性断言。

## 验证日志

- `npm run typecheck` -> PASS，含无DOM领域编译。
- `npm test -- --run` -> PASS，18文件84项。
- `npm run build` -> PASS；轻量入口gzip86.06kB、场景gzip128.22kB；场景505.26kB告警如实保留。
- `npm run test:e2e -- --grep "20 complete|complete match at"` -> 20次完整终局资源循环与触屏整局PASS；键盘找到F-03，修复后独立两条整局PASS。
- `npm run test:e2e -- --grep "complete match at|view remount|StrictMode|navigation|five actual"` -> PASS，8项；生产加载/音频拒绝、严格模式重挂载、真实教学及两种辅助输入完整整局。
- 20次循环60个开始/终局/释放样本：20个唯一会话、全部20轮、全部监听/音符/几何/纹理/动画/canvas归零。原报告暂存`/tmp/richman-p2-full-cycle-results.json`；最终回归`test-results/results.json`。640x360键盘与360x640触屏模拟的开局/购买/终局截图已目检。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：四项实现接入真实生产链路；三项审计发现闭环，配置/终局/财务原子性、教学隔离、辅助操作与完整终局销毁验证通过。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：当前仅Chromium自动化及CSS视口重排证据，不宣称实际浏览器缩放、真机触屏、屏幕阅读器、设备性能或首次试玩通过。用户明确无真实设备/试玩证据，P11/P12保留待验收。尚无存档，菜单不承诺继续游戏；P3继续实现。未发布、push或修改远端资源。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
