# P3 — 稳定快照、自动存档与安全恢复

**Goal：** 刷新/退出后能从最后一次已保存的合法规则状态继续，任何存储故障不能静默毁局。

**Non-goals：** 无云同步、账户、多存档管理器、自动迁移未发布开发格式或以 savegame 执行脚本。

**Approach：** IndexedDB 负责局面/上一有效备份/revision/结算标记的事务；偏好仍用原有 localStorage。Session 在规则命令后保存结果，不存动画进度，恢复不重放经济副作用。

**Acceptance：** A02/A03/A10；当前 schema v1 的导入/导出/续玩可闭环，多标签旧版本写入被拒绝。

**Rules：** 依赖 P1–P2。实际保存成功才显示“已保存”；文件校验失败不改当前局；S03/S04 指明浏览器存储不是永久可靠介质。

## P3-T1

### 快照格式与事务存储仓库

**文件与锚点：** `GameSnapshot`、`Game` 构造/导出入口、`preferences.ts`；新增 `src/storage/snapshot.ts`、`src/storage/GameStore.ts`、`test/storage/snapshot.test.ts`、`test/storage/store.test.ts`、必要的静态 JSON fixture。

**步骤：** 明确 schemaVersion 与 rulesVersion 区别：前者表示文件形状，后者表示游戏规则和随机算法。当前局 envelope 包含 matchId/revision/mapId、时间仅作显示、domain state 与上一有效快照。校验先完成再创建 Game，验证席位唯一、当前玩家存在、金额为安全整数、位置在本地图、owner/待购买指向合法对象、阶段与终局一致、随机状态合法。保存的数据不得含函数或语言化文案。

使用最小 IndexedDB 对象库：games 保存当前/备份；profile 保存结算去重与摘要。写同一事务先检查期望 revision，再保存新局面与前一有效局面；仅 transaction complete 才返回成功。首次打开失败、事务 abort、配额不足分成可辨认错误结果。测试使用 fake-indexeddb（只作开发依赖），真实入口同样接通 GameStore，不新增无人使用的 Repository 接口层。

IndexedDB事务内部只调度必要的数据库请求，不夹入网络、动画或无关异步await导致事务提前结束；request成功不是事务提交成功，统一等待complete/abort结果。所有写入比较matchId与上一次成功落库revision，创建/替换当前局也检查current指针，不能只保护单局record而让旧局抢回首页继续入口。

**验证：** 同 revision 的两次竞争写仅一次成功；事务中途失败后当前与备份均保持原状；不存在 revision 的旧存档不能覆盖新局；非法 NaN/无效所有者/未知 rulesVersion 拒绝。读写完整快照比较，不以“函数没抛错”作为保存证明。

**原子提交：** `feat: 定义版本化快照与原子存档事务`。

## P3-T2

### 自动保存与菜单继续游戏

**依赖：** P3-T1。

**文件与锚点：** `GameSession` 命令入口、PresentationQueue、MainMenu、PauseMenu、ResultsScreen；新增 `test/e2e/save-resume.spec.ts`。

**步骤：** 每条已接受规则命令后保存当前结果，完成保存或明确错误分支后才继续表现/下一命令；重试只写同一快照，不能再次执行 roll/apply。保存中应用入口串行，不用多个 UI busy 标记分别猜测。Session记录lastPersistedRevision；用户明确选择未保存继续后，内存可比数据库领先多步，重试以lastPersistedRevision作事务比较并写当前最新快照，不能拿内存revision−1要求数据库已存在而永远无法恢复。数据库若已被其他标签更新则停止并提示冲突，不能把写失败误当自己可强制覆盖。菜单仅在有有效未结束局时显示继续；已结束局显示查看最近结算，不误当继续。返回菜单先完成当前保存，失败提供重试、导出或明确放弃，不谎报保存。

