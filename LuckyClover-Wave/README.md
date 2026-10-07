# LuckyClover-Wave —— 国庆尸潮守点

斗兽场（Colosseum travertine v.4）波次防守活动插件，LSE(quickjs) 版。

## 玩法

- 玩家 `/wave join` 进场（自动传送到集合点 + 发初始装备）
- OP `/wave start [波数]` 开局，10 秒后第一波，波间有补给倒计时
- 怪从四周刷怪点刷新，**进入核心半径内每只每秒扣核心血量**——核心归零=活动失败
- 第 5/10/15 波精英波（命名+血量强化），最后一波 Boss
- 死亡达到 `deaths_limit`（默认 2）次淘汰 → 传送到观众席观战
- 全部波次清空=通关；结算按**击杀分排行**（普通 1 / 精英 5 / Boss 30），逐名执行奖励命令

## 安装（活动服）

1. `LuckyClover-Wave/` 整个文件夹放进活动服 `plugins/`（需已装 `legacy-script-engine-quickjs`）
2. 把存档 **`Colosseum travertine v.4`**（本机官方启动器目录
   `%APPDATA%\Minecraft Bedrock\Users\408659333956806290\games\com.mojang\minecraftWorlds\LE+rDdGlimk=`）
   整个拷进活动服的 `minecraftWorlds/`
3. 重启服务器

## 首次布场（进游戏按顺序执行，站定后执行对应命令）

| 命令 | 作用 |
|---|---|
| `/wave setlobby` | 集合点（玩家 join 后传送至此，建议核心旁） |
| `/wave setcore` | 防守核心位置（建议场地正中央） |
| `/wave setseat` | 淘汰观战席（观众席前排） |
| `/wave setreturn` | 活动结束回传点（世界出生点） |
| `/wave addspawn` | 刷怪点——在四周入口处逐个站、逐个加（建议 4-6 个） |
| `/wave status` | 检查是否还有"未设置"项 |

坐标类配置都会写进 `plugins/LuckyClover-Wave/config.json`，可手改微调。

## 常用命令

```
/wave join | leave        加入 / 退出（首人加入自动倒计时开局，见"自动开局"）
/wave shop                活动商店（列出商品与余额）
/wave buy <ID>            购买（扣 LegacyMoney 金币；活动进行中仅场上存活者可买）
/wave rank [场次|off|on]   最终排行榜（常驻侧边栏；off/on 开关；场次 1=最近）
/wave status              状态（波次/核心血/人数/点位检查/开局倒计时）
/wave start [波数]        开始（默认20波，OP；倒计时中执行=立即开始）
/wave stop                强制停止并清场（OP；倒计时中执行=取消倒计时）
/wave setlobby|setcore|setseat|setreturn   点位设置（OP，站定执行）
/wave addspawn|clearspawns|spawns          刷怪点管理（OP）
```

## 自动开局（auto_start）

- **首人 `/wave join` 即启动倒计时**（默认 60 秒），到点**自动开始**，无需 OP 在场
- 倒计时中**新玩家加入 → 倒计时重置**；同一人退出重进**不重置**（防恶意反复进出拖时间）
- 重置累计 `max_resets`（默认 5）次后**锁定**不再延长；全员退出/离线则取消倒计时
- 到点校验场地与人数：缺配置→取消并说明；人数不足→挂起等待加入
- **倒计时期间侧边栏即接管**，显示对局状态（阶段/倒计时秒数/人数）；取消或开始时自然过渡
- `/wave start` 仍可手动立即开始；`config → auto_start: {enabled, countdown_seconds, max_resets}`；
  `enabled: false` 回到"必须 OP 手动 start"的老流程

## 人数难度（随参与人数缩放）

- **数量**（原有）：每波 = `count_base + 人数 × count_per_player`，按 `growth` 逐波递增、`max_per_wave` 封顶
- **生命**（新增）：每多 1 名参与者，普通/精英怪生命 +`health_per_player`（默认 5%），**Boss 不缩放**
- 开局广播公示本场难度（首波只数 + 生命加成百分比）

## 首次进服自动 deop（auto_deop）

- 该地图会把**所有进入者变成 OP**；插件在玩家**首次进服**时自动执行一次 `deop` 兜底
- 名单持久化在 `known_players.json`（按 xuid 记），同一人只处理一次，换游戏名不重复触发
- 名字带空格时命令自动加引号（`deop "Foo Bar"`），防命令解析截断
- `config → auto_deop: {enabled, keep_op}`：`enabled:false` 整体关闭；
  `keep_op` 为豁免名单（游戏名或 xuid）——**管理记得把自己加进去**，否则下次进服会被 deop

## 侧边栏联动（自动）

