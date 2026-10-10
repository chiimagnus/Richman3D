# Audit P2 - network-multiplayer

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p2.md`
- feature 目录：`.github/features/network-multiplayer/`
- 粒度：`phase`

## 任务看板

- [x] P2-T1 房间与完整游戏交互
- [x] P2-T2 局域网启动与远程交付

## 任务到文件的映射

- P2-T1
  - `src/network/RoomClient.ts`、`readState.ts`、`src/app/OnlineSession.ts`、`GameApp.ts`：凭据/同源连接、完整公开投影校验、固定席位、串行表现、断线与退出。
  - `src/domain/restore.ts`、只读查询、World/BoardView、`src/ui/App.tsx`、RoomPanel/Hud/Hand/Trade/Results、双语：共享数据约束、现有经营入口与表现，不填私有状态、不引入第二套规则。
  - `test/network/client.test.ts`、projection、后台聚焦回归、已有 app/UI 回归；提交 `135cdb4`。`SceneHost.playSeatFeedback` 与 `test/audio/game-audio.test.ts` 的本人席位音效审计修复提交 `cf38165`。
- P2-T2
  - `scripts/lan.mjs`、package、wrangler、tsconfig、README 中英文：离线入口、管理面隔离、双构建、免费部署与导航。
  - `src/server/worker.ts:readBody`、`test/network/lan.test.ts`、worker/client 回归：按字节限流读取、真实进程与 2/3/4 席；提交 `a77bc50`。

## 发现项

## 发现 F-03

- 任务：`P2-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/ui/SceneHost.tsx:107`
- 摘要：`联机音效仍把所有真人都视为本机玩家，败者会收到胜利音效`
- 风险：`在线全真人使 winnerIds.some(controller===human) 恒为真，回合音效也无法区分本人/其他玩家`
- 预期修复：`在回合与结束音效的共享席位反馈入口区分固定本人席位和本地真人，保留同机多人语义`
- 验证：`真实 OnlineSession 的本人/对手视角分别验证回合与胜败音效参数，单机及同机真人回归保留`
- 解决证据：`typecheck PASS；network/client 与 audio/game-audio 两文件22项 PASS。真实 workerd OnlineSession 固定席位经生产反馈函数与 GameAudio 验证实际振荡器音符：本人/对手回合及胜者/败者不同；同机真人/电脑语义保留。音效听感未实测。`


## 发现 F-02

- 任务：`P2-T2`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/server/worker.ts:67`
- 摘要：`HTTP 房间请求在完整读取为字符串后才检查大小`
- 风险：`公开创建/加入入口允许超大请求占用房间运行时内存和处理额度，现有 2048 字符判断不限制读取量`
- 预期修复：`在唯一 HTTP 请求解码入口按字节限量读取，超限取消流，不提交成员状态`
- 验证：`真实 workerd 超量创建/加入拒绝后房间状态与正常加入仍正确`
- 解决证据：`实际重跑 typecheck PASS；test/network 4文件20项 PASS，包含字节超限创建/加入 400、成员不变及后续正常加入/WS。TextDecoder Worker契约已校正。`


## 发现 F-01

- 任务：`P2-T2`
- 严重级别：`High`
- 状态：`Resolved`
- 位置：`package.json:10`
- 摘要：`Wrangler 默认开发存储 API 随 0.0.0.0 监听向局域网暴露`
- 风险：`同端口可访问本地开发存储与调试入口，绕过房间投影的隔离边界`
- 预期修复：`LAN 启动时关闭 Local Explorer 和本地观测开发 API，调试仍只监听本机；保留同一 Worker`
- 验证：`实际启动 LAN 命令，健康/HTTP/WS 正常且开发 API 路径不返回管理数据`
- 解决证据：`test/network/lan.test.ts 真实 Wrangler 启动通过；外网代理失效、覆盖恶意继承开发开关，health/assets 200、三条开发API 404`


逐路径复核席位来自认证连接、客户端不 Game.apply/重发经济命令、presence 不重置动画、reset 不重放反馈、取消/解绑/销毁后迟到回调无效、界面只向本人提供当前经营决策。单机完整类型与存档仍保留，未删除明确要求保留的本地功能；替代的弱投影检查、重复反馈选择与 randomUUID 调用已移除。

