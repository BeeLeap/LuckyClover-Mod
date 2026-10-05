# LuckyClover-Plugin

适用于 LeviLamina `legacy-script-engine-quickjs` 的 LuckyClover 服务器**核心**插件。

当前版本 **v1.4.1** —— 头衔/显示名/VIP/飞行、传送、椅子、侧边栏已拆分为独立插件，本插件只保留核心玩法与聊天管线。v1.4.1 起移除主菜单（`/menu`）功能，入口改由各插件自带命令与 LuckyClover-ShoppingMall 提供。

## 插件矩阵

| 插件 | 职责 |
| --- | --- |
| **LuckyClover-Plugin**（本体 v1.4.1） | 每日任务、主城保护、电影运镜、禁言、在线时长、跨服、进服通知、**onChat 聊天管线（唯一属主）** |
| **LuckyClover-VIP** | 头衔、显示名字、VIP、飞行（`/vip` `/fly` `/settitle` `/setname` …） |
| **LuckyClover-TPA** | TPA / Home / Warp / Back + 聊天文本输入 |
| **LuckyClover-Seat** | 右键坐下（配套 `LuckyClover-Seat-BP` 行为包） |
| **LuckyClover-Sidebar** | 侧边栏、TPS/MSPT、排行轮换 |
| **LuckyClover-ShoppingMall** | 商城：官方商店（出售/回收）、玩家开店、交易日志、排行榜、税收（`/shop` `/smgm` `/smhs`） |

**部署矩阵**：玩完整功能需 v1.4.1 核心与 4 个拆出插件（均可单独缺失，见下文降级行为）。核心与 VIP、TPA 必须同版本部署（命令不重叠，但聊天格式依赖 VIP）。`LuckyClover-ShoppingMall` 为可选玩法插件，不装不影响其余功能。

## 功能概览（本体）

- 每日任务：`/daily` 表单查看进度、一键领取；奖励金额吃 VIP 倍率（经 VIP 插件导入）。
- 跨服：`/serverhub` 转发到配置的目标服务器。
- 主城保护：2D 区域保护、白名单、多区域。
- 电影运镜：`/cinematic` 录制/播放运镜路径。
- 禁言：`/mute` `/unmute` `/mutelist` `/muteinfo`，onChat 阶段硬拦截，不漏进 QQ 桥接。
- 在线时长：累计时长、计分板同步、TOP10 排行、时长名字颜色阶梯（`nameColor` 配置，作为 `getOnlineTimeColor` 导出供 VIP 使用）。
- 进服通知：VIP/新玩家 Toast 横幅（VIP 状态经 VIP 插件导入）。
- 聊天兼容：`chatFormatMode` + `chatBridge`（QQ 桥接导出调用）。

## 聊天管线（onChat 唯一属主）

```
玩家发言
  → TPA.handleChatInput   （文本输入框消费则拦截；缺 TPA 则跳过）
  → 禁言检查              （本插件）
  → chatFormatMode 判断   （vanilla 直接放行）
  → VIP.format            （渲染 {vip}{title}{name}…；缺 VIP 则退化为 "名字: 消息"）
  → chatBridge 转发 + 广播
```

`chatFormat`、`nametagFormat`、`titleWrapper` 等格式配置已移至 **LuckyClover-VIP** 的 `config.json`。

## 导出 API（供其他插件 / 网页面板）

namespace：`LuckyCloverCore`

| 函数 | 说明 |
| --- | --- |
| `getOnlineTimeColor(player)` | 在线时长名字颜色阶梯（VIP 导入） |
| `getSidebarExtras(player)` | `{dailyTask*}` `{onlineTime}` `{topOnline1..10}`（Sidebar 导入） |
| `mgmtGetConfig` / `mgmtSetConfig` / `mgmtReload` / `mgmtStatus` | 管理四件套（JSON 字符串进出） |
| `mgmtListDailyTasks({name?})` | 今日任务列表（可带在线玩家进度） |
| `mgmtGetOnlineTop({count})` | 在线时长排行 |
| `mgmtMuteList` / `mgmtUnmute({name})` | 禁言管理 |
| `mgmtHubRegions` | 主城保护区域列表 |

