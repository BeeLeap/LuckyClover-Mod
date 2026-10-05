# LuckyClover-Seat-BP

这是一个独立行为包，用来提供专用的座位实体 `luckyclover:seat`。

目的：

- 不把座位实现塞进现有插件目录
- 为后续脚本插件提供更稳定的“坐下”载体
- 避免直接用矿车作为座位实体

## 目录

```text
LuckyClover-Seat-BP/
  manifest.json
  entities/
    seat.json
```

## 实体标识符

```text
luckyclover:seat
```

## 当前设计

- `runtime_identifier` 复用 `minecraft:armor_stand`
- 关闭重力
- 关闭碰撞
- 禁止被推动
- 抗击退 1.0，抵挡风弹/爆炸击退
- 可供 1 名玩家骑乘
- 座位位置设置为实体中心上方一点
- 实体缩放为极小

## 用法示例

在游戏中或脚本里生成：

```mcfunction
summon luckyclover:seat ~ ~ ~
```

让玩家骑上去：

```mcfunction
ride <player> start_riding @e[type=luckyclover:seat,c=1,r=3] teleport_rider until_full
```

让玩家起身：

```mcfunction
ride <player> stop_riding
```

删除座位实体：

```mcfunction
kill @e[type=luckyclover:seat]
```

## 说明

- 这是行为包，不是脚本插件
- 需要放到世界或服务器使用的行为包目录并启用
- 这个包只提供“座位实体”本身
- 右键台阶/楼梯触发坐下，仍需要脚本或命令逻辑去判断并执行 `/ride`

## 建议

如果后续要继续做“右键坐下”，推荐脚本改成：

1. 在目标台阶/楼梯位置 `summon luckyclover:seat`
2. 给玩家执行 `/ride ... start_riding ...`
3. 起身时删除对应座位实体

这样会比矿车兼容方案稳定得多。