## 修复日志

- F-01：先实际 GET 证实开发管理 API 可读，再关闭两个 Wrangler 开发开关并补真实启动回归；无第二套规则服务。
- F-02：先记录完整 request.text 后检查的问题，再改唯一请求读取入口；一次 Worker TextDecoder 类型验证失败后修正 ignoreBOM 契约，重跑实际通过后才保留 Resolved。中途提前回填已显式撤回更正。
- F-03：回合和结束音效在共同反馈入口区分联机本人席位与同机真人。测试先因误读既有 fixture 返回类型而未通过 typecheck，按 fixture 实际 Game 返回值和两栋建筑出售流程修正；随后真实会话与音频协议 22 项、全量验证通过，提交 `cf38165`，没有以参数 mock 代替最终音符验证。
- 无未解决的阻塞代码 finding；不添加理论风险防护、自动重试经济命令、额外账号/匹配/观战设施。

## 验证日志

- `npm run typecheck` → PASS，浏览器/纯领域/Worker 三份配置。
- `npm test -- --run --reporter=dot` → PASS，80 文件、761 项；network 21 项使用真实 workerd 或实际 Wrangler 子进程，覆盖 cash/产权最终效果、重连、并发/重复、错误与 2/3/4 席私有投影。新增本人/对手回合、赢家/败者以及同机真人/电脑音效，验证实际振荡器频率。
- `npm run build`、`npm run build:worker`、Worker dry-run → PASS；Pages 与根路径 Worker 产物独立。原 Three.js chunk 大小告警保留，没有为告警过度拆分。
- 失效 HTTP/HTTPS/ALL_PROXY 下 `npm run lan:start` 与生产 RoomClient 三席 → PASS：转账 50、买地、重复接受拒绝、重连、私有手牌隔离、根路径静态资源；开发管理 API 三条路径 404。未关闭机器网络，只阻断本服务的外网代理条件，不称作物理断网多电脑测试。
- 官方 Free/SQLite/静态资产/休眠文档已核对；Worker 同名服务不存在（原账号 3 个服务），OAuth 无账单读权限，用户在控制台确认 Workers Free 后批准部署；未修改付费订阅或既有服务。
- `npm run deploy:worker` → PASS；新 Worker URL `https://richman3d-multiplayer.chiimagnus.workers.dev/`，最终版本 `d64a3740-23f6-4c14-b998-9a73574b2d2c`；修复音效后再次验证公网生产 RoomClient 四席与失效外网代理下本地三席，最终现金/产权、重连、重复拒绝、私有投影与静态资源 → PASS。
- 后台 Helium 实际 DOM 页面查看房间/HUD/购买/交易/设置：双席现金 1500→1450/1550、只有接收者交易 dialog、本人固定视角、购买显示费用与 B/N、双语与 200% 字体/窄窗口脚本检查。截图已查看：`/tmp/richman-network-lobby.png`、`/tmp/richman-network-purchase.png`、`/tmp/richman-network-settings-en.png`。脚本 DOM 事件不称作完整原生鼠标输入验证；未调用 activate/bringToFront，原生输入无法稳定保持后台即停止，后续 DOM 脚本确认 document.hidden；未操作用户原有标签或重启用户主浏览器。原生 B 曾完成初版购买，但完整快捷键/指针锁/声音听感未全实测；完整实时动画受后台帧节流限制，使用现有表现测试与跳过同步补证。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：两阶段实现与交付完成，三项有证据的审计问题均已修复并验证；全量测试、双构建及最终部署后的真实多人经营同步通过，未测边界明确保留。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：本环境访问本机局域网 IP 的 curl 被系统拒绝（Bad file descriptor），跨物理电脑 LAN、防火墙放行与真正网络拔除未实测，不修改系统权限；完整原生键鼠/指针锁/声音听感与自然后台实时动画未全实测。CF 免费额度为账号共享、超额会停止服务；现有 Vitest 链 3 条审计告警未做不相关的强制 major 升级。Git 只本地提交，不 push；旧美术计划的用户已有暂存/修改保留。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

