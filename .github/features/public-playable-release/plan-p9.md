# P9 — 让3D服务于决策、反馈与辨识度

**当前规则（2026-10-06）：** P6-T4删除抵押、赎回和拍卖，保留升级与交易，缺现金必须卖建筑。已执行旧版证据仅作历史；后续验收以当前规则及todo.toml为准。

**Goal：** 让玩家看清地产、位置和经营结果；第一人称有沉浸感，但不成为操作与舒适性的门槛。

**Non-goals：** 本阶段骰子采用确定轨迹演出，尚无需要物理求解的自由步行/碰撞玩法；不同时增加开放世界或昼夜经营模拟。ECS/物理引擎不是永久禁用项，准入依据见idea第8节，不为观感标签安装整套引擎。

**Approach：** 在P1统一运行时与React界面上保留独立Three.js场景，按镜头、骰子、地产、节奏、音频拆分。每个可视结果只表现Game已提交的事实；有明确性能预算和减少动态效果替代。

**Acceptance：** A01/A08/A10；两种视角均可完成一局，骰子显示与移动结果一致，地产变化可识别，静音和跳过动画不改变规则。

**Rules：** 依赖P8；功能性文字仍来自JSON。P5已交付基本建筑，本阶段是精修而非第一次把升级画出来。实测素材和画面效果不能由单元测试代替。

## P9-T1

### 战术总览、第一人称与地块检查

**文件与锚点：** P2已建立的`src/rendering/CameraRig.ts`与`test/rendering/camera.test.ts`、World.camera、FirstPersonRig、PlayerView、boardGeometry、GameSession、HUD、preferences；扩充根test下的真实镜头/偏好/只读UI回归，实际交互用已安装的后台Helium验收，不重建已移除的E2E/spec/helper。本任务扩展固定总览/第一人称的既有模块，不再次创建一套模式状态。

**源码确认后的实现边界：** 使用已安装Three.js的OrbitControls，仅总览启用，禁平移并约束俯仰/缩放；App视角直接来自用户偏好，未选时PC默认第一人称，不保留另一份useState模式或World设备判断。点击检查仅改变地块ID草稿，复用publicProperty与PropertyDetails；HUD单一按需详情同时提供原生下拉框，非地产展示真实起点奖励/税额/机会信息，不叠规则决策弹窗。显式回当前玩家可跟随其总览棋子，拖动或检查即停止，其他玩家行动不默认抢镜头；第一人称仍跟随已确认的本地观察者。

**步骤：** 复用P2的CameraRig视角模式与目标，World继续只创建一个最终渲染相机；本任务增加总览拖拽、缩放和检查。第一人称控件和总览控件互斥启用，不让两组监听同时改同一相机。PC初始第一人称但不自动锁鼠标，明显提供总览按钮；用户未设置时不再按触屏设备自动选总览。总览可拖动旋转、有限缩放、点击地块查属性，边界保证棋盘不被拖丢；一键回当前玩家。相机模式进入偏好，视角位置不进入规则存档。

点击检查与拖动有移动阈值区分；UI按钮事件不冒泡成canvas锁定请求。第一人称下地块信息由React资产列表提供同一查询投影，不要求精准瞄准小模型；保持全部经营按钮可用，Pointer Lock中打开资产/手牌先解锁再显示面板，不能藏住所有新增动作只留Space/B/N。

切换模式不移动棋子、不结束回合、不重发事件；电脑/其他真人行动时可自愿跟随，默认不突然抢走玩家正在检查的视角。同机交接确认后再切本地视角。移除分散在World与FirstPersonRig中互相覆盖的自动朝向控制，改由单一模式拥有者裁定。

**验证：** 连续模式切换、Pointer Lock成功/拒绝/原生退出、打开手牌、检查地块与拖动区分；相机变化前后Game快照完全相同。两种模式分别完成掷骰、卡牌和购买；第一人称跟随者的自身棋子按视角隐藏以免挡镜头，切总览后恢复；测试中所有玩家仍在相同格显示正确，不是相机移动冒充棋子移动。

