# P2 — 清楚的产品入口与可保存的对局配置

**Goal：** 菜单、配置、教学和结算完整可用，并在首次存档前稳定席位、规则、地图的数据契约。

**Non-goals：** 不在此时开放四人、第二地图、未实现难度或继续游戏；不建立通用路由/配置框架。

**Approach：** 在 P1 的 React UI、独立 GameSession 上开发。现有城市和两人玩法先迁成配置驱动；P4/P8/P10增加能力，不再重做底层标识和数据归属。

**Acceptance：** A01/A02/A08/A09；不刷新重开；名称/语言正确；配置进入真实规则与场景，而不是只保存在表单。

**Rules：** 依赖 P1；所有新用户文案进 JSON，面板遵守 idea 的信息归属表。UI为TSX/CSS Modules，domain仍是纯TS。

## P2-T1

### 应用菜单与按需创建对局

**文件/锚点：** main.tsx、ui/App.tsx、SceneHost.tsx、app/GameApp.ts/GameSession.ts；新增 ui/MainMenu.tsx、PauseMenu.tsx 与对应样式；test/e2e/navigation.spec.ts。

**步骤：** App先显示轻量菜单，主要行动一个；未开始不创建World/AudioContext，开始操作按需导入会话和场景。GameApp负责请求与唯一会话，React仅展示加载、错误和可用操作；重试加载不创建两局。SceneHost连接视图不自行决定开始/继续规则，防止StrictMode重复Effect推进。

暂停菜单只有继续、重开、返回，设置/帮助共享同一个PanelHost。重开换matchId与种子但保留偏好；返回清理运行时，删除location.reload。此时尚无对局存档，离开明确提示会丢局；P3接通后才承诺保存。菜单与局内不复制设置状态；已存语言在主要文案显示前应用。

**验收/验证：** 菜单→开始→暂停→继续→返回→新局；空菜单无场景帧/声音，旧局回调不改变新局；动态模块失败能返回或重试，连续点击开始只有一局。基线浏览器测试改为从真实菜单开局，保留原掷骰/现金断言。完整typecheck/build以及navigation.spec。

**同任务清理/提交：** 删除旧首屏立即newGame/newWorld和刷新重开路径；`feat: 接通声明式菜单与完整对局导航`。

## P2-T2

### 对局设置与明确的终局规则

**文件/接入：** domain/types.ts、game.ts、board.ts、random.ts、selectors.ts、bot.ts，World/BoardView/boardGeometry/PlayerView，i18n与所有玩家/地块名称消费处；新增 domain/rules.ts、domain/maps/city.ts、domain/maps/index.ts、domain/turns.ts、ui/MatchSetup.tsx。新增 test/domain/config.test.ts、maps.test.ts、turns.test.ts 和 test/e2e/match-setup.spec.ts。

**前置契约：** MatchConfig包含稳定p1–p4席位ID、controller、显示名/默认名键、棋子外观、rulesVersion、mapId/mapVersion与seed；UI本阶段只提供两席，其他规模P4开放。身份不是用户名，也不是human/bot；后者仅控制方式。规则与渲染所有调用者同任务迁移为按ID查询，不能等存档完成后再改主键。

RuleSet拥有现在真实使用的初始资金、起点奖励、轮数上限和四种机会金额。以后建筑/市场/牌效任务往同一来源增加字段，不在P8才收集散落常量。i18n说明用规则参数插值；只更改语言不能更改规则。当前地图迁为MapDefinition：有稳定版本、地块规则、环路顺序和纯数字坐标；boardGeometry接受所选地图，移除固定6×6推导及全局BOARD消费。城市20格价格/坐标逐项保持，公共BoardTile用判别类型表达，不再从一张地图字面量推导所有可能ID。

Game在创建时绑定不可变配置；World接相同地图和玩家配置。玩家mesh通过ID映射，两个同格棋子有稳定偏移；当前只验证完整二人，三/四席构造不是已完成多人产品。创建第二地图和新玩家控制方式的UI不提前显示。

快速20轮/标准40轮，一轮按固定轮序完成；最后一席的购买等决策结束后才结算。唯一存活者提前结束；轮满按净资产再现金排序，仍相等为并列，结果改为排名与赢家列表。当前净资产=现金+地产标价，P5扩充同一函数；结果组件和声音的赢家判断同任务迁移，不保留winnerId旁路。

