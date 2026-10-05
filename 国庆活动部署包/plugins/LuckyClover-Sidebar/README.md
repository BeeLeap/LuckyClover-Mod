# LuckyClover-Sidebar

适用于 LeviLamina `legacy-script-engine-quickjs` 的侧边栏插件。
从 `LuckyClover-Plugin` v1.3.0 拆出（v1.0.0）。

## 功能

- 侧边栏（记分板）循环刷新，间隔 `refreshIntervalMs`（250ms 下限）。
- TPS / MSPT 采样（由刷新间隔推算）。
- 主页 / 排行页轮换（`cycleEnabled` + `cycleIntervalMs`）。
- 占位符渲染；跨插件数据（头衔、显示名、每日任务、在线时长）通过导入获得，缺失时降级显示。

## 占位符

| 来源 | 占位符 |
| --- | --- |
| 本插件 | `{serverName}` `{onlinePlayers}` `{playerName}`\* `{sidebarTitle}`\* `{tps}` `{mspt}` `{ping}` `{money}` `{time}` `{hour}` `{minute}` `{second}` |
| ← LuckyClover-VIP | `{sidebarTitle}` `{playerName}`（显示名 + 颜色终态） |
| ← LuckyClover-Plugin | `{dailyTaskTotal}` `{dailyTaskCompleted}` `{dailyTaskProgress}` `{onlineTime}` `{topOnline1..10}` |

\* VIP 缺失时 `{sidebarTitle}` 显示 `无`、`{playerName}` 回退真实名字；主插件缺失时每日任务/时长类占位符显示 `—` 或空。

排行页渲染 `rankingLines`（原版实现误用 `lines`，本插件已修正）。

## 配置

`plugins/LuckyClover-Sidebar/config.json` 的 `sidebar` 键（与原主插件完全一致）：

```json
{
    "sidebar": {
        "enabled": true,
        "title": "§aLuckyClover",
        "serverName": "LuckyClover",
        "refreshIntervalMs": 1000,
        "cycleEnabled": false,
        "cycleIntervalMs": 15000,
        "rankingTitle": "§6=== 在线时长排行 ===",
        "rankingLines": ["{topOnline1}", "..."],
        "lines": ["§b服务器§f: {serverName}", "..."]
    }
}
```

首启自动从主插件配置抽取 `sidebar` 键。

## 跨插件 API

namespace：`LuckyCloverSidebar`（管理接口，JSON 字符串进出）

- `mgmtGetConfig` / `mgmtSetConfig` / `mgmtReload` / `mgmtStatus`
- `mgmtGetMetrics()` — tps / mspt / 在线数 / 当前页
- `mgmtRenderPreview({name?})` — 返回指定在线玩家的侧边栏最终行数组（所见即所得，供面板预览）
- `mgmtSetPage({page: "main" | "ranking"})` — 强制翻页

## 依赖关系

- ← `LuckyCloverVIP`：`getTitle`、`renderDisplayName`
- ← `LuckyCloverCore`（主插件）：`getSidebarExtras`

全部 lazy 导入，任一缺失只影响对应占位符。

## 安装

将 `LuckyClover-Sidebar/` 放入 `plugins/`，重启。需与 `LuckyClover-Plugin` v1.4.0+ 配套（主插件已移除侧边栏逻辑）。

## 版本

`1.0.0`
