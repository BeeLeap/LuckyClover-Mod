# LuckyClover-Seat

适用于 LeviLamina `legacy-script-engine-quickjs` 的椅子功能插件。
从 `LuckyClover-Plugin` v1.3.0 拆出（v1.0.0）。**需要配套行为包 `LuckyClover-Seat-BP`**（提供实体 `luckyclover:seat`）。

## 功能

- 右键台阶 / 楼梯坐下：在目标位置生成 `luckyclover:seat` 实体并让玩家骑乘。
- 200ms 锚定循环：防止座位实体漂移，玩家起身（潜行/跳跃/切维度/重生/退出）自动清理。
- 玩家级开关（`seat_prefs.json`），默认值由配置 `defaultEnabled` 控制。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/seat` | 查看开关状态与用法 |
| `/seat on` / `/seat off` | 开启 / 关闭自己的坐下功能（关闭时立即起身） |

## 配置

`plugins/LuckyClover-Seat/config.json`：

```json
{
    "seatFeature": {
        "command": "seat",
        "defaultEnabled": true
    }
}
```

**首启迁移**：本目录无 `config.json` 时自动从主插件配置抽取 `seatFeature` 键；`seat_prefs.json` 自动复制。

## 跨插件 API

namespace：`LuckyCloverSeat`（管理接口）

- `mgmtGetConfig` / `mgmtSetConfig` / `mgmtReload` / `mgmtStatus`
- `mgmtGetSessionCount()` — 当前在坐人数
- `mgmtSetDefaultEnabled({enabled})` — 修改默认开关
- `mgmtCleanupAll()` — 起身并清理全部座位实体

## 依赖关系

- 无跨插件 API 依赖。
- 事件监听与主插件（主城保护的 `onUseItemOn`）并行注册：在保护区域内坐下会先触发座位逻辑，随后主插件的保护检查仍会执行。

## 安装

1. 行为包 `LuckyClover-Seat-BP` 放入行为包目录并启用。
2. 本插件目录放入 `plugins/`，重启。
3. 需与 `LuckyClover-Plugin` v1.4.0+ 配套（主插件已移除 `/seat` 与座位逻辑）。

## 版本

`1.0.0`