**原子提交：** `feat: 增加战术总览与一致的视角操作`。

**实施证据（2026-10-04）：** 根因处以CameraRig互斥原生输入控制、App单一偏好模式替换旧World设备判定/局内重复模式；同位置同步不重置环视朝向。11条真实Three控制器/棋子回归含拖回原处、双触点、取消、缩放边界和20次监听释放；所有20格共用只读投影，两种语言检查税/起点金额与抵押地产。typecheck、60文件605测试、build、diff-check均通过，日志`/tmp/richman-p9-t1-final-{tests,build}.log`；SceneHost 532.73kB/gzip134.55kB，OrbitControls带来24.31kB成本，未隐藏预算警告。

后台Helium任务自己的生产页：实际CDP拖动/滚轮/V切换无误触，完整保存state保持revision32（`/tmp/richman-p9-t1-camera-check.json`）；实际点击3D中央车站打开同一详情且存档不变；原生summary开关、20格select选择税额120均通过。390px中文/英文常态HUD、设置及真实购买面已目检，无水平溢出。四席旧局真实第一人称确认位置交换revision40→41，RNG/现金保持；随后经菜单正常创建种子1639305041的两席局，第一人称霓虹大道购买1600→1420，N按钮获焦连续KeyB只成交一次；总览金融中心购买亦真实成交，检查另格/镜头切换保持购买快照。实际重新加载/Continue恢复完整state，视角偏好overview保留且检查草稿关闭。设置内focused KeyL实际preventDefault、关闭dialog并显示原生锁定拒绝说明，revision16不变；不把后台拒绝当作前台Pointer Lock成功。截图均`/tmp/richman-p9-t1-*.png`；未添加或维护E2E/helper/fixture。前台锁定成功/原生退出、真机触屏、原生200%缩放与完整两视角整局仍需阶段后续验收，不以单测或后台模拟冒充。

## P9-T2

### 与规则一致的3D骰子

**依赖：** P9-T1。

**文件与锚点：** 当前FeedbackLayer字符骰子分支、SceneHost的rolled等待520ms、PresentationQueue、World、GameSession；新增 `src/rendering/DiceView.ts`、`test/rendering/dice.test.ts`，扩充根test会话/投影回归，实际画面用后台Helium核对，不恢复已移除的E2E目录。

**步骤：** 两颗骰子采用明确面编号与朝向映射，演出有开始、滚动、落定三个阶段，终点由规则dice确定。视觉轨迹可用独立装饰随机数，绝不能消耗规则rng或重新决定结果。遥控骰子也使用同一映射，标注已选结果。控制正常演出约0.6–1.0秒，减少动态效果直接给最终面；快速模式由P9-T4的同一速度偏好接入并保留点数，不在T2提前创建尚无消费者的速度配置。

最终两骰在紧凑HUD保留一次，屏幕阅读器按同一settled事件公告一次；3D演出中的逐帧点数不另加aria-live；移除原来同时可见的字符骰子演出，保留必要的语义文本而不是双重播报。销毁或跳过时清理计时器与对象，当前结果仍由Session快照同步。骰子不能遮住尚未完成的卖房付款选择，不在一个必需模态后面偷偷开始下一回合。

**验证：** 六个面映射、全部36种骰子对、总数2–12遥控组合逐项检查最终朝向/公告/步数一致；取消演出后不会二次finish。浏览器实际捕获低/高点数组合画面人工核对，不能用程序读取自己设的quaternion就宣称可视朝上正确。

**原子提交：** `feat: 以确定规则结果驱动3D骰子演出`。

