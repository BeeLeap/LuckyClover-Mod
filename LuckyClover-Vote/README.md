# LuckyClover-Vote

适用于 LeviLamina `legacy-script-engine-quickjs` 的独立投票插件。

功能：

- 管理员创建投票项目
- 管理员添加投票选项
- 管理员开启、结束、清空投票
- 玩家进行投票
- 玩家和管理员查看投票结果
- 管理员创建、修改、删除游戏内悬浮字

## 玩家命令

- `/vote`
- `/vote <编号>`
- `/vote result`

## 管理命令

- `/voteadmin create <标题>`
- `/voteadmin add <选项内容>`
- `/voteadmin start`
- `/voteadmin end`
- `/voteadmin clear`
- `/voteadmin result`
- `/voteadmin info`

## 悬浮字命令

- `/floattext create <id> <文本>`
- `/floattext set <id> <文本>`
- `/floattext movehere <id>`
- `/floattext delete <id>`
- `/floattext list`

`/voteadmin` 和 `/floattext` 默认只有 OP 可以使用。

悬浮字功能依赖 `GMLIB` 与 `GMLIB-LegacyRemoteCallApi`。

## 使用流程

1. `/voteadmin create 今天晚上的活动是什么`
2. `/voteadmin add 打末影龙`
3. `/voteadmin add 建筑比赛`
4. `/voteadmin start`
5. 玩家使用 `/vote 1` 或 `/vote 2` 投票
6. `/voteadmin end`

## 配置

```json
{
    "playerCommand": "vote",
    "adminCommand": "voteadmin",
    "floatTextCommand": "floattext",
    "allowRevote": true,
    "resultBroadcastOnVote": false,
    "floatTextYOffset": 2
}
```

- `playerCommand`: 玩家投票命令名
- `adminCommand`: 管理员命令名
- `floatTextCommand`: 悬浮字管理命令名
- `allowRevote`: 是否允许重复投票并覆盖上次选择
- `resultBroadcastOnVote`: 玩家投票后是否广播提示
- `floatTextYOffset`: 创建或移动悬浮字时，相对玩家当前位置向上的偏移高度

## 悬浮字说明

- 悬浮字使用 `GMLIB` 的假实体发包实现，不再依赖盔甲架实体
- 数据保存在 `floattexts.json`
- 服务器重启后会自动重建
- 如果未安装 `GMLIB-LegacyRemoteCallApi`，悬浮字命令会提示不可用
- 建议文本不要太长，避免显示异常

## 安装

将整个 `LuckyClover-Vote/` 目录放到服务器的 `plugins/` 目录下。

最终结构应为：

```text
plugins/
  LuckyClover-Vote/
    manifest.json
    LuckyClover-Vote.js
    config.json
    vote.json
    floattexts.json
```
