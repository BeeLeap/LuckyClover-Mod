# LuckyClover-InventoryViewer

适用于 LeviLamina `legacy-script-engine-quickjs` 的玩家背包查看插件。

插件核心功能不依赖 GMLIB，避免 GMLIB 版本或依赖链差异影响服务器启动。玩家登录时会保存 UUID 和名称，并兼容读取 `LuckyClover-Plugin` 的 `online_time.json` 名称缓存。

## 功能

- 查看在线玩家和已保存的离线玩家。
- 使用 LLSE 玩家 NBT API 读取背包、盔甲、副手和末影箱，不依赖 GMLIB。
- 临时把目标物品栏显示到查看者自己的原生背包界面。
- 查看者退出查看时恢复自己的背包。
- 服务器异常重启后，玩家重新进入服务器时尝试恢复备份。
- 目标潜影盒的完整物品 NBT 会随背包一起保留。
- 第一版只读，不提供将查看者物品写回目标玩家的功能。

## 命令

```text
/invsee
/invsee <玩家名>
/invsee ender
/invsee restore
```

命令默认仅 OP 可用。`/invsee` 打开玩家列表，选择目标后进入查看状态。

查看状态下修改背包会在下一刻被目标背包快照覆盖，避免误取出物品或修改潜影盒副本。

查看背包后使用 `/invsee ender`，再直接打开末影箱，可以查看目标玩家的末影箱。查看期间只允许打开末影箱，其他容器和放置方块操作会被拦截。

## 注意

查看机制和 InventoryCheck 类似：插件临时替换查看者自己的背包，而不是创建一个独立的目标背包窗口。查看期间请不要退出菜单后继续操作物品；使用 `/invsee restore` 结束查看。
