# LuckyClover-ShoppingMall

LuckyClover 商城插件 —— 官方商店（出售 / 回收）、玩家开店、仓库、悬赏求购、折扣、批量、交易提醒，LSE（quickjs）版。

当前版本 **v1.2.0**，已接入 **LuckyClover-Panel** 管理面板；支持从旧版 **ShoppingMall（子邪）** 一键迁移生产数据。

## 玩法

### 主线（P0）
- `/shop` 打开商城主菜单：余额 + 商城统计 + 最新交易 + 未读提醒，按配置显示各功能入口
- **玩家店铺**：开店（可配费用）→ 从背包上架（上架即扣背包）→ 他人购买 → 收益入账
  - 货架种类上限 / 单件数量上限 / 价格区间均可配；卖家离线时收益进「待结算」，上线自动入账
  - 店铺公告、改名、开关店、改价、下架退还、删除店铺
- **官方商店 · 出售**：管理员从物品目录（`Items.json`，2387 条中文物品）上架，玩家付钱拿货；库存可设无限
- **官方商店 · 回收**：按单价或「N 个 = X 金币」批量回收（`perCount`，与旧版同语义）
- **交易税**：可开关、可设税率，范围可选玩家店铺 / 官方商店 / 全部交易；税款单独记账
- **全局搜索 / 交易动态 / 店铺排行榜**

### 扩展（v1.1.0）
- **个人仓库** `/smck`：存入（背包 → 仓库，同种堆叠、可加备注）、取出（单件 / 全部）、
  免费容量 + **一次性买断扩容**（买断后永久到 `buyoutSlots` 格）
- **悬赏 · 求购** `/smreq`：发布（**全额托管**手续费另计）→ 他人履约交货（钱立刻入账，货进求购方背包或**仓库**）
  → 支持部分履约、取消退款、**到期自动退款**（默认 72h），进行中 / 我的 / 历史三个列表
  - 发布时的物品选择器：**分页（每页 40 条，共 2387 条）+ 关键词搜索 + 目录分类筛选**
- **批量操作**：「我的货架」「官方在售」「回收清单」多选 → 批量改价（固定价 / ±百分比）、批量打折、批量改分类、批量下架
  - 面板侧同样支持：表格勾选 → 批量改价 / 打折 / 下架
- **折扣**：单品打折（1~9.9 折，按时长），**到期自动恢复原价**（60s 扫描）+ 可选全服公告；
  字段 `discount / originalPrice / discountEndTime` 与旧版完全同名，迁移免转换
- **提醒箱**：店铺售出（**含离线补记**）、求购被履约、求购到期退款、折扣生效与到期、仓库存入
  - 上线推送未读条数，主菜单显示「你有 N 条未读提醒」，可查看 / 全部已读 / 清空
- **界面（v1.2.0 界面调整）**：所有列表页的**分类 / 搜索**按钮移到物品列表**上方**；
  每个按钮都带图标（操作图标 + 物品自身贴图）；灰色字体全部换成高可见度颜色

## 安装

把 `LuckyClover-ShoppingMall/` 整个文件夹放进服务器 `plugins/`（需已装 `legacy-script-engine-quickjs`），重启后日志应出现：

```text
LuckyClover-ShoppingMall v1.2.0 loaded
官方在售 … · 回收 … · 店铺 … 家(营业 …) · 在售商品 … 种
```

首次启动在插件目录生成 `config.json`；数据文件随使用自动生成。

## 命令

| 命令 | 权限 | 说明 |
| --- | --- | --- |
| `/shop`（`command` 可配） | 所有人 | 打开商城主菜单 |
| `/smgm` | 所有人 | 直达官方商店购买页 |
| `/smhs` | 所有人 | 直达物品回收 |
| `/smck` | 所有人 | 直达个人仓库 |
| `/smreq` | 所有人 | 直达悬赏求购大厅 |

## 配置（`config.json`）

