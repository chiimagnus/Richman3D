# Audit P3 - network-multiplayer

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p3.md`
- feature 目录：`.github/features/network-multiplayer/`
- 粒度：`phase`

## 任务看板

- [x] P3-T1 GitHub Pages 直接联机与发布

## 任务到文件的映射

- P3-T1
  - `src/ui/App.tsx:App`、`src/app/GameApp.ts:enterRoom`、`src/network/endpoints.ts`：同页面房间入口、Pages 远程目标与 LAN 同源目标。
  - `src/server/worker.ts:roomRequest/fetch`：精确 Origin、JSON 预检、公共 HTTP 结果 CORS 与不克隆 WS 101；既有 Room 保留席位令牌与权威规则。
  - `test/network/worker.test.ts`、`client.test.ts`、`test/ui/network-entry.test.tsx`：真实 workerd、真实 GameApp 生命周期、同源/Pages 路径、未授权 Origin 与错误可读性；README 中英文仅推荐 Pages 正式入口。接入提交 `d46b473`。
  - `src/ui/App.tsx:GamePlay`、`SettingsPanel.tsx`、`test/ui/settings-panel.test.tsx`：共享暂停入口依据场景绑定状态开放，双语加载/绑定/恢复/解绑回归；修复提交 `ababf47`。

## 发现项

## 发现 F-01

- 任务：`P3-T1`
- 严重级别：`Medium`
- 状态：`Resolved`
- 位置：`src/ui/App.tsx:145`
- 摘要：`首次进入对局时场景未绑定，设置完成按钮已开放而 resume 被拒绝`
- 风险：`慢网首次加载或后台进入时点击完成没有恢复效果；单机与联机共用该设置入口`
- 预期修复：`在共用设置界面依据实际可用的 onClose 投影按钮和 Esc 可用性，场景未绑定时不开放恢复或依赖场景的环视/重定位；保留 Session 无呈现器禁止恢复的约束`
- 验证：`未绑定和已绑定的真实 App/SettingsPanel 回归；后台 Pages 重新验收首次进入后经营与重连`
- 解决证据：`ababf47：真实 App 双语未绑定/绑定/恢复/解绑回归通过，4文件30项针对性与81文件772项全量/typecheck/双build/dry-run通过。最新 Pages 38071403169 SUCCESS 后后台 Helium首次恢复、交易现金、买地产权、设置双语大字及刷新原席位revision8无重放全部通过；DOM操作不称原生输入。`


复核正常与拒绝路径：API 预检不创建房间，不开放任意 Origin；合法 Pages 错误仍能由客户端读取；WS 使用原协议席位令牌而非 URL 参数。Invitation 复用当前页面 URL，不产生第二套邀请规则。Worker 静态构建仍用于 LAN/既有入口，未以删除兼容为名删掉离线能力或存量凭据。

## 修复日志

- F-01：正式 Pages 后台首次进入已复现完成按钮接受点击但 resume 被拒绝。根因是共享界面没有投影会话 attached 约束，不是网络连接失败。改为未绑定时不给 onClose，复用 PanelHost 的取消保护与原生 disabled；同时不开放依赖场景的环视/重定位，不添加自动恢复、超时重试或额外加载状态。

## 验证日志

- 修复前正式 Pages 后台 Helium → FAIL：建房、邀请、两席连接与开始对局成功，场景未绑定时首次完成点击无效；该结果触发 F-01，不把链路通畅冒称完整对局通过。
- `npm run typecheck` → PASS。
- `npm test -- --run test/ui/settings-panel.test.tsx test/ui/network-entry.test.tsx test/network/client.test.ts test/network/worker.test.ts` → PASS，4 文件 30 项。
- `npm test -- --run` → PASS，81 文件 772 项，含真实 LAN 进程、同源与 Pages workerd、资金/产权最终效果、越权/重复与重连。
- `npm run build`、`npm run build:worker`、`npx wrangler deploy --dry-run` → PASS，保留既有 Three.js chunk 告警。
- 按已授权范围推送 `d46b473` 与 `ababf47`，不包含本地计划或用户已有暂存。首次 Pages Actions `38070097888` SUCCESS；修复后 Worker 部署 SUCCESS，版本 `e1a822e4-2b8f-4108-8f45-47491bd3bfb4`。
- `gh run watch 38071403169 --exit-status` → PASS，最新 SHA `ababf47e6ed15e40e2d5a71f51e89c5abadfd0bb` 的测试/构建/Pages 发布全部 SUCCESS。正式 HTML HTTP 200，主产物为 `assets/index-B3hsNh3Q.js`，与本次构建一致。
- 最终后台正式 Pages Helium → PASS：菜单原页面打开房间、实际 JSON OPTIONS/HTTP/WSS、两席邀请/开局、场景就绪后的首次恢复、接收者独占交易决策、50 元转账双 HUD、买地产权同步、本人/对手手牌隔离、无 seed/random/deck 泄露、英文设置、200% 字体与 960px PC 窗口无水平溢出；刷新后点击返回上次房间，新 WS 恢复原席位/revision 8，无经济命令重放。脚本不以旧缓存状态判定重连成功。
- 最新公开 Worker OPTIONS 补证 → PASS：Pages Origin HTTP 204、ACAO 精确匹配、Vary Origin、仅 POST/Content-Type；evil.test HTTP 403 forbidden 且无 ACAO。补充 Node fetch 直连先连接超时，未据此改服务器；使用现有环境代理的 curl 后取得上述实际响应（浏览器全流程也使用现有代理）。
- 中途验收脚本先误找不存在的常驻设置按钮，随后在刷新时只识别中文按钮；源码核对后使用现有 Esc 入口及双语恢复按钮。语言偏好在同源 localStorage 共享，刷新加载英语符合产品行为，不为脚本错误修改生产实现。最终完整重跑退出码 0。
- 实际截图已查看：`/tmp/richman-pages-room.png`、`/tmp/richman-pages-hud.png`、`/tmp/richman-pages-purchase.png`、`/tmp/richman-pages-settings-en.png`。不声称完整真人对局、原生键鼠/焦点恢复/Pointer Lock/听感或物理 GPU 验收通过；本次使用已安装 Helium 独立临时后台实例与 DOM/合成事件，不激活用户页面、不带到前台，后台节流通过既有跳过动画操作完成同步。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：`正式 Pages 不跳站的房间、经营与刷新恢复通过；有证据的共享加载入口问题已修复并通过双语边界回归、全量验证和最新部署。`

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：`物理多电脑 LAN、完整原生输入/焦点恢复/指针锁/音效听感未全测，不由 DOM 或单元测试替代；既有 Three.js chunk 告警保留。Pages/Worker 已发布，个人主页/DNS/付费设置与其他资源未改；用户已有暂存/本地计划保留。`

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

