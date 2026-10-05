// LuckyCloverMC2QQ - SparkBridge3 plugin
// MC -> QQ only. This plugin never cancels onChat.

const PLUGIN = "LuckyCloverMC2QQ";
logger.setTitle(PLUGIN);

const configFile = spark.getFileHelper(PLUGIN);

configFile.initFile("config.json", {
    QQChat: spark.env.get("main_group"),
    Debug: true,
    Server: {
        name: "LuckyClover",
        messagePrefix: "[{server}] "
    },
    MC2QQ: {
        Chat: false,
        Join: true,
        Left: true,
        Say: true
    },
    PrivateCommands: {
        enable: true,
        help: true,
        status: true,
        list: true
    },
    GroupCommands: {
        enable: true,
        online: true,
        onlineAliases: ["查在线", "在线", "online", "list"]
    },
    Chat: {
        skipPrefix: "+",
        stripColor: true,
        format: "[{dim}]{ping}{title}{name} >> {msg}",
        joinFormat: "{name} joined the server",
        leftFormat: "{name} left the server",
        sayFormat: "[Server] {msg}"
    },
    DimensionNames: {
        "0": "Overworld",
        "1": "Nether",
        "2": "The End"
    },
    LuckyCloverTitle: {
        enable: true,
        file: "plugins/LuckyClover-Plugin/titles.json",
        wrapper: "[{title}] ",
        empty: ""
    }
});

const config = JSON.parse(configFile.read("config.json"));
let configChanged = false;
if (!config.Server || typeof config.Server !== "object") {
    config.Server = {};
    configChanged = true;
}
if (typeof config.Server.name !== "string") {
    config.Server.name = "LuckyClover";
    configChanged = true;
}
if (typeof config.Server.messagePrefix !== "string") {
    config.Server.messagePrefix = "[{server}] ";
    configChanged = true;
}
if (!config.PrivateCommands || typeof config.PrivateCommands !== "object") {
    config.PrivateCommands = {};
    configChanged = true;
}
if (typeof config.PrivateCommands.enable !== "boolean") {
    config.PrivateCommands.enable = true;
    configChanged = true;
}
if (typeof config.PrivateCommands.help !== "boolean") {
    config.PrivateCommands.help = true;
    configChanged = true;
}
if (typeof config.PrivateCommands.status !== "boolean") {
    config.PrivateCommands.status = true;
    configChanged = true;
}
if (typeof config.PrivateCommands.list !== "boolean") {
    config.PrivateCommands.list = true;
    configChanged = true;
}
if (!config.GroupCommands || typeof config.GroupCommands !== "object") {
    config.GroupCommands = {};
    configChanged = true;
}
if (typeof config.GroupCommands.enable !== "boolean") {
    config.GroupCommands.enable = true;
    configChanged = true;
}
if (typeof config.GroupCommands.online !== "boolean") {
    config.GroupCommands.online = true;
    configChanged = true;
}
if (!Array.isArray(config.GroupCommands.onlineAliases)) {
    config.GroupCommands.onlineAliases = ["查在线", "在线", "online", "list"];
    configChanged = true;
}
if (configChanged) {
    configFile.write("config.json", JSON.stringify(config, null, 4));
}

