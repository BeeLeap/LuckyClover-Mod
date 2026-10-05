# LuckyClover-Mod

LuckyClover 基岩版服务器（BDS + **LeviLamina**）的插件、资源包与工具集合。私有仓库。

运行环境：LeviLamina + LegacyScriptEngine（`legacy-script-engine-quickjs` 跑绝大多数插件，`legacy-script-engine-nodejs` 跑管理面板）。

## 服务端插件

| 插件 | 版本 | 引擎 | 职责 |
| --- | --- | --- | --- |
| **LuckyClover-Plugin** | 1.4.1 | quickjs | 核心：每日任务、主城保护、电影运镜、禁言、在线时长、跨服、进服通知、onChat 聊天管线（v1.4.1 起移除 `/menu` 主菜单） |
| **LuckyClover-ShoppingMall** | 1.2.0 | quickjs | 商城：官方商店/回收、玩家店铺、个人仓库、悬赏求购、折扣、批量、交易提醒；**可从旧版 ShoppingMall（子邪）自动迁移生产数据** |
| **LuckyClover-Panel** | 1.1.0 | nodejs | 网页管理面板：概览 / 商店 / 六件套管理分区（按插件分页签），`/panel passwd` 设密登录 |
| LuckyClover-VIP | 1.0.0 | quickjs | 头衔、显示名、VIP 等级、飞行 |
| LuckyClover-TPA | 1.0.0 | quickjs | TPA / Home / Warp / Back |
| LuckyClover-Seat | 1.0.0 | quickjs | 右键坐下（配套 `LuckyClover-Seat-BP`） |
| LuckyClover-Sidebar | 1.1.0 | quickjs | 侧边栏、TPS/MSPT、排行轮换 |
| LuckyClover-Wave | 1.2.2 | quickjs | 国庆尸潮守点活动 `/wave`（配套 `tools/LuckyClover-Wave-AI`） |
| LuckyClover-Vote | 1.0.0 | quickjs | 可配置的投票插件 |
| LuckyClover-WhiteList | 1.0.0 | quickjs | HuHoBot 附属：QQ 验证码绑定白名单 |
| LuckyClover-InventoryViewer | 0.1.0 | quickjs | 查看在线/离线玩家背包 |
| LuckyClover-ShapeProbe | 1.0.0 | quickjs | HologramLib PrimitiveShapes 渲染通道探针 |
| LuckyClover-GMLIB-Activator | 0.1.0 | quickjs | 为其它 QuickJS 插件激活 GMLIB |

## 资源包 / 行为包

| 目录 | 说明 |
| --- | --- |
| `DogeUI_v1.0.0/` | UI 资源包：表单/菜单/开始界面/暂停屏样式（LSE 表单标题以 `/L ` `/TEXT ` `/D ` 等前缀触发对应样式） |
| `LuckyClover-Hood-BP` / `Hood-RP` | 兜帽装备（行为包 + 资源包） |
| `LuckyClover-Seat-BP` | 坐下功能配套行为包 |
| `tools/LuckyClover-Wave-AI` | 尸潮活动的强化怪物行为包 |

## 工具与探针

- `ProtocolLibProbe` / `ProtocolLibProxy` — C++ DLL，协议层探测
- `Sign/`、`sb3_LuckyCloverMC2QQ/` — spark 平台脚本
- `tools/` — Wave 行为包构建、Dsh 会话导出、冒烟测试

## 测试

```bash
node tools/smoke_mall.js                            # 商城 92 项（全流程 + 数据迁移 + 仓库/求购/折扣/提醒）
node LuckyClover-ShoppingMall/tools/test-logic.js   # 商城 14 项经济/防刷物品回归
node LuckyClover-ShoppingMall/tools/smoke-ui.js     # 商城 29 个页面 / 全按钮点击 / 布局与图标
node smoke_vip.js                                   # VIP 27 项
node smoke_wave.js                                  # Wave 122 项
```

当前基线：**5 套全绿**。商城测试通过 stub 在 Node 里加载真实插件、驱动真实表单回调，
`JsonConfigFile` 桩按真引擎语义「每次返回新副本」，用来抓住「读一次→改→又读一次→存」这类写库 bug。

> `smoke-ui.js` 的图标贴图校验需要官方 [bedrock-samples](https://github.com/Mojang/bedrock-samples) 的
> `resource_pack/textures`；设环境变量 `BEDROCK_SAMPLES_TEXTURES` 指向它即可，**缺失时自动跳过该项校验**（其余照跑）。

## 部署

1. 把插件文件夹复制到服务器 `plugins/`，重启
2. 面板首次使用需在游戏内 `/panel passwd <密码>` 设密后登录
3. 部署包按需打包：**只含代码与静态资源**（`Items.json` / `Icons.json` 属于运行时必需，要带上）

## 仓库约定（`.gitignore`）

以下内容**不入库**：

- 会话记录 `session-*.md`、`2026-*.md`、`*会话记录*.md`
- 服务端运行时数据：`panel.json`、`passwords.json`、`checkins.json`、`assets/`、
  `LuckyClover-ShoppingMall/*.json`（shops/official/warehouse/requests/logs/tax …）、`migrated.flag`
- 打包产物：`*.zip`、`*.mcpack`、`国庆活动部署包/`
- IDE 与本机痕迹：`.idea/ .claude/ .agents/ .mimocode/ .reasonix/ node_modules/`、临时目录 `.tmp_oldver/`

> `LuckyClover-Plugin/config.json` 含服务器地址与桥接配置，**仓库为 Private**，可正常跟踪。

## 文档

- `插件拆分方案.md` — 核心插件拆分为六件套的设计与实施记录
- `HologramLib-通道实测结论.md`
- 各插件目录下的 `README.md`；`LuckyClover-ShoppingMall/README.md` 含**旧版数据迁移**完整说明与 v1.2.0 修复清单