**实施证据（2026-10-04）：** DiceView使用已安装Three的RoundedBoxGeometry与实际点阵面（对面和为7），两个骰子复用2个几何/2个材质；透明3D投影层复用World唯一WebGLRenderer与MotionClock，不新增渲染循环、物理引擎或随机源。正常800ms，其中最后200ms为最终面；系统减少动态直接写最终面并保持200ms可读时间。World/SceneHost真实rolled路径替换旧520ms等待；Session仅发布一次只读settledRoll，队列拦截取消后的迟到通知；HUD唯一语义点数、live公告按revision认领，暂停/恢复不重新公告，导入恢复不补播。旧字符骰子分支、全部CSS摇摆动画、diceActor旧文案同步删除。

54条DiceView回归覆盖全部36对朝向和实际点数、11个遥控总数经真正Game→Session→DiceView路径的步数/公告认领/原子状态、取消前后/减少动态/窄视口完整边界与20次共享资源释放；另5条会话跳过/暂停/销毁/真实恢复及双语HUD单一语义投影。typecheck、62文件664测试、build、diff-check通过，日志`/tmp/richman-p9-t2-final-{full,build}.log`；场景536.71kB/gzip135.94kB警告保留，未声称性能预算通过。

后台Helium生产页已实际目检中文总览1/3、英文390px第一人称6/4、系统减少动态4/5的最终面，HUD与逐帧截图/公告一致，演出期间同一已保存revision17保持。遥控验收使用现有unit helper通过真实合法Game命令生成seed1/revision56记录（未伪造骰子、RNG或DOM），临时文件只在/tmp，经实际file input→预览→确认替换→Continue导入；界面分别选择2和12、确认用牌、实际掷骰，revision56→57→58、RNG不变；总览1/1、第一人称6/6最终面与唯一落定公告人工核对，草稿选择不改完整保存state。截图`/tmp/richman-p9-t2-controlled-{2,12}-3.png`及`/tmp/richman-p9-t2-fp-0-2.png`，非维护E2E/fixture；任务原对局已通过同一导入界面恢复且完整state相等。未听测屏幕阅读器，不把aria文本等同实际发声；快速档属于T4，完整两视角整局/真机仍需阶段后续。

## P9-T3

### 地产成长、归属与城市可读性

**依赖：** P9-T2。

**文件与锚点：** PropertyBuilding、BoardView.buildTiles/buildCenter、PlayerView、CameraRig、JSON地块文案；扩充根test的建筑/资源/标签回归，以后台Helium检查真实棋盘，不新增E2E/spec。

**步骤：** 明确三级建筑轮廓、统一底座和产权符号；完整同色组有轻量连贯标记，产权和等级有形状与文字，不只靠颜色。建筑高度、中心装饰高度和位置根据第一人称与总览检查调整，确保地块标价、到达位置、下次前进方向可辨识。

长英文名称使用可读字号/分行或短标签加完整DOM详情，而非把字符压扁到极窄宽度；中文和英文都从同一语义ID读取。当前行动玩家、选中地块、拥有者标记是不同概念，不能统一画一个颜色让用户误解。坐标变更仅影响视觉布局，不改变规则落点。

升级的短生长动画、抵押/赎回变化、清算后归零均消费同一PropertyState；不要在渲染层另存“视觉等级”成为第二份真源。复用材质/几何，资源创建/释放沿P1明确拥有者；只在实际状态变化时更新，不在每帧重建标签与建筑，也不把每帧transform同步到React state。只有剖析显示大量动态实体的遍历成本成为瓶颈时才对照评估ECS；不要为了本任务给静态地块建立组件注册框架。

**验证：** 两视角检查全部现有地块、各等级、出售/归零、四棋子重叠、中文/英文长标题；200%文字缩放时DOM详情可读；20次创建/销毁和多次语言切换GPU资源无持续线性增长。截图有场景/状态说明，不以一张精选截图代替矩阵。

**原子提交：** `feat: 完善地产成长与棋盘信息可读性`。

