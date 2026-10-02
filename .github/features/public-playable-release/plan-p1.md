# P1 — 确定性内核、对局运行时与 React 界面基础

**Goal：** 在保持现有一人一电脑玩法可用的前提下，建立可测试的规则内核、可销毁运行时和声明式 UI，而不是把 GameApp 换个名字继续扩张。

**Non-goals：** 本阶段不增加市场、建筑、多地图内容、后端或新游戏规则。React UI 的迁移不同时重写 Three.js renderer。

**Approach：** T1 固定现状与测试入口；T2 收敛规则命令和稳定快照；T3 分离调度/资源生命周期；T4 让 React 接管现有 UI 并修复交互边界。后续界面只在新路径开发。

**Acceptance：** A01/A02/A08/A10；原有规则回归保留，非法动作不产生部分变更；订阅无无限重渲染；旧局无残留推进；中英 UI 和实际控件操作可用。

**Rules：** 架构取舍以 idea 第8节和根 AGENTS.md 为准，不再设框架黑名单。所有测试及配置在 test/；本次只修订计划，以下新增文件和命令均待执行任务创建。

## P1-T1

### 建立现状回归与浏览器测试入口

**文件/接入：** package.json、锁文件、tsconfig.json、.gitignore、现有 deploy-pages.yml；新增 test/vitest.config.ts、test/playwright.config.ts、test/e2e/baseline.spec.ts。P1-T2接入领域边界测试时再增加test/tsconfig.domain.json（只含ES库、无DOM全局）并纳入typecheck，不为尚不存在的架构放空检查。现有四个单元测试不删除。

**问题：** 当前 `vitest --passWithNoTests` 会掩盖目录收集错误；现有测试没有证明实际鼠标交互、焦点或 WebGL 生命周期。部署只 build。

**步骤：** Vitest 显式收集 test/**/*.test.ts，排除 e2e/fixture，去掉零测试通过；浏览器以独立测试进程打开原有入口，先覆盖首屏、掷骰到下一个合法决策、现有现金和棋盘。新增 @playwright/test 开发依赖，配置和脚本同任务接通；`test:e2e` 显式指定 test/playwright.config.ts，webServer 随进程退出，baseURL 使用 /Richman3D/。不用用户日常浏览器抢焦点，不安装或替换用户的 Chrome 应用。

把当前可复现失败与未测项列清，禁止用 evaluate() 直接调用业务方法绕过点击来宣称按钮可用。设置控件命中、拒绝存储 getter、动态语言问题的修复与完整回归由 T4 负责；本任务不把已知红色 UI 场景改成假通过。若基线阻断冒烟，先定位最小实际阻塞，随相应任务修复，不删除断言。

报告输出 test-results/，加入忽略。此时记录现有产物传输体积、启动到可操作耗时与设备/浏览器信息作为比较基线；T3记录反复进入退出的资源趋势，后续每次重型场景改动对照，不把首次性能观察延至P11。尚无测量的数字不能写成通过，P11负责完整设备预算验证，不再重复建立另一套采样工具。现有部署立即增加 typecheck 和非空单测前置；PR 检查复用同一命令。完整浏览器生产产物门槛在 P12 收口，不让整个开发期间仅靠 build。不在本任务触发远端部署。

**验证：** npm run typecheck；npm test -- --run；npm run test:e2e -- test/e2e/baseline.spec.ts。检查零收集返回失败、四个现有测试被发现、测试进程关闭后没有遗留服务器。记录真实结果，不把浏览器 fixture 当最终用户测试。

**提交：** 测试入口、报告忽略与已有 workflow 的最小门槛一起，`test: 建立游戏回归入口与基本质量门槛`。

## P1-T2

### 统一规则命令、结构化事件和可重放随机源

