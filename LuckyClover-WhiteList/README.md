# LuckyClover-WhiteList

适用于 LeviLamina `legacy-script-engine-quickjs` 的 HuHoBot BDSAdapter 附属插件。

实现 **离线服 QQ 验证码绑定白名单** 功能。

## 功能

- 玩家进服后自动弹出表单显示随机验证码
- 关掉表单后被踢出服务器
- QQ 群发送绑定命令完成验证，自动加白名单（在QQ群发送 `@HuHoBot /执行 验证码 X7K3P9`）
- 再次进服即可正常游玩
- 支持单 QQ 限制绑定账号数量
- 支持绑定过期重新验证（可选）
- 绑定命令可自定义（默认 `验证码`）
- 消息回报 — 绑定结果通过 HuHoBot 实时反馈到 QQ 群
- 配置热重载 — `/whitelist_bind reload` 无需重启服务器

## 前置依赖

- [HuHoBot BDSAdapter](https://github.com/HuHoBot/BDSAdapter)（已安装并正常运行）
- LegacyScriptEngine 0.9.4+
- Minecraft Bedrock Server 1.21.50+

## 安装

1. 确保服务器已安装 `HuHoBot BDSAdapter` 并正常运行
2. 将 `LuckyClover-WhiteList/` 目录放到服务器 `plugins/` 目录下
3. 最终结构：`plugins/LuckyClover-WhiteList/manifest.json`
4. 重启服务器

## 配置

`plugins/LuckyClover-WhiteList/config.json`：

```json
{
    "bindCommand": "验证码",
    "maxAccountsPerQQ": 1,
    "codeLength": 6,
    "codeExpirySeconds": 300,
    "rebindEnabled": false,
    "rebindDays": 30,
    "form": {
        "title": "§l§aLuckyClover 服务器",
        "content": "§c你尚未绑定QQ！\n\n§e请在QQ群 @HuHoBot 发送以下命令完成验证：\n\n§6/执行 {cmd} {code}\n\n§7验证码有效期: {expiry} 分钟\n\n§c关闭此窗口将被踢出服务器",
        "rebindTitle": "§l§e绑定已过期",
        "rebindContent": "§c你的绑定已过期！\n\n§e请在QQ群 @HuHoBot 发送以下命令重新验证：\n\n§6/执行 {cmd} {code}\n\n§7验证码有效期: {expiry} 分钟\n\n§c关闭此窗口将被踢出服务器",
        "button": "§c我知道了"
    },
    "messages": {
        "usage": "§e用法: /执行 {cmd} <验证码>",
        "invalidCode": "§c验证码无效或已过期",
        "bindLimit": "§c绑定上限（最多{max}个）",
        "alreadyBound": "§c{player} 已被其他QQ绑定",
        "success": "§a{player} 绑定成功，已加白名单"
    }
}
```

### 配置项说明

| 字段 | 说明 |
|---|---|
| `bindCommand` | QQ 群绑定命令关键词（发送格式：`/执行 {bindCommand} 验证码`），默认 `验证码` |
| `maxAccountsPerQQ` | 单个 QQ 最多绑定账号数量 |
| `codeLength` | 验证码长度（默认 6 位） |
| `codeExpirySeconds` | 验证码有效期（秒） |
| `rebindEnabled` | 是否启用绑定过期重新验证 |
| `rebindDays` | 过期天数（`rebindEnabled: true` 时生效） |
| `form.title` | 表单标题（支持 `§` 颜色代码） |
| `form.content` | 表单内容，支持占位符：`{code}`、`{cmd}`、`{expiry}` |
| `form.rebindTitle` | 重新绑定时的表单标题 |
| `form.rebindContent` | 重新绑定时的表单内容 |
| `form.button` | 表单按钮文本 |

### 占位符

#### 表单内容（form.content / form.rebindContent）

| 占位符 | 说明 |
|---|---|
| `{code}` | 随机验证码 |
| `{cmd}` | 绑定命令名 |
| `{expiry}` | 验证码有效期（分钟） |

#### 消息回报

| 占位符 | 说明 |
|---|---|
| `{player}` | 玩家名 |
| `{max}` | 单 QQ 绑定上限 |
| `{cmd}` | 绑定命令名 |

## 命令

| 命令 | 权限 | 说明 |
|---|---|---|
| `/whitelist_bind reload` | OP/控制台 | 重载配置文件 |
| `/whitelist_bind remove <玩家名>` | OP/控制台 | 移出白名单并清理绑定数据 |
| `/whitelist_bind removeqq <QQ-OpenID>` | OP/控制台 | 通过 QQ OpenID 移除其绑定的所有玩家 |
| `/whitelist_bind` | OP/控制台 | 显示帮助 |

## 使用流程

1. 玩家进入服务器
2. 未绑定 → 自动弹出表单，显示验证码：`请在QQ群 @HuHoBot /执行 验证码 X7K3P9`
3. 关掉表单 → 自动踢出
4. 玩家在 QQ 群发送 `@HuHoBot /执行 验证码 X7K3P9`
5. HuHoBot 回复绑定结果到 QQ 群
6. 重新进入服务器 → 正常游玩

## 数据文件

| 文件 | 说明 |
|---|---|
| `plugins/LuckyClover-WhiteList/data/bindings.json` | 绑定数据持久化存储 |

## 说明

- 插件依赖 HuHoBot BDSAdapter 的 `run` 事件回调机制
- 如果 HuHoBot 未安装，插件会正常加载但白名单功能不可用
- 玩家被手动从白名单移除后，将重新进入验证流程
- 验证码使用 Base32 字符集（排除易混淆字符 0/O/I/1）
