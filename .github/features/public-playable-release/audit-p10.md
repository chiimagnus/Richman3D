# Audit P10 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p10.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P10-T1 地图定义与显式路径坐标
- [x] P10-T2 24格港湾地图及策略差异
- [x] P10-T3 版本化每日挑战与可重复种子
- [x] P10-T4 战绩、成就与克制的赛后分享

## 任务到文件的映射

- P10-T1
  - `src/domain/board.ts`、`src/domain/maps/index.ts`：内容/坐标与ID版本校验、精确注册查询。
  - `src/ui/MapPreview.tsx`、`src/ui/MatchSetup.tsx`、双语JSON：同一地图定义的预览/价格和开局配置；`test/domain/maps.test.ts`、`test/ui/map-preview.test.tsx`。
- P10-T2
  - `src/domain/maps/harbor.ts`、地图注册、`src/rendering/BoardView.ts`：24格分散组、港湾装饰与菱形标识；沿World/boardGeometry/CameraRig追到所选地图和disposeObject释放。
  - `test/domain/harbor.test.ts`、`test/rendering/harbor.test.ts`、`test/rendering/boardGeometry.test.ts`、`test/simulation/balance.test.ts`、README双语模拟入口。
- P10-T3
  - `src/domain/challenges.ts` → `src/ui/App.tsx`/`ChallengePanel.tsx` → `GameApp.startChallenge`/`GameSession` → `GameStore.write`/`src/storage/challenges.ts`：UTC身份、固定配置、当前槽登记与同事务结果。
  - `src/ui/ResultsScreen.tsx`、`test/domain/challenges.test.ts`、`test/storage/challenges.test.ts`、`test/app/challenges.test.ts`、`test/ui/challenges.test.tsx`：真正事务结束后刷新成绩而非提交规则时提前读缓存。
- P10-T4
  - `src/domain/achievements.ts`/`records.ts` → `GameSession.enqueue/persist` → `GameStore.write`/`src/storage/records.ts` → `GameApp.refreshProfile` → `RecordsPanel`/`ResultsScreen`：已提交规则结果、失败重试、20局/30日期和实际界面投影。
  - `GameStore.clearRecords/readRawProfile`、`SavePanel`/`App`/`PanelHost`/`SettingsPanel`、`src/storage/transfer.ts`：明确清除、原数据导出、未保存状态中的恢复入口和原生modal后的返回焦点。
  - `test/domain/records.test.ts`、`test/storage/records.test.ts`、`test/app/records.test.ts`、`test/ui/records.test.tsx`、`test/fixtures/record-match.ts`：生产Game命令、真实GameSession和IndexedDB事务，不以假事件代替正式记账。

## 发现项

## 发现 F-01

- 任务：`P10-T4`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`src/ui/RecordsPanel.tsx:43`
- 摘要：`战绩与挑战保留上限在双语标题中写死，未投影已有统一常量`
- 风险：`RecordsPanel 的标题和真实 MATCH_RECORD_LIMIT/CHALLENGE_DAYS 拥有两份数值来源，违反文案业务常量参数化约定`
- 预期修复：`标题改用limit/days插值，读取现有常量，不新增配置或抽象`
- 验证：`记录UI/国际化针对测试，typecheck，完整单测和build`
- 解决证据：`79e9fde91a38b82f37ad328591c4d989d064c8ff：记录UI/国际化10测试、typecheck、729完整测试、build、diff-check全部通过；标题从现有统一常量插值，不另设配置。`


本轮唯一新增发现项为F-01，已修复并重新验证。逐任务未发现仍可达的未接线模块、替代后的双轨实现或阻塞性资金/存档问题。CodeGraph对间接测试覆盖的推断不作为缺失测试结论，覆盖以真实GameStore/GameSession测试执行为准。

## 修复日志

- `79e9fde91a38b82f37ad328591c4d989d064c8ff`：F-01标题投影统一保留上限，针对测试和全量验证通过。
- 本阶段实现时发现并已闭环的问题（非本轮新finding）：T3在旧保存引用上提前读成绩，改为真实SaveView完成通知；T4清除中途挑战后缺失终局成绩、坏profile恢复缺少未保存状态入口、原生modal打开覆盖父组件返回焦点，均在`745d4f7`/`d21e218`中修复。回归覆盖真实事务、会话及实际界面，不引入超时/重放规则的补丁。
- 清理核对：`setup.city`旧描述、仅挑战`resetChallenges`及`results.notRecorded`旧路径已替换删除；没有新增旧API重载/迁移链。现行SaveRecord/快照格式仍是有效契约，不作为“兼容代码”删除。

