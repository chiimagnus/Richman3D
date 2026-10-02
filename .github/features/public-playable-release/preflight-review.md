# 公开版计划执行前审查

审查日期：2026-10-02。输入基线：`b490b96`，分支 `crh/bold-think`。本轮只修订需求、实施计划及根 `AGENTS.md`，不实现游戏功能。以下“已修订”指计划的处理决定，不代表源码缺陷已经修复。

## 结论

原计划需要修订的核心不是再增加功能数量，而是UI技术决定、基础契约的建立时机、状态/副作用所有权和重复交互。现已采用React DOM界面、独立Three.js运行时、纯TypeScript规则内核；取消技术黑名单，补充具体采用理由和替换路径。48个任务仍全部pending，编号保留，正文与依赖顺序已经更新。

首次公开测试以城市地图的完整经营、续玩、可达UI和已声明设备为范围；P10的第二地图、挑战、成就保持独立扩展任务，不再阻塞核心公开版。没有删掉这些功能，也没有把暂未执行写成完成。

## 阅读范围与证据边界

基线49个仓库文件全部核销，不用已有audit结论替代判断：

| 范围 | 文件与读取方式 |
| --- | --- |
| 生产源代码与样式，17个 | `src/main.ts`；`app/GameApp.ts`；`domain/game.ts`、`board.ts`；`rendering/World.ts`、`BoardView.ts`、`FirstPersonRig.ts`、`PlayerView.ts`、`motion.ts`、`boardGeometry.ts`；`audio/GameAudio.ts`；`settings/preferences.ts`；`i18n/index.ts`；`ui/Hud.ts`、`SettingsPanel.ts`、`FeedbackLayer.ts`；`style.css`。TypeScript由CodeGraph逐字源码及调用路径核对，CSS全文读取。 |
| 语言资源，2个 | `src/i18n/locales/zh-CN.json`、`en.json`全文；区分文案、规则金额和动态玩家名称。 |
| 测试，4个 | `test/domain/game.test.ts`、`test/rendering/boardGeometry.test.ts`、`test/settings/preferences.test.ts`、`test/i18n.test.ts`全文；核对断言能证明的实际行为。 |
| 计划，14个 | `idea.md`、`plan-p1.md`至`plan-p12.md`、`todo.toml`全文；逐task核对依赖、接入、验证和旧路径删除。 |
| 长期用户文档，3个 | `README.md`、`README.en.md`、`docs/how-to-play.md`全文。 |
| 配置，7个 | `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`.gitignore`、`.github/workflows/deploy-pages.yml`。锁文件逐依赖读取版本、关系、引擎和许可元数据；这不是第三方源码安全审计。 |
| 许可与素材，2个 | `LICENSE`全文；实际查看`public/og-image.png`，不是仅检查文件存在。 |

根AGENTS.md按init技能和TypeScript参考约束建立；从`src/ui`重新调用read_rules，确认项目规则实际进入继承链。审查期间未读旧audit文件，未运行新的浏览器试玩、性能测量或屏幕阅读器测试。原19个测试通过是历史证据，不作为本轮新架构通过的证据。

## 主要发现及计划处理

| 编号 | 证据或冲突 | 已写入的处理与对应任务 |
| --- | --- | --- |
| R01 | `GameApp`同时创建场景、操作DOM、处理输入、执行Bot、调度动画和声音；未来面板继续沿此模式会扩张同一控制器 | P1-T3分出GameSession和只消费结果的PresentationQueue；P1-T4由React接管原有UI，不仅把DOM字符串换成JSX。 |
| R02 | `Game.snapshot`每次getter重新创建对象/数组；不能直接作为React外部状态订阅的稳定快照 | P1-T2在成功规则提交后生成缓存不可变快照；P1-T4稳定订阅与清理，场景每帧不更新React状态。 |
| R03 | `roll`在机会抽取前已改变位置和起点奖金；后续计算失败可留下部分变更，`rollDie`比较也未排除NaN | P1-T2先校验、在候选状态和候选RNG游标计算、成功后原子提交；失败不扣钱、不移动、不消耗随机数。 |
| R04 | World帧循环、motion的rAF/超时及多个组件定时器缺少完整销毁链；产权标记移除不等于资源释放 | P1-T3统一帧入口与取消语义、明确资源拥有者，覆盖已移出scene的资源；暂停/销毁必须解除等待且不再推进旧局。 |
| R05 | `FeedbackLayer.setLanguage`只更新重开按钮；缓存中的回合、事件和结算文案不会一起更新 | P1-T4保存语义事件，在当前语言下重新投影，不续期、不重播音效，删除旧DOM文案缓存路径。 |
| R06 | `.settings-root`禁用pointer-events，dialog未明确恢复；现有测试不检查真实点击。属于静态交互风险，未声称已复现 | P1-T4原生dialog封装明确pointer-events与焦点，实际命中/点击回归，不用脚本直接调用click绕过。 |
| R07 | localStorage默认参数在try外求值；现有偏好测试只模拟getItem/setItem报错 | P1-T4把存储访问置于边界内；保留真实v1偏好，补getter拒绝场景，不建立虚构旧版适配链。 |
| R08 | 音频setEnabled只影响后续音符，已安排音符不因此停止 | P1-T3接入即时总静音与销毁；P9-T5在此基础扩展音乐和音量，不把已知基本问题拖到末期。 |
| R09 | 原计划在存档后才改玩家ID、在玩法完成后才抽地图和RuleSet、最后才拆Bot | P1已有统一selectors/Bot入口；P2在首次存档前统一席位、地图、规则配置。P4/P8/P10扩能力，不重复迁移底层。 |
| R10 | 原计划禁止React等技术，但同时要大量表单、交接与决策面板 | idea第8节改为具体取舍：采用React、局部有类型订阅、显式注入；ECS/物理引擎按实际用例评估，不永久禁止也不全部默认安装。 |
| R11 | 多处可能重复展示回合、现金、付款原因和确认动作；新资产/市场面板可能再次变成常驻信息墙 | idea第6节和AGENTS建立信息归属表、单一PanelHost、一个主动作、按需明细；P1就拆组件样式和令牌，不到P11才补UI架构。 |
| R12 | 交易发起者随时取消与单一接收者decision.actorId矛盾 | P6-T2及idea统一为提交前取消草稿，提交后接收者接受/拒绝；暂停不撤销提案，无并行取消协议。 |
| R13 | 收牌发生在掷骰后、用牌仅在掷骰前，却另计划每张牌acquiredTurn/冷却状态 | P7通过已有阶段和一回合一次额度表达，删除重复时间/冷却状态；目标选择采用可访问列表，不依赖穿透modal点击棋盘。 |
| R14 | P3预建profile但到P10才有持久战绩；P10挑战可能反过来依赖下一task才有的记录库 | P3只有当前局/备份；P10-T3挑战记录和真实profile存储同任务接入，T4复用。 |
| R15 | 若AI只用Omit或类型断言处理完整快照，运行时仍可能包含对手手牌/RNG | P8-T1实际构造允许字段的BotObservation；不能把类型省略当运行时去敏。 |
| R16 | 原始测试可零收集通过，workflow仅build；唯一OG图仍展示旧玩家大卡片/日志 | P1补真实测试收集和基本门槛；P12最终核对生产产物并更换实际新UI截图。未来脚本尚未建立，不宣传已经运行。 |

与公开平台有关的判断按官方契约复核：React的`useSyncExternalStore`要求快照稳定且不可变；StrictMode的重复Effect用于检查清理；ErrorBoundary不代替异步事件错误处理。参考入口在idea的S10–S12；Three.js资源释放参考S01。项目特定风险仍需实现时的回归证明。

## 原实现替换与清理的归属

| 旧路径 | 同任务替换/删除，不延至末尾 |
| --- | --- |
| 直接roll/buy/skip旁路与函数型生产随机源 | P1-T2：Game.apply、候选状态/RNG、实际调用者和旧测试同时迁移。 |
| GameApp内整局推进、motion双调度、未注销监听 | P1-T3：Session/统一帧驱动/明确取消结果；不能只新增新类而留下旧循环。 |
| 三个命令式UI类、重复requiredElement和失效全局样式 | P1-T4：React组件与CSS Modules接管时删除；main入口和所有引用同改。 |
| Language类型和校验放在preferences造成反向归属 | P1-T4：移入无业务依赖的i18n/language.ts，更新调用者并删旧导出，不做兼容重导出。 |
| 写死human/bot、全局BOARD、固定6×6坐标与散落数值 | P2-T2：稳定席位与当前对局配置真实注入，P4/P10不再重复迁移。 |
| 基础胜负层与新结算页并存 | P2-T3：ResultsScreen成为唯一终局面，旧层/调用/样式一起删。 |
| owners与新版地产状态重复 | P5-T1：一份PropertyState，不维持两份可写产权来源。 |
| 先给地主全额再判断负现金 | P5-T4：固定债务与真实可收回金额；新债务必须当任务就有全部合法出口。 |
| 不买地产直接结束回合 | P6-T1：拍卖接入时替换旧skip分支。 |
| 每次独立随机机会数组/语言内写死牌效金额 | P7-T1：可恢复牌库和RuleSet金额，移除旧抽取器/文案常量。 |
| 字符骰子与3D骰子同时演出 | P9-T2：保留单次语义结果，替换旧可见演出与无用样式。 |

P5-T5、P6-T3、P7-T4等组合检查任务不承担前面故意缺失的基本正确性；它们只复核组合并修复真实发现，不是统一清理兜底。

## 已收敛的过度规划

不预建无使用者的战绩库、依赖注入容器、通用可编程牌效引擎、分布式actor/lease层、全局事件总线或部署版本轮询器。不为回合制经营引入固定60Hz规则时钟；只有场景动画需要帧更新。不把客户端本地挑战包装成可信排行或加签名防作弊协议。

将第二地图/每日挑战/成就从首次公开门槛拆出，但保留完整目标。真实试玩从发现阻塞开始，不强制未经确认的8–12人、80%成功率或恰好两轮；性能/经济实验按预算和新证据推进，不把三次调参次数当质量结论。

保留真正必要的边界：外部输入校验、同一笔资金原子性、已发布数据兼容、损坏保全、用户可见未保存状态、真实跨标签CAS冲突和资源清理。没有把这些称为“多余围栏”删掉。

## 核销结果及尚未证明的事项

- 任务表当前字节SHA256：`22d9eb42eb622981d85891bd0de58124b8d3acb681f11e81d5d3a0857d1b4414`。使用与本机同SHA的feature_tool.py，在容器检查逐字节副本，`todo validate`返回`todo.toml OK`；`todo next --phase p11`正确返回P11-T1。
- 48个任务ID与12份正文标题存在对应，全部pending、current_task_id为空，未修改状态或伪造实现提交。阶段数量依次为4/4/4/4/5/3/4/3/5/4/4/4。
- 根AGENTS在src/ui的read_rules结果中实际生效；文档链接指向真实路径。仅有规范/计划变更，生产源码、测试、锁文件、HTML入口和工作流相对b490b96的diff为空；工作区和暂存区diff空白检查通过。
- 未执行新的typecheck、游戏测试、浏览器交互、真机、性能或完整neat-freak脚本审计。此轮证据是源码与计划静态审查、任务校验和规范加载，不将历史19tests结果冒充React或新规则验收。

后续按修订后的P1开始实现。框架安装兼容性、真实UI命中/焦点、帧时间、资源释放趋势及玩法乐趣仍由对应任务验证；本次不作“所有潜在bug已经排除”的保证。
