# Plan P1 - Settings UI

**Goal:** 增加一个简洁、持久化的设置界面，仅管理声音与第一人称鼠标灵敏度。

**Non-goals:** 不做图形设置、主题、HUD 开关、自定义键位、暂停系统或云同步。

**Approach:** 用独立 preferences 模块拥有本地持久化和默认值；GameApp 仍是运行时协调者。设置界面使用原生 `<dialog>`，避免自制模态状态机和焦点陷阱。声音与第一人称控制仅增加必要 setter，不引入事件总线或全局 store。

**Acceptance:**
- 设置状态有唯一真源并可持久化。
- UI 只展示声音与三档鼠标灵敏度。
- M 快捷键、设置 UI、Audio 和 FirstPersonRig 状态一致。
- 设置打开时游戏快捷键不会误触发。
- 桌面与窄屏真实验证通过。

---

## P1-T1 建立最小设置状态与运行时接入

**Files:**
- Create: `src/settings/preferences.ts`
- Create: `src/settings/preferences.test.ts`
- Modify: `src/audio/GameAudio.ts`
- Modify: `src/rendering/FirstPersonRig.ts`
- Modify: `src/rendering/World.ts`
- Modify: `src/app/GameApp.ts`

**Implementation:**
- 定义 `GamePreferences`、`LookSensitivity`、默认值和版本化 localStorage key。
- 读取时只接受合法 boolean / 三档灵敏度；解析失败回退默认值。
- 保存失败不阻断游戏。
- 提供灵敏度倍率映射：0.7 / 1 / 1.35。
- GameAudio 改为明确 `setEnabled`；删除被替代的 toggle 路径。
- FirstPersonRig 直接设置 Three.js `PointerLockControls.pointerSpeed`；World 提供最小透传方法。
- GameApp 加载偏好并在启动时应用；M 切换后同步保存。

**Verify:**
- preferences 单测覆盖默认、合法读取、损坏数据、保存。
- typecheck / tests / build。
- 浏览器刷新后声音状态保持。

**Commit:** `功能: P1-T1 接入持久化游戏设置`

---

## P1-T2 实现简洁设置面板

**Files:**
- Create: `src/ui/SettingsPanel.ts`
- Modify: `src/ui/Hud.ts`
- Modify: `src/app/GameApp.ts`
- Modify: `src/style.css`

**Implementation:**
- 从 Hud 删除右上声音按钮及对应 action/render 字段。
- SettingsPanel 自己拥有右上“设置”入口和原生 `<dialog>`。
- 面板只包含：
  - 声音 checkbox/switch；
  - 低 / 标准 / 高三档灵敏度。
- 设置变化直接回调 GameApp 的唯一设置更新路径。
- `SettingsPanel.isOpen` 用于 GameApp 阻止 Space/B/N/M 游戏快捷键误触。
- busy 时禁用设置入口；Pointer Lock 时隐藏入口。
- 使用 `aria-labelledby`、原生 label/button 语义；不做额外自制焦点管理。

**Verify:**
- 实际点击打开/关闭；
- `Esc` 关闭；
- 模态打开时 Space/B/N/M 不改变游戏状态；
- M 在设置关闭时仍可切换声音；
- 第一人称下入口隐藏；
- 375px 无溢出。

**Commit:** `功能: P1-T2 增加简洁设置界面`

---

## P1-T3 更新用户文档并完整回归

**Files:**
- Modify: `docs/how-to-play.md`
- Modify: `README.md` only if needed for discoverability

**Implementation:**
- 按 neat-freak 原则，仅补用户需要知道的设置入口、持久化行为和鼠标灵敏度说明。
- 不复制内部 localStorage key、类名或实现结构。
- 若 README 已能通过玩法说明入口发现设置，不额外扩写。

**Verify:**
- neat-freak audit_docs；
- GitHub/本地真实渲染修改页面；
- typecheck / tests / build / diff check；
- 设置持久化、声音、灵敏度、第一人称、普通回合、375px 全链路回归。

**Commit:** `文档: P1-T3 补充游戏设置说明`

---

## Phase Audit

完成 P1 全部任务后进入 plan-task-auditor；重点检查旧声音按钮/toggle 是否彻底删除、设置状态是否出现双轨、以及 localStorage 失败是否会影响游戏启动。
