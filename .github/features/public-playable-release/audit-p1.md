# Audit P1 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p1.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P1-T1 建立现状回归与浏览器测试入口
- [x] P1-T2 统一规则命令、结构化事件和可重放随机源
- [x] P1-T3 可取消表现序列与会话销毁
- [x] P1-T4 修复当前双语投影与启动失败边界

## 任务到文件的映射

- P1-T1
  - `package.json`、`test/vitest.config.ts`、`test/playwright.config.ts`、`test/e2e/baseline.spec.ts`、`.github/workflows/check.yml` / `deploy-pages.yml`
- P1-T2
  - `src/domain/{game,types,random,selectors,bot}.ts`；`test/domain/`；`test/tsconfig.domain.json`；全部规则调用者
- P1-T3
  - `src/app/GameSession.ts` / `PresentationQueue.ts`；`src/rendering/{World,BoardView,PlayerView,FirstPersonRig,MotionClock,motion,disposeObject}.ts`；`src/audio/GameAudio.ts`；`test/app/`、`test/audio/`、`test/rendering/`、`test/fixtures/`、`session-lifecycle.spec.ts`
- P1-T4
  - `src/main.tsx`、`src/ui/*.tsx` / CSS Modules / `tokens.css`；`src/app/GameApp.ts`；偏好与 i18n；`react-ui.spec.ts` / `runtime-boundaries.spec.ts`；真实 `public/og-image.png`

## 发现项

## 发现 F-04

- 任务：`P1-T4`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/ui/FeedbackLayer.tsx:13`
- 摘要：`播报编号和已到期状态只由组件持有，重挂载会重播同一会话通知及短暂显示过期内容`
- 风险：`StrictMode或场景重建造成重复无障碍公告，违背每事件一次与不续期要求`
- 预期修复：`会话持有已播报编号，组件只在Effect领取新公告；可见通知按原绝对到期时间判断`
- 验证：`真实组件卸载重绑保留现有事件但公告为空；到期通知不重新出现`
- 解决证据：`真实StrictMode卸载重绑：相同通知不再公告，到期后重绑不可见；会话claim重复返回false；11e2e和60单测通过`


## 发现 F-03

- 任务：`P1-T3`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/app/GameSession.ts:112`
- 摘要：`正常自动电脑推进立即覆盖人类付款反馈，电脑无主地产落点又清空仍有效通知`
- 风险：`财务已变化却看不到付款原因；现有语言测试借暂停绕过正常路径`
- 预期修复：`在同一会话表现序列中增加真实落地后的反馈阶段，保持操作者与输入门禁直到原因展示完成或明确跳过`
- 验证：`受控port验证落地反馈期间电脑尚未apply；真实生产UI正常掷骰无需暂停即看见费用原因且资金已结算`
- 解决证据：`受控port确认费用原因阶段revision仍1且电脑尚未apply；正常生产UI无需暂停可见已扣款1420及税费80，原因完毕才电脑推进；60单测/11e2e/typecheck/build通过`


## 发现 F-02

- 任务：`P1-T3`
- 严重级别：`High`
- 状态：`Resolved`
- 位置：`src/app/GameSession.ts:62`
- 摘要：`拒绝命令后残留command_rejected会阻止resume；随后打开设置或后台暂停便不能继续`
- 风险：`非致命的过期输入变成永久暂停，只能放弃对局`
- 预期修复：`恢复只禁止真正的表现故障，恢复时清除可恢复的命令拒绝通知；覆盖真实pause/resume/再次合法apply链`
- 验证：`npm test -- --run test/app/session.test.ts；拒绝输入→暂停→恢复→合法行动实际提交；typecheck/build`
- 解决证据：`ab9bbb5：正常拒绝→暂停→恢复→掷骰→购买及电脑真实apply；8项会话回归与typecheck通过，表现故障仍禁止恢复`


## 发现 F-01

- 任务：`P1-T2`
- 严重级别：`High`
- 状态：`Resolved`
- 位置：`src/domain/game.ts:77`
- 摘要：`仅验证最终资金安全整数，起点奖励的中间溢出可能舍入后又被费用减回安全范围，错误资金仍被提交`
- 风险：`允许的近MAX_SAFE_INTEGER初始资金可在正常过起点/税费路径发生一元精度损失，违反资金完整性`
- 预期修复：`在拥有经济运算的领域层集中验证每次现金变更，拒绝溢出并保持候选状态与RNG原子回滚`
- 验证：`npm test -- --run test/domain/commands.test.ts；新增近上限起点奖励后减税的回归；typecheck/build`
- 解决证据：`1164d44：所有现金运算立即校验安全整数；领域26项回归与typecheck通过`


<在此之下由 `finding add` 命令追加发现项，不要手工照抄模板>

## 修复日志

- F-01：`1164d44`，所有现金变更立即验证，失败回滚状态/RNG/通知。
- F-02：`ab9bbb5`，非致命拒绝允许恢复，真实表现故障仍关闭输入。
- F-03/F-04：同一表现队列在真实落地后展示费用原因，保持原操作者；会话持有播报编号，通知保留绝对到期时间。

## 验证日志

- `npm run typecheck` -> PASS（含无 DOM 领域编译）。
- `npm test -- --run` -> PASS，12 文件 / 60 项。
- `npm run build` -> PASS；756.66 kB 主包，gzip 207.72 kB；按需拆包由 P2 接通，不隐藏告警。
- `npm run test:e2e` -> PASS，11 项；开发 StrictMode/生产真实点击、付款原因/语言/焦点、权限拒绝、卸载重绑与 20 次资源归零；当前报告 `test-results/results.json`。
- 独立只读源码审计及可执行复现发现 F-01/02/03；全部实际缺陷已回归修复。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：四项可达缺陷修复，原规则结果/原子性及真实 UI、暂停重建和销毁路径通过；旧 UI、直接规则旁路与双帧调度已删除。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：当前为 Chromium 自动化证据，未宣称真机 Safari/触屏及公开试玩完成。既有 Vitest mocker 中危公告尚未升级处理，实际 Node 单测不启用其浏览器重定向服务；P12 依赖门槛必须复核。发布、邀请与远端变更仍未授权。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
