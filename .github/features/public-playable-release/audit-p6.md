# Audit P6 - public-playable-release

2026-10-03的拍卖、融资审计是历史记录；2026-10-06的当前规则审计见文末P6-T4，不把旧Go视为新规则验收。

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

## P6-T4 当前规则审计（2026-10-06）

- 范围：删除抵押、赎回、拍卖，缺现金必须卖建筑；保留普通三级升级、玩家交易、收租和卡牌。只审此次收敛涉及的路径，不代替P9/P11/P12发布验收。
- 文件映射：types/rules/economy/Game.apply/selectors/market/bot/restore拥有规则及序列化；GameSession→App/viewModel→AssetPanel/DebtPanel/PropertyDetails/eventText/SceneHost→BoardView拥有串行保存、单一决策、文案、演出与资源。对应test/domain、app、storage、rendering、ui和simulation回归随规则迁移，拍卖专用组件及三份专用测试删除。
- 只读复核：命令和恢复边界拒绝旧字段/指令；saleOption计算实际成本与均衡，首次筹足在候选状态中付款、记录统计和结束行动链一起提交。canDeclareBankruptcy要求所有建筑已售完，零退款建筑也不能绕过；破产只转移真实现金，无裸地融资。restore校验固定付款来源、历史签名、成本与财务守恒，不重执行命令。交易仍由指定接收者原子响应，组内有建筑时不可转让。
- 发现项：本次最终复核未发现仍需修复的缺陷。旧F-01保留历史，不要求重新实现已删除的拍卖恢复。
- 验证：typecheck、63文件680项测试、build、diff-check通过；覆盖真实付款、部分/足额/不足/零退款出售、债权人溢出整体回滚、重复/越权、最后一轮、2/3/4席淘汰、交易接受/拒绝/保存重试/CAS冲突/100条历史截断。旧v12档及其备份读取拒绝，原数据不变；旧命令与字段不存在于生产代码。
- 模拟：test:balance五项通过，含36局冒烟和6000局固定种子（快速/标准各2/3/4席各1000），无资金、牌实体、轮次或合法出口失败。旧报告及首次跨版本比较失败报告保全于/tmp/richman-v12-balance-before/；新报告位于test-results/balance/。本轮只跑一个新规则完整批次，不声称已作两次6000局重跑一致性或真人平衡验证。
- 后台Helium实际页面：使用校验通过的领域checkpoint，经生产文件选择/预览/确认/继续/交接进入界面，不冒称从初始现金自然玩出的贫困路径。卖房现金100、应付120，霓虹一层退45，连点只44→45，现金25、等级0，building_sold/paid/turn各一次，RNG不变；刷新state完全相同。购买面“不买”只1→2，地产无主、双方现金与RNG不变，直接轮到p2，无竞价。真实交易草稿选霓虹、差额180，交接p2接受连点只42→43，产权归p2、现金1926/1534，回合仍p1且RNG/轮数不变；刷新state完全相同。
- 视觉：390×844购买面、常态资金区、设置与英文卖房/中文交易截图已目检，无页面横溢；中英切换不更改规则。证据/tmp/richman-v13-{purchase-zh,purchase-en,settings-zh,settings-en,debt-en,trade-draft-zh}.png。后台页面始终hidden=true、hasFocus=false；只恢复本任务页生命周期和模拟视口，不激活标签。原生前台按键、真实200%缩放、触屏和屏幕阅读器未测；背景冻结下用跳过动画完成展示，不作自然帧率或连续动画性能证明。
- Gate：Go（本次功能删除和规则收敛）；非整产品公开发布许可。
- 实现提交：deedc0aa676a76874ef39521dee6612f36e5368e。P6-T4完成并回写todo.toml，phase-complete与todo validate通过；仅代码、回归及AGENTS入库，feature计划与审计留本地。
- 计划：idea、P4–P11受影响要求与AGENTS同步；P6-T1撤销仅留历史，P6-T2/T3交易保留，实时完成状态只写todo.toml。feature文件按项目规则仅本地更新，不入本次代码提交。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
