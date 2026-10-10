# P3 — GitHub Pages 直接联机

**Goal:** 原 Pages 游戏页面直接创建/加入并完成多人对局，不再跳到 Worker 网站。

**Non-goals:** 不迁移个人主页、不更改域名/DNS、不新建云资源、不增加账号或复制规则。Worker 的同一静态产物仍服务离线 LAN，不删除既有房间或原浏览器凭据。

**Approach:** App 联机入口始终打开 RoomPanel；GameApp 在 Pages Origin 选择既有远程房间后端，其他入口保留同源。服务端唯一 API 路由精确允许 Pages Origin，处理 JSON POST 的 OPTIONS 预检与全部 HTTP 结果的 CORS 头，WebSocket 握手仍必须有已允许 Origin 和原席位令牌。

**Acceptance:** Pages 正式地址内完成房间、邀请、交易/买地、重连；HTTP 成功和错误可读取，任意其他跨域站点/无 Origin 的 WS 仍拒绝；本地真实多人回归不变。全部基础验证、双构建通过，获准推送后确认 Pages 部署与真实页面。

**Rules:** 不使用通配 CORS 或 cookie 认证，不把令牌写入 URL，不重发经济命令；计划及用户已有暂存不提交；后台 Helium 不激活或前台输入。

## P3-T1 保留 Pages 入口并连接 CF

**Files:** `src/ui/App.tsx:App`、`src/app/GameApp.ts:enterRoom`、新增 `src/network/endpoints.ts`；`src/server/worker.ts:fetch`；`test/network/worker.test.ts`、`client.test.ts` 与 UI 入口回归；README 中英文。

**Implementation:** 删除 BASE_URL 跳转分支。复用 RoomClient 单连接与 RoomPanel 当前页面邀请 URL；公开 Origin 常量同时供服务器授权和 GameApp 选择使用。API 路由的 Origin/Fetch-Metadata 判断允许明确 Pages 请求，OPTIONS 仅允许房间 create/join、POST 与 Content-Type；在公共响应层附加精确 ACAO/Vary，不克隆 101 升级响应。保留所有席位/大小/版本/速率和领域命令校验。README 只推荐 Pages 正式入口，记录后台服务与双构建关系。

**Verify:** 真实 workerd 的 Pages 预检、HTTP 正常/错误、WS 经营及重连；未知 Origin/权限拒绝与原 LAN 测试；App 实际入口/房间会话回归。typecheck、全 test、Pages/Worker build、dry-run。先更新已授权的 Worker，再原子提交并按授权推送 main；观察 Pages Actions 部署，后台 Helium 验证正式地址与邀请不跳站及购买/HUD/设置，明确未测项。

**Commit:** 中文原子提交，只包含本次接入代码/文档/测试。历史 11 个已批准提交一起推送，不夹带计划或当前暂存。

**Audit repair:** 后台正式页发现设置恢复入口早于场景绑定开放；在共享 GamePlay/SettingsPanel 以 attached 决定 onClose 与场景动作是否可用，复用 PanelHost 已有不可关闭语义，保留 Session 的呈现器约束。新增双语真实 App 未绑定、绑定、恢复与解绑回归，不添加自动重试或第二份加载状态。

## Phase Audit

- Audit file: `audit-p3.md`
- Rule: 完成后进入 plan-task-auditor，发现有证据的问题先记录，再修复验证；不给理论风险加框架。
