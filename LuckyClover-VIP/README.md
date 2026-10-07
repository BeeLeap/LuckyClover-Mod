# LuckyClover-VIP

适用于 LeviLamina `legacy-script-engine-quickjs` 的头衔 / 显示名字 / VIP / 飞行插件。
从 `LuckyClover-Plugin` v1.3.0 拆出，独立维护（v1.0.0）。

## 功能

- **头衔**：聊天前缀、名牌显示、颜色代码包装（`titleWrapper`）。
- **显示名字**：`/setname` 自定义玩家显示名，覆盖聊天与名牌中的真实名字。
- **VIP 系统**：等级特权、逐字彩色名字、到期时间、奖励倍率、Home 上限加成、TPA 超时加成。
- **飞行**：VIP 每日飞行时长 + `/fly` 购买飞行（金币计费），共用同一套结算循环。

## 命令

| 命令 | 权限 | 说明 |
| --- | --- | --- |
| `/settitle <玩家> <头衔>` | OP | 设置头衔 |
| `/cleartitle <玩家>` | OP | 清除头衔 |
| `/setname <玩家> <名字>` | OP | 设置显示名字（支持 `&` 颜色代码） |
| `/clearname <玩家>` | OP | 清除显示名字 |
| `/vip` | 所有人 | 打开 VIP 信息表单 |
| `/vip fly [on\|off\|time]` | VIP | 开关 VIP 飞行、查看余量 |
| `/vip set <玩家> <等级> [天数]` | OP | 设置 VIP（0/省略 = 永久） |
| `/vip remove <玩家>` | OP | 移除 VIP |
| `/vip info [玩家]` / `/vip list` | OP | 查看 VIP 信息 |
| `/fly` | 所有人 | 打开飞行购买表单 |
| `/fly buy\|time\|on\|off` | 所有人 | 购买/查看/开关飞行 |

## 配置

`plugins/LuckyClover-VIP/config.json`：

| 键 | 说明 |
| --- | --- |
| `chatFormat` | 聊天格式（`{vip}{title}{name}{device}{ping}{msg}` 等） |
| `nametagFormat` | 名牌格式 |
| `titleWrapper` | 头衔外层包装，如 `[{title}] ` |
| `emptyTitleFallback` | 无头衔时的占位输出 |
| `vip` | 等级定义：`display`、`prefixColor`、`nameColors`、`maxHomes`、`dailyRewardMultiplier`、`teleportRequestTimeoutSeconds`、`allowFlight`、`dailyFlightSeconds`、`flightResetHour` |
| `fly` | `enabled`、`command`、`hourPrice`、`purchaseSeconds` |

**首启迁移**：若本目录没有 `config.json`，自动从 `plugins/LuckyClover-Plugin/config.json` 抽取上述键；`titles.json`、`customnames.json`、`vips.json`、`flight.json` 也会从旧目录自动复制到本目录（仅当新路径不存在时）。

## 数据文件

| 文件 | 说明 |
| --- | --- |
| `titles.json` | 玩家头衔（键为 xuid） |
| `customnames.json` | 自定义显示名字 |
| `vips.json` | VIP 数据 |
| `flight.json` | 购买飞行时长 |

## 跨插件 API

namespace：`LuckyCloverVIP`（`ll.export`，供其他插件 `ll.imports` 调用）

### 运行时

| 函数 | 签名 | 使用方 |
| --- | --- | --- |
| `format` | `(template, player, msg) => string`；`template` 传 `null` 时用本插件 `chatFormat` | 主插件 onChat 广播、（内部）名牌 |
| `refreshNametag` | `(player) => void` | 外部触发名牌刷新 |
| `getTitle` | `(xuid) => string` | 侧边栏 `{sidebarTitle}` |
| `renderDisplayName` | `(player) => string` | 侧边栏 `{playerName}` |
| `getVipStatus` | `(player) => {isVip, level, display, expireAt}` | 主插件进服通知 |
| `getRewardMultiplier` | `(player, key, fallback) => number` | 主插件每日任务奖励 |
| `getMaxHomes` | `(player, baseMax) => number` | TPA（传入基础上限） |
| `getTpTimeoutSeconds` | `(player, baseSeconds) => number` | TPA（传入基础超时） |

### 管理接口（JSON 字符串进出，供未来网页管理面板）

