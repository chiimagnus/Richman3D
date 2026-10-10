# 场景资产

模型来自 Kenney，均为 CC0：

- 房屋与树：[City Kit Suburban 2.0](https://kenney.nl/assets/city-kit-suburban)，[原包许可](city-license.txt)。
- 船：[Watercraft Kit 2.1](https://kenney.nl/assets/watercraft-kit)，[原包许可](water-license.txt)。

JSON 由 [转换脚本](../../../scripts/bake-scenery.mjs) 生成并入库，不手改。脚本合并 OBJ 部件、将调色板纹理烘焙成线性顶点色，并把原点移到地面中心，保留模型比例。模型随游戏打包，不额外下载模型或纹理文件。

## 重新生成

更换原包或修改转换逻辑时重新生成，并保留许可文件。安装项目依赖、下载并解压对应版本的原包后，从仓库根目录运行，例如：

```sh
node scripts/bake-scenery.mjs "/path/to/City Kit/Models/OBJ format" building-type-a > building-type-a.generated.json &&
mv building-type-a.generated.json src/assets/scenery/building-type-a.json
```

船模型使用 Watercraft 原包目录与对应模型名。先写临时文件，生成成功才替换资产，避免失败时清空已有 JSON。

脚本仅支持非交错、8-bit indexed、无行过滤的 PNG 调色板；格式不符会报错，不猜测颜色。运行 [资产回归测试](../../../test/rendering/art-direction.test.ts)，并在真实页面检查两张地图的第一人称与总览；基础验证见 [README](../../../README.md#开发验证)。