```json
{
    "command": "shop",
    "pageSize": 20,
    "allowSelfPurchase": false,
    "statistics": true,
    "tax": { "enabled": true, "rate": 0.05, "scope": "player" },
    "categories": ["全部", "武器", "…", "其他"],
    "shop": { "allowCreate": true, "createCost": 0, "maxItemTypes": 15,
              "maxQuantityPerListing": 960, "minPrice": 1, "maxPrice": 1000000000 },
    "official": { "sortMode": "随机" },
    "recycle": { "enabled": true },
    "warehouse": { "enabled": true, "maxSlots": 50, "buyoutSlots": 100, "buyoutPrice": 10000 },
    "request":  { "enabled": true, "fee": 0, "expiryHours": 72, "notifyAll": true },
    "discount": { "enabled": true, "notifyAll": true },
    "notify":   { "enabled": true, "inboxLimit": 50 },
    "menu": { "buttons": { "center": true, "official": true, "recycle": true, "myShop": true,
                           "warehouse": true, "requests": true, "notify": true,
                           "search": true, "logs": true, "ranking": true } }
}
```

- `tax.scope`：`player` 只对玩家店铺征税（默认）/ `official` 只对官方商店 / `all` 全部交易
- `warehouse.maxSlots` 免费容量，`buyoutSlots` 买断后容量，`buyoutPrice` 买断价（0 = 免费买断）
- `request.fee` 发布手续费，`expiryHours` 到期小时数（到期自动全额退款）
- `menu.buttons.*`：主菜单入口开关；OP 还会看到「管理市场」

## 数据文件

| 文件 | 内容 |
| --- | --- |
| `config.json` | 配置 |
| `shops.json` | 玩家店铺：货架（含折扣字段）、公告、收益、待结算、暂存物品 |
| `official.json` | 官方出售清单 + 回收清单（`perCount`） |
| `forbidden.json` | 禁售物品（不可上架，仍可购买与回收） |
| `logs.json` | 交易日志（环形保留 500 条） |
| `ranking.json` | 店铺排行（销量 / 订单 / 收益） |
| `tax.json` | 税收记录（环形 500 条）与累计额 |
| `warehouse.json` | 个人仓库（含 `purchased` 买断标记） |
| `requests.json` | 求购进行中 + 历史 |
| `notifications.json` | 提醒箱（每人上限 `notify.inboxLimit` 条） |
| `Items.json` | 物品目录（2387 条中文名；缺失时降级为类型名） |
| `Icons.json` | 物品图标表（物品类型 → 客户端贴图路径；缺失时按物品分类回退） |
| `migrated.flag` / `migration-report.json` | 旧数据迁移标记与报告（见下） |

## 从旧版 ShoppingMall 迁移生产数据

生产服仍在跑参考插件（子邪 ShoppingMall）时，本插件**启动即自动迁移**，无需手工导出：

1. 部署本插件到生产服，确认 `plugins/ShoppingMall/`（旧插件目录）存在
2. **先停用 / 卸载旧插件**（本插件只读旧目录，但两边同时写会导致数据分叉）
3. 启动服务器，日志会输出：
   ```text
   检测到旧版 ShoppingMall 数据，开始迁移…
   旧商城数据迁移完成：店铺 N 家 / 货架 N 项 …
   迁移报告: plugins/LuckyClover-ShoppingMall/migration-report.json
   ```
4. 检查 `migration-report.json`（每类迁了多少条、跳过多少、字段折算警告）
5. 写入 `migrated.flag` 后**不会重复执行**；已存在的同名对象一律跳过不覆盖

读取方式与旧插件一致：优先 **`KVDatabase`**（`plugins/ShoppingMall/database`，引擎私有二进制，只能在服务器内读），读不到则回退旧版 JSON 文件。

| 旧数据（DB key / 文件） | 迁到 | 说明 |
| --- | --- | --- |
| `shops_data` / `ShoppingMall.json` | `shops.json` | 货架 key 由 SNBT 重算；`owner`→`ownerName`、`announcement`→`notice`；折扣三字段原样保留；`shopLevel/advertSlot/iconName` 存进 `legacy.*` 仅作留档 |
| `official_shop` / `OfficialShop.json` | `official.json` | 保留 `displayName/remark/perCount` 与折扣字段 |
| `forbidden_items` | `forbidden.json` | 原样 |
| `ranking_data` | `ranking.json` | `salesCount`→`sales`、`totalEarnings`→`earnings` |
| `warehouse` | `warehouse.json` | `items[]` 直迁（`itemData→nbt`、`timestamp→at`），`purchased` 直迁 |
| `purchase_requests` | `requests.json` | 进行中 + 历史；无 `expiresAt` 按 `createdTime + expiryHours` 重算 |
| `purchase_logs.global` | `logs.json` | 取最近 500 条 |
| `tax_records.totalCollected` | `tax.json.total` | 只迁累计额（旧版无逐笔明细） |
| `player_records` | （用于命名） | 给排行 / 店铺补玩家名 |
| `config.json` | `config.json` | `cmd`→`command`、税率三件套→`tax`、`itemCategories`→`categories`、开店/货架参数→`shop`、`purchaseRequest*`→`request`、`warehouse*`→`warehouse`、`mainMenuButtons`→`menu.buttons` |
| ❌ 不迁 | priceHistory、dynamicRecycle、recycleLimits、chatMessages、mentionData、giftRecords、广告位、本地图标 | 对应功能未实现 |