spark.web.createConfig(PLUGIN)
    .number("QQChat", config.QQChat, "Target QQ group")
    .switch("Debug", config.Debug, "Debug logs")
    .text("Server.name", config.Server.name, "Server display name")
    .text("Server.messagePrefix", config.Server.messagePrefix, "QQ message prefix")
    .switch("MC2QQ.Chat", config.MC2QQ.Chat, "Forward player chat")
    .switch("MC2QQ.Join", config.MC2QQ.Join, "Forward join")
    .switch("MC2QQ.Left", config.MC2QQ.Left, "Forward left")
    .switch("MC2QQ.Say", config.MC2QQ.Say, "Forward console say")
    .switch("PrivateCommands.enable", config.PrivateCommands.enable, "Private message commands")
    .switch("PrivateCommands.help", config.PrivateCommands.help, "Private help command")
    .switch("PrivateCommands.status", config.PrivateCommands.status, "Private server status command")
    .switch("PrivateCommands.list", config.PrivateCommands.list, "Private player list command")
    .switch("GroupCommands.enable", config.GroupCommands.enable, "Group commands")
    .switch("GroupCommands.online", config.GroupCommands.online, "Group online command")
    .array("GroupCommands.onlineAliases", config.GroupCommands.onlineAliases, "Group online aliases")
    .text("Chat.skipPrefix", config.Chat.skipPrefix, "Skip messages with prefix")
    .switch("Chat.stripColor", config.Chat.stripColor, "Strip MC color codes")
    .text("Chat.format", config.Chat.format, "Chat format")
    .text("Chat.joinFormat", config.Chat.joinFormat, "Join format")
    .text("Chat.leftFormat", config.Chat.leftFormat, "Left format")
    .text("Chat.sayFormat", config.Chat.sayFormat, "Console say format")
    .switch("LuckyCloverTitle.enable", config.LuckyCloverTitle.enable, "Read LuckyClover titles")
    .text("LuckyCloverTitle.file", config.LuckyCloverTitle.file, "LuckyClover titles file")
    .text("LuckyCloverTitle.wrapper", config.LuckyCloverTitle.wrapper, "Title wrapper")
    .text("LuckyCloverTitle.empty", config.LuckyCloverTitle.empty, "Empty title text")
    .register();

spark.on(`config.update.${PLUGIN}`, (key, val) => {
    const keys = key.split(".");
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") {
            obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = val;
    configFile.write("config.json", JSON.stringify(config, null, 4));
    logger.info(`Config updated: ${key}=${val}`);
});

function debug(msg) {
    if (config.Debug) {
        logger.info(`[Debug] ${msg}`);
    }
}

let botOnline = false;

spark.on("core.ready", () => {
    debug("core.ready");
});

spark.on("bot.online", () => {
    botOnline = true;
    logger.info("QQ bot is online.");
});

function readJsonFile(path, fallback) {
    try {
        if (typeof File === "undefined" || !File.exists(path)) {
            return fallback;
        }
        const text = File.readFrom(path);
        if (!text) {
            return fallback;
        }
        return JSON.parse(text);
    } catch (e) {
        logger.warn(`Failed to read JSON: ${path} ${e}`);
        return fallback;
    }
}

function stripColor(text) {
    return String(text || "")
        .replace(/\u00A7[0-9a-fk-or]/gi, "")
        .replace(/&[0-9a-fk-or]/gi, "");
}

function cleanForQQ(text) {
    const value = String(text || "");
    return config.Chat.stripColor ? stripColor(value) : value;
}

function getTitleKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function getLuckyCloverTitle(player) {
    if (!config.LuckyCloverTitle.enable) {
        return "";
    }
    const titles = readJsonFile(config.LuckyCloverTitle.file, {});
    const title = titles[getTitleKey(player)];
    return typeof title === "string" ? title : "";
}

function renderTitle(player) {
    const title = getLuckyCloverTitle(player);
    if (!title) {
        return config.LuckyCloverTitle.empty || "";
    }
    return String(config.LuckyCloverTitle.wrapper || "{title}").split("{title}").join(title);
}

function getDimName(player) {
    const id = player && player.pos ? String(player.pos.dimid) : "";
    return config.DimensionNames[id] || "Unknown";
}

function getPingText(player) {
    try {
        const device = player.getDevice ? player.getDevice() : null;
        const ping = device ? Number(device.avgPing) : 0;
        return ping > 100 ? `[${ping}ms]` : "";
    } catch (e) {
        return "";
    }
}

function getServerName() {
    return String((config.Server && config.Server.name) || "LuckyClover");
}