**标签逻辑块证据（2026-10-04，非整个T3完成）：** 原标签使用Canvas.fillText的maxWidth导致长英文/大金额横向压缩。改为原生文本测量与词/字素换行，维持原字号，384px纹理与对应物理纵横比保持字形；不截断金额。复用根test的轻量Canvas协议替身，真实Geometry/Texture释放仍由原实现验证，不引入浏览器测试框架。10条标签/建筑针对性、62文件666测试、typecheck/build/diff-check通过；后台Helium实际双语总览/显式回当前玩家后的近景目检，完整state保持不变。背景输入一次CDP等待超时后仅模拟页面focus/active（Emulation.setFocusEmulationEnabled），没有激活真实标签页或前台窗口，模拟结束显式关闭；不把它当作原生前台验收。近景见`/tmp/richman-p9-t3-label-focus-{en,zh}.png`。实际放大已暴露中心装饰过高遮挡棋盘，这是同T3后续必须解决的可复现问题；产权/整组/抵押/选中/成长及矩阵验收尚未交付。

**缩放逻辑块证据：** `294b18d`修复CameraRig原最小距离过近导致桌面视野内零个棋盘格的问题，未强制回中心或改动相机草稿/规则。新增回归先红后绿，包含三个比例及旋转/调整尺寸；14项镜头、62文件669测试、typecheck/build/diff-check通过，日志`/tmp/richman-p9-t3-zoom-{red,green,full,build}.log`。仅收紧边界，不冒称中央遮挡或整个T3已解决。

**中央装饰逻辑块证据：** `84cf3ff`将旧固定原点/7.6高装饰改为按路径居中、内圈范围适配且最高约1.08的城市组；保留原有城市与纪念物，十楼仅共享同一释放拥有者内的几何和两材质。20次原生Geometry/Material释放、平移坐标、语言与快照同步不重建，通过25针对回归及670全量测试/typecheck/build/diff-check。一次两批测试并发造成机器人5000ms超时；没有改超时或忽略失败，串行最终全测通过，日志`/tmp/richman-p9-t3-city-final-full.log`、`/tmp/richman-p9-t3-city-build.log`。后台Helium实际Settings视角select确认模式后目检双语最大缩放/旋转和第一人称、390px英文第一人称；完整state相等，`/tmp/richman-p9-t3-city-check.json`及对应png。临时脚本最初语言变量重复声明、一次视角依赖旧偏好导致截图命名不符，均属验收工具错误，最终显式选模式重跑且人工核对；不把最初误命名截图当证据。该块不等于全部地块/等级或整个T3矩阵已完成。

**产权/抵押逻辑块证据：** `547c4c7`以数值席位牌替换旧无文字细高柱，与HUD及DOM所有者对应；共享建筑数字纹理生成路径，无双轨。有效整组的双条带与抵押斜纹使用原生Geometry，只从PropertyState与领域completeGroup/publicProperty投影，语言变化不重建数字牌。真实四席购买验证每个数字与颜色；交易仅释放旧数字纹理一次，原marker/几何/材质保留；20次完整Board创建释放与四次语言切换，所有Native资源各释放一次。双语公开查询含整组状态、重复姓名HUD有可见和可访问席位编号；41针对及63文件692测试/typecheck/build/diff-check通过，最终`/tmp/richman-p9-t3-ownership-final-{full,build}.log`，538.52kB警告保留。

后台Helium经真实导入界面载入现有unit helper用合法Game命令生成的seed8/revision61记录，实际经营UI抵押→赎回rev62/63：现金1746→1836→1737、RNG不变、组条带取消/恢复、抵押四斜纹出现/消失，DOM分别本金90/租金0/未生效与本金0/租金48/生效，`/tmp/richman-p9-t3-ownership-check.json`及`group-active-en/mortgaged-en/redeemed-en.png`。任务原记录已经同一导入界面恢复且完整state相等；元数据由真实导入产生新matchId，不声称整个record相等。没有持久E2E或新框架。

验证中旧机器人一项六场完整对局再次触发5000ms超时，普通7143ms/困难5617ms；进程观察确认存在非本任务高CPU工作，未干预用户进程。`e470cf8`按18个真实对局单独成项，保留全部合法命令/每步完整恢复/终局断言，不增加超时、不丢弃种子；51策略针对与最终全测均通过。这是测试粒度根因收敛，不作为产品算法提速证据。选中/行动/方向、成长及完整矩阵仍属于未完成T3。