- `start` 时自动接管 LuckyClover-Sidebar：主页面换成**波次 / 核心血 / 存活 / 我的得分 / 击杀榜**，
  并关闭在线时长榜轮播；`stop` 或结算后**自动还原**原配置（含标题）
- 活动侧边栏模板在 `config.json → sidebar_lines` 可自定义
- Sidebar 侧新增占位符（普通配置里也可用，无活动时显示 "—"）：
  `{wave}` `{waveTotal}` `{eventPhase}` `{coreHp}` `{coreMax}` `{alive}`
  `{myKills}` `{myScore}` `{topKills1}`…`{topKills10}`

## 活动商店（表单）

- `/wave shop` 打开**表单商店**：标题行显示余额，点商品即购买，买完自动重开刷新余额，X 关闭
- 引擎缺少表单 API 时自动降级为文本列表；`/wave buy <ID>` 文本购买始终可用
- `config.json → shop.items`：`{id, name, price, icon, commands[]}`——`icon` 是表单按钮贴图路径
  （如 `textures/items/golden_apple`），`{player}` 占位
- 空闲期任何人可买（赛前备货）；活动进行中仅**场上未淘汰参与者**可买
- 扣费使用 LegacyMoney 经济接口

## 核心的实体化（方块 + 名牌盔甲架）

- `/wave setcore` 站的位置：**方块放在你脚边的空气格**（站在地上设=方块立在地上），活动结束恢复成 `restore_block`（默认 air）
- 开局自动：放置 `core.block`（默认钻石块）+ 上方生成**盔甲架**，名牌实时显示
  `§e[国庆核心] §aHP 200/200`（黄/红随血量变色），每次掉血即时刷新
- **保护**：攻击盔甲架、挖核心方块都会被**拦截取消**并提示；默认不扣血（防捣乱者故意送失败），
  想让"拆核心=扣血"就设 `core.dmg_on_mine: true`（扣 `mining_damage`，默认 5）
- 怪物靠近（`core.radius` 半径）持续扣血的逻辑不变；核心归零=活动失败
- 盔甲架用 `spawnMob("armor_stand")` 生成，若你的引擎不认这个类型会自动降级为"只有方块的核心"（日志有 warn）

## 怪物为什么会进攻核心（配套行为包）

原版 AI 只会追玩家，不会走向方块——所以配套提供 **`LuckyClover-Wave-AI` 行为包**：

- 给池内 8 种怪（zombie/zombie_villager/husk/stray/drowned/spider/cave_spider/witch）的目标选择器
  **追加盔甲架过滤器（40格）**：玩家更近→打玩家；玩家远离/不可见→扑向核心盔甲架
- **走原生 AI 寻路**：自带面朝方向、走路动画、交战停手——不是传送硬拽
- 蜘蛛原版只会反击，行为包给它补了主动目标组件（玩家+盔甲架）
- 已部署：`behavior_packs/LuckyClover-Wave-AI/` + 挂入斗兽场世界 `world_behavior_packs.json`
  （只影响该世界；原文件备份 `.bak`）
- 盔甲架若被打死：3 秒冷却自动重生（`core.stand:false` 可关闭）

## 活动经济与锁夜

- **开局**：所有参与者金币**暂存并清零**（聊天提示暂存额）→ 击杀得币（普通20/精英100/Boss500，
  `economy.kill_reward` 可调）→ 商店消费 → **结束自动全额返还赛前资产**
  - `economy.clear_on_start` / `restore_after` 可关（restore_after=false 慎用=不返还）
  - 活动中途 `/wave join` 的人同样被清零暂存
- **锁夜**：开局 `gamerule dodaylightcycle false` + `time set night`（彻底定格在夜晚），
  tick 内周期 `time set night` 兜底；结束恢复昼夜循环（`night_restore_cycle`）

## 特殊机制（v1.3）

### 精英词缀
- 精英波怪随机 1 个词缀（第10波起可能 2 个），名字带前缀如 `§e[爆破]`
- 词缀池 `affixes.pool`：**迅捷**(速度II)、**坦克**(3×血+缓慢)、**爆破**(死亡AOE炸玩家和核心)、
  **分裂**(死亡再生2只)、**灼身**(光环点燃身边玩家)
- 击杀奖励按词缀数翻倍（1词缀×2，2词缀×4）；词缀写在播报里

### 波间三选一（roguelike）
- 每波清空后自动弹**表单**给存活玩家，30 秒内选 1 个作用于下一波（每人每波1次）
- 增益池 `buff_pool`：力量祝福 / 铁壁(恢复+抗性) / 紧急加固(核心+40) / 箭雨(×24箭+急迫) /
  赏金(本波击杀币×2) / 核心屏障(本波前10秒核心无敌)
