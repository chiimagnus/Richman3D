# P1 — 统一玩具城市美术

**Goal：** 改变粗糙原型观感，让场景与界面形成统一的明亮桌游体验。

**Non-goals：** 不改规则、数据格式、默认视角、声音体系，不安装依赖或发布。

**Approach：** 已沿SceneHost→World→BoardView/PlayerView/DiceView及App→MainMenu/Hud/PanelHost核对真实路径；复用RoundedBoxGeometry与disposeObject。先做场景，再统一UI，逐块实测和提交。

**Acceptance：** idea中的完整双图/双视角/可读交互和基础验证。

**Rules：** 生命周期、规则确定性、完整双语名字/金额、原生dialog与快捷键不可缩水；中心装饰保持眼高以下。计划与todo仅本地。

## P1-T1

### 画面诊断与美术方向

官方参考图、真实后台页面和源代码确认：黑底网格、暗色方块、没有立面的中心建筑、无品牌构图的菜单是主要问题。用户已选明亮方向；证据为/tmp/richman-art-before-{menu,first-person,overview}.png及/tmp/richman-reference-mario.jpg。无生产改动，不创建空提交。

## P1-T2

### 明亮棋盘与两图模型

- 修改World环境/阴影；BoardView托盘、圆角地块、完整Canvas标签、选择与产权；PropertyBuilding立面；PlayerView棋子质感；CameraRig初始总览角度。
- 将BoardView现有buildCenter/buildHarbor替换为接入同一生命周期的BoardScenery，只负责静态装饰；复用已安装RoundedBoxGeometry。两图固定布局、共享几何/材质，不引入规则随机数。
- 城市：庭院、低矮建筑、屋顶、窗与树；港湾：水面、岸线、木码头、船帆、双色灯塔。依地图bounds定位，中心低于1.1，产权楼低于眼高；维持等级轮廓和编号。
- 验证test/rendering中资源、几何、等级、标签、棋子、相机及骰子；新增两图确定性、装饰边界/释放和棋盘材质检查。真实两图两视角查看、不遮挡。类型检查/build后原子中文提交。

## P1-T3

### 统一菜单与局内界面

- 修改tokens、App/Menu、Hud、PanelHost、SettingsPanel、ResultsScreen、MapPreview/Inspection/Feedback样式；只在需要处调整MainMenu与Hud结构。
- 菜单建立原创内联SVG模型构图，不挂第二个WebGL世界；保留存档失败/继续/挑战/设置路径。新增文案仅双语JSON。
- 奶油纸卡/深色文字/青绿色主按钮；紧凑资金区保留席位及原生操作，购买价格后果保持唯一展示。删除旧深色硬编码，不增常驻卡片。
- 现有test/ui与i18n回归，新增菜单输出与主次行为校验。真实HUD、购买面、设置、双语、800PC窗口/CSS200%大字、Esc/V/B/焦点路径；不把后台按键说成前台Pointer Lock验证。
- 完整typecheck、基线及新增测试、build、diff检查；仅提交代码/测试/必要开发文档。

## 阶段审计

全部任务完成后进入plan-task-auditor，核对生产接线、旧样式移除、规则/存档不变、资源释放与视觉证据，修复finding后交付。
