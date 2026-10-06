# Audit P9 - public-playable-release

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p9.md`
- feature 目录：`.github/features/public-playable-release/`
- 粒度：`phase`

## 任务看板

- [x] P9-T1 战术总览、第一人称与地块检查
- [x] P9-T2 与规则一致的3D骰子
- [x] P9-T3 地产成长、归属与城市可读性
- [x] P9-T4 动画速度、事件优先级与舒适性
- [x] P9-T5 音乐、音效音量与即时静音

## 任务到文件的映射

- P9-T1
  - `src/rendering/CameraRig.ts`、`FirstPersonRig.ts`、`World.ts`；App单一视角偏好、Hud→TileDetails；camera/preferences/view-model回归。
- P9-T2
  - `src/rendering/DiceView.ts`→World→SceneHost→GameSession.settledRoll→Hud/FeedbackLayer；dice/dice-presentation/presentation回归。
- P9-T3
  - `src/rendering/BoardView.ts`、`PropertyBuilding.ts`、`PlayerView.ts`、`boardGeometry.ts`；property-markers/buildings/resources/board-effects回归。
- P9-T4
  - `src/app/PresentationQueue.ts`、GameSession、MotionClock、motion、BoardView、FirstPersonRig、preferences；presentation/motion/visibility回归。
- P9-T5
  - `src/audio/GameAudio.ts`→GameApp会话订阅→SettingsPanel；audio-lifecycle/game-audio/preferences/settings-panel回归。

## 发现项

本轮沿规则提交→保存事务→取消边界→视觉收敛→下一操作者逐项审查，未发现新的P9正确性缺陷。历史抵押/拍卖证据只说明当时规则，当前以P6-T4的v13和680项回归为准。WebGL上下文丢失监听和手动重建原计划归P11-T4，现随用户取消P11不再实施，不将其误报为P9已交付能力。

## 修复日志

- 无需代码修复，不造空提交；本地补齐阶段审计。旧字符骰子、棋盘计时Map、双视角状态及隐式音频Context创建均已从生产路径删除。

## 验证日志

- `npm run typecheck` -> PASS；`npm test -- --run` -> PASS，63文件680项；`npm run build` -> PASS。日志`/tmp/richman-plan-{types,tests,build}.log`，场景539.97kB警告仍在，不冒称性能预算通过。
- 已审查真实Three骰子面映射/资源释放、原生控件互斥/拖动取消、成长取消/finally、Session通知与队列三类回调归属、音频授权与资源释放；现有回归涵盖正常、拒绝、取消、迟到和20次生命周期。
- 后台Helium任务页`4E415766AA3AB387A7EFA2EC6598D01A`，隔离的`http://localhost:4347/Richman3D/`空存档origin：经实际新对局表单创建两真人局，第一人称与总览分别完整20轮到结算。没有调用领域命令或篡改快照；全部动作经真实按钮/交接/购买/弃牌/Skip。第一人称最终净资产2064/1756；总览种子2112917926，v13快速，最终revision51，净资产2786/2394，原生IndexedDB保存game_over。两局均使用跳过动画，证明操作可完成，不作为连续动画FPS或真人舒适度证据。页面始终hidden=true、hasFocus=false；未激活用户页面。
- 前序P9逐块双语画面、骰子最终面、三级建筑、200%文字与20次原生GPU/音频生命周期证据见plan-p9；本轮没有把其中旧抵押/拍卖画面当作当前规则验收。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：`P9生产接入、取消后规则不重放、两视角完整对局与现有针对性回归通过；允许推进P11，不等于PC性能、听读或公开发布通过。`

2026-10-06范围更新：上行保留原审计结论；用户随后取消P11/P12，推进P11的安排不再生效。后续实施范围仅保留P10；取消阶段不代表它们通过审计或公开发布就绪。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 证据边界：前台Pointer Lock成功/原生退出、PC屏幕阅读器、设备听测与舒适度未测；用户已取消P11/P12补证安排，不再将它们列为待完成任务或转入P10，也不记作通过。手机/平板适配与验收已取消。两局使用Skip，不声称正常动画完整整局实测；不据此承诺未测的浏览器兼容、性能或公开发布就绪，不能保证不存在所有潜在bug。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板
