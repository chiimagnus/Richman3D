# Audit P6 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p6.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P6-T1 不购买后的顺序拍卖
- [x] P6-T2 原子交易提案与接受拒绝
- [x] P6-T3 市场中断、交接和可解释记录闭环

## 任务到文件的映射

- P6-T1
  - `src/domain/market.ts` minimumBid/canBid/nextBidder/startAuction；`src/domain/game.ts` skip/bid/pass原子事务；selectors/bot/restore；AuctionPanel/viewModel/App、GameSession/SceneHost；`test/domain/auction.test.ts`、`test/app/auction-save.test.ts`、`test/ui/auction.test.tsx`。
- P6-T2
  - market.tradeOption/tradePropertyReason/canProposeTrade/tradeResponseReason；Game.apply、types、restore、rules v8、selectors/bot；TradePanel/TradeDraft、AssetPanel/App/viewModel/eventText/locales、GameSession/SceneHost、BoardView；`test/domain/trade.test.ts`、results独立账本、trade-save、trade UI与真实marker资源回归。
- P6-T3
  - `test/app/market-recovery.test.ts`；`test/domain/trade.test.ts` bounded history；GameStore事务CAS→complete、GameSession persist/run/queue取消/nextViewPlayer、PresentationQueue、App原生PanelHost与快捷键。真实后台Helium三席含电脑和双target冲突、原生import/current/backup恢复证据见plan-p6。

## 发现项

## 发现 F-01

- 任务：`P6-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/domain/restore.ts:184`
- 摘要：`拍卖恢复仅检查最新事件，允许在withdrawnIds中伪造从未弃权的活席`
- 风险：`真实三席seed940中p3报价10后，把p2加入withdrawnIds仍可恢复；继续竞买会跳过尚未响应的玩家，外部存档参与者与历史失配。`
- 预期修复：`复用领域拍卖状态推进；当前拍卖开场仍在保留历史时按真实报价/弃权重建当前决策并与导入状态比较，保留100条截断的合法恢复。`
- 验证：`test/domain/auction.test.ts真实三席伪造弃权、非法历史报价/顺序及110次拍卖恢复；typecheck/test/build`
- 解决证据：`f108b7f709c6e992e93e97cdc2727fa430ff4562；真实三席伪造withdrawnIds/历史错误席位/倒退报价拒绝，合法最终p1仅扣20；110报价逐条恢复仍通过；46针对项、403全测/typecheck/build/diff-check。`


<在此之下由 `finding add` 命令追加发现项，不要手工照抄模板>

## 修复日志

- F-01已在 `f108b7f709c6e992e93e97cdc2727fa430ff4562` 修复。领域的advanceAuction同时用于生产报价/弃权与恢复校验，删除Game内重复推进片段；开场仍在100条历史内时校验整条当前拍卖的合法报价、响应顺序和退出名单，不重演扣款。真实三席伪造退出不能读入；合法p1 20、p2/p3弃权后p1仅扣20，110次报价恢复未回归。

## 验证日志

- 只读调查：真实seed940三席p3报价10后，向withdrawnIds伪加p2仍被Game.restore接受 -> FAIL（F-01，修复前）；对应回归现拒绝 -> PASS。
- `npm test -- --run test/domain/auction.test.ts test/app/auction-save.test.ts test/app/market-recovery.test.ts` -> PASS，46项；含正常市场成交、逐存档恢复、拒绝外部伪造、未保存重试、取消表现重绑及CAS冲突。
- `npm run typecheck` -> PASS，含无DOM领域配置。
- `npm test -- --run` -> PASS，48文件403项；独立财务账本、租金、净资产、规则随机游标及真实GPU资源释放覆盖。
- `npm run build` -> PASS，99模块；index351.89kB/gzip109.37，scene507.69kB/gzip128.93；体积警告未隐藏，不称性能门禁通过。
- `git diff --check` -> PASS。
- 后台生产Helium：真实三席含2真人1电脑拍卖30、交易10、两标签不同报价CAS拒绝覆盖、冲突页载入最新、不同市场阶段完整state刷新一致及中英历史不改15条；双语390px交易页面无横溢且已目检。T1/T2/T3实际证据见plan-p6，target/服务器均清理；不把静态SSR或fake-indexeddb称成浏览器通过。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：`市场规则、原子财务、操作者交接、真实保存/冲突和已发现恢复缺陷均闭环；允许进入P7实现，不等于整份plan或公开发布验收完成。`

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：历史有界100条，开场已截掉时仅能校验现有字段/剩余记录，不宣称导入抗作弊。后台生命周期人为恢复仍document.hidden=true，不作真实后台计时或性能证据；原生Tab/Enter在隐藏页未能驱动默认操作，因此前台真实键盘、浏览器200%缩放、屏幕阅读器与设备性能留P11，不能抢用户焦点。真实触屏和首位试玩者证据用户暂不能提供，保留P11/P12待完成。未发布旧规则版本保全原档但不兼容，公开冻结版本仍待P12；未push/发布或远端操作。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