**检查/行动/方向逻辑块证据：** 地块检查ID从GamePlay经SceneHost→World→BoardView驱动单一白色角框，选择/关闭不切镜头；各格三角形采用实际boardDirection，当前决策actor棋子才显示圆环，普通回合玩家仍保留HUD原指示，不把拍卖/交易操作者混成turnPlayer。移除没有调用者的World.syncOwnership旧入口；方向几何/材质只在Board根共享释放。原ShapeGeometry实验导致场景564.01kB，直接三点BufferGeometry表达同一三角形后539.69kB，没有引入新依赖或遮掩预算警告。原生顶点方向/20格选择、2/3/4同格棋子轮换单行动环/资源一次释放及693全量测试/typecheck/build/diff-check通过，`/tmp/richman-p9-t3-selection-{targeted,full,build}.log`。后台Helium20次实际select完整state不变；河畔角框、Skyline行动圆环、产权数字牌真实画面已分别目检，390px英文详情金额可达且无横溢，`/tmp/richman-p9-t3-selection-check.json`与对应png；不把视口模拟当作真机或200%缩放。建筑精修/成长与完整矩阵尚待完成。

**建筑精修/成长逻辑块证据：** `a948767`保留三种轮廓/数字等级并加入统一底座，最高含顶面数字约1.66低于第一人称眼高；建筑外移至边角，底座/身体/二级屋顶只在同建筑共享几何。源码确认Session的settle并不同步World、pause是先stop再sync，故不按快照差异猜成长，也不另建计时Map：SceneHost真实upgraded事件先同步committed，再调用现有MotionClock280ms；取消/finally收敛最终模型，纯恢复只投影、不播成长。检查/方向上一块提交为`81e4a87`。

34针对及63文件701测试/typecheck/build/diff-check通过，`/tmp/richman-p9-t3-growth-{targeted,full,build}.log`；正常三级、已取消信号、演出中取消、共享时钟停止、销毁、减少动态与完整恢复/资源一次释放覆盖。实测截图发现旧通用presenting文案把升级说成移动，根因直接改同一JSON文案为“展示操作”，不堆事件特判，双语真实会话权限回归保证呈现中无新指令/重复资金。

后台生产UI实际六次均衡升级1737→1257、六次出售→1497，规则RNG不变；三级正面/顶面数字、成长首/末帧、中文第一人称闭合详情的前方路径、总览及390px画面人工核对。`/tmp/richman-p9-t3-growth-check.json`、`growth-*-*.png`、`level-*.png`与`/tmp/richman-p9-t3-growth-browser.log`记录真实场景；任务原保存state通过同一导入UI恢复。原验收target在下一复验前已不存在，新建任务自己的后台页继续，未触碰其他页；最终复验明确选语言/视角，更新文字亦真实目检。场景540.21kB/gzip137.15警告保留；本块不冒称真人舒适度、真机、GPU字节峰值或整个T3矩阵通过。20次真实资源/200%文字/四棋子实际矩阵继续。

**T3矩阵收尾证据：** 后台Helium实际20次Continue→设置离局，每次四次真实语言切换，唯一Native WebGL上下文的buffer/texture/program/vertexArray/framebuffer/renderbuffer计数均保持351/33/6/123/4/1；离局context确实lost、待处理RAF为0，下一局重新进入仍相同，没有持续线性增长。原生句柄调用临时页内计数，不增加产品调试API或仓库E2E；失去上下文后的句柄不可用不等于JS堆/显存字节峰值已测。`/tmp/richman-p9-t3-gpu-check.json`、`gpu-browser.log`；20次保存完整state与本次开始的最新记录一致，不拿早期存档覆盖后来状态。