## 命令（本体保留）

| 命令 | 权限 | 说明 |
| --- | --- | --- |
| `/daily [claim <ID\|all>]` | 所有人 | 每日任务 |
| `/serverhub`（可配） | 所有人 | 跨服 |
| `/hubprotect ...` | OP | 主城保护 |
| `/cinematic ...` | 所有人/OP | 电影运镜 |
| `/mute` `/unmute` `/mutelist` `/muteinfo` | OP/所有人 | 禁言 |
| `dailytasks`（控制台） | 控制台 | 输出今日任务列表 |

已迁移命令：`/settitle` `/cleartitle` `/setname` `/clearname` `/vip` `/fly` → VIP 插件；`/tpa` `/tpaccept` `/tpdeny` `/tpacancel` `/back` `/home` `/warp` → TPA 插件；`/seat` → Seat 插件。

## 配置说明（本体保留的键）

`plugins/LuckyClover-Plugin/config.json`：

| 配置项 | 说明 |
| --- | --- |
| `chatFormatMode` | `vanilla`（不拦截）/ `override`（按 VIP 插件格式重广播） |
| `chatBridge` | QQ 桥接导出（`namespace`/`functionName`） |
| `joinNotify` | 进服通知（`{name}` `{vip}` 占位符） |
| `transfer` | 跨服目标 |
| `hubProtection` | 主城保护区域 |
| `dailyTasks` | 每日任务定义与轮换 |
| `nameColor` | 在线时长名字颜色阶梯 |
| `cinematic` | 运镜参数 |
| `mute` | 禁言命令名与默认原因 |

> 旧文件中的 `chatFormat`、`nametagFormat`、`titleWrapper`、`emptyTitleFallback`、`vip`、`fly`、`teleport`、`seatFeature`、`sidebar` 键已被忽略（各插件首启时自动迁移到自己的配置）。

## 数据文件

| 文件 | 说明 |
| --- | --- |
| `daily_tasks.json` | 每日任务状态 |
| `online_time.json` | 在线时长 |
| `mutes.json` | 禁言数据 |
| `cinematics.json` | 运镜数据 |

已迁移：`titles.json` `customnames.json` → LuckyClover-VIP；`vips.json` `flight.json` → LuckyClover-VIP；`teleports.json` → LuckyClover-TPA；`seat_prefs.json` → LuckyClover-Seat。

## 事件归属

| 事件 | 属主 |
| --- | --- |
| `onChat` | 仅本插件 |
| `onJoin` | 本插件（通知/禁言/在线会话）+ VIP（名牌/飞行）+ Sidebar（刷新） |
| `onLeft` | 本插件（在线时长/运镜）+ VIP（飞行结算）+ TPA（请求清理）+ Seat（起身） |
| `onRespawn` `onSneak` `onJump` `onChangeDim` | VIP / Seat |
| `onUseItemOn` | Seat（坐下）+ 本插件（主城保护） |
| `onMobDie` | 本插件（击杀任务）+ TPA（死亡点） |

## 安装

1. 确保已安装 `legacy-script-engine-quickjs`。
2. 将各插件目录放入 `plugins/`：本体 + `LuckyClover-VIP` + `LuckyClover-TPA` + `LuckyClover-Seat` + `LuckyClover-Sidebar`。
3. 确认入口为各自目录下的 `manifest.json`。
4. 重启服务器，日志应出现各插件的 `loaded` 与 API 连通自检行。

## 降级行为（任一插件缺失均不崩溃）

| 缺失 | 行为 |
| --- | --- |
| VIP | 聊天退化 `名字: 消息`；`{vip}`/`{title}` 不渲染；进服通知只走新玩家分支；每日奖励无倍率；侧边栏头衔显示 `无` |
| TPA | 聊天文本输入交互不可用（Home/Warp 命名仍走表单输入）；`/tpa` 等命令不存在 |
| 主插件 | VIP 无时长颜色阶梯；侧边栏任务/时长占位符显示 `—` |
| Sidebar | 无侧边栏，其余不受影响 |
| Seat | 无坐下功能，其余不受影响 |

## 版本

当前插件版本：`1.4.1`