## 验证日志

- `npm test -- --run test/domain/maps.test.ts test/domain/harbor.test.ts test/rendering/harbor.test.ts test/domain/challenges.test.ts test/storage/challenges.test.ts test/app/challenges.test.ts test/domain/records.test.ts test/storage/records.test.ts test/app/records.test.ts test/ui/map-preview.test.tsx test/ui/challenges.test.tsx test/ui/records.test.tsx` → PASS，12文件/49测试（阶段审计）。
- `npm test -- --run test/ui/records.test.tsx test/i18n.test.ts` → PASS，10测试（F-01修复后）。
- `npm run typecheck`、`npm test -- --run`、`npm run build`、`git diff --check` → PASS，最后一次全量74文件/729测试；领域单独无DOM编译通过，场景chunk 541.06kB的既有警告未伪装为错误或擅自调高门槛。
- `npm run test:balance -- --testNamePattern=batch` → PASS，2026-10-09实际12,000局（2图×2规则×3规模×1,000种子），521.27秒。`test-results/balance/maps-report.json`保留完整统计，`/tmp/richman-p10-balance.log`保留运行证据；旧城市非耗时统计保持，未因添加地图改经济规则。
- `npm run test:balance -- -t smoke` → PASS，最后审计72局、4测试通过（完整批次在冒烟中明确跳过），多次运行非耗时统计一致。T4/F-01只改变元数据/UI，不重跑相同12,000局掩盖验证成本。
- 数值判断：港湾快速模式轮满95.9/98.2/99.8%，平均现金674/895/1105，组完成率79.9/83.8/84%；标准平均轮数36.505/37.931/38.915。区别符合较长单环/分散组，不支持额外调参，也不宣称真人公平性。
- 真实界面：两张地图分别完整20轮（主动跳过动画），双语配置/购买/HUD/设置；每日挑战固定seed2130457846实际终局，真人第3/资产1828/现金828，续看与同日重试保持首次/最佳且不重复次数。
- 真实记录界面读取IndexedDB终局摘要，显示实际财务和已解锁首局/买地；清除确认/取消、清除后current/backup/全部本地偏好字节保持，终局刷新不会补回删除记录；有坏记录时原数据保留，重新打开面板读取错误并提供导出/明确清除。真正失败命令清除后保存成功且不重执行由会话/存储回归证明。
- 分享：原生剪贴板拒绝时实际显示手动选择文本；注入成功回调收到与textarea完全一致的文本并显示成功，不称为前台系统剪贴板写入。自定义姓名/整档/手牌/RNG状态/matchId不进入默认分享，由实际命名对局的双语UI回归核对。
- PC视觉/焦点：查看`/tmp/richman-p10-records-zh.png`、`/tmp/richman-p10-records-en-200.png`等真实截图；800×720桌面视口/CSS200%字样，dialog与页面均无横向溢出。生产构建的菜单、结算、展开“对局”后的暂停面返回焦点均为`records-open`；实际Esc关闭记录不改变revision且保持暂停，按钮/可见Esc/aria-keyshortcuts一致。未调用activate/bringToFront；旧任务页一度报告非隐藏后即关闭，只在新的background:true任务页继续，不将该状态作为后台验收证据。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：四项任务真实接线、原子提交和范围内验证完成，唯一审计finding已修复；P10内容扩展验收成立，不自动转入已取消的P11/P12或发布/push。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：没有仍需阻塞P10的已知缺陷；不保证穷尽潜在bug。未实测前台系统剪贴板、原生浏览器200%缩放、成功Pointer Lock、屏幕阅读器、真机听感或真人舒适度，不把CSS大字/单测/电脑模拟说成这些验证。手机/平板、可信排名、在线账户、UGC、公开发布均不在本阶段范围。
- 范围内没有待确认的关键设计假设；仅检查既有单环地图和本地元数据，不为理论未来状态建立额外防护或框架。计划/任务状态/本审计保持本地，不进入代码提交。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

