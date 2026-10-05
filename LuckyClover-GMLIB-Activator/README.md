# LuckyClover-GMLIB-Activator

独立激活 GMLIB 的 QuickJS 插件。

## 作用

- 声明 `GMLIB-LegacyRemoteCallApi` 前置。
- 在 `onServerStarted` 之后导入官方 `GMLIB_API-JS` 模块。
- 让其他插件可以使用已经启动的 GMLIB 导出。

## 安装

将整个 `LuckyClover-GMLIB-Activator` 目录放入服务器的 `plugins` 目录，并确认已经安装：

- `GMLIB`
- `GMLIB-LegacyRemoteCallApi`
- `legacy-script-engine-quickjs`

启动后检查日志：

```text
LuckyClover-GMLIB-Activator activated GMLIB
```

如果启动失败，查看该插件输出的错误；InventoryViewer 本身不会因此加载 GMLIB。
