# LuckyClover-Guild

轻量工会系统 MVP，提供工会创建、邀请、加入/退出、成员角色、公告、工会列表和管理接口。

## 命令

- `/guild`：打开工会菜单
- `/guild create <名称> [简称]`：创建工会
- `/guild list [关键词]`：查看工会列表
- `/guild info <工会ID>`：查看工会信息
- `/guild invite <玩家>`：邀请玩家（支持离线）
- `/guild join <工会ID>`：提交加入申请
- `/guild accept`：接受邀请
- `/guild leave`：退出工会
- `/guild notice <内容>`：修改工会公告
- `/guild fund`：打开工会公共资金
- `/guild deposit <金额>`：存入工会资金
- `/guild withdraw <金额>`：按工会支出权限支出工会资金
- `/guild promote <玩家>`：任命副会长
- `/guild demote <玩家>`：降为成员
- `/guild transfer <玩家>`：转让会长
- `/guild disband`：会长解散工会
- `/guild test-application [名称]`：OP 生成模拟入会申请，用于单人测试审核流程
- `/guild admin`：OP 工会管理（查看、修改公告、强制解散）

创建费用和成员上限等基础配置会生成在 `plugins/LuckyClover-Guild/config.json`。

每个工会默认允许所有成员支出公共资金；会长可在「公共资金 → 支出权限」中切换为仅会长和副会长可支出。旧工会没有该字段时按“所有成员可支出”处理。

玩家相关操作会优先使用在线玩家，离线玩家使用插件记录过的 XUID 和最近用户名；玩家至少进服一次后，才可以被离线邀请、任命或转让。