恢复从 domain state 重建 World、HUD、当前决策与电脑队列：snapshot 若已在目的地，直接显示目的地，不能补发经过起点奖励或再次付租。电脑待行动时用户确认继续后才推进。开始新局的覆盖操作与旧会话最后写入必须按 matchId/revision 事务隔离；旧局 dispose 后的 await 完成不能抢回 current 指针。

**验证：** 真实浏览器在骰子动画中、待购买、电脑待行动、已结束时刷新；实际现金/位置/所有权/随机状态吻合；继续后下次骰子与未刷新的对照一致；开始新局期间旧写完成不覆盖新局；连续三条命令处于未保存模式后恢复存储，可把最新状态写回且无重掷/重扣。开启第二浏览器 context 验证不同 origin/storage 不被误称同步。

**原子提交：** `feat: 接通自动保存与刷新续玩完整链路`。

## P3-T3

### 有限导入导出、损坏保全和版本处理

**依赖：** P3-T2。

**文件与锚点：** `snapshot.ts`、`GameStore`、MainMenu/PauseMenu；新增 `src/storage/transfer.ts`、`test/storage/transfer.test.ts`、`test/e2e/save-transfer.spec.ts`。

**步骤：** 导出明确的 `.richman.json` 文件，包含版本而不包含 DOM/音频/外部资源。导入大小先限 1 MiB，再 JSON parse，再完整 schema/引用校验，最后确认是否替换当前局；读取、校验、预览不得提前停止现有局。存在格式损坏时优先提供恢复上一有效快照和导出原始数据；备份也无效则说明不可继续，不自动重置。未来版本/未知规则拒绝载入，但保留原文件与当前存档。

导入局标记来源 imported，不纳入正式挑战最佳成绩；不把这个标记宣传为反作弊。当前只承诺发布过的格式兼容；真正发布 schema v2 前需要新增明确迁移路径和 fixture，禁止无限“尝试猜字段”。所有异常向用户呈现可操作选项，开发细节仅进入本地诊断。

**验证：** 导出→清空测试 origin→导入→继续→再导出同一规则状态；超大文件、未知版本、重复玩家、非法所有权、未知牌引用（P7 扩充）不能改变当前局；取消替换不销毁现有会话；恢复备份后标记恢复时间而不重复事件。

**原子提交：** `feat: 提供受校验的存档导入导出与恢复`。

## P3-T4

### 后台暂停与跨标签页冲突的用户路径

**依赖：** P3-T3。

**文件与锚点：** `GameSession`、`PauseMenu`、`GameStore`、`motion.ts`、`GameAudio`；新增 `test/e2e/save-conflict.spec.ts`、`test/app/visibility.test.ts`。

**步骤：** visibilitychange hidden 后禁止推进新规则命令，当前已提交结果已由 T2 保存；不依赖 beforeunload 最后一秒写数据库。返回前台停在暂停/待决策状态，用户点击继续后恢复；关闭时不能自动代替玩家确认购买。文档说明“暂停会收敛当前动画到已结算位置”，不假装能保存视频帧。

两个标签页继续同一局，旧 revision 保存失败时停止该页推进，给出重新载入/另存新局，不循环覆盖或后台自动抢锁。直接使用 T1 事务条件，不叠加 localStorage 锁、lease 心跳或网络协调层。存储不可用可选择继续未保存局并显著显示状态；导出仍可用，不把浏览器拒绝持久化当成玩法崩溃。

**验证：** 两页面真实竞争写，后打开页不能静默覆盖；隐藏期间资金/轮数不继续变化；恢复后恰好一条电脑推进链；存储被拒绝时仍可正常玩一轮并手动导出；错误修复后重试保存不改变骰子。关闭浏览器后的恢复需真实浏览器验证，不仅 mock visibility。

**原子提交：** `fix: 处理后台续玩与多标签存档冲突`。

## 阶段结束检查

M1 的范围是完整本地闭环，不是全功能公开版。执行时回归所有现有测试、浏览器存档用例与 build；audit-p3 只在执行审计时创建。后续每增加决策阶段，必须在同一任务扩充 snapshot 校验、恢复 UI 与中断用例，不能等 P12 才补。