**依赖：** T1。**文件/锚点：** domain/game.ts 的 roll/buyCurrentProperty/skipPurchase/snapshot、GameApp 调用者；新增 domain/types.ts、random.ts、selectors.ts、bot.ts；test/domain/commands.test.ts、random.test.ts、snapshot.test.ts，并迁移原 game.test.ts。

**关键不变量：** 校验失败、计算失败和重复提交不能改变位置、资金、随机游标或事件。当前 roll 会先移动/发奖再抽机会事件，只在最外层 catch 不能撤销已经改变的数据。

**步骤：** 建立 Game.apply(command) 单一入口，携带actor与用户当前看到的expectedRevision；会话不能把过期输入改写成最新revision来绕过拒绝。先校验类型、有限数字和实际决策；使用候选状态及候选随机游标计算全部结果，成功后一次提交并返回快照+有序语义事件。失败保留原状态，不通知订阅，不通过重试命令恢复。外部监听器在提交后失败只影响表现，不能导致再次转账。

snapshot 改为成功提交时建立的不可变缓存，同一版本反复读取保持 Object.is 相同；旧快照不被下一次命令修改。只读查询统一产生当前地块、合法动作、购买限制和资金信息，UI 不另写判断；不是建立第二个可写 store。基线 Bot 也通过 selectors 和同一命令入口行动，先保留260现金的现有选择，不把策略继续塞进 GameSession；后续阶段在这个模块扩展。

规则 RNG 使用固定版本 xorshift32，保存非零 uint32 状态，零种子统一规范化并保存原始输入/规范化结果的约定。若采用拒绝采样，须按 xorshift 非零输出域定义：先将原始输出减一映射到 [0, 2^32−2]，以区间长度 2^32−1 计算可整除上界，再拒绝尾部；不能把非零域当成完整2^32取样域。固定测试向量同时覆盖恢复和有界整数。这里不需要密码学随机、公平性网络证明或自研随机框架。动画、音频和 UI 不接触该状态。

当前只迁移已有三个决策；types 的判别联合随实际功能扩展，不预先装配未实现的市场/牌效状态。移除旧公开 roll/buy/skip 旁路、函数型生产 RNG 注入与重复合法性判断；保留所有旧测试的业务结果，用确定性 state/seed fixture 替换不可恢复随机序列。

**验证：** 同 seed/命令序列结果一致；非法 actor/revision、NaN、Infinity、失败机会计算不留下部分提交；旧快照深内容不变、同版本引用稳定；拒绝动作不消耗 RNG。query/AI 返回的动作从真实 apply 执行，不能只检查对象形状。完整旧规则回归与基线冒烟继续通过；用单独的test/tsconfig.domain.json（lib仅ES库、types为空，避免自动引入浏览器/Node全局）验证domain在无DOM类型环境编译，测试运行时导入边界不引用React/Three/存储，不能只靠AGENTS口头约束。

**提交：** 内核及所有调用者原子迁移，`refactor: 建立原子规则命令与稳定快照`。

## P1-T3

### 可取消表现序列与会话销毁

**依赖：** T2。**文件/锚点：** GameApp、World、FirstPersonRig、PlayerView、BoardView、motion、FeedbackLayer、GameAudio；新增 app/GameSession.ts、app/PresentationQueue.ts；test/app/session.test.ts、test/rendering/motion.test.ts、test/e2e/session-lifecycle.spec.ts。

**步骤：** GameApp 保留依赖组装与应用导航；GameSession 拥有一局的串行命令入口、生命周期和已提交结果。PresentationQueue 只消费语义事件，不能补结算。基线 Bot 调用 T2 的策略函数；组件或动画不能再直接 runBotTurn。运行中、暂停、销毁有明确转换，但不新增 generation/lease/重试框架。

