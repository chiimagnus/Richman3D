# Audit P7 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p7.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P7-T1 实体牌库与抽弃牌总量守恒
- [x] P7-T2 前进、后退、传送与落点链
- [x] P7-T3 五种持有道具与手牌交互
- [x] P7-T4 卡牌恢复、隐私、过期与淘汰清理

## 任务到文件的映射

- P7-T1
  - `src/domain/cards.ts` initialDeck/drawCard/discardCard；Game.apply/pay、types/rules/restore、storage.snapshot/GameStore；`test/domain/deck.test.ts`、`test/app/card-save.test.ts`。
- P7-T2
  - `src/domain/movement.ts`、Game.roll/resolveLanding、restoreHistory；`src/app/PresentationQueue.ts`、SceneHost、World/PlayerView/FirstPersonRig；card-movement领域/会话/真实模型测试。
- P7-T3
  - cards.itemCommands、Game.use_item/discard_item/consumeItem、economy.upgradeOption/discountedCost、restore.validateCardHistory；HandPanel/App/viewModel/Hud/FeedbackLayer/PanelHost、eventText/locales、GameSession/bot；items领域/存档/UI回归。
- P7-T4
  - `src/domain/restore.ts` 清算弃牌顺序、awaiting_discard不变量；`test/domain/cards-recovery.test.ts` 十二类卡、五区域、四席十手牌、交易/拍卖/终局和截断历史；HandoverScreen与HistoryPanel只读文本投影。

## 发现项

本次阶段只读审计没有新发现的未解决缺陷。T4实施中复现的合法清算存档拒绝与非法第四张接受均已先留红测试，再于61a7432修复；不把已修复的实施问题伪装成本轮新审计发现。

<在此之下由 `finding add` 命令追加发现项，不要手工照抄模板>

## 修复日志

- T1–T4已有提交42db820、3db27ce、fc233acb、61a7432；审计不另造空修复提交。十二类处理器均接到真实规则/保存/投影，不存在中间八张/十四张旧执行入口或旧规则迁移链；历史证据中的开发阶段数字不作为当前目录。

## 验证日志

- 逐真实执行路径核对draw→pending→现金/移动/hand、hand→active/discard、付款→破产手牌→效果到期→终局剩余手牌；所有规则只由Game.apply原子提交，UI与动画不再裁定。资金采用现有obligation/pay，优惠成本由upgradeOption同时服务命令/UI/计分。
- `npm run typecheck` -> PASS，含无DOM领域配置。
- `npm test -- --run` -> PASS，57文件542项；P7-T4新增22项正式回归。
- `npm run build`、`git diff --check` -> PASS，SceneHost508.42kB警告保留。
- Vite SSR加载真实Game/策略/经济/存档，seed1–20×2/3/4席共60局4895条命令，混合保留道具及基线使用/实际建设，每条命令makeSave→Game.restore并deepStrictEqual -> PASS。实际覆盖awaiting_roll/purchase/auction/discard/debt、移动/道具/建筑/抵押、正常轮满及单次终局；所有对局5000条以内、有合法出口、24实体守恒。首次探针误用JSON字符串比较对象键顺序，改为Node deepStrictEqual后才计正式结果，不把字符串顺序差异算生产bug。
- T1–T3后台Helium实际负面牌救济、反向逐格画面、移动债务、道具确认/取消/刷新、四张弃新牌、交接DOM无手牌名、双语390px常态HUD/购买/设置证据已核对，路径详见plan-p7；自有页与服务器已关闭。静态SSR/fake-indexeddb不冒充浏览器验收。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：`P7四项实现、清理、实体/经济/恢复/隐私及有序表现证据闭环，发现的实际缺陷均已修复；允许进入P8，不等于整份计划或公开发布通过。`

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：本机存档不是抗作弊秘密，100条之外不能重建所有历史牌型，只校验现有状态与可证历史；当前公开历史不泄露未用牌，未建立虚假安全承诺。508.42kB包体预算与真实触屏、屏幕阅读器、原生前台键盘/200%缩放仍属于P11待验收，不抢用户焦点。P8尚未交付三档/信息隔离策略和数值实验；P9–P12未完成，不宣称已找出全产品所有潜在bugs，未push/部署/发送或改变远端资源。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