> 本地测试服没有旧插件目录时，迁移**自动跳过且不写标记**，等真正部署到生产服时再执行。

## 与 LuckyClover-Panel 的对接

命名空间 **`LuckyCloverShoppingMall`**，`ll.export` 暴露 `mgmt*` 接口（面板经 `^mgmt[A-Za-z0-9]+$` 白名单调用）：

| 分区 | 接口 |
| --- | --- |
| 通用 | `mgmtStatus`、`mgmtOverview`、`mgmtGetConfig`、`mgmtSetConfig`、`mgmtReload` |
| 玩家店铺 | `mgmtListShops`、`mgmtGetShop`、`mgmtSetShopOpen`、`mgmtSetShopNotice`、`mgmtSetShopPrice`、`mgmtRemoveShopItem`、`mgmtDeleteShop` |
| 官方出售 | `mgmtListOfficial`、`mgmtAddOfficial`、`mgmtSetOfficialPrice`、`mgmtSetOfficialStock`、`mgmtRemoveOfficial` |
| 官方回收 | `mgmtListRecycle`、`mgmtAddRecycle`、`mgmtSetRecyclePrice`、`mgmtRemoveRecycle` |
| 求购 | `mgmtListRequests`、`mgmtCancelRequest`（取消并退款） |
| 仓库 | `mgmtListWarehouse`、`mgmtGetWarehouse` |
| 批量 | `mgmtBatchList`（`scope=official/recycle/shop`，`action=price/percent/category/discount/clearDiscount/remove`） |
| 内容管理 | `mgmtSearchItems`、`mgmtListCategories`、`mgmtAddCategory`、`mgmtRemoveCategory`、`mgmtGetForbidden`、`mgmtSetForbidden` |
| 交易 | `mgmtListLogs`、`mgmtGetRanking`、`mgmtGetTaxStats`、`mgmtSetTax` |

约定：入参为 JSON 字符串（或对象），出参统一 `{"ok":true,...}` / `{"ok":false,"error":"..."}`。
面板下架玩家货架物品时，物品转入店主「待领取区」，不会丢失。

## 实现说明

- 存储用 `JsonConfigFile`（JSON 文件），与 LuckyClover 系列一致，不使用 KVDatabase
- 经济只走 `money`（llmoney），不支持计分板经济
- 物品同一性 = 类型 + 归一化 NBT（去掉 `Count`）；官方目录条目与背包物品用「类型 + aux」对应
- 上架即扣背包、下架即退还；背包空间不足时转入「待领取区」或退回，不会吞物品
- 折扣语义与旧版一致：`price` 即当前售价（已含折扣），`originalPrice` 保存原价，到期由定时任务恢复
- 按钮图标只用**客户端自带的原版贴图**（`textures/ui/*`、`textures/items/*`、`textures/blocks/*`），
  不依赖任何材质包、不使用 `FinalTexture/` / `ui_icons.json`；物品图标来自 `Icons.json`，查不到时按物品分类回退
- 所有列表页的**分类 / 搜索按钮都排在物品上方**，先选条件再看商品

## 测试

`node tools/smoke-ui.js`（stub 出 LSE 运行环境后加载插件、逐个打开所有页面）—— 校验：

- 每个表单的**按钮数与图标数一致**，且每个图标路径都在原版贴图清单里真实存在
- 表单正文 / 按钮里不再残留灰色 `§7`
- 对 29 个页面按下全部按钮（约 400 次点击），确认按钮索引分发正确、回调不抛错
- **分类 / 搜索确实排在物品上方**，且第 1/2 个按钮分别打开分类下拉与搜索框、第 3 个按钮进入购买确认
- `Icons.json` 的每一条路径都真实存在（`--dump` 可人眼查看关键页面的实际排版）