World 持有一个 setAnimationLoop 场景帧入口；motion/骰子/建筑/相机以 update(delta) 或可注销回调接入，不各开无限 rAF。当前 rAF + fallbackTimer 改为同一运行时的 finish/cancel 语义：普通完成、主动跳过、暂停收敛、销毁取消分别处理；取消必须解除等待且不能接着发下一条电脑命令。隐藏/暂停即停止推进并把画面投影到已提交状态，因此删旧后台超时补完不会让 Promise 永远悬挂。规则不使用 delta 决定钱和骰子；本版没有物理积分，不强制60Hz固定规则 tick。

创建方负责清理：World 停帧并移除 resize，FirstPersonRig dispose PointerLockControls 与监听，BoardView/PlayerView 释放自己拥有的几何/材质/纹理，反馈清计时器，GameAudio 停正在播放的节点。公共几何只由共享拥有者释放；已 removeFromParent 的产权标记也释放，不能只处理仍在 scene 内的对象。声音主 Gain 在本任务解决静音立即生效，P9 只扩展音乐/音量，不让已知声音残留拖到末期。

为 UI 提供范围限于当前应用/会话的 subscribe/getSnapshot 与命令接口；返回 unsubscribe。对局状态与表现就绪状态分开，不能每帧给 React 发一个新 GameSnapshot。测试替换外部计时/视图边界，不为每个纯函数造 interface。

**结果提交与玩家看见的顺序：** Game.apply提交后立即取得最终快照，P3在此保存；演出尚未结束时，界面仍标识这条行动的执行者并关闭规则输入，不因快照已经advanceTurn就提前切到下一人的购买/掷骰面。GameView可持有本次提交前、提交后的两个只读快照引用和表现阶段：演出期间使用提交前的静态资金/位置，落地演出完成或跳过时一次切到提交后结果；连续追加移动通过语义事件说明，不在React里重新累加余额。暂停、隐藏、渲染故障与恢复直接显示最后已提交快照并停止自动推进。这样只延迟展示，不产生第二份可写规则状态，不把未显示等同于未保存。测试要同时断言中间可见阶段与最终结果，不能只检查最后现金。

**验证：** 用受控 delta 覆盖移动正常结束、跳过、隐藏、销毁；等待必须结束且取消后无命令。真实测试 fixture 20次进入/销毁，核对 canvas、监听、音频节点和 renderer.info 趋势；异步旧动画返回不会写新局。加入“移除产权标记后重建”资源回归。检查静音当下停止已安排音符，不能只测 enabled=false。

**提交：** `refactor: 统一对局运行时与资源生命周期`；同提交删除原 GameApp 里的游戏推进职责和 motion 双调度路径。

## P1-T4

### 修复当前双语投影与启动失败边界

**依赖：** T3。**交付方式：** 直接通过 React UI 迁移解决重复 DOM/文案拥有者，不先把旧控制器扩一遍再重写。

**文件/接入：** main.ts→main.tsx、index.html 入口、package.json/锁文件/tsconfig.json/vite.config.ts；新增 ui/App.tsx、SceneHost.tsx、Hud.tsx、SettingsPanel.tsx、FeedbackLayer.tsx、PanelHost.tsx、useGameView.ts、组件 CSS Modules 与 tokens.css；修改i18n、preferences和GameApp的UI接口；Language/isLanguage移到无业务依赖的src/i18n/language.ts，更新全部类型/校验调用者并删除preferences的旧导出，不保留兼容重导出；新增 test/ui/view-model.test.ts、test/e2e/react-ui.spec.ts、runtime-boundaries.spec.ts。

**步骤：** 只加入 React、React DOM、匹配类型及 Vite React 插件，核对现有 TS/Vite peer 要求并锁定版本；配置 jsx=react-jsx，测试收集包括 .test.tsx，tsconfig 包含 test/。不为这一迁移顺手装 Redux、R3F、ECS或DI容器；需要它们时依据 idea 的用途决策，而非永久禁用。