名字去首尾空白，空值使用本地化默认名，1–16个用户可见字符；React文本渲染，不使用dangerouslySetInnerHTML。自定义名字不翻译，默认名以语义键保存。种子自动生成；外观不带规则能力；高级配置折叠，只有已生效选项。

**验证：** 所有旧地图坐标/价格、规则用例保持；配置地图与视觉同源；修改声音/语言不改变配置与RNG；完成20/40轮边界、并列、最后购买后终局；两个席位ID不再被误当输家/电脑；名称实际进入资金栏、提示、结算。修改一项RuleSet金额后运行断言，确认真实付款和双语说明一起变化，不仅测试配置对象。运行config/maps/turns及现有i18n/几何/规则回归。

**同任务清理/提交：** 删除全局BOARD生产路径、写死human/bot身份/单个bot对象、旧固定坐标、业务文案金额重复、独立winnerId逻辑；`refactor: 在存档前统一对局配置与胜负规则`。该任务结果是完整配置驱动的二人局，不是注册了一组无人读取的配置文件。

## P2-T3

### 有解释的结算页和重开路径

**文件/锚点：** React FeedbackLayer、GameSession、Game事件、selectors与结果模型；新增 ui/ResultsScreen.tsx、test/domain/results.test.ts、test/e2e/results.spec.ts。

**步骤：** 结算第一屏只回答谁赢、为什么、你的最终结果及再来一局；默认只列排名与净资产，现金/地产/租金收支放可展开明细。财务合计来自domain事件和同一selectors，不由动画播放次数累加。合并并列赢家和不同结束原因。

重开默认同配置新种子；返回菜单不改变已结束结果。重玩原种子入口放次级操作并标重玩，不同时给三个同样突出的开始按钮。替换P1简单胜负弹层，而不是在它上面再盖ResultsScreen；阶段迁移后只有一个终局决策面。未做本地历史前不假装已永久保存胜场。

**验证：** 从真实终局事件进入界面，角色名字、净资产、租金和余额对账；切语言/反复渲染不增统计；重复确认终局无副作用；主要行动与焦点唯一；重开不刷新，matchId变化、偏好不变。test/domain/results.test.ts与results.spec。

**同任务清理/提交：** 删旧showGameOver命令式弹层、重复文案和样式；`feat: 统一有解释的结算与重开界面`。

## P2-T4

### 可跳过的实操教学与游戏内规则

**文件/锚点：** MainMenu、MatchSetup、GameSession、Hud、JSON；新增 app/tutorial.ts、ui/HelpPanel.tsx、test/e2e/tutorial.spec.ts；同步docs/how-to-play.md与完整基础英文玩法docs/how-to-play.en.md，并从英文README链接。

**步骤：** 独立预设教学使用真实Game与固定种子，观察资金→掷骰→查看落点→买或不买→理解对方回合，最多五步可随时退出。预设必须保证出现可讲解的实际购买，不靠伪造DOM事件推进。不能修改正式局RNG、覆盖正式存档或记战绩。教学结束返回开局；已完成标记独立于对局。

提示附在当前行动区，不再同时弹中央说明和底部同一句。帮助可从菜单及局内同一入口打开；只解释已实现玩法。增加建筑/牌效/债务的task同步扩展帮助，不把全套规则硬塞进第一次教学。中文/英文的用户入口和内容覆盖对称，文档不导向不存在按钮。

**验证：** 五步真实完成、任一步跳过、换语言保留进度、纯键盘可退出；开始正式局不带教学资产/种子；帮助关闭回触发点，快捷键不穿透；桌面与窄屏读完当前步骤无需横向滚动。教程状态不会进入正式战绩。

**同任务清理/提交：** 删除重复提示与旧不可达帮助文案；`feat: 提供独立教学与对称双语帮助`。

## 阶段结束检查

从菜单→教学→正式局→结算→返回完整走通，核对配置/地图/席位契约已真实接入。首次存档P3以本阶段数据契约为基线；后续不再以迟到的架构迁移重复改写ID和地图来源。