`node tools/test-logic.js` —— **14 项交易/经济回归测试**，直接驱动真实的购买、回收、履约、仓库、
买断、面板接口，逐条验证"刷物品 / 丢物品 / 凭空增发"这几类问题已被修掉，例如：
部分发放只按到手数量扣款并只退差额、0 库存下架不再生成幽灵物品、取仓库传负数被拒、
连点买断只扣一次钱、已取消订单不能履约、履约只收订单指定的 NBT（附魔物品不会被普通物品掉包）、
背包写不下时物品退回仓库而不是消失、面板非法数量/价格被拒绝、折扣中改价不会被旧原价覆盖。

`node tools/gen-icons.js` 可重新生成 `Icons.json`（需要本地有官方
[bedrock-samples](https://github.com/Mojang/bedrock-samples) 资源包，脚本顶部 `SAMPLES` 常量指向它；
BDS 自带的 `resource_packs/vanilla` 只含 `texts`，贴图不全）。`node tools/find-tex.js <关键词>` 用来查原版贴图真实文件名。

## v1.2.0 修复（逻辑正确性）

| 问题 | 现象 | 修法 |
| --- | --- | --- |
| 发放物品部分成功却全额退款 | 玩家能白拿一部分物品还拿回全部金币 | 新增 `giveItemsPartial`，按**实际到手数量**结算并只退差额、库存也只扣到手的量 |
| `Math.max(1, qty)` 造出幽灵物品 | 0 库存条目下架后，上线结算会凭空生成 1 件 | `queuePendingItem` / `storeToWarehouse` 对 0 数量直接拒绝 |
| 上架先扣背包、后写店铺 | 店铺恰好不存在时整套物品消失 | 失败时按实际退不回的数量转入店铺待领取区，并记 error 日志 |
| 删店不校验未领取资产 | 暂存物品与待结算收益随店铺一起消失 | 玩家侧与面板侧都要求先领取（`mgmtDeleteShop` 返回明确错误） |
| 取出仓库回滚不检查结果 | 仓库满时物品两边都没有 | 回滚失败则强制放回仓库，兜底失败才报错并留日志 |
| 批量下架发放失败只记名字 | 条目已删、物品丢失 | 退回失败的部分转入店铺待领取区 |
| 履约按类型扣货、按样本发货 | 附魔/改名物品被普通物品掉包 | 求购单新增 `itemNbt`/`itemAux`，收货与发货都按「类型 + NBT」匹配 |
| 扣背包中途失败不回滚 | 扣了一半、业务却判定失败 | `removeMatching` 记录已扣项并原样退回（退不回则报错 + 日志） |
| 履约不校验订单状态 | 已取消/已到期的订单仍能交货，凭空增发金币 | 履约时现查订单，非进行中直接拒绝；订单被移除时回滚本次交易 |
| 改价与折扣字段不同步 | 折扣到期后用旧原价覆盖店主的新价 | 改价一律先结束该物品的折扣，并提示玩家 |
| 面板数值校验是死代码 | 传 NaN/负数被静默写成 1，库存缺字段变 **-1 = 无限** | 改为显式范围判断；`mgmtSetOfficialStock` 非法即报错 |
| 空输入被当成 0 | 清空税率框 → 税率静默变 0；单价变最低价 | 表单先判空串再换算，留空视为不修改 / 直接报错 |
| 官方商品缺 `quantity` | 坏数据等于无限库存免费刷 | 非显式 `-1` 一律按 0 处理并打告警；列表显示同步 |
| 卖家在线但入账失败 | 货款凭空消失 | 退化为「待结算」，卖家下次上线补账 |
| 取消求购退款展示不一致 | 部分履约后提示的退款比实际多 | 提示改用 `requestRefund()`，与实际退款一致 |
| 到期扫描回写旧快照 | 期间的新订单/改动可能被覆盖 | 改为一次性写回 + 纯追加历史 |
| 取仓库传负数 | 被钳成 1，多扣玩家东西 | 显式拒绝非法数量 |
| 连点买断 | 两次判定都通过 → 重复扣款 | 判定 + 扣款 + 落标记收进同一次写盘 |

> 行为变更提示：①「改价」现在会结束该物品正在进行的限时折扣；②取消/到期退款仍按
> `剩余件数 × 单价 + 手续费` 退还（手续费照退，界面提示已与实际一致）；③官方商品必须在
> `official.json` 里显式写 `quantity`（`-1` 才是无限），缺失会按库存 0 处理并打日志。

## 版本

`1.2.0`
