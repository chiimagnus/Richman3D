# Richman 3D

**中文** | [English](README.en.md)

支持第一人称与棋盘总览的 3D 大富翁浏览器游戏。使用 **TypeScript + Three.js + WebGL + Vite** 构建，支持2–4席同机真人与电脑对局。视角、总静音、音效/音乐音量、语言、鼠标灵敏度、动画速度和第一人称晃动保存在本地偏好中，不写入规则存档。

**游戏入口（单机与远程联机）：https://chiimagnus.github.io/Richman3D/**

![Richman 3D gameplay](public/og-image.png)

当前仅面向 PC 桌面浏览器，使用鼠标、键盘和界面按钮操作；不提供手机或平板适配。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址即可开始游戏。

## 联机开发与部署

正式游戏入口仍在 GitHub Pages；「联机房间」直接在当前页面创建/加入，不跳站，邀请链接也保留 Pages 地址。远程 HTTP/WSS 房间服务由 Cloudflare Worker + SQLite Durable Object 提供，仅额外授权 `https://chiimagnus.github.io` 的跨域请求，不使用通配 Origin 或 cookie 认证。支持 2–4 位真人分别使用电脑，领域层在服务器裁定，浏览器只呈现本人的视角和手牌；原有同机真人、电脑、存档和挑战仍保留。Vite 开发服务器没有房间后端；开发联机使用下面的局域网命令，本地连接同源房主服务器而不是 Cloudflare。

房主电脑先安装 Node.js 22.12+ 和依赖，再构建启动：

```bash
npm ci
npm run lan
```

所有电脑（包括房主）访问 `http://房主局域网IP:8787/`，使用页面的联机入口。不要分享 `localhost` 或 `127.0.0.1` 的邀请地址，它们只指向访问者自己的电脑。启动脚本关闭 Wrangler 的本地开发存储/观测 API，游戏服务器监听局域网接口，调试端口只监听本机；系统防火墙可能需要允许 Node 的局域网访问，不需要路由器端口转发。

准备好依赖和 `dist-worker/` 后，断网时直接启动，无需 Cloudflare 登录：

```bash
npm run lan:start
```

本地房间存于 `.wrangler/state/`，房主必须保持服务器运行，重启可读取未到期房间。普通 HTTP 只适合可信局域网，不要暴露到公网。远程服务使用 HTTPS/WSS，同样在服务器保存房间；席位凭据留在当前浏览器标签的 `sessionStorage`，刷新或重连恢复原席位，关闭标签或清理数据可能丢失凭据。新玩家不能顶替已开始对局的席位。房间在最后有效操作后保留 24 小时，页面显示到期时间。

部署独立服务（会创建或更新 `wrangler.jsonc` 指定的 Worker，请先核对账号和同名服务归属）：

```bash
npx wrangler whoami
npm run deploy:worker
```

Pages 构建仍是 `npm run build` → `dist/`，main 推送触发本游戏的 Pages workflow；Worker/LAN 使用根路径 `npm run build:worker` → `dist-worker/`，静态产物用于本地离线游戏，不能混用产物。更改后端 Origin 授权时先部署 Worker，再发布 Pages 前端。Workers Free 支持本项目使用的 SQLite Durable Objects；采用 WebSocket 休眠，静态资源不经过房间 Worker。免费额度为账号共享且不是无限免费，超额会停止服务，不会由项目自动升级付费；已付费账号仍按其订阅计费。部署前在控制台确认 Workers Free，限额以 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) 与 [Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/) 为准。

## 技术栈

- TypeScript
- Three.js / WebGL
- React / React DOM
- Vite
- Vitest

## 开发验证

环境音乐由`src/audio/GameAudio.ts`中的三个110/165/220Hz正弦音在运行时合成，没有外部录音、下载音轨或额外素材文件（新增音频素材0字节），与源代码一同使用仓库`LICENSE`。Web Audio只在开始或声音按钮手势中启用；播放被拒绝时设置提供明确重试按钮，不影响对局。

```bash
npm run typecheck
npm test -- --run
npm run build
```

需要验证实际交互时，使用已安装的 Helium 检查真实游戏页面；不维护浏览器自动化测试。

独立经济模拟（不包含在默认单测中）：

```bash
npm run test:balance -- -t smoke
npm run test:balance
```

完整批次对每张内置地图、2/3/4席的快速和标准模式各运行1,000个固定种子，核对资金、牌总量、推进边界和可恢复性，并比较局长、现金与整组完成率；报告在 `test-results/balance/maps-report.json`，不提交。重复相同配置会核对全部非耗时统计。报告只反映电脑策略模拟，不证明真人时长、体验或平衡性；此前不同规则/策略的报告应先保留后移走再生成新基线。