React App 消费 GameApp/Session 稳定视图。useSyncExternalStore 使用稳定 subscribe/getSnapshot，语言/局面/运行阶段改变才生成新投影；不要把 Game.snapshot 的 map/spread getter直接塞进 Hook。UI 只保存面板选择与输入草稿；React render、Effect、ref 回调不执行掷骰、转账或推进电脑。创建新局由明确开始操作负责；StrictMode 重挂载不能创建第二局或重放动作，不关闭 StrictMode 掩盖问题。

**唯一资源拥有者：** GameApp创建/销毁GameSession；SceneHost在已获得真实容器后创建一个World并向会话绑定呈现端口，Effect清理只解绑并销毁这个World，不能调用GameSession.dispose。会话不依赖HTMLElement构造，也不再另持有一份自己创建的World。解绑取消未完成演出、关闭规则输入，但保留已提交领域状态；新视图绑定后先从该状态完整重建，再按会话当前运行状态开放操作，不能从组件挂载重新执行roll或买地。用户返回菜单时由GameApp停止/销毁会话并卸载SceneHost；局部渲染错误只关闭视图，不丢掉可导出的局面。T3的命令式视图接入在本任务随旧UI一起移除，不留两套World创建路径。

一次替换三个旧 UI 类及 GameApp 对它们的创建、render、监听引用，删除旧 requiredElement 样板和不再引用的全局 CSS。单一 PanelHost 管设置/当前结算，原生 dialog 明确 pointer-events:auto、关闭/焦点恢复，不能依赖 top layer 自动修正祖先 pointer-events。样式令牌与组件样式本任务建立，不留 P11 才拆；隐藏界面不应还能执行底层快捷键。

反馈存语义事件和到期时间，换语言重投影当前事件/回合/结算，不续期、不重放声音。移除装饰性的重复英文 kicker、重复 status/toast及不再引用的翻译键；设置变更在控件内反映，不覆盖当前购买/付款原因。可见事件文案按语言重投影，独立的单个语义播报区只在收到新的事件编号时更新；不能给每个金额/提示再加aria-live，否则切语言或React重渲染也会重复播报。不要用隐藏旧中文文案阻止播报而牺牲当前可读内容。偏好默认 localStorage 获取移入 try 内，保留真实 v1偏好逐字段默认，不写旧版兼容层。Pointer Lock 失败只更新状态并给按钮路径，不反复申请。初始WebGL创建失败保留可读错误与退出路径，P11再扩充上下文丢失场景。React渲染错误设置局部ErrorBoundary；异步保存/演出失败由Session显式接收并显示当前状态，ErrorBoundary不是Promise异常捕获器，不能留下void异步调用的未处理拒绝。

**验证：** 开发 StrictMode 与生产 preview 分别执行真实控件点击、键盘操作、焦点返回；检查 settings-dialog计算样式和实际命中，不用DOM.click绕过。存储 getter 抛错仍可进入；显示中的事件换语言无旧文案/未替换占位符；0金额、特殊字符姓名均正确；一次动作只一次 apply/一次 aria公告。快照静止时重复渲染不发布新对象，场景帧不触发整个HUD重渲染。验证 `index.html` 新入口及 /Richman3D/ 静态产物，不留下旧 main.ts 与旧控制器。

**补充验证：** StrictMode setup→cleanup→setup期间matchId、revision、RNG不变，活跃World和帧入口各至多一个；动作播放中卸载再绑定只显示已提交结果，不重复推进。对比动画开始、落地、下一操作者三个时点，不能出现“正在看本人掷骰、却能操作对手回合”。本任务同时用真实新UI更新README引用的`public/og-image.png`；不得继续展示已删除的大卡片/日志，P12只做发布版本的最终复核。

**提交：** `refactor: 用 React 统一游戏界面与交互边界`。

## 阶段结束检查

完整 typecheck、Vitest、build、基线与React浏览器回归；核对旧 UI、双帧调度、直接规则旁路确已移除。未来执行阶段才建立本阶段审计；本次计划审查不以任务 pending 的存在冒充实现完成。
