# Richman 3D

**中文** | [English](README.en.md)

基于 TypeScript、React、Three.js 和 Vite 的 3D 大富翁浏览器游戏，仅面向 PC 桌面浏览器。

**[在线游玩](https://chiimagnus.github.io/Richman3D/)**：单机与远程联机共用这一入口，不跳站。

- 2–4 席同机真人与电脑对局，或不同电脑上的真人联机。
- 每日挑战、本地存档与存档导入导出。
- 国王、女王、骑士和主教四种人物雕像；第一人称与棋盘总览，中英文界面。

## 本地开发

需要 Node.js 22.12+。在仓库根目录运行：

```bash
npm ci
npm run dev
```

打开终端显示的地址。此命令只启动前端；开发联机使用下面的本地部署命令。

## 本地部署

房主安装依赖后运行：

```bash
npm run lan
```

- 所有电脑访问 `http://房主局域网IP:8787/`；不要分享 `localhost` 或 `127.0.0.1` 地址。
- 本地房间不连接 Cloudflare。房主必须保持服务运行，系统防火墙需允许该端口的局域网访问。
- 本地 HTTP 服务仅用于可信局域网，不要暴露到公网。

已有构建可用 `npm run lan:start` 启动。房间数据保存在 `.wrangler/state/`，不要删除需要恢复的数据。

## 远程部署

GitHub Pages 提供游戏页面，Cloudflare Worker 与 SQLite Durable Object 提供房间服务。部署前核对账号及 [wrangler.jsonc](wrangler.jsonc) 中的服务名，避免覆盖其他服务：

```bash
npx wrangler whoami
npm run deploy:worker
```

- Pages：`npm run build` 输出 `dist/`，推送 `main` 后由 GitHub Actions 发布。
- Worker 与本地部署：`npm run build:worker` 输出 `dist-worker/`。两种构建的访问路径不同，不能混用。
- 更换 Pages 或 Worker 地址时，同步更新 [地址配置](src/network/endpoints.ts)。后端跨域授权变更时先部署 Worker，再发布 Pages。

只使用免费方案时，先在控制台确认 Workers Free。免费额度有上限，付费账号按其订阅计费；参见 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) 与 [Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

## 房间恢复

- 刷新后可在「联机房间」返回原席位；断线后使用重连入口，不会重放已确认的操作。
- 同一席位在另一页面连接会替换旧连接；先关闭重复页面，再重连。关闭标签或清理浏览器数据可能丢失席位，新玩家不能替换已开局的席位。
- 房间在最后一次有效操作后保留 24 小时，页面显示到期时间。

## 开发验证

```bash
npm run typecheck
npm test -- --run
npm run build
```

开发约束与人工验收见 [AGENTS.md](AGENTS.md)，素材来源与再生成见 [场景资产](src/assets/scenery/README.md)。公开功能、入口或开发流程变化时更新两种语言的 README，公开描述同时更新 [页面元信息](index.html)；更换素材或转换逻辑时更新场景资产说明。

经济模拟不包含在默认测试中：

```bash
npm run test:balance -- -t smoke
npm run test:balance
```

完整批次报告为 `test-results/balance/maps-report.json`，不提交。规则或电脑策略变化后，先备份并移走旧报告再生成新基线；相同配置重跑会比较非耗时统计。模拟不能替代真人体验与平衡性验收。
