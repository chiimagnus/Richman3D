# Audit P2 - toy-city-art

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p2.md`
- feature 目录：`.github/features/toy-city-art/`
- 粒度：`phase`

## 任务看板

- [x] P2-T1 删除右上重复按钮并收回设置
- [x] P2-T2 替换占位资产并实看双地图
- [x] P2-T3 替换三级经营建筑并验证状态投影
- [x] P2-T4 修正同格棋子遮挡第一人称

## 任务到文件的映射

- P2-T1
  - `src/ui/App.tsx`、`src/ui/App.module.css`、`src/ui/SettingsPanel.tsx`、`test/ui/settings-panel.test.tsx`
  - 审计修复：`src/ui/Hud.module.css`
- P2-T2
  - `src/rendering/BoardScenery.ts`、`src/rendering/SceneryModels.ts`、`src/assets/scenery/`、`scripts/bake-scenery.mjs`
  - `test/rendering/art-direction.test.ts`、`test/rendering/resources.test.ts`
- P2-T3
  - `src/rendering/PropertyBuilding.ts`、`src/rendering/SceneryModels.ts`、`test/rendering/buildings.test.ts`
- P2-T4
  - `src/rendering/PlayerView.ts`、`test/rendering/camera.test.ts`

## 执行路径复核

- App→SettingsPanel→SceneHost→World→CameraRig：常驻 tools 已删除，Esc 暂停/恢复仍走会话；视角、环视、回中在设置，不自动确认经营决策。PanelHost 仍使用原生 dialog 与焦点恢复，Handover 的 Esc 不越权推进。
- SceneHost→World→BoardView→BoardScenery→SceneryModels：静态导入本地几何，顶点色为线性空间；放置组先抵消矩形地图缩放，再让模型等比旋转。资源由当前 BoardView 拥有，经 disposeObject 释放，未新增网络、异步回调或全局缓存。
- BoardView.syncBuilding→createPropertyBuilding：仅等级/产权变化重建；真实房屋代替墙块/贴片窗/锥顶；三级形态高度递增、足迹不超过底座。等级纹理与产权底座保持。规则禁止交易有建筑的同色组，因此不伪造“直接交易建成房屋”路径；已有裸地交易标记及卖房后交易回归仍通过。
- World.setObserver/setView 与 movePlayer→PlayerView/FirstPersonRig：本人棋子显隐原样保留，其他玩家仍可见；等比缩小与中心席位布局不改规则落点、眼高或用户视角。跳跃最高点及四席同格已测。
- 旧模型主体、码头盒船、贴片窗与旧 tools DOM/CSS 没有并行残留；未修改领域、存档版本、随机规则、音乐或骰子演出。

## 发现项

## 发现 F-01

- 任务：`P2-T1`
- 严重级别：`High`
- 状态：`Resolved`
- 位置：`src/ui/Hud.module.css:1`
- 摘要：`800px桌面窗口配合CSS200%时购买行动栏标题被挤成逐字竖排，费用与操作超出首屏`
- 风险：`明确大字验收不成立，购买信息与主次动作不可用`
- 预期修复：`收敛行动栏网格宽度分配；长文本与按钮在窄有效宽度换行，不缩字或隐藏金额`
- 验证：`双语真实购买面800px CSS200%，按钮可达及B购买最终扣款产权；完整test/typecheck/build`
- 解决证据：`后台800px CSS200%中英文真实购买面标题/金额/动作完整可达；B最终存档revision1→2、p2现金1500→1300、cargo-lane归p2；736测试/typecheck/build。修复提交：c43c55f677457d69ad1f85183c9c8e1cb55a4f7d`


## 修复日志

- F-01：`c43c55f677457d69ad1f85183c9c8e1cb55a4f7d` 将行动栏改为内容宽度驱动的 flex 换行，删除失效网格规则；未缩字或删除金额/动作。
- 执行中发现的同格棋子遮挡已作为 P2-T4 完成，非用隐藏对手或移动镜头绕过。

| Before | After | Why |
| --- | --- | --- |
| 右上重复设置/视角/跟随入口 | 常驻区域不再重复，设置用 Esc | 把次要选项归到已有设置路径 |
| 扁平墙块与盒船 | 带窗框、庭院、船体和甲板的真实几何 | 美术质量来自资产，而非主题色 |
| 同格棋子头部遮住第一人称 | 双图四席开局路线与模型可见 | 棋子尺寸低于固定眼高，保留对手 |
| 800px CSS200% 标题逐字竖排 | 两语言金额和操作正常换行、滚动可达 | 按可用空间布局，不用设备断点猜测 |

## 验证日志

- `npm test -- --run test/ui/feedback.test.tsx test/ui/settings-panel.test.tsx` → PASS，11 项。
- 建筑/产权/资产专项 → PASS，18 项；相机/移动/建筑专项 → PASS，32 项。
- 最终 `npm test -- --run` → PASS，75 文件 / 736 项；`npm run typecheck` → PASS；`npm run build` → PASS。
- 七个模型逐个重新运行 `scripts/bake-scenery.mjs` → 与生产 JSON 字节相同；原生 BufferGeometryLoader 解析后的 position/normal/color 均有限，颜色和索引范围正确。许可与官方来源随资产保存，仅涉及这七个资产。
- 后台 Helium：双图总览、双图四席同格第一人称，中文 HUD/购买与英文设置/购买；800px CSS200% 两语言购买金额与按钮完整、无横向溢出，操作区能滚动到达。实际 Esc 关闭后焦点回到购买按钮，设置 select 上 V 切到总览、回中按钮关闭设置且未买地。
- 真实三级建设：导入现有 propertyMatch 经生产规则命令形成的有效快照，走实际校验/确认/继续入口；逐级建设至三级，现金 1746→1336，租金/等级及模型同步。出售规则有单元回归；一次真实出售时 document.hidden=false，不计入后台交互验收；随后后台继续恢复显示现金1381、二级模型，无经济重放。
- 真实购买：后台 native B，购买按钮有焦点时仍有效；只读 IndexedDB 证据为 revision1→2、p2现金1500→1300、cargo-lane产权归p2，随后进入下一操作者交接。偏好/视角操作之前 revision 仍为1。
- 新画面证据：`/tmp/richman-p2-city-four-person.png`、`/tmp/richman-p2-harbor-four-person.png`、`/tmp/richman-p2-building-level3.png`、`/tmp/richman-p2-purchase-en-large-actions.png`、`/tmp/richman-p2-purchase-zh-large.png`、`/tmp/richman-p2-final-hud.png`。
- 验收使用独立临时 Helium profile 和后台页面，未重启用户原浏览器、未请求前台 Pointer Lock，也未新建永久浏览器测试/fixture。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：P2 四项实现及清理完成，真实双地图/经营/快捷键路径有证据，审计发现的行动栏缺陷已修复并复验。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 剩余风险：场景分块约980.50kB，gzip192.32kB，相对旧版本gzip增加约54kB，仍有500kB分块警告。本地实际资源传输约193kB/28ms不是公网性能或GPU性能证据；不为消除警告隐藏上限或新增异步框架。
- 证据边界：200% 使用 CSS 放大，不声称原生浏览器缩放已实测；后台未验证需要前台焦点的 Pointer Lock 或系统音频。技术 Gate 不代表用户已经认可最终美术，也不能证明不存在所有潜在 bugs。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