function format(template, player, msg) {
    return cleanForQQ(String(template || "")
        .split("{server}").join(getServerName())
        .split("{dim}").join(getDimName(player))
        .split("{ping}").join(getPingText(player))
        .split("{title}").join(renderTitle(player))
        .split("{name}").join(player ? player.realName : "")
        .split("{msg}").join(msg || ""));
}

function formatOutgoingMessage(msg) {
    const text = cleanForQQ(msg);
    const prefix = String((config.Server && config.Server.messagePrefix) || "");
    if (!prefix) {
        return text;
    }
    return prefix
        .split("{server}").join(getServerName())
        .split("{msg}").join(text) + (prefix.includes("{msg}") ? "" : text);
}

function getOnlinePlayers() {
    try {
        const players = mc.getOnlinePlayers ? mc.getOnlinePlayers() : [];
        return Array.isArray(players) ? players : [];
    } catch (e) {
        logger.warn(`Failed to read online players: ${e}`);
        return [];
    }
}

function getServerVersionText() {
    try {
        if (!mc.getBDSVersion) {
            return "Unknown";
        }
        const protocol = mc.getServerProtocolVersion ? mc.getServerProtocolVersion() : "";
        return protocol ? `${mc.getBDSVersion()} (${protocol})` : String(mc.getBDSVersion());
    } catch (e) {
        return "Unknown";
    }
}

function getGameDayText() {
    try {
        return mc.getTime ? String(mc.getTime(2)) : "Unknown";
    } catch (e) {
        return "Unknown";
    }
}

function buildPlayerListText() {
    const players = getOnlinePlayers();
    if (!players.length) {
        return "当前没有玩家在线。";
    }
    return `在线玩家 ${players.length} 人：\n${players.map((player) => `- ${player.realName}`).join("\n")}`;
}

function buildOnlineListText() {
    const players = getOnlinePlayers();
    if (!players.length) {
        return "当前没有玩家在线。";
    }
    return [
        `在线玩家：${players.length}`,
        "玩家列表：",
        ...players.map((player) => `- ${player.realName}`)
    ].join("\n");
}

function buildServerStatusText() {
    const players = getOnlinePlayers();
    const names = players.map((player) => player.realName).join(", ") || "无";
    return [
        `${getServerName()} 服务器状态`,
        `在线玩家：${players.length}`,
        `玩家列表：${names}`,
        `游戏天数：${getGameDayText()}`,
        `BDS版本：${getServerVersionText()}`
    ].join("\n");
}

function buildPrivateHelpText() {
    return [
        "LuckyClover 私聊命令",
        "查服 / status - 查看服务器状态",
        "在线 / list - 查看在线玩家",
        "帮助 / help - 查看帮助"
    ].join("\n");
}

function getRawMessage(pack) {
    if (!pack) {
        return "";
    }
    if (typeof pack.raw_message === "string") {
        return pack.raw_message;
    }
    if (typeof pack.message === "string") {
        return pack.message;
    }
    if (Array.isArray(pack.message)) {
        return pack.message
            .filter((item) => item && item.type === "text" && item.data)
            .map((item) => item.data.text || "")
            .join("");
    }
    return "";
}

