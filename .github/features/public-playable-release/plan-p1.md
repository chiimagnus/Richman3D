# P1 — 让规则结果与会话生命周期可控

**Goal：** 给菜单、续玩和策略系统建立可重放的规则入口与可销毁的游戏会话，不推倒重写现有玩法。

**Non-goals：** 不加建筑、多人、卡牌、数据库或通用游戏框架。

**Approach：** 先保住现有可玩流程，再把同步规则提交与异步表现分开；新会话仍走现有 Game/World/HUD。仅因返回菜单、暂停、存档的明确需求新增取消与生命周期边界。

**Acceptance：** A01/A02/A08/A10。原有买地、租金、税费、机会、语言和按键仍可用；取消旧局不会继续驱动下一局；规则随机数可重放。

**Rules：** domain 不依赖 DOM/Three.js；不为动画设置第二份资产状态；测试全部在 `test/`；不新增 Redux、ECS、状态总线。依赖无；后续阶段必须先满足本阶段契约。

## P1-T1

### 建立现状回归与浏览器测试入口

**文件与锚点：** 修改 `package.json`、`.gitignore`、`tsconfig.json`（仅在测试配置确实要求时）；新增 `test/vitest.config.ts`、`test/playwright.config.ts`、`test/e2e/baseline.spec.ts`；复用四个现有 `test/**/*.test.ts`。现有接入是 `main.ts → GameApp`，测试命令带 `--passWithNoTests`。

**当前问题：** 19 个已记录的测试只覆盖规则/偏好/翻译/几何，不能证明真实 UI 链路；零测试也可通过的配置会掩盖将来的目录错误。

**步骤：** 将 Vitest 明确限定为 `test/**/*.test.ts`，排除 e2e 与浏览器 fixture；去掉零测试通过。增加仅开发依赖 `@playwright/test` 与 `test:e2e` 脚本，配置放在 test 内，不安装/替换用户的 Chrome。浏览器先测当前已有界面：页面加载、WebGL canvas、语言切换、声音偏好、掷骰到玩家再次可操作或待购买的合法状态。使用专用无头测试浏览器，不抢用户浏览器焦点。新增配置与脚本同一任务接通，不能只建一个无人运行的测试目录。配置位于 test/，因此 package.json 必须显式指定 `vitest --config test/vitest.config.ts` 与 `playwright test --config test/playwright.config.ts`；将配置目录计入现有 typecheck。Playwright 的 webServer 由测试进程负责启动和停止，baseURL 使用实际 `/Richman3D/` 子路径，先只运行 Chromium 项目，P11再扩大浏览器矩阵。锁定新增开发依赖版本，不顺手升级生产技术栈。测试报告统一输出test-results/，本任务把该目录和Playwright报告目录加入.gitignore，不把生成报告混进源码。纯规则/投影继续用Vitest；实际DOM、WebGL与音频控制走浏览器fixture，不为单元测试再造完整假浏览器。

**验证：** `npm run typecheck`、`npm test -- --run`；`npm run test:e2e -- test/e2e/baseline.spec.ts`。预期四个现有测试文件仍被收集；空 include 负向检查必须返回失败；浏览器不得出现未处理异常，等待明确状态而不是固定睡眠后截图。此时不伪造未来菜单或存档测试。

**原子提交边界：** 测试配置、命令与真实现状用例一组；提交建议 `test: 建立公开版浏览器回归入口`。后续实现时才提交代码，本次只登记计划。

## P1-T2

### 统一规则命令、结构化事件和可重放随机源

**依赖：** P1-T1。

**文件与锚点：** 修改 `src/domain/game.ts::Game.roll/buyCurrentProperty/skipPurchase/advanceTurn`、`src/app/GameApp.ts::rollHuman/runBotTurn`、`test/domain/game.test.ts`；新增 `src/domain/types.ts`、`src/domain/random.ts`、`test/domain/random.test.ts`、`test/domain/commands.test.ts`。

**不变量：** 一次合法命令只有一份规则结果；非法操作者/错误阶段/重复提交不得移动棋子、扣钱或消耗随机数。所有 UI/电脑动作必须进入同一入口。

**步骤：** 以 `Game.apply(command)` 承接现有三种动作，命令带操作者与期望 revision；返回完整快照和按顺序排列的语义事件，不存中文/英文句子。把原有直接业务方法迁入该执行路径并修改全部调用者，不留下两个能独立结算的入口。当前仅保留实际需要的三种阶段，不提前把拍卖、网络、卡牌所有状态写进枚举。

