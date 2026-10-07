# LuckyClover-Mod

本项目以 [MIT License](LICENSE) 发布；第三方资源仍以其各自许可证为准。

LuckyClover 基岩版服务器（BDS + **LeviLamina**）的插件、资源包与工具集合。

运行环境：LeviLamina + LegacyScriptEngine（`legacy-script-engine-quickjs` 跑绝大多数插件，`legacy-script-engine-nodejs` 跑管理面板）。

## 服务端插件

| 插件 | 版本 | 引擎 | 职责 |
| --- | --- | --- | --- |
| **LuckyClover-Plugin** | 1.4.1 | quickjs | 核心：每日任务、主城保护、电影运镜、禁言、在线时长、跨服、进服通知、onChat 聊天管线（v1.4.1 起移除 `/menu` 主菜单） |
| **LuckyClover-ShoppingMall** | 1.2.0 | quickjs | 商城：官方商店/回收、玩家店铺、个人仓库、悬赏求购、折扣、批量、交易提醒 |
| **LuckyClover-Panel** | 1.1.0 | nodejs | 网页管理面板：概览 / 商店 / 六件套管理分区（按插件分页签），`/panel passwd` 设密登录 |
| LuckyClover-VIP | 1.0.0 | quickjs | 头衔、显示名、VIP 等级、飞行 |
| LuckyClover-TPA | 1.0.0 | quickjs | TPA / Home / Warp / Back |
| LuckyClover-Seat | 1.0.0 | quickjs | 右键坐下（配套 `LuckyClover-Seat-BP`） |
| LuckyClover-Sidebar | 1.1.0 | quickjs | 侧边栏、TPS/MSPT、排行轮换 |
| LuckyClover-Wave | 1.2.2 | quickjs | 国庆尸潮守点活动 `/wave`（配套 `LuckyClover-Wave-AI`） |
| LuckyClover-Vote | 1.0.0 | quickjs | 可配置的投票插件 |
| LuckyClover-WhiteList | 1.0.0 | quickjs | HuHoBot 附属：QQ 验证码绑定白名单 |
| LuckyClover-InventoryViewer | 0.1.0 | quickjs | 查看在线/离线玩家背包 |

## 资源包 / 行为包

| 目录 | 说明 |
| --- | --- |
| `LuckyClover-Hood-BP` / `Hood-RP` | 兜帽装备（行为包 + 资源包） |
| `LuckyClover-Seat-BP` | 坐下功能配套行为包 |
| `LuckyClover-Wave-AI` | 尸潮活动的强化怪物行为包 |

## 测试

```bash
node tools/smoke_mall.js                            # 商城 92 项（全流程 + 数据迁移 + 仓库/求购/折扣/提醒）
node LuckyClover-ShoppingMall/tools/test-logic.js   # 商城 14 项经济/防刷物品回归
node LuckyClover-ShoppingMall/tools/smoke-ui.js     # 商城 29 个页面 / 全按钮点击 / 布局与图标
```

> `smoke-ui.js` 的图标贴图校验需要官方 [bedrock-samples](https://github.com/Mojang/bedrock-samples) 的
> `resource_pack/textures`；设环境变量 `BEDROCK_SAMPLES_TEXTURES` 指向它即可，**缺失时自动跳过该项校验**（其余照跑）。

## 部署

1. 把插件文件夹复制到服务器 `plugins/`，重启
2. 面板首次使用需在游戏内 `/panel passwd <密码>` 设密后登录
3. 部署包按需打包：**只含代码与静态资源**（`Items.json` / `Icons.json` 属于运行时必需，要带上）

## 构建发行包

在 Windows PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-release.ps1 -ReleaseName 20261007
```

脚本会在 `dist/release/` 生成各插件独立压缩包、完整服务器发行包和 `SHA256SUMS.txt`。运行时配置、玩家数据、密码和测试工具不会被打进包内。

## 仓库约定（`.gitignore`）

以下内容**不入库**：

- 会话记录 `session-*.md`、`2026-*.md`、`*会话记录*.md`
- 服务端运行时数据：`panel.json`、`passwords.json`、`checkins.json`、`assets/`、
  `LuckyClover-ShoppingMall/*.json`（shops/official/warehouse/requests/logs/tax …）、`migrated.flag`
- 打包产物：`*.zip`、`*.mcpack`、`国庆活动部署包/`
- IDE 与本机痕迹：`.idea/ .claude/ .agents/ .mimocode/ .reasonix/ node_modules/`、临时目录 `.tmp_oldver/`

> `LuckyClover-Plugin/config.json`、`LuckyClover-ShoppingMall/config.json` 等运行时配置不入库；请复制对应的 `config.example.json` 后按服务器环境修改。
> 发布前请确认第三方 DLL、材质和音频资源具有可再发布许可；本仓库不包含服务器运行数据、密码或会话记录。

## 文档

- 各插件目录下的 `README.md`
- `CONTRIBUTING.md` — 开发、测试与提交约定
- `SECURITY.md` — 敏感信息报告方式
