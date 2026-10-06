# Audit P8 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p8.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P8-T1 合法动作投影与独立策略入口
- [x] P8-T2 三档决策与全玩法策略闭环
- [x] P8-T3 可重复模拟、调参和局长验证

## 任务到文件的映射

- P8-T1
  - `src/domain/bot.ts` observeBot/chooseBotAction、selectors.legalCommands/publicProperty、economy查询；`src/app/GameSession.ts`三处真实策略推进；bot、commands、真实会话bot-policy与逐状态restore测试。
- P8-T2
  - botReserve/rescueCommand/landingScore/投资交易道具评分；config/types/rules/restore、market.tradeOption→Game.apply→真实产权/现金与财务；GameSession.botDecision→viewModel.actionView→HUD、MatchSetup→GameApp.start、双语ai文案；bot-decisions、items、snapshot、settings-panel及真实后台Helium证据。
- P8-T3
  - `test/simulation/balance.test.ts` simulate/assertState/summarize/batch、`test/fixtures/balance-seeds.json`、专用/默认Vitest配置、package.json test:balance、README双语开发入口、被忽略的实际报告。模拟只调用真实领域模块，不在产品增加全电脑入口。

## 发现项

本轮逐任务审计没有新发现的未解决缺陷。实施中已经复现并修复的同组收益重复计价、旧快照测试错误操作者、长同步批次RPC阻塞以及无用rentLoss字段分别保留测试/日志/提交证据，不伪装成本次审计中新发现的问题。先手优势与难度区间重叠是实验已报告的限制，不属于无证据的规则正确性finding，也不把它们隐去或称为已平衡。

<在此之下由 `finding add` 命令追加发现项，不要手工照抄模板>

## 修复日志

- 已有原子提交dfecdb2、d50d922、f4f0263、6782046、8ac1fa9。审计没有另造空提交。观察是实际白名单，领域快照冻结引用稳定；策略不读config/seed/RNG/deck/history/对手手牌，不复制规则裁定。规则Game.apply继续负责最终校验、候选状态/随机/事件原子提交；交易接收者与普通回合分开，清算每次重查合法均衡操作，保存重试不重执行命令。
- 原chooseBotCommand、会话硬编码260策略、market.tradeResponseReason、交易策略reason历史字段、旧botReasons以及rentLoss重复投影均删除。旧未发布v11拒绝并保全，不创建兼容wrapper或迁移链。短理由只投影实际提交动作，不污染规则或存档历史；暂停/失效revision不播报旧理由。

## 验证日志

- 逐源码读取observeBot→合法候选/领域查询→三档选择→GameSession.enqueue/run→Game.apply→persist事务→有序表现→下一操作者，及MatchSetup配置/restore版本/双语HUD实际消费者。共享经济、交易、卡牌和存档恢复追至真实现金/产权/牌实体变化，而不是只断言函数被调用。
- `npm test -- --run test/domain/bot.test.ts test/domain/bot-decisions.test.ts test/app/bot-policy.test.ts test/ui/settings-panel.test.tsx test/storage/snapshot.test.ts test/domain/items.test.ts test/domain/auction.test.ts test/domain/trade.test.ts` -> PASS，8文件198项，正常三档/实际资金转移及错actor/旧revision/非法输入/隐私/债务/道具边界均覆盖，日志/tmp/richman-p8-audit-targeted.log。
- 最终`npm run typecheck`、`npm test -- --run` -> PASS，60文件595项；`npm run build`、`git diff --check` -> PASS。日志/tmp/richman-p8-final-gate-{tests,build}.log；508.42kB场景预算警告保留。
- `npm run test:balance -- -t smoke`重复 -> PASS，4项/36实际对局+18身份轮换对局（9对）。现金错账与实体重复故障注入确实失败；报告不把未运行full标成通过。
- 最终`npm run test:balance`两批 -> PASS，每批6组×1000实际对局、专项5项全通过、exit0；全部非耗时统计独立Node deepStrictEqual相同，SHA256 27c7702d2194898645148bd40838c0bac07191065274f2585a86f23bf969ea40。最大361命令/局，无过滤失败种子/负现金/幽灵牌/无合法出口/恢复失败。首次RPC错误的CLI确为FAIL，保留原报告；根因让出事件循环后长批次通过，不调高超时或忽略错误。
- T2后台Helium实际三档选择、购买KeyB、补齐组交易485、切语言/设置只读、刷新恢复、双语390px实际HUD/购买/设置证据已逐项核对，详plan-p8。SSR/fake-indexeddb不冒充真实UI；清理无用观察字段与测试报告不改变UI，不重复开启无关浏览器。自有浏览器页/服务器已关闭。
- `todo validate`、`phase-complete --phase p8` -> PASS，计划与证据保持本地，不混入上述源码提交。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：`P8信息隔离、三档实际决策/保存/解释、旧路径清理和可重复有界经济报告全部交付且验证通过；允许进入P9，不等于真人体验/整份计划/公开发布通过。`

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：同策略行动序位存在优势，普通与困难在该固定样本中的区间重叠；未据此强行改骰子/现金或宣称公平/更强。冻结city-v12原有参数作为后续比较基线，真实试玩的经营理解、先手影响、10–20/20–40分钟待P12采样；模拟不是人类分钟。原生200%缩放/前台PointerLock/屏幕阅读器与真机仍未测，508.42kB性能预算未闭环，留P9/P11实际验收，不抢用户焦点。P9–P12未完成；不能证明已揪出全产品所有潜在bug。无push、部署、发送或远端资源变更。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
