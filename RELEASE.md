# GitHub 发布检查清单

## 发布前必须完成

- [ ] 确认仓库许可证，并添加根目录 `LICENSE`。
- [ ] 将本机运行配置从 Git 索引移除：`git rm --cached LuckyClover-Plugin/config.json`；保留本地文件，提交 `config.example.json`。
- [ ] 检查 Git 历史中的服务器地址、会话记录、密码和部署数据；如曾推送过敏感内容，先轮换凭据，再决定是否重写历史。
- [ ] 核对材质和音频资源的再发布许可。
- [ ] 在干净目录按 README 安装，运行受影响插件的 smoke/test 脚本。
- [ ] 发布源码仓库和部署包时分开处理；部署包不应包含生产配置、玩家数据、密码或面板会话。

## 建议的 GitHub 设置

- 开启 Issues 和 Discussions 前，先确认不在公开 Issue 中收集敏感日志。
- 添加仓库描述、主题标签和支持的 LeviLamina/LSE 版本。
- 使用 GitHub Release 附件发布经过测试的部署包，并在附件旁提供 SHA-256。
- 配置 Secret Scanning / Push Protection（若仓库计划公开）。

本文件不替代第三方资源的授权条款；每个外部资源仍需单独保留来源和许可证说明。
