# Audit P1 - toy-city-art

- 审计方式：`plan-task-auditor`
- 审计范围：`plan-p1.md`
- feature 目录：`.github/features/toy-city-art/`
- 粒度：`phase`

## 任务看板

- [x] P1-T1 确认画面诊断与美术方向
- [x] P1-T2 升级明亮棋盘与双地图模型
- [x] P1-T3 统一菜单与局内界面并完成验证

## 任务到文件的映射

- P1-T1
  - `idea.md`、`plan-p1.md`；官方 Nintendo/Ubisoft 参考与 `/tmp/richman-art-before-*.png`，不复制商业素材。
- P1-T2
  - `src/rendering/{World,BoardView,BoardScenery,PropertyBuilding,PlayerView,CameraRig}.ts`
  - `test/rendering/{art-direction,resources}.test.ts`；提交 `27c71e7`。
  - `SceneHost→World→BoardView→createBoardScenery` 为真实接线；释放仍沿 `World.dispose→BoardView.dispose→disposeObject`，共享几何/材质仅释放一次。装饰不读规则随机数。
- P1-T3
  - `src/ui/{MainMenu,MenuArtwork,Hud}.tsx`、`tokens.css` 及 App/Hud/PanelHost/SettingsPanel/ResultsScreen/Inspection/MatchSetup/MapPreview 样式；双语 locale、`index.html`、`test/ui/settings-panel.test.tsx`；提交 `5208728`。
  - `App→MainMenu/MenuArtwork` 只有本地 SVG，不挂载额外 World。`GamePlay→Hud/SettingsPanel/PanelHost` 的规则命令、订阅及原生 dialog 焦点逻辑不变。
  - HUD 席位色索引核对 `Game` 初始化及 `restoreSnapshot` 玩家顺序约束，确与配置对应；不另造查找/恢复状态。

## 发现项

## 发现 F-01

- 任务：`P1-T3`
- 严重级别：`Low`
- 状态：`Resolved`
- 位置：`index.html:19`
- 摘要：`浏览器主题色仍使用被替代的深色背景`
- 风险：`支持 theme-color 的浏览器外壳与明亮菜单不一致`
- 预期修复：`将主题色统一为菜单背景色，不修改其他元数据`
- 验证：`npm run build，并核对 dist/index.html 主题色`
- 解决证据：`5208728；npm run build通过，dist/index.html theme-color为#e4ece4；diff检查通过`


除此之外未发现有具体证据支持的阻塞缺陷；不把理论 GPU/平台边缘情况扩成任务。

## 修复日志

- F-01 在记录后将旧浏览器主题色改为奶油菜单背景，构建验证后随 P1-T3 原子提交；其余元数据不动。
- 计划中“CSS 模型构图”按实际无网络内联 SVG 收敛，仍满足原创构图、无第二个 WebGL 世界的目标；不是额外架构。
- 旧 GridHelper、两套旧中心装饰与对应深色 UI 硬编码已替换，没有并行主题入口；规则、存档、偏好格式和依赖未变。

## 验证日志

- `npm test -- --run test/ui/settings-panel.test.tsx test/rendering/art-direction.test.ts test/rendering/resources.test.ts` → PASS，3 文件 14 项。
- P1-T2 全部 rendering 回归 → PASS，11 文件 118 项；包括相机缩放、骰子、产权等级、完整标签与资源释放。
- `npm run typecheck` → PASS。
- `npm test -- --run` → PASS，75 文件 734 项（最后完整运行 2026-10-09 15:44），包括资金原子性、确定性、恢复和生命周期既有回归。
- `npm run build` → PASS；主题色修复后再次构建通过，产物 `theme-color=#e4ece4`。既有 SceneHost 543.13 kB 分块警告保留，不通过调高阈值隐藏。
- `git diff --check`、`git diff --cached --check` → PASS；生产/测试两次提交，计划与审计只留本地。
- Helium 生产预览后台真实两图/两视角：`/tmp/richman-art-scene-{city,first-person,harbor,harbor-first}.png`；均查看，中心低矮装饰不挡棋盘路径，不新增规则效果。
- 最终界面：`/tmp/richman-art-menu-zh.png`、`/tmp/richman-art-hud-en.png`、`/tmp/richman-art-purchase-en.png`、`/tmp/richman-art-settings-en.png`；菜单/HUD/实际购买/设置接通，双语金额 200 与租金 38 清楚，B/N/V/Esc 标注仍在。
- 800×720 PC 窗口与 CSS 200% 大字：购买中英、设置英文、菜单英文均检查；document/main 宽度 800，dialog clientWidth/scrollWidth 均 518，无横向溢出；菜单与设置纵向滚动保留，不缩字体隐藏操作。对应 `/tmp/richman-art-{purchase-zh-200,purchase-en-200,settings-en-200,menu-en-200}.png`。
- 实际购买：从正常掷骰抵达 Cargo Lane，通过真实 B 快捷键提交，1500→1300、revision 1→2，ownerId=p1；交接时再次 B 后 revision 2/cash1300 不变。非制造领域状态的测试夹具。
- 真实 V 切视角、设置切语言与 Esc 返回：只读 IndexedDB 比较确认规则状态不变；购买按钮焦点恢复。最终菜单 Esc 后 settings dialog 关闭，焦点恢复 Settings。
- 任务验收页核对 `document.hidden=true`；曾有旧验收页变为非隐藏，立即关闭，相关 Space 尝试不计为后台验收。仅管理任务页面，没有激活标签页或调用 bringToFront。

## Gate（是否允许进入下一阶段）

- 结论：`Go`
- 理由：三项任务与相称验证完成，唯一有证据的审计发现已修复；保留真实数据/生命周期边界，画面和交互没有双轨实现。

## 最终状态与剩余风险

- 当前状态：`Resolved`
- 未实测：前台 Pointer Lock、原生浏览器 200% 缩放（这里是 CSS 大字）、Space/Enter 的原生默认按钮激活、屏幕阅读器和独立 GPU 性能测量。原生 Enter 后台尝试没有可靠激活，未将其算作通过或产品回归；按钮语义未修改，不为此抢前台焦点。
- 未宣称：穷尽所有潜在 bug、达到商业大作素材制作量或完成发布合规。现存构建体积提示不阻塞此次美术验收。

## 审计约束

- 本文件对应一个 phase，不对应单个 task
- 如果由 `executing-plans` 自动进入审计，也沿用同一模板

