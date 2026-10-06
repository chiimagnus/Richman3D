# Audit P5 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p5.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P5-T1 单一地产状态与经济计算
- [x] P5-T2 建筑升级与可见成长
- [x] P5-T3 出售建筑、抵押与赎回
- [x] P5-T4 固定债务与救济决策
- [x] P5-T5 破产清算与多人终局一致

## 任务到文件的映射

- P5-T1
  - `src/domain/economy.ts` / `types.ts` / `game.ts` / `restore.ts` / `selectors.ts`：唯一产权、租金、账面与清算；`PropertyDetails`、HUD、BoardView 和存档消费者；economy/history/snapshot 回归。
- P5-T2
  - `Game.apply(upgrade)` / `upgradeOption` / `PropertyOperations` / `PropertyBuilding` / `BoardView.syncBuilding`；buildings、construction-save、construction 回归。
- P5-T3
  - `liquidityOption` / `Game.apply(property command)` / restore 财务对账 / 资产预览 / 棋盘标签；liquidity、construction-save、rendering/buildings 回归。
- P5-T4
  - `obligation` / `Game.apply(pay, bankrupt)` / `canDeclareBankruptcy` / `restoreDebt` / bot / GameSession / DebtPanel / App 单一决策面；debt、debt-save、UI/debt 回归。
- P5-T5
  - 同一清算→`nextTurn` / `matchResult`→GameSession 事务保存→ResultsScreen 与 World/BoardView；bankruptcy、bankruptcy-results、debt-save、rendering/buildings 回归。

## 发现项

## 发现 F-01

- 任务：`P5-T4`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`test/domain/results.test.ts:41`
- 摘要：`旧财务全局回归仍把rolled落点的应付款当成已支付款，未覆盖固定债务与部分清算。`
- 风险：`新规则的rolled只确定债务，实际资金由paid裁定；旧账本在真实欠租checkpoint会虚增rentPaid/rentReceived，不能验证跨命令财务不变量。`
- 预期修复：`移除旧rolled扣款验证，从paid及建设融资清算事件独立记账，加入真实债务、救济与多人清算局；复用现有测试不引入第二套生产账本。`
- 验证：`npm test -- --run test/domain/results.test.ts test/domain/debt.test.ts test/domain/bankruptcy.test.ts；typecheck/full test/build`
- 解决证据：`35针对性回归、317单测、typecheck/build/diff-check通过；真实欠租516、抵押救济和已抵押资产清算局逐事件独立对账，移除rolled即扣款的旧假设。提交见git当前HEAD。`


<在此之下由 `finding add` 命令追加发现项，不要手工照抄模板>

## 修复日志

- F-01：6411349。移除旧 rolled 直接扣税/租/负面机会款的回归账本；按 paid 实际支付和建设、融资、清算事件独立对账，覆盖固定欠租、出售救济、已抵押清算及多人后续局。没有新增生产算法。

## 验证日志

- `npm test -- --run test/domain/results.test.ts test/domain/debt.test.ts test/domain/bankruptcy.test.ts` -> PASS，35项。
- `npm run typecheck` -> PASS，含无DOM领域边界。
- `npm test -- --run` -> PASS，41文件317项。
- `npm run build` / `git diff --check` -> PASS；SceneHost507.46kB既有警告保留，性能实测归P11。
- T1–T5后台Helium证据见plan-p5；本轮三席建筑清算实付270、冲销246，产权/建筑5→3，刷新完整state相等，退出画布0。没有维护E2E脚本或操作用户页面。
- 只读审查：命令边界→合法动作→候选资金/产权/统计/RNG→安全净资产→唯一提交→会话事务→演出/恢复；所有购买、租金、升级、出售、抵押、赎回、救济和清算共用economy，无旧owners真源、负现金即破产、旧规则兼容分支。
- UI单一决策面、实际可偿付/运行时禁用分离，固定债务不能关闭逃过；paid实收原因及冲销投影和历史一致。后台DOM内重复付款文字分别为可见反馈和srOnly唯一live区域，不是两个可见横幅；屏幕阅读器实际朗读尚未测试，未凭DOM推断通过。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：P5地产、债务、恢复及多人清算闭环已验证，审计发现的旧回归假设已移除；允许推进P6，不等同于整个公开版已完成。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：P7真实优惠卡仍需接入并复验实际成本退款；P8经济平衡、P11性能与真机/屏幕阅读器/原生缩放、P12首次试玩与发布判定仍待完成。用户目前无法提供真机及首玩证据，保持待验收，不冒称全量验收。未执行push、发布、远端资源操作；计划目录仅本地回写。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
