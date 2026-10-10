# P1 — 权威房间后端

**Goal:** 可实际连接的 CF/本地同源房间 API。

**Non-goals:** 不改玩家 UI、不部署。

**Approach:** Worker 路由到每房间一个 SQLite DO，Hibernation WebSocket。每次读取完整持久状态，用 Game.restore/apply 计算候选，保存后才广播，不缓存内存规则状态。复用 normalizeName/createMatchConfig 与既有规则校验。

**Acceptance:**
- 实际 workerd HTTP/WebSocket 多人经营同步、身份隔离、过期/重复命令、重连及持久恢复测试通过。

**Rules:**
- 不出界 seed/random/deck/其他手牌；actor 来自认证席位；Origin、消息大小及连接速率限制；创建/加入令牌幂等；保存失败不广播候选。

---

## P1-T1 建立并验证真实房间 API

**Files:**
- 新增 `src/network/protocol.ts`、`src/server/worker.ts`、`wrangler.jsonc`、`test/network/worker.test.ts`；修改 package/test 配置。入口 `Game.restore/apply`、`createMatchConfig/normalizeName` 已核对，不能复制规则。

**Step 1: 实现功能**

服务端种子、2–4 真人、已知地图/规则配置，仅房主开始。JSON 边界严格校验；WebSocket 握手的子协议传递令牌，不放 URL、不接受匿名连接；之后只发该席位投影；重连替换旧 socket，断线保留席位。整房间状态与到期 alarm 原子保存，过期 deleteAll。安装可移植 Wrangler；Miniflare/esbuild 运行真实 Worker，复用既有 Vitest，不迁移现有测试运行时。

**Step 2: 验证**

Run: `npm test -- --run test/network/worker.test.ts`、`npm run typecheck`、`npm run build`、Worker dry-run。

Expected: 两人购地/交易最终产权与现金同步；非法身份/输入不影响状态；重复命令无重扣；重连/运行时重新初始化可恢复。

**Step 3: 原子提交**

由 `executing-plans` 按仓库 Git 规则提交本 task 已验证的改动。

---

## Phase Audit

- Audit file: `audit-p1.md`
- Rule: 完成本 phase 全部 tasks 后，`executing-plans` 必须自动进入该文件的审计闭环
