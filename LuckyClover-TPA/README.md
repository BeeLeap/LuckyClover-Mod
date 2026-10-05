# LuckyClover-TPA

适用于 LeviLamina `legacy-script-engine-quickjs` 的传送系统插件。
从 `LuckyClover-Plugin` v1.3.0 拆出（v1.0.0）。

## 功能

- **TPA**：发送/接受/拒绝/取消传送请求，带确认表单与超时。
- **Home**：私人传送点，数量上限 = 基础配置 ∪ VIP 加成。
- **Warp**：公共传送点，普通玩家只能编辑自己创建的，OP 管理全部。
- **Back**：返回死亡点或上一次传送前的位置（死亡点由本插件 `onMobDie` 记录）。
- **聊天文本输入**：设置 Home/Warp 名称时可直接在聊天框输入，由本插件拦截并回调。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/tpa` | 传送请求菜单 |
| `/tpaccept [玩家]` / `/tpdeny [玩家]` | 接受 / 拒绝请求 |
| `/tpacancel` | 取消自己发出的请求 |
| `/home` | Home 菜单（`set <名字>` / `<名字>` / `del <名字>`） |
| `/warp` | Warp 菜单（`set` / `del` / `info` / `<名字>`） |
| `/back` | 返回上一个位置 |

命令名均可在配置中修改；权限均为所有人。

## 配置

`plugins/LuckyClover-TPA/config.json`：

```json
{
    "teleport": {
        "enabled": true,
        "requestTimeoutSeconds": 60,
        "maxHomes": 3,
        "tpaCommand": "tpa",
        "tpacceptCommand": "tpaccept",
        "tpdenyCommand": "tpdeny",
        "tpacancelCommand": "tpacancel",
        "backCommand": "back",
        "homeCommand": "home",
        "warpCommand": "warp"
    }
}
```

**首启迁移**：本目录无 `config.json` 时自动从主插件配置抽取 `teleport` 键；`teleports.json` 自动从 `plugins/LuckyClover-Plugin/` 复制。

## 数据文件

`teleports.json` — `{ homes, warps, back }`，按玩家键存储，坐标带 `yMode: "feet"` 标记。

## 跨插件 API

namespace：`LuckyCloverTPA`

- 运行时：`handleChatInput(player, msg) => boolean` — 主插件 onChat 管线首行调用，`true` 表示消息已被文本输入框消费（直接拦截）。
- 管理接口：`mgmtGetConfig` / `mgmtSetConfig` / `mgmtReload` / `mgmtStatus`、`mgmtListHomes`、`mgmtListWarps`、`mgmtDeleteWarp`、`mgmtClearHomes`、`mgmtGetPendingRequests`。

## 依赖关系

- 导入 `LuckyCloverVIP` 的 `getMaxHomes` / `getTpTimeoutSeconds`（VIP Home 上限与请求超时加成）。缺失时回退为基础配置，OP 仍不受 Home 上限限制。

## 安装

将 `LuckyClover-TPA/` 放入 `plugins/`，重启。需与 `LuckyClover-Plugin` v1.4.0+ 配套（主插件 onChat 依赖本插件的文本输入拦截；缺失时该交互退化为表单输入，聊天不受影响）。

## 版本

`1.0.0`