真实文字放大暴露英文工具按钮min-content超过180px及详情dt长词覆盖金额，分别在拥有者`.tools button`允许换行/min-width:0、`.values`统一词内换行修复，不缩字、不裁金额、不藏overflow。实际双语×两视角×1200/390的8组合、每组合20格原生select均保持完整规则state；所有dt/dd无横向溢出、末项金额可滚动抵达，截图人工目检。这是实际CSS根字号16→32的200%文字测试，不冒称原生浏览器200%页面缩放或真实手机。`/tmp/richman-p9-t3-matrix-check.json`及`text200-*.png`。另通过真实导入合法Game初始四真人seed31记录，确认p3交接后，四棋子都在起点且偏移分明，只有紫色第三席行动环；双语`four-overlap-*.png`已目检。结束同一导入UI恢复本次新备份完整state，import元数据不同符合契约；原有不同用途各等级、抵押/赎回/出售归零实测与此组合构成T3验收，不以精选单张代替矩阵。

## P9-T4

### 动画速度、事件优先级与舒适性

**依赖：** P9-T3。

**文件与锚点：** PresentationQueue、MotionClock、motion、FeedbackLayer、FirstPersonRig、BoardView、preferences、HistoryPanel；新增根`test/app/presentation.test.ts`并扩充已有原生渲染/偏好/UI回归。真实生产交互由临时后台Helium检查，不恢复已删除的E2E/spec/helper。

**源码核对后的边界：** 现有World共享MotionClock已驱动骰子/移动/建筑成长，直接扩充其两档播放速率；App偏好同时配置Session的实际notice到期时间与World的逻辑时钟，settle仍返回逻辑毫秒，避免重复缩短。World.wait是文字可读等待，不再把系统减少动态误当成零阅读时间；movement的减少动态直达终点不连发所有脚步。BoardView另有performance.now两套脉冲/产权计时Map，需同任务迁入共享时钟并只在真实事件演出，恢复sync不重放。第一人称晃动由同一偏好显式控制且系统减少动态优先。

**步骤：** 正常/快速两档和本次跳过，只缩短表现，不跳过玩家决策、保存或规则事件；电脑思考不通过固定长等待制造“聪明”。在路径动画中跳过应立即同步到已提交结果，声音/计时器一并停止，不重播脚步和收入。

事件优先级：待用户选择/债务/终局高于普通提示；普通事件按行动链顺序短暂展示并进入历史，后一条不能在用户尚未看清时覆盖关键付款原因。P1已替换旧showEvent/单卡覆盖路径，本阶段复用既有有序表现队列调节节奏，不再写另一条全局队列。当前主要决策已经说明的结果不重复弹toast，费用变化与原因各司其职；详细历史只在主动打开时出现。

系统prefers-reduced-motion优先；提供关闭第一人称上下晃动的设置，不允许在“减少动态效果”下强制震屏。暂停/隐藏后当前表现收敛，恢复不补播十秒历史演出；最后状态及费用可在历史查到。

**验证：** 同一seed/命令在正常、快速、减少动态、随机跳过动画下快照/现金/牌库完全相同；多条落点链有可追溯记录；卖房付款和交易面板不被自动关闭。实际连续游玩检查眩晕风险反馈，舒适度不以单元测试冒充用户结论。

**原子提交：** `feat: 统一动画节奏与可跳过的事件表现`。

**共享时钟/舒适性逻辑块证据（非整个T4完成）：** App偏好配置真实Session提示到期与World共享时钟，正常/快速为1×/2×，返回的settle仍是逻辑1750ms而到期按真实播放速率计算，不重复缩短。保留已存在的声音/骰子/棋子演出；减少动态直达落点不连发所有跳过脚步，文字等待仍可读；头部晃动可独立关闭，真实原生FirstPersonRig中间高度1.80/1.72及相同终点均验证。配置保留有效旧偏好并逐字段校验，新字段实际接入，未增依赖。