- 表单缺失时 `/wave buff` 走文本列表，`/wave buff <ID>` 直接选

### 经济三处消费
- `/wave shop` 补给（8件含铁甲全套）
- `/wave repair`：100金 → 核心 +10 血（3秒冷却）
- `/wave revive`：500金 → 淘汰者复活（每场1次，回集合点补装备）

### Boss 与成长
- Boss 每 `boss_tick.summon_interval` 秒（默认15）招 `summon_count` 只援军；
  血量低于 `enrage_hp_pct`(30%) 狂暴（速度II + 全服播报）
- 全体怪按波数成长：第10波起速度I、第15波起力量I（`growth.*` 可调）

## 活动背包（赛前暂存 → 结束返还）

- **开局/中途加入**：把玩家赛前背包+护甲**暂存到 `inventory_backup.json` 并清空**，聊天提示件数；
  然后照常发活动 kit、商店购物
- **结束**：先**丢弃全部活动物品**，再把赛前背包原样还回去——活动装备一件不留、赛前家当一件不丢
- **离线兜底**：结束时不在服的玩家暂存保留，**下次上线自动返还**
- `inventory.restore_after: false` = 不返还（赛前物品丢失=真清空），只建议在专用活动服上开
- 背包 API 缺失时自动跳过并打日志（`inventory API unavailable`），功能降级不影响活动本身
- 暂存文件 `plugins/LuckyClover-Wave/inventory_backup.json`：若服务器活动中途崩溃，玩家物品在里面，
  手动恢复或留到下次启动处理

## 配置要点

- `waves.pool`：普通怪池（刷怪类型用基岩原版 id，如 `husk`/`stray`/`witch`）
- `waves.elite` / `waves.boss`：精英与 Boss 的名字、血量、附带效果
- `core.max_hp` / `core.radius` / `core.damage_per_hit`：核心强度与判定
- `kit_commands` / `supply_commands`：进场装备、波间补给（`{player}` 占位）
- `rewards`：名次奖励命令，支持 `{player}` `{rank}` `{waves}` 占位
  - **跨服发奖玩法**：活动服没有主服经济时，把主服生成的国庆 CDK 兑换码写进
    `say`/`tell` 命令里发给获奖者，让他们回主服 `/vip code` 或面板兑换
- `deaths_limit`：死亡淘汰次数；`lock_night`：活动期间锁夜

## 计分与结算说明

- 排行榜主序=击杀分（含精英/Boss 加成），波次为全队共享成绩，写进结算广播
- 结算广播 + `rewards` 里 rank 1/2/3 的命令依次执行；参与但未进前三的可自行在
  `rewards` 加 `{"rank": "all", ...}` 规则（当前版本仅按名次 rank 数字匹配）
- 活动失败（核心毁/全灭）同样结算排行，按已到达波数广播
- **每场结束自动存档最终榜**（`leaderboard.json`，保留最近 10 场，新场整段叠在旧场上方）：
  `/wave rank` = 全部叠层 + 底部多场累计总榜；`/wave rank N` = 只看第 N 近一场；
  活动进行中 `/wave rank` = 实时榜
- **最终榜单常驻侧边栏**：空闲期间一直显示（退服重进、重启服务器都在），直到**下一场开始**
  或 `/wave rank off` 手动关闭、`/wave rank on` 重新上屏。off 状态持久化，
  但下一场结束后自动失效（新榜单重新上屏）

## 死亡与观战席落点

- 死亡计数走 `onRespawn`：阵亡未到上限 → 重生后回集合点；达到上限 → 旁观模式进观战席
- 落点是**延迟自检**的：确认玩家真正重生（`health>0`）才传送，之后每 0.5s 自检一次，
  被引擎的重生落点冲掉会自动补传（API 失败还有 `/tp`、`/gamemode` 指令兜底），上限 60 秒
- 活动结束时淘汰者自动恢复生存模式并传回集合点，不会卡在旁观模式
- 排查日志：`还在死亡界面(health=0)，等真正重生后再落点`（在等重生，正常）、
  `落点补传#N ... → 到位`（被引擎冲掉后自愈）、`eliminate 落点就位`（成功）；
  出现 `落点自检超时` 说明 60 秒仍未落上，把那段日志发出来定位

## 已知边界

- 怪不会真正"寻路攻击方块"，核心伤害用** proximity（进入半径扣血）**模拟攻城
- 精英/Boss 血量通过 `entity.health` 设置，个别客户端受上限影响时配合效果补偿
  （配置里已给 `damage_resistance` 效果）
- 玩家死亡以 `onRespawn` 计数；虚空/横死等极端情况同样计入
- 活动期间锁夜为周期执行（默认 30s），开局瞬间若为白天最迟 30s 变夜
