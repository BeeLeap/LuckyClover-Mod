# LuckyCloverMC2QQ

SparkBridge3 plugin for LuckyClover.

## Features

- Forward LuckyClover formatted MC chat to QQ through the exported `send` API.
- Forward player join/left and console `say` messages to the target QQ group.
- Private message commands through `message.private.friend`.
- Optional LuckyClover title reading from `plugins/LuckyClover-Plugin/titles.json`.

## Multi-Server Prefix

Set these options differently on each server:

```json
{
  "Server": {
    "name": "生存服",
    "messagePrefix": "[{server}] "
  }
}
```

For another server, use for example:

```json
{
  "Server": {
    "name": "模组服",
    "messagePrefix": "[{server}] "
  }
}
```

`messagePrefix` is applied at the final QQ send step, so it works for LuckyClover exported chat, join/left messages, console `say`, and test messages. It supports `{server}` and `{msg}`.

## Private Commands

Send these commands to the bot in private chat:

- `查服` / `status`: show server status.
- `在线` / `list`: show online players.
- `帮助` / `help`: show command help.

Group chat commands are not enabled by default, so the official bot group stays clean.

## Notes

When LuckyClover uses `chatFormatMode: "override"`, keep `MC2QQ.Chat` disabled in this plugin. LuckyClover will call `LuckyCloverMC2QQ.send` directly after it formats the message.
