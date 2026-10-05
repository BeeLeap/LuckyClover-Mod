# LuckyClover-Hood Packs

这是一套独立的行为包和资源包，用来提供一个可戴在头上的自定义头套物品。

目录：

```text
LuckyClover-Hood-BP/
LuckyClover-Hood-RP/
```

## 物品标识符

```text
luckyclover:hood
```

## 当前内容

- 行为包定义了一个可穿戴头部物品
- 资源包定义了物品图标
- 资源包定义了头部 attachable 模型
- 头套贴图文件已留空位，供你自行替换

## 你需要替换的图片

物品图标：

```text
LuckyClover-Hood-RP/textures/items/luckyclover_hood.png
```

头套模型贴图：

```text
LuckyClover-Hood-RP/textures/models/armor/luckyclover_hood.png
```

建议：

- 图标使用正方形 PNG
- 模型贴图建议使用 32x46 PNG
- 保持透明背景

当前模型已改为“平面面罩”形式：

- 图片会显示在玩家脸前
- 不会再包裹整个头部
- 最适合直接放一张完整头像或 Logo
- 当前默认按 `32x46` 的竖向长方形图片做了缩小显示

## 获取物品

```mcfunction
give @s luckyclover:hood 1
```

## 安装

1. 将 `LuckyClover-Hood-BP` 放进行为包目录
2. 将 `LuckyClover-Hood-RP` 放进资源包目录
3. 在世界或服务器中同时启用这两个包
4. 使用 `/give` 获取头套测试

## 说明

- 这是包体骨架和基础模型
- 具体外观图片由你自行替换
- 如果你后续要多个头套款式，可以按同样结构继续扩展更多物品和 attachable