`mgmtGetConfig` / `mgmtSetConfig` / `mgmtReload` / `mgmtStatus`、`mgmtListVips`、`mgmtSetVip`、`mgmtRemoveVip`、`mgmtSetTitle`、`mgmtClearTitle`、`mgmtSetDisplayName`、`mgmtClearDisplayName`、`mgmtGetFlight`。

设置类接口支持 `{ "key": "<xuid>" }` 直接指定存储键（离线玩家建议传 xuid）。

## 金币套餐（金币购买）

| 套餐ID | 显示名 | 价格 | 有效期 | 5h池 | 周池 |
| --- | --- | --- | --- | --- | --- |
| `vip`（老玩家保留，已下架） | VIP | 不售卖 | 长期有效* | 10 分钟 | 2 小时 |
| `vip_plus`（老玩家保留，已下架） | VIP+ | 不售卖 | 长期有效* | 20 分钟 | 4 小时 |
| `plus` | VIP Plus | 15,000 | 30天 | 45 分钟 | 8 小时 |
| `pro_5x` | Pro 5x | 45,000 | 30天 | 90 分钟 | 40 小时 |
| `pro_20x` | Pro 20x | 120,000 | 30天 | 180 分钟 | 168 小时（≈无限） |

- 购买：`/vip buy <套餐ID>`，金币不足会提示；**同级续费自动叠加剩余时长**，永久 VIP 续费保持永久
- 价格/时长/额度全部在 `config.json → vip.levels.<id>` 里，可自行调整；`price: 0` 表示不可购买
- 特权（Home 上限、奖励倍率、名字颜色等）仍按等级配置，套餐等级已带默认值

### 飞行双额度模型

每个套餐等级有两个飞行额度池（字段 `flight5hSeconds` / `flightWeekSeconds`）：

- **5h 池**：距上次归零满 5 小时自动重置（惰性计算，无需定时器）
- **周池**：按自然周（周一起）重置

飞行同时消耗两个池；**任一池耗尽即自动关闭飞行**并提示（"5小时飞行额度已用完" / "本周飞行额度已用完"）。`/vip fly time` 与 `/fly` 表单都会分别显示两池剩余。

### 旧数据迁移

首启自动执行 `ensureVipConfigUpgrade()`：

1. 向 `vip.levels` 注入缺失的 `plus` / `pro_5x` / `pro_20x`
2. 旧的 `vip` / `vip_plus`：补齐双池额度，**`price = 0` 下架**——老玩家继续持有生效，但不出现在 `/vip shop`、不可购买（\* 原到期时间不变，OP 设置的永久仍为永久）
3. 其他自定义等级若缺字段，从旧的 `dailyFlightSeconds` 推导周池额度，`price` 默认 0（不售卖，需显式定价）

已有的 `vips.json` 玩家数据**无需改动**——旧字段保留兼容，新池字段在首次结算时自动初始化。日志出现「VIP等级配置已升级」即表示迁移完成。
## 兑换码（CDK）

- **生成**：网页管理页「兑换码管理」（走面板 mgmtGenerateCdk），可批量生成 1~100 个，支持套餐（含 0 天=永久）或金币两种奖励、批次备注、按小时过期
- **兑换**：游戏内 /vip code <兑换码>，或网页商店页「兑换码」卡片（两者共用同一份 cdks.json，兑一次即作废）
- 码格式：12 位 ABCD-EFGH-IJKL（字母数字，去掉了易混的 I/O/0/1）；**不区分大小写、可省略连字符**
- 发放成功后才标记已用——金币发放失败（缺 xuid / 经济接口不可用）不会消耗兑换码
- 同级套餐兑换与购买一样**自动叠加剩余时长**，永久保持永久

## 依赖关系

- 反向依赖 `LuckyClover-Plugin`（Core）的 `getOnlineTimeColor`：在线时长名字颜色阶梯。缺失时非 VIP 名字不着色，其余功能不受影响。
- 无其他依赖；可单独安装（此时聊天前缀/名牌功能完整，仅时长颜色阶梯失效）。

## 安装

1. 确认已安装 `legacy-script-engine-quickjs`。
2. 将 `LuckyClover-VIP/` 放入服务器 `plugins/`。
3. 重启服务器，日志应出现 `LuckyClover-VIP loaded`。

> 注意：必须与已移除同名命令的 `LuckyClover-Plugin` v1.4.0+ 配套部署，否则会命令重复注册。

## 版本

`1.0.0`