47针对与64文件717测试/typecheck/build/diff-check通过，`/tmp/richman-p9-t4-speed-{targeted,full,typecheck,build}.log`。三个seed各正常/快速/减少动态/每三步跳过的真实GameSession+DiceView+PlayerView完整命令轨迹，逐步完整存档可恢复且所有状态/牌库/现金/RNG一致；不把测试适配PresentationPort等同实际SceneHost验收。后台Helium实际UI导入合法seed6双真人记录，四种方式同一掷骰固定税80，全部完整state相等；正常3533ms、快速2344ms、跳过837ms是包含截帧/协议开销的观察，不是精确帧预算。已目检实际快速双2面、中文390px设置及真实关闭晃动偏好。`/tmp/richman-p9-t4-speed-check.json`、`speed-browser.log`和对应png；最后恢复本次完整原档。不声称真人眩晕舒适度已听取；Board旧计时Maps迁移与中断/优先级闭环仍待完成。

**棋盘计时/中断收尾证据：** 删除BoardView的tilePulses/markerPops两套performance.now Maps及每帧update入口，落点脉冲和产权弹出使用唯一MotionClock；买入/拍卖成交真实事件先投影committed再演出，纯恢复/语言同步不重播产权动画。取消/finally都回到完整标记与无闪烁，减少动态直接静态且正常反馈保留。9原生Board/Session回归验证正常/快速/取消/停止/减少动态、真实购买中跳过/暂停/销毁、恢复不缩回小标记；公开产权/RNG/现金始终同一领域事实。

另发现并红绿证明暂停后Session仍新造paid提示；PresentationQueue对show/dice已校验归属却对settle没有，暂停恢复后的迟到settle可污染下一次演出。统一第三类回调在拥有队列处的取消边界，Session自身收敛只在running生成notice，暂停/故障清理临时notice，付款事实仍存历史。旧债务恢复测试明确在暂停前验证paid120提示，暂停后验证notice为null且历史paid120仍在，不削弱原付款/持久化断言。`/tmp/richman-p9-t4-late-{red,green}.log`。

52中断针对、最后65文件729测试/typecheck/build/diff-check通过，`/tmp/richman-p9-t4-final-{full,typecheck,build}.log`。后台Helium真实购买时100ms内通过现有Skip按钮取消，现金1500→1320一次、revision1→2/RNG不变；刷新Continue后标记完整及全state相等。快速下真实债务120/现金30和拍卖两界面各等待3秒及设置暂停/恢复，选择面仍在且完整state相等；截图已目检，`/tmp/richman-p9-t4-effects-check.json`、`effects-browser.log`、`purchase-{skipped,restored}.png`与`{debt,auction}-decision.png`。临时工具初次确认交接定位时序与标题大小写错配已据实际DOM修正，失败不计作通过，也未改产品为工具绕过。最后同一UI恢复本次最新原档。真人连续游玩的主观眩晕反馈仍属后续真实试玩证据边界，未声称已验证；两视角完整局继续在本阶段最终验收执行。

## P9-T5

### 音乐、音效音量与即时静音

**依赖：** P9-T4。

**文件与锚点：** GameAudio.tone/audioContext/setEnabled、GameApp/GameSession、SettingsPanel、preferences；扩充根`test/audio/game-audio.test.ts`、应用生命周期/偏好/语义UI回归，真实节点/按键/界面只在临时后台Helium验收，不维护E2E/spec/helper。

**源码核对后的实现边界：** 现有总Gain和合成音效继续复用，新增两个混音Gain；背景选择代码内三谐音环境声，不下载/加载音轨或安装依赖，因此无音频文件404消费者，不造无效资源回退分支。默认音效1、音乐0.12，静音仍是既有soundEnabled。AudioContext只在明确unlock手势创建/resume，音频自身的稳定状态订阅让设置提供拒绝/待启用入口；尚未running不排队旧音效。GameApp拥有会话状态到背景声音的订阅并释放，SceneHost.stop只取消本次动作音效；暂停/离局/终局停止背景，跳过动作不永久关掉整局背景。

