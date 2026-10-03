# Audit P3 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p3.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P3-T1 快照格式与事务存储仓库
- [x] P3-T2 自动保存与菜单继续游戏
- [x] P3-T3 有限导入导出、损坏保全和版本处理
- [x] P3-T4 后台暂停与跨标签页冲突的用户路径

## 任务到文件的映射

- P3-T1
  - `src/domain/restore.ts`、`src/domain/game.ts`、`src/storage/snapshot.ts`、`src/storage/GameStore.ts`；`test/storage/snapshot.test.ts`、`test/storage/store.test.ts`
- P3-T2
  - `src/app/GameSession.ts`、`src/app/GameApp.ts`、`src/ui/MainMenu.tsx`、`src/ui/SavePanel.tsx`、`src/ui/PauseMenu.tsx`；`test/app/session-save.test.ts`、`test/app/navigation-save.test.ts`、`test/e2e/save-resume.spec.ts`
- P3-T3
  - `src/storage/transfer.ts`、`src/storage/GameStore.ts::replace/write`、`src/app/GameApp.ts::replaceSaved`、`src/ui/TransferPanel.tsx`、`src/ui/App.tsx`；`test/storage/transfer.test.ts`、`test/e2e/save-transfer.spec.ts`；双语locales/玩法文档/README
- P3-T4
  - `src/app/GameApp.ts::start/visibility`、`src/app/GameSession.ts::pause/resume/persist`、`src/ui/SceneHost.tsx`、`src/ui/SavePanel.tsx`；`test/app/visibility.test.ts`、`test/e2e/save-conflict.spec.ts`；双语帮助和玩法文档

## 发现项

逐任务只读审查暂未发现新增阻塞问题。核对要点：

- 恢复只经过纯领域校验，不调用规则命令；配置、地图/规则登记版本、资金对账、产权、RNG、待决策及终局结果均有完整检查。拒绝未知格式，不引入未发布格式迁移链。
- 普通保存和显式恢复共用同一写事务；读取current、比较身份/预览、移动有效backup、写current均无跨任务await；只在complete报告成功，abort回滚双键。固定两键，不嵌套历史。
- Session先提交规则再保存，失败不回滚或重做命令；以最后一次持久化身份重试最新内存状态。暂停/旧异步/销毁沿实际SceneHost取消演出和音频，不复活旧会话。
- 文件大小以字节在读取前限制；完整校验之后才显示确认。取消、坏文件和写失败不销毁当前局；只有明确确认且原始current未变化才替换。恢复/导入使用新matchId，防止回退revision使旧页再次获得写权限。
- 导出不上传数据；原始数据无法无损表示为JSON时报告失败而不假装保全成功。浏览器拒绝存储不影响导出合法内存局面。导入source贯穿后续保存，未提前实现/宣传挑战成绩。
- 同源双页使用真实IndexedDB竞争；旧页停止推进并可导出本页状态/明确载入最新。不同context隔离不当成跨页同步。关闭和重新启动浏览器进程用同一测试专用profile验证续玩。
- 唯一visibility监听归GameApp所有；创建完成时也核对hidden，避免漏掉加载期间的后台事件。没有beforeunload抢写、租约、心跳或自动抢锁。原生JSON/Blob/File/IndexedDB承担既有职责，未增加新状态框架。

## 修复日志

- 本阶段任务内修复已提交：`025ab294` 修正坏档NaN比较与显式恢复身份；`dd29ea92` 修复读档完成前切后台仍启动电脑。对应回归先复现再通过，本次审计不重复创建已闭环finding。

## 验证日志

- `npm run typecheck` -> PASS，含领域无DOM编译。
- `npm test -- --run` -> PASS，24文件148项。
- `npm run build` -> PASS，场景505.26kB/gzip128.22kB告警保留，不隐藏预算问题。
- P3-T2完整回归 -> 38项PASS（21.3分钟）；日志`/tmp/richman-p3-pre-transfer-full-e2e.log`。
- P3-T3保存/导航/传输9项及最终共享路径7项 -> PASS；360px英文确认操作和时间可见、无横向溢出，截图已目检；日志`/tmp/richman-p3-transfer-shared-e2e.log`。
- P3-T4双页竞争、模拟后台、真实浏览器重启及拒绝存储 -> 5项PASS；日志`/tmp/richman-p3-conflict-e2e.log`。
- 阶段最终`npm run test:e2e` -> PASS，`test-results/results.json`记录2026-10-02T14:58:43.852Z开始、1467322.932ms（约24.5分钟）、48项expected、0 skipped/unexpected/flaky、errors为空；包括连续20次完整对局资源释放。临时日志已不在当前环境，以保留的实际JSON报告为准。
- 浏览器持久配置契约：[Playwright launchPersistentContext](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)。测试只操作自建临时profile并关闭后删除，不使用日常浏览器数据。

## Gate（是否允许进入下一阶段）

- 结论：Go。
- 理由：各任务针对性验收及阶段完整48项浏览器回归均通过，无新增未解决阻塞finding，允许进入P4。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：后台事件的单元/浏览器测试使用模拟visibility，不冒称原生真机后台验收。跨页事务与浏览器关闭重启为真实Chromium证据；P11/P12真机、屏幕阅读器、首次试玩仍按用户决定待验收。没有发布、push或远端资源修改。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