采用固定算法版本的 xorshift32 随机源，保存非零 uint32 状态；新局种子在 app 边界生成，零种子明确规范化；骰子/洗牌通过有界整数抽取，避免直接取模引入可避免的偏差。规则随机数与动画、音效、UI 完全隔离；测试保存已知种子输出向量和恢复向量。原来的函数型 random 注入与 sequenceRandom 测试迁为明确可重放的随机状态 fixture，不保留不能序列化的生产随机路径。GameSnapshot 增加 schema 所需的规则版本、revision 和随机状态；正式存储由 P3 接入。

**验证：** `npm test -- --run test/domain/game.test.ts test/domain/random.test.ts test/domain/commands.test.ts`；两个相同种子/命令序列快照相同；错误 revision、NaN、越界参数和错误玩家拒绝后快照与随机状态逐字段不变。原有五个规则场景都保留结果断言，再跑 baseline 浏览器用例。

**原子提交边界：** 命令入口、调用者迁移、随机源与回归一起提交；`refactor: 统一规则命令与可重放随机状态`。不能只新增 types/random 而无人使用。

## P1-T3

### 可取消表现序列与会话销毁

**依赖：** P1-T2。

**文件与锚点：** 修改 `GameApp`、`World`、`FirstPersonRig`、`PlayerView`、`BoardView`、`motion.ts::animatePositions`、`FeedbackLayer`、`GameAudio`；新增 `src/app/GameSession.ts`、`src/app/PresentationQueue.ts`、`test/app/session.test.ts`、`test/e2e/session-lifecycle.spec.ts`、所需 `test/fixtures/session.html`。

**根因与接入：** E02/E08。当前 await 动画后继续 runBotTurn，旧局没有销毁入口；`motion` 的补完定时器可能在视图退出后仍写位置。新增菜单后这条路径直接可达。

**步骤：** GameApp 只持有一个活动 GameSession；Session 承接当前对局命令、音效、表现与电脑推进。PresentationQueue 只串行消费已提交事件，不重算落点；同一时刻不能开两条推进链。取消必须是可识别的取消结果，不能假装成功 resolve 后继续电脑回合。暂停把画面收敛到已提交快照并保留待决策，销毁则终止旧链；恢复只启动一条合法后继链，不重播规则。

为 World/控件/反馈/音频建立明确 dispose：停止 renderer animation loop，移除监听，释放纹理/几何/材质和控件订阅，清理 rAF/计时器/播放节点。共享资源由唯一拥有者释放，不遍历时重复释放；已移除的归属标记也要释放资源。替换当前没有取消语义的 motion fallback，而不是只在每个回调外再加一层 try/catch。测试 fixture 只在测试服务器可用，不在生产公开 `window.game` 调试后门。

**验证：** session 单元测试覆盖取消发生在掷骰等待、位移、落地反馈、电脑等待；旧会话不能再发命令。浏览器 fixture 连续创建/销毁 20 次、取消后再次创建；检查 canvas/监听次数与 `renderer.info.memory` 不持续增长，并核验最后位置和余额来自当前快照。资源清理由 S05 支持；后台补完由 S02 支持，不能仅用 mock 计数代替浏览器证据。

**原子提交边界：** 生命周期接线与相应资源清理同一组；`refactor: 分离对局会话并完整取消旧局表现`。

## P1-T4

### 修复当前双语投影与启动失败边界

**依赖：** P1-T3。

**文件与锚点：** `preferences.ts::loadPreferences/savePreferences`、`FeedbackLayer::setLanguage/showEvent/showGameOver`、`GameSession`、`FirstPersonRig::lock/onLockChange`、双语 JSON；扩展 `test/settings/preferences.test.ts`，新增 `test/e2e/runtime-boundaries.spec.ts`。

**步骤：** 把默认 storage 获取移入 try 内，保留显式存储注入以测试拒绝 getter；不把设置存储失败和对局存档失败混为同一状态。反馈保存“事件种类+参数/玩家 ID”，语言变更时重新绘制正在显示的事件/回合/结算，不延长其寿命、不再次触发音效或规则。清理复制的已翻译字符串缓存。对 Pointer Lock 请求失败监听真实错误事件并给出按钮/拖动玩法提示；不自动反复申请，不吞错后把 UI 标为已锁定。

**验证：** 存储 getter 直接抛错时仍进入游戏并使用默认偏好；显示中的租金/机会/结算中英来回切换、对应 aria 文本同步而余额不变；拒绝锁定仍能用按钮完成掷骰购买。执行 preferences、i18n 和 runtime-boundaries 用例，覆盖缺占位符、0 金额、中文用户名与特殊字符。

**原子提交边界：** 当前边界缺口与回归；`fix: 完整更新动态语言并处理浏览器拒绝`。

## 阶段结束检查

运行完整 typecheck、Vitest、build 和 P1 浏览器用例；记录基线浏览器版本。执行阶段才创建 `audit-p1.md`，未过审不进入 P2。这里没有审计结论，也不把“计划写完”当作四个任务完成。