**步骤：** 保留已存在的合成音效，加入独立音效/音乐GainNode与总静音。M和设置切换同一总静音，复用P1已接通的总Gain立即静音能力，并覆盖新加入的音乐；音量0仍保持无声，不因下一回合又重置。旧soundEnabled偏好保留语义并补新字段默认，音乐默认低音量。AudioContext创建/resume应发生在开始/声音按钮的真实用户手势中，不能等异步加载、保存完成或React Effect后才假设仍有手势授权；播放拒绝提供明确的声音操作，不无限重试。

背景仅一个轻量原创/许可明确音轨或合成环境声，按需加载；失败不阻断对局，不自动安装音频库。应用退出对局时停止相关音轨，应用销毁时关闭AudioContext与节点；React重新渲染不能新建上下文；若同一应用跨局复用Context，所有权必须明确，不能每次重开留一套。素材来源、许可、作者/取得方式与文件大小同提交记录。

**验证：** 播放中静音、0音量、新局继续静音、后台暂停声音、拒绝自动播放、音频资源404；余额与回合不受影响。自动化验证节点状态，实际设备人工听取是否仍响/爆音；没有音频设备条件时标注未验证，不声称听测通过。

**原子提交：** `feat: 增加可即时控制的音乐与音效混音`。

**实施证据（2026-10-04）：** 保留原合成动作音效、在原总Gain下接入独立effects/music混音；环境声为110/165/220Hz三个正弦源，新增音频素材0字节、无下载音轨/依赖，与本仓库AGPLv3源代码许可一致，README双语记录取得方式与来源，不据此宣称全产品许可审计完成。删除原音效隐式创建Context路径，只有明确unlock创建/resume；原soundEnabled是仍有效的总静音偏好，不新增旧格式迁移链。GameApp订阅真实Session运行/暂停/终局并释放，临时场景重建不复制Context；SceneHost.stop仍只取消动作音效，跳过不永久关闭整局环境声。

11音频协议、3真实应用/会话、15偏好和2双语语义UI回归（31针对）覆盖独立混音、静音/零音量、拒绝/同步失败与显式恢复、迟到授权、上下文中断、部分环境源/混音初始化失败释放、真实购买音频失败不重复扣款及完整终局保存。typecheck、66文件746测试、build、diff-check实际通过，日志`/tmp/richman-p9-t5-final-{targeted,typecheck,full,build}.log`；场景540.66kB/gzip137.20kB警告保留。

后台Helium生产页以真实原生AudioContext/Gain/Oscillator调用观测：菜单未创建Context；真实M键静音后总Gain=0、活动源0、输出RMS=0，恢复3源有输出；真实Home/End/ArrowRight范围输入设双音量0、暂停、离局均0输出且完整保存state不变。20次实际菜单离局/Continue，始终一个Context，局内3个环境源、菜单0且已断开，不出现线性活动源增长。累计创建69个、断开66个、剩余3个的页内观测列表是临时工具留存，不作为JS堆/显存字节测量。`/tmp/richman-p9-t5-audio-check.json`、`audio-browser.log`；390px双语原生范围控制及拒绝提示截图已人工目检。拒绝验收是向真实suspended Context注入resume rejection，不冒称系统权限拒绝；明确按钮恢复，不自动重试或排队旧音效。原生AudioParam在无活动图时value可保留渲染线程旧值，零音量证据是实际接受的setValueAtTime(0)、无源与RMS0，不为观测getter加产品补丁。设备听测/爆音质量未验证；本任务允许无设备条件明确标注，不能以节点/RMS等同听测。无音频文件404消费者，不维护无效回退或E2E。结束恢复本次实时偏好；完整规则保存未被改变。

## 阶段结束检查

完整测试与build、两视角完整对局、减少动态与静音路径、资源销毁回归。执行时建立audit-p9；所有画面和声音必须有实际证据，不使用假截图、未授权素材或“动画函数返回了”代替效果验收。