function normalizePrivateCommand(text) {
    return String(text || "").trim().replace(/^\//, "").toLowerCase();
}

function normalizeCommand(text) {
    return String(text || "").trim().replace(/^\//, "").toLowerCase();
}

function getTargetGroup() {
    return config.QQChat || spark.env.get("main_group");
}

function isTargetGroup(groupId) {
    const targetGroup = getTargetGroup();
    return targetGroup && String(groupId) === String(targetGroup);
}

function isAliasMatch(cmd, aliases) {
    if (!Array.isArray(aliases)) {
        return false;
    }
    return aliases.map((item) => normalizeCommand(item)).includes(cmd);
}

function handleGroupCommand(pack) {
    if (!config.GroupCommands || config.GroupCommands.enable === false) {
        return false;
    }
    if (!pack || !isTargetGroup(pack.group_id)) {
        return false;
    }

    const cmd = normalizeCommand(getRawMessage(pack));
    if (!cmd) {
        return false;
    }

    if (config.GroupCommands.online && isAliasMatch(cmd, config.GroupCommands.onlineAliases)) {
        debug(`group online command from ${pack.user_id || "unknown"}: ${cmd}`);
        return sendGroupMsg(buildOnlineListText(), "group-online");
    }
    return false;
}

const recentPrivateCommands = {};

function getPrivateCommandKey(pack, raw) {
    const userId = pack && pack.user_id ? String(pack.user_id) : "unknown";
    const messageId = pack && pack.message_id ? String(pack.message_id) : "";
    return `${userId}:${messageId || raw}`;
}

function shouldSkipDuplicatePrivateCommand(pack, raw) {
    const key = getPrivateCommandKey(pack, raw);
    const now = Date.now();
    if (recentPrivateCommands[key] && now - recentPrivateCommands[key] < 3000) {
        return true;
    }
    recentPrivateCommands[key] = now;
    Object.keys(recentPrivateCommands).forEach((item) => {
        if (now - recentPrivateCommands[item] > 10000) {
            delete recentPrivateCommands[item];
        }
    });
    return false;
}

function replyPrivate(pack, reply, text) {
    if (typeof reply === "function") {
        reply(text);
        return true;
    }
    if (spark.QClient && typeof spark.QClient.sendPrivateMsg === "function" && pack && pack.user_id) {
        spark.QClient.sendPrivateMsg(pack.user_id, text);
        return true;
    }
    logger.warn("No private reply method is available.");
    return false;
}

function handlePrivateCommand(pack, reply) {
    if (!config.PrivateCommands || config.PrivateCommands.enable === false) {
        return false;
    }

    const raw = getRawMessage(pack);
    const cmd = normalizePrivateCommand(raw);
    if (!cmd) {
        return false;
    }
    if (shouldSkipDuplicatePrivateCommand(pack, raw)) {
        debug(`skip duplicate private command: ${raw}`);
        return true;
    }

    debug(`private ${pack && pack.user_id ? pack.user_id : "unknown"} sub=${pack && pack.sub_type ? pack.sub_type : "unknown"}: ${raw}`);

    if (config.PrivateCommands.help && ["help", "帮助", "菜单", "指令"].includes(cmd)) {
        return replyPrivate(pack, reply, buildPrivateHelpText());
    }

    if (config.PrivateCommands.status && ["查服", "status", "server", "服务器"].includes(cmd)) {
        return replyPrivate(pack, reply, buildServerStatusText());
    }

    if (config.PrivateCommands.list && ["查在线", "在线", "list", "玩家", "online"].includes(cmd)) {
        return replyPrivate(pack, reply, buildOnlineListText());
    }
    return false;
}

function sendGroupMsg(msg, source) {
    const targetGroup = getTargetGroup();
    if (!targetGroup) {
        logger.warn("QQChat is not configured. Set QQChat or env main_group.");
        return false;
    }
    if (!spark.QClient || typeof spark.QClient.sendGroupMsg !== "function") {
        logger.error("spark.QClient.sendGroupMsg is not available. Is SparkBridge QQ client loaded?");
        return false;
    }
    if (!botOnline) {
        debug("QQ bot.online has not been received yet; trying to send anyway.");
    }
    const outgoingMsg = formatOutgoingMessage(msg);
    debug(`send ${source || "msg"} -> group ${targetGroup}: ${outgoingMsg}`);
    try {
        const result = spark.QClient.sendGroupMsg(targetGroup, outgoingMsg);
        debug(`send result: ${result === undefined ? "undefined" : JSON.stringify(result)}`);
        return true;
    } catch (e) {
        logger.error(`sendGroupMsg failed: ${e}`);
        return false;
    }
}

let isReloading = false;

logger.info(`Loaded. QQChat=${config.QQChat}, Chat=${config.MC2QQ.Chat}, Join=${config.MC2QQ.Join}, Left=${config.MC2QQ.Left}, Say=${config.MC2QQ.Say}`);

if (config.MC2QQ.Chat) {
    mc.listen("onChat", (player, msg) => {
        debug(`onChat ${player.realName}: ${msg}`);
        const skipPrefix = String(config.Chat.skipPrefix || "");
        if (skipPrefix && String(msg || "").startsWith(skipPrefix)) {
            debug("skip by prefix");
            return;
        }
        sendGroupMsg(format(config.Chat.format, player, msg), "chat");
    });
}

if (config.MC2QQ.Join) {
    mc.listen("onJoin", (player) => {
        if (isReloading) return;
        sendGroupMsg(format(config.Chat.joinFormat, player, ""), "join");
    });
}

if (config.MC2QQ.Left) {
    mc.listen("onLeft", (player) => {
        if (isReloading) return;
        sendGroupMsg(format(config.Chat.leftFormat, player, ""), "left");
    });
}

if (config.MC2QQ.Say) {
    mc.listen("onConsoleCmd", (cmd) => {
        if (!String(cmd || "").startsWith("say ")) return;
        const msg = String(cmd).slice(4);
        sendGroupMsg(cleanForQQ(String(config.Chat.sayFormat || "{msg}").split("{msg}").join(msg)), "say");
    });
}

spark.on("message.group.normal", (pack) => {
    try {
        handleGroupCommand(pack);
    } catch (e) {
        logger.error(`group command failed: ${e}`);
    }
});

function listenPrivateCommandEvent(eventName) {
    spark.on(eventName, (pack, reply) => {
        try {
            debug(`event ${eventName}`);
            handlePrivateCommand(pack, reply);
        } catch (e) {
            logger.error(`private command failed on ${eventName}: ${e}`);
            try {
                replyPrivate(pack, reply, "命令处理失败，请稍后再试。");
            } catch (_ignored) {
            }
        }
    });
}

[
    "message.private.friend",
    "message.private.group",
    "message.private.other",
    "message.private.normal",
    "message.private"
].forEach(listenPrivateCommandEvent);

spark.on("gocq.pack", (pack) => {
    try {
        if (!pack || pack.post_type !== "message") {
            return;
        }
        debug(`gocq message type=${pack.message_type || "unknown"} sub=${pack.sub_type || "unknown"} user=${pack.user_id || "unknown"} raw=${getRawMessage(pack)}`);
        if (pack.message_type !== "private") {
            return;
        }
        debug(`event gocq.pack private sub=${pack.sub_type || "unknown"}`);
        handlePrivateCommand(pack, null);
    } catch (e) {
        logger.error(`private command failed on gocq.pack: ${e}`);
    }
});

ll.exports((msg) => {
    sendGroupMsg(cleanForQQ(msg), "export");
}, PLUGIN, "send");

mc.listen("onConsoleCmd", (cmd) => {
    if (String(cmd || "").startsWith("lcqqtest")) {
        const msg = String(cmd).slice("lcqqtest".length).trim() || "LuckyCloverMC2QQ test";
        const ok = sendGroupMsg(msg, "test");
        logger.info(`lcqqtest ${ok ? "sent" : "failed"}. QQChat=${config.QQChat || spark.env.get("main_group")}, botOnline=${botOnline}, hasQClient=${!!spark.QClient}`);
        return;
    }

    if (String(cmd || "") === "lcqqdiag") {
        logger.info(`diag QQChat=${config.QQChat || spark.env.get("main_group")}, botOnline=${botOnline}, hasQClient=${!!spark.QClient}, hasSend=${!!(spark.QClient && spark.QClient.sendGroupMsg)}, Chat=${config.MC2QQ.Chat}`);
        return;
    }

    if (cmd === "ll reload sparkbridge3") {
        isReloading = true;
    }
});
