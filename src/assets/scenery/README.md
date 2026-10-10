# 场景资产

只收录实际使用的 Kenney 静态模型。房屋与树来自 [City Kit Suburban 2.0](https://kenney.nl/assets/city-kit-suburban)，船来自 [Watercraft Kit 2.1](https://kenney.nl/assets/watercraft-kit)。原包许可随附 `city-license.txt`、`water-license.txt`（CC0）；不含商业游戏资产。

JSON 为 Three.js BufferGeometry 格式：合并原 OBJ 的部件，将原调色板纹理按 UV 烘焙成线性空间顶点色，保留屋顶、窗框、庭院、船体、甲板和船帆的真实几何。仅移动模型原点到地面中心，不拉扁模型。没有远程模型/纹理请求、运行时文件解析器或异步加载生命周期。

从官网下载并解压原包后，可使用仓库现有依赖重新生成，例如：

```sh
node scripts/bake-scenery.mjs "/path/to/City Kit/Models/OBJ format" building-type-a > src/assets/scenery/building-type-a.json
node scripts/bake-scenery.mjs "/path/to/Watercraft Kit/Models/OBJ format" boat-sail-a > src/assets/scenery/boat-sail-a.json
```

脚本只接受这两个版本的非交错、8-bit indexed、无行过滤 PNG 调色板；格式变化时明确报错，不猜测颜色。验证使用 `test/rendering/art-direction.test.ts`，并在真实页面查看两张地图与两种视角。
