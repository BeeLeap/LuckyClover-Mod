# LuckyClover-Arena

适用于 Endstone 服务端的 LuckyClover 暑假 PVP 双败淘汰赛插件。

## 赛制

- 双败淘汰赛，每位玩家有两次机会。
- 第一次输进入败者组，第二次输淘汰。
- 胜者组冠军和败者组冠军进入总决赛。
- 总决赛三局两胜。
- `/lcarena begin` 会从配置名单自动分组。
- `/lcarena next` 开始下一场，自动切冒险并传送到擂台。
- 玩家死亡后自动判另一方获胜；只有总决赛三局两胜还没结束时，才会把双方清包并传回各自复活点。
- 开始下一场时，如果上一场选手不在下一场，会执行 `[arena.standby]` 命令把他们送回世界出生点。
- 比赛全部结束后，插件会执行 `[arena.finish]` 和 `[arena.standby]`，清包、切冒险，并把全部参赛玩家送回世界出生点。
- 所有在线玩家血量会用红心显示在玩家头顶名牌下方。
- 积分榜使用计分板右侧数字显示积分。

## 安装

构建后会得到 `.whl` 文件，例如：

```text
dist/endstone_luckyclover_arena-0.3.6-py3-none-any.whl
```

把这个文件放到 Endstone 服务端的 `plugins` 目录，然后重启服务器。

第一次加载后，Endstone 会生成：

```text
plugins/luckyclover-arena/config.toml
plugins/luckyclover-arena/state.json
```

## 构建

```powershell
pipx run build --wheel
```

或：

```powershell
python -m pip install build hatchling
python -m build --wheel --no-isolation
```

## 活动流程

1. 在 `config.toml` 的 `[tournament] players` 写好参赛名单。
2. 改好 `[arena.side_a]` 和 `[arena.side_b]` 的擂台传送点。
3. 改好 `[arena.respawn.side_a]` 和 `[arena.respawn.side_b]` 的死亡后复活点。
4. 改好 `[arena.standby]` 的世界出生点传送命令。
5. 如需发装备，可自行在 `[equipment] commands` 添加命令；默认不发装备。
6. 服务器内执行 `/lcarena reload`。
7. 执行 `/lcarena begin` 生成双败赛程。
8. 执行 `/lcarena next` 开始下一场。
9. 玩家死亡后插件自动判胜；总决赛未结束时会清理双方背包、传回各自复活点；如需人工兜底，用 `/lcarena win <玩家名>`。
10. 总决赛先赢 2 局者成为冠军，插件会广播最终积分。

## 命令

| 命令 | 权限 | 说明 |
| --- | --- | --- |
| `/lcarena reload` | OP | 重载配置和状态 |
| `/lcarena begin` | OP | 从配置名单自动生成双败赛程 |
| `/lcarena list` | OP | 查看赛程状态 |
| `/lcarena current` | OP | 查看当前比赛 |
| `/lcarena next` | OP | 开始下一场 |
| `/lcarena win <玩家名> [积分]` | OP | 手动判定胜者并推进赛程 |
| `/lcarena score <玩家名> [积分]` | OP | 只给玩家加分 |
| `/lcarena board on` | OP | 开启侧边栏 |
| `/lcarena board off` | OP | 关闭侧边栏 |
| `/lcarena reset` | OP | 清空赛程、积分和当前比赛 |

玩家名有空格时请加引号：

```text
/lcarena win "Player Name"
```

## 配置示例

```toml
[tournament]
players = ["Steve", "Alex", "Mell", "Lucky"]
shuffle = true
seed = ""
score_per_win = 1
score_per_manual_add = 1
final_best_of = 3
auto_death_judge = true
announce_commands = true

[arena.match_start]
commands = [
  'kill @e[type=item]'
]

[arena.pre_match]
commands = [
  'gamemode adventure "{player}"'
]

[arena.side_a]
commands = [
  'tp "{player}" 99 -49 63',
  'title "{player}" title {match_name}'
]

[arena.side_b]
commands = [
  'tp "{player}" 99 -49 166',
  'title "{player}" title {match_name}'
]

[arena.respawn]
delay_ticks = 40

[arena.respawn.side_a]
commands = [
  'clear "{player}"',
  'tp "{player}" 99 -49 63',
  'title "{player}" title 回到A方复活点'
]

[arena.respawn.side_b]
commands = [
  'clear "{player}"',
  'tp "{player}" 99 -49 166',
  'title "{player}" title 回到B方复活点'
]

[arena.finish]
commands = [
  'clear "{player}"',
  'gamemode adventure "{player}"'
]

[arena.standby]
commands = [
  'tp "{player}" 127 -45 124'
]

[equipment]
commands = []
```

## 占位符

所有 `commands` 支持：

| 占位符 | 说明 |
| --- | --- |
| `{player}` | 已转义的玩家名 |
| `{raw_player}` | 原始玩家名 |
| `{opponent}` | 对手玩家名 |
| `{match_id}` | 当前比赛 ID |
| `{match_name}` | 当前比赛名 |
| `{match_no}` | 当前比赛编号 |
| `{bracket}` | 胜者组、败者组或总决赛 |
| `{side}` | 当前参赛方名称 |

## 注意事项

- 当前按 1v1 双败淘汰赛设计。
- 死亡自动判胜只会在当前比赛双方之一死亡时触发。
- `delay_ticks` 默认 40 tick，大约 2 秒；如果死亡后传送太早，可调大。
- `/lcarena reset` 会清空赛程和积分，正式活动中谨慎使用。
