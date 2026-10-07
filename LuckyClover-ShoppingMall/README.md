# LuckyClover-ShoppingMall

LuckyClover 商城插件 —— 官方商店（出售 / 回收）、玩家开店、仓库、悬赏求购、折扣、批量、交易提醒，LSE（quickjs）版。

当前版本 **v1.2.0**，已接入 **LuckyClover-Panel** 管理面板。

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

## 实现要点

- 数据使用 JSON 文件保存，经济接口使用 `money`（llmoney）。
- 物品按类型与规范化 NBT 匹配；库存不足或背包写入失败时会进入待领取区/仓库，不会静默丢失。
- 官方商品必须显式设置 `quantity`，只有 `-1` 表示无限库存。
- 图标使用客户端原版贴图，物品图标由 `Icons.json` 提供回退映射。

## 测试

`node tools/smoke-ui.js`：检查表单布局、按钮回调和图标路径。

`node tools/test-logic.js`：运行购买、回收、履约、仓库、面板接口和经济安全回归测试。

`node tools/gen-icons.js` 可重新生成 `Icons.json`（需要本地有官方
[bedrock-samples](https://github.com/Mojang/bedrock-samples) 资源包，脚本顶部 `SAMPLES` 常量指向它；
BDS 自带的 `resource_packs/vanilla` 只含 `texts`，贴图不全）。`node tools/find-tex.js <关键词>` 用来查原版贴图真实文件名。

## v1.2.0 更新

- 加强购买、回收、履约、仓库和批量操作的库存一致性与失败回滚。
- 修复部分发放、下架、退款和入账失败时的物品/金币丢失风险。
- 增加 NBT 精确匹配和面板输入校验，避免错误物品交付与非法数据写入。
- 调整列表筛选、图标和管理操作界面，并补充自动化回归测试。

## 版本

`1.2.0`
