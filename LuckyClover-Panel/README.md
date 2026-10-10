# LuckyClover-Panel

LuckyClover 网页管理面板 —— 基于 **LSE Node.js 引擎** 的插件后端 + 静态前端。

- 概览页：TPS / MSPT / 在线玩家 / 侧边栏快捷配置 / 实体 / 运行时间 / 世界信息 / CPU·内存·磁盘环形仪表 / 玩家列表
- 管理页：登录授权后，管理已导出 `mgmt*` 接口的全部 LuckyClover 插件
- 权限模型：**游戏内执行 `/panel passwd <密码>` 设置登录密码 → 网页端用玩家名 + 密码登录**。设密码时是 **OP → 管理员**（可进管理分区），**非 OP → 观察者**（可签到、逛商店，不能改配置）；未登录只能看概览

## 依赖

1. LeviLamina + **legacy-script-engine-nodejs**（NodeJS 后端引擎）

   ```text
   lip install github.com/LiteLDev/LegacyScriptEngine#nodejs
   ```

2. LuckyClover 六件套（管理接口来源，缺哪个对应分区显示"不可用"，不影响面板本身）：
   `LuckyClover-Plugin` v1.4.1+、`LuckyClover-VIP`、`LuckyClover-TPA`、`LuckyClover-Seat`、`LuckyClover-Sidebar`、`LuckyClover-ShoppingMall` v1.2.1+

## 安装

这是 LeviLamina 插件，不需要执行 `npm install`，也不需要单独启动 Node.js 服务。

1. 安装 LeviLamina 和 `legacy-script-engine-nodejs`：

   ```text
   lip install github.com/LiteLDev/LegacyScriptEngine#nodejs
   ```

2. 将整个 `LuckyClover-Panel/` 目录复制到服务器的 `plugins/` 目录，目录结构应为：

```text
plugins/LuckyClover-Panel/
  manifest.json
  index.js
  web/
    index.html
    style.css
    app.js
```

如使用部署包，保持上述目录结构直接解压即可；不要把 `package.json` 当作 npm 包安装。

3. 同时安装需要被面板管理的 LuckyClover 插件，然后重启服务器。日志应出现：

```text
LuckyClover-Panel 已启动: http://127.0.0.1:30019
全部插件管理接口连通
```

## 配置

首次启动在插件目录生成 `panel.json`：

```json
{
    "port": 30019,
    "bind": "0.0.0.0",
    "publicUrl": "",
    "serverName": "LC生存服"
}
```

`publicUrl` 用于 `/shop web` 发给玩家；留空会尝试使用服务器第一张局域网 IPv4 网卡地址，公网或反向代理部署建议填写玩家实际可访问的完整地址。

## 使用

1. 浏览器打开 `http://<服务器IP>:30019`，默认进入**概览**页（免登录只读）。
2. 游戏内执行 `/panel passwd 你的密码`（至少 6 位，可含空格）设置登录密码；`/panel passwd clear` 可清除。所有玩家都可设置，**权限取自设密码那一刻的 OP 状态**。
3. 进入**管理**页 → 账号填**玩家名** + 密码 → 登录。
4. **商城**：顶部「商城」页公开展示官方出售、回收清单和玩家店铺；游戏内执行 `/shop web` 可获得网页地址。顶部「会员商店」页可直接用金币购买会员套餐与飞行时长（需登录；余额、当前套餐、飞行余量实时显示）。
5. **兑换码**：商店页「兑换码」卡片输入兑换码即可兑换（游戏内 /vip code <兑换码> 等效）；管理页 VIP 分区可批量生成兑换码（套餐/金币、批次、有效期），生成后一键复制。
6. **每日签到**：概览页点「签到」，或游戏内执行 `/signin`（两端共用同一份记录，同一天只能签一次；奖励金币按账号 xuid 入账）。
7. **管理员**账号登录后出现六个插件的管理分区；**观察者**账号只有概览 / 商店 / 签到。右上角「退出」清除会话。
8. **插件管理页按插件分页签**：`服务器核心 / 头衔·VIP / 传送 / 椅子 / 侧边栏 / 商城` 六个页签，每页只展示一个插件的分区；页签会记住上次选择（`localStorage`），切页时只重新加载该插件的状态与配置。

安全说明：密码在游戏内由玩家自行设置，**设密码时是 OP 才会记为管理员**；角色是设置时刻的快照，之后被撤 OP 仍是管理员、新授 OP 也需重新执行一次 `/panel passwd` 才会升为管理员。密码以 PBKDF2-SHA256（12 万轮加盐）存于插件目录 `passwords.json`。面板走 HTTP，公网部署请自行加 HTTPS/反代。

## 管理接口一览

| 分区 | 接口 |
| --- | --- |
| 服务器核心 `LuckyCloverCore` | 配置读写、每日任务、禁言列表/解除、主城区域、在线时长排行 |
| 头衔·VIP `LuckyCloverVIP` | VIP 列表/设置/移除、头衔设置/清除、显示名设置/清除、飞行查询 |
| 传送 `LuckyCloverTPA` | Warp 列表/删除、Home 查询/清空、挂起请求 |
| 椅子 `LuckyCloverSeat` | 状态、默认开关、一键清理座位实体 |
| 侧边栏 `LuckyCloverSidebar` | 状态/指标、配置读写、渲染预览、主页/排行页切换 |
| 商城 `LuckyCloverShoppingMall` | 状态/概览、玩家店铺（开关/查看货架/下架/删除）、官方在售与回收清单（上架/改价/改库存/下架/**勾选批量改价·打折·下架**）、求购订单（查看/取消退款）、玩家仓库（查看）、分类、禁售物品、交易日志、排行榜、税收设置、配置读写 |

- HTTP 面：`GET /api/overview`（公开）、`GET /api/auth/status`、`POST /api/auth/login`（账号密码）、`POST /api/auth/logout`、`POST /api/admin/invoke`（需会话头 `X-Panel-Session`，方法名强制 `^mgmt` 白名单）。
- 玩家商城面：`GET /api/market`（公开，只读查询官方出售、回收清单、玩家店铺）。

## 演示模式

前端直连失败（先开网页后开服、或纯静态预览）会自动进入演示模式：概览展示示例数据、管理分区返回演示响应，顶部出现黄色提示条。恢复服务后刷新页面即回实时。

## 已知限制

- 登录会话保存在内存中，服务器重启后需要重新登录（密码本身持久化在 `passwords.json`，不受影响）。
- 「游戏时间 / 种子」依赖运行环境 API（`mc.getDayTime` / `server.properties`），取不到显示 `—`。
- 跨引擎调用（quickjs 插件导出 → nodejs 面板导入）依赖 LSE 统一导出注册表，以启动日志的连通自检为准。
- 密码由游戏内 OP 命令设置，远程无法凭空创建账号；登录失败有 800ms 延迟（防暴力枚举），公网部署建议再加反代层限流。

## 版本

`1.3.0`
