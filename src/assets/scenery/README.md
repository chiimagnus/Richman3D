# 场景资产

房屋、树和船来自 Kenney，均为 CC0：

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

## 人物雕像

四个席位依次使用国王、女王、骑士、主教，保留玩家颜色。模型由 [CharacterModel.ts](../../rendering/CharacterModel.ts) 直接构建并随游戏打包，不下载外部模型或纹理，不改变存档和联机协议。

造型仅参考 [MONOPOLY Madness](https://www.playstation.com/en-us/games/monopoly-madness/) 的角色辨识度与 [世界游戏大全 51](https://www.nintendo.com/sg/switch/as7t/index.html) 的桌面棋具质感，没有引入这两款游戏的素材。修改造型时运行 [人物回归测试](../../../test/rendering/characters.test.ts)，检查两张地图上的四人同格、正反向移动、第一人称遮挡与资源释放，并在真实页面核对总览和近景。
