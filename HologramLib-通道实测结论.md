# HologramLib 协议渲染通道实测结论（2026-09-30）

> 起因：想用 HologramLib 实现「玩家描边/ESP」。5 轮探针实测后收官，结论如下。
> 探针插件 `LuckyClover-ShapeProbe`（`/shapetest`、`/shapetest clear`）保留在测试服，随时可复测。

## 环境

- 服务端：BDS 1.26.51 / LeviLamina 26.51.5
- HologramLib **26.51.0**（release 说明"适配 LeviLamina 26.51.x"；sha256 与官方 digest 一致）
- 安装：`D:\Bedrock-server\plugins\HologramLib\`；备份 `.hologramlib-dl\HologramLib-26.51.0.zip`
- 26.40.4 在 1.26.51 上会缺符号（`ItemInstance::ItemInstance`）+ 发包客户端闪退——必须用 26.51.x
- 下载注意：GitHub 主站直连超时走 `api.github.com` asset 端点重定向即可；加速器会劫持 hosts

## 通道实测矩阵

| 通道 | 渲染 | 穿墙 | 关键细节 |
|---|---|---|---|
| 形状线框 box/line | ✅ | ✗ 深度测试 | 颜色按 RGBA 文档传但**实际 R/B 交换**（传红出蓝，交换传参即正常）；`shapeUpdateToPlayer` 同 id 原地更新无闪烁；`drawToPlayer` 逐人白名单 |
| 形状文字 | ✅ | ✗ 深度测试 | 样式=普通白字，与全息无法区分 |
| `holo*` 悬浮字 | ✅ | ✗ 深度测试 | 与形状疑似共用渲染路径；**文字自带深色底板且无 API 关闭**；`holoSetFollowPlayer` 可用但 `holoTick(delta)` 步进单位按 tick（传 1.0 不是 0.05） |
| HL 合成实体 `entity*` | ✅ | ✗（名牌悬停显示） | 创建/白名单/骑乘 `entitySetRidePlayer`（挂玩家头，服务端驱动平滑）全部服务端生效；**名牌 `nametagAlwaysShow=false`，LSE 无任何导出可改** → 准心瞄上才显示；**`entitySetInvisible(true)` 连名牌一起吞**（隐形+名牌双死） |
| `playerNpc` 假玩家 | 未测（收官） | 未知 | 名牌走真玩家渲染路径（预期常显+隔墙），但 `setPosition`=全量 respawn（RemoveActor→重发），移动目标跟踪会**闪烁**，源码注释承认高频重建有断线风险 |

## 穿墙描边的最终路线（按可行性）

1. **全员隔墙描边 → 资源包路线**：`玩家描边透视版V1.7-穿墙看人版.mcpack` 已实测通过 —— **原始需求已闭环**
2. **视线内选择性描边 → 协议路线（可行未落地）**：shape box 跟踪（`shapeSetLocation`+`shapeUpdateToPlayer` 20Hz）+ `entitySetRidePlayer` 骑乘跟随 + `drawToPlayer` 白名单；仅视线内可见
3. **服务端选择性隔墙 → 死结**：缺 `entitySetNametagAlwaysShow` 的 LSE 导出（C++ 配置字段早已存在，只差 exportTo）。等作者导出后可复活方案：**骑乘（已验证平滑）+ 常显名牌（待导出）= 完美隔墙 ESP**

## 给作者的 issue 草稿

```text
Title: LSE: export entitySetNametagAlwaysShow (CustomEntityConfig.nametagAlwaysShow)

CustomEntityConfig 已有 nametagAlwaysShow 字段，但 LSE 层没有对应导出，
entity* 名牌只能悬停显示，无法做常显名牌（隔墙名牌/标记类用途）。
建议在 CustomEntityExporter 增加 entitySetNametagAlwaysShow(id, bool)。
另：playerNpc 的 setPosition 走全量 respawn，低频跟踪会闪烁，
若能补一个基于 MoveActorAbsolute 的轻量 setPosLight 就更好了。
```

## 探针复测方法

1. 重启服务器（确认启动日志有 `正在加载 HologramLib v26.51.0`）
2. `/shapetest` 生成测试目标 → 按聊天提示观察
3. 返回值全在 `latest.log` 的 `probe-vN` 行，无需手抄
4. `/shapetest clear` 清理（实体/NPC/全息无自动时限）

## 历史轮次速查

- v1：通道打通、box 深度测试（埋地黄框被挡）、颜色异常
- v2：确认 R/B 交换补偿有效；形状文字/全息均深度测试；holo follow 不动
- v3：实体服务端创建全成功但客户端全隐身 → 暴露探针静默失败问题
- v4：全量返回值日志 `suspicious=[]`（零失败）；实体名牌悬停显示实锤；隐形吞名牌实锤
- v5：playerNpc 穿墙测试（用户决定收官，未执行）
