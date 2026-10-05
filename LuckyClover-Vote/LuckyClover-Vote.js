const PLUGIN_NAME = "LuckyClover-Vote";
const PLUGIN_DESC = "Simple configurable voting plugin";
const PLUGIN_VERSION = [1, 0, 0];
const PLUGIN_EXTRA = {
    Author: "OpenCode",
};

const BASE_DIR = "plugins/LuckyClover-Vote/";
const CONFIG_PATH = `${BASE_DIR}config.json`;
const VOTE_DATA_PATH = `${BASE_DIR}vote.json`;
const FLOAT_TEXT_DATA_PATH = `${BASE_DIR}floattexts.json`;

let StaticFloatingText = null;
let hasGmlibFloatingText = false;
const floatTextInstances = {};

class LegacyRemoteStaticFloatingText {
    constructor(pos, text, papi) {
        this.mPosition = pos;
        this.mText = text;
        this.mPlaceholderAPI = papi !== false;
        this.mRuntimeId = ll.imports("GMLIB_API", "createFloatingText")(this.mPosition, this.mText, this.mPlaceholderAPI);
    }

    getRuntimeId() {
        return this.mRuntimeId;
    }

    getText() {
        return this.mText;
    }

    getPos() {
        return this.mPosition;
    }

    setText(newText) {
        this.mText = String(newText || "");
    }

    sendToClient(player) {
        return ll.imports("GMLIB_API", "sendFloatingTextToPlayer")(this.mRuntimeId, player);
    }

    sendToClients() {
        return ll.imports("GMLIB_API", "sendFloatingText")(this.mRuntimeId);
    }

    removeFromClient(player) {
        return ll.imports("GMLIB_API", "removeFloatingTextFromPlayer")(this.mRuntimeId, player);
    }

    removeFromClients() {
        return ll.imports("GMLIB_API", "removeFloatingText")(this.mRuntimeId);
    }

    updateClient(player) {
        return ll.imports("GMLIB_API", "updateClientFloatingTextData")(this.mRuntimeId, player);
    }

    updateClients() {
        return ll.imports("GMLIB_API", "updateAllClientsFloatingTextData")(this.mRuntimeId);
    }

    update() {
        ll.imports("GMLIB_API", "setFloatingTextData")(this.mRuntimeId, this.mText);
        return this.updateClients();
    }

    updateText(newText) {
        this.setText(newText);
        return this.update();
    }

    destroy() {
        return ll.imports("GMLIB_API", "deleteFloatingText")(this.mRuntimeId);
    }
}

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, PLUGIN_EXTRA);

logger.setTitle(PLUGIN_NAME);
File.mkdir(BASE_DIR);

const config = new JsonConfigFile(
    CONFIG_PATH,
    JSON.stringify(
        {
            playerCommand: "vote",
            adminCommand: "voteadmin",
            floatTextCommand: "floattext",
            allowRevote: true,
            resultBroadcastOnVote: false,
            floatTextYOffset: 2,
        },
        null,
        4,
    ),
);

const voteStore = new JsonConfigFile(
    VOTE_DATA_PATH,
    JSON.stringify(
        {
            title: "",
            options: [],
            active: false,
            votes: {},
            updatedAt: 0,
        },
        null,
        4,
    ),
);
const floatTextStore = new JsonConfigFile(FLOAT_TEXT_DATA_PATH, "{}");

function initConfig() {
    config.init("playerCommand", "vote");
    config.init("adminCommand", "voteadmin");
    config.init("floatTextCommand", "floattext");
    config.init("allowRevote", true);
    config.init("resultBroadcastOnVote", false);
    config.init("floatTextYOffset", 2);
}

function getFloatTextEntries() {
    const data = floatTextStore.get("all");
    return data && typeof data === "object" ? data : {};
}

function saveFloatTextEntries(entries) {
    floatTextStore.set("all", entries || {});
}

function getPoll() {
    return {
        title: String(voteStore.get("title") || ""),
        options: Array.isArray(voteStore.get("options")) ? voteStore.get("options") : [],
        active: Boolean(voteStore.get("active")),
        votes: voteStore.get("votes") || {},
        updatedAt: Number(voteStore.get("updatedAt") || 0),
    };
}

function savePoll(poll) {
    voteStore.set("title", String(poll.title || ""));
    voteStore.set("options", Array.isArray(poll.options) ? poll.options : []);
    voteStore.set("active", Boolean(poll.active));
    voteStore.set("votes", poll.votes || {});
    voteStore.set("updatedAt", Date.now());
}

function resetPoll() {
    savePoll({
        title: "",
        options: [],
        active: false,
        votes: {},
    });
}

function getVoteKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function isAdmin(player) {
    return player && player.isOP();
}

function sanitizeFloatTextId(id) {
    return String(id || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
}

function getFloatTextPos(entry) {
    return new FloatPos(Number(entry.x), Number(entry.y), Number(entry.z), Number(entry.dimid));
}

function tryLoadGmlibFloatingText() {
    if (hasGmlibFloatingText && typeof StaticFloatingText === "function") {
        return true;
    }

    const requiredExports = [
        ["GMLIB_API", "createFloatingText"],
        ["GMLIB_API", "deleteFloatingText"],
        ["GMLIB_API", "setFloatingTextData"],
        ["GMLIB_API", "sendFloatingText"],
        ["GMLIB_API", "updateAllClientsFloatingTextData"],
    ];

    for (const item of requiredExports) {
        if (!ll.hasExported(item[0], item[1])) {
            return false;
        }
    }

    StaticFloatingText = LegacyRemoteStaticFloatingText;
    hasGmlibFloatingText = true;
    return true;
}

function createRuntimeFloatText(entry) {
    if (!hasGmlibFloatingText || typeof StaticFloatingText !== "function") {
        return null;
    }

    const ft = new StaticFloatingText(getFloatTextPos(entry), String(entry.text || ""), false);
    floatTextInstances[entry.id] = ft;
    return ft;
}

function destroyRuntimeFloatText(id) {
    const ft = floatTextInstances[id];
    if (!ft) {
        return;
    }

    try {
        ft.destroy();
    } catch (_error) {}
    delete floatTextInstances[id];
}

function syncRuntimeFloatText(entry) {
    destroyRuntimeFloatText(entry.id);
    return createRuntimeFloatText(entry);
}

function restoreAllFloatTexts() {
    if (!hasGmlibFloatingText) {
        return;
    }

    const entries = getFloatTextEntries();
    for (const id in entries) {
        try {
            syncRuntimeFloatText(entries[id]);
        } catch (error) {
            logger.error(`恢复悬浮字 ${id} 失败: ${error}`);
        }
    }
}

function createFloatText(player, rawId, text) {
    const id = sanitizeFloatTextId(rawId);
    const entries = getFloatTextEntries();

    if (!id) {
        player.tell("§c请输入有效的悬浮字 ID，仅支持字母数字下划线中划线");
        return;
    }

    if (entries[id]) {
        player.tell("§c该悬浮字 ID 已存在");
        return;
    }

    const yOffset = Number(config.get("floatTextYOffset", 2)) || 0;
    const entry = {
        id,
        text,
        x: player.pos.x,
        y: player.pos.y + yOffset,
        z: player.pos.z,
        dimid: player.pos.dimid,
    };

    if (!hasGmlibFloatingText) {
        player.tell("§c未检测到 GMLIB-LegacyRemoteCallApi，无法创建悬浮字");
        return;
    }

    if (!syncRuntimeFloatText(entry)) {
        player.tell("§c悬浮字创建失败");
        return;
    }

    entries[id] = entry;
    saveFloatTextEntries(entries);
    player.tell(`§a已创建悬浮字 ${id}`);
}

function updateFloatText(player, rawId, text) {
    const id = sanitizeFloatTextId(rawId);
    const entries = getFloatTextEntries();
    const entry = entries[id];

    if (!entry) {
        player.tell("§c指定悬浮字不存在");
        return;
    }

    entry.text = text;
    entries[id] = entry;
    saveFloatTextEntries(entries);
    syncRuntimeFloatText(entry);
    player.tell(`§a已更新悬浮字 ${id}`);
}

function moveFloatTextHere(player, rawId) {
    const id = sanitizeFloatTextId(rawId);
    const entries = getFloatTextEntries();
    const entry = entries[id];

    if (!entry) {
        player.tell("§c指定悬浮字不存在");
        return;
    }

    const yOffset = Number(config.get("floatTextYOffset", 2)) || 0;
    entry.x = player.pos.x;
    entry.y = player.pos.y + yOffset;
    entry.z = player.pos.z;
    entry.dimid = player.pos.dimid;
    entries[id] = entry;
    saveFloatTextEntries(entries);
    syncRuntimeFloatText(entry);
    player.tell(`§a已将悬浮字 ${id} 移动到你当前位置`);
}

function deleteFloatText(player, rawId) {
    const id = sanitizeFloatTextId(rawId);
    const entries = getFloatTextEntries();

    if (!entries[id]) {
        player.tell("§c指定悬浮字不存在");
        return;
    }

    destroyRuntimeFloatText(id);
    delete entries[id];
    saveFloatTextEntries(entries);
    player.tell(`§a已删除悬浮字 ${id}`);
}

function listFloatTexts(player) {
    const entries = getFloatTextEntries();
    const ids = Object.keys(entries);

    if (!ids.length) {
        player.tell("§e当前没有悬浮字");
        return;
    }

    player.tell("§6悬浮字列表:");
    for (const id of ids) {
        const entry = entries[id];
        player.tell(`§b${id} §f- ${entry.text} §7(${entry.x.toFixed(1)}, ${entry.y.toFixed(1)}, ${entry.z.toFixed(1)}, dim ${entry.dimid})`);
    }
}

function showFloatTextUsage(player) {
    const command = String(config.get("floatTextCommand") || "floattext");
    player.tell(`§e/${command} create <id> <文本>`);
    player.tell(`§e/${command} set <id> <文本>`);
    player.tell(`§e/${command} movehere <id>`);
    player.tell(`§e/${command} delete <id>`);
    player.tell(`§e/${command} list`);
}

function countVotes(poll) {
    const counts = [];
    for (let i = 0; i < poll.options.length; i++) {
        counts.push(0);
    }

    for (const key in poll.votes) {
        const index = Number(poll.votes[key]);
        if (!isNaN(index) && index >= 0 && index < counts.length) {
            counts[index]++;
        }
    }

    return counts;
}

function buildResultLines(poll) {
    const counts = countVotes(poll);
    const totalVotes = counts.reduce((sum, value) => sum + value, 0);
    const lines = [];

    lines.push(`§6投票项目§f: ${poll.title || "未设置"}`);
    lines.push(`§6投票状态§f: ${poll.active ? "进行中" : "未开启/已结束"}`);
    lines.push(`§6总票数§f: ${totalVotes}`);

    for (let i = 0; i < poll.options.length; i++) {
        lines.push(`§b${i + 1}. §f${poll.options[i]} §7- §a${counts[i]}票`);
    }

    return lines;
}

function showPoll(player) {
    const poll = getPoll();

    if (!poll.title || !poll.options.length) {
        player.tell("§e当前没有可用的投票项目");
        return;
    }

    player.tell(`§6当前投票§f: ${poll.title}`);
    player.tell(`§6状态§f: ${poll.active ? "进行中" : "未开启/已结束"}`);
    for (let i = 0; i < poll.options.length; i++) {
        player.tell(`§b${i + 1}. §f${poll.options[i]}`);
    }

    if (poll.active) {
        player.tell(`§a使用 /${config.get("playerCommand")} <编号> 进行投票`);
    }
}

function showResults(player) {
    const poll = getPoll();

    if (!poll.title || !poll.options.length) {
        player.tell("§e当前没有投票结果可查看");
        return;
    }

    const lines = buildResultLines(poll);
    for (const line of lines) {
        player.tell(line);
    }
}

function handleVote(player, optionText) {
    const poll = getPoll();

    if (!poll.active) {
        player.tell("§e当前没有正在进行的投票");
        return;
    }

    if (!poll.options.length) {
        player.tell("§c当前投票没有可选项");
        return;
    }

    const optionIndex = Number(optionText) - 1;
    if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
        player.tell("§c请输入正确的投票编号");
        return;
    }

    const key = getVoteKey(player);
    const allowRevote = Boolean(config.get("allowRevote"));
    if (!allowRevote && poll.votes[key] !== undefined) {
        player.tell("§c你已经投过票了，不能重复投票");
        return;
    }

    poll.votes[key] = optionIndex;
    savePoll(poll);
    player.tell(`§a投票成功，你选择了: ${poll.options[optionIndex]}`);

    if (Boolean(config.get("resultBroadcastOnVote"))) {
        mc.broadcast(`§e${player.realName} 已完成投票`, 0);
    }
}

function showPlayerUsage(player) {
    const command = String(config.get("playerCommand") || "vote");
    player.tell(`§e/${command} §7查看当前投票`);
    player.tell(`§e/${command} <编号> §7为指定选项投票`);
    player.tell(`§e/${command} result §7查看当前投票结果`);
}

function showAdminUsage(player) {
    const command = String(config.get("adminCommand") || "voteadmin");
    player.tell(`§e/${command} create <标题>`);
    player.tell(`§e/${command} add <选项内容>`);
    player.tell(`§e/${command} start`);
    player.tell(`§e/${command} end`);
    player.tell(`§e/${command} clear`);
    player.tell(`§e/${command} result`);
    player.tell(`§e/${command} info`);
}

function registerCommands() {
    const playerCommand = String(config.get("playerCommand") || "vote").trim() || "vote";
    const adminCommand = String(config.get("adminCommand") || "voteadmin").trim() || "voteadmin";
    const floatTextCommand = String(config.get("floatTextCommand") || "floattext").trim() || "floattext";

    mc.regPlayerCmd(playerCommand, "投票命令", (player, args) => {
        if (!args.length) {
            showPoll(player);
            showPlayerUsage(player);
            return;
        }

        if (String(args[0]).toLowerCase() === "result") {
            showResults(player);
            return;
        }

        handleVote(player, args[0]);
    }, 0);

    mc.regPlayerCmd(adminCommand, "投票管理命令", (player, args) => {
        if (!isAdmin(player)) {
            player.tell("§c你没有权限使用该命令");
            return;
        }

        if (!args.length) {
            showAdminUsage(player);
            return;
        }

        const action = String(args[0]).toLowerCase();
        const poll = getPoll();

        if (action === "create") {
            const title = args.slice(1).join(" ").trim();
            if (!title) {
                player.tell("§c请输入投票标题");
                return;
            }

            savePoll({
                title,
                options: [],
                active: false,
                votes: {},
            });
            player.tell(`§a已创建投票: ${title}`);
            return;
        }

        if (action === "add") {
            const option = args.slice(1).join(" ").trim();
            if (!poll.title) {
                player.tell("§c请先创建投票项目");
                return;
            }
            if (!option) {
                player.tell("§c请输入选项内容");
                return;
            }

            poll.options.push(option);
            savePoll(poll);
            player.tell(`§a已添加投票选项: ${option}`);
            return;
        }

        if (action === "start") {
            if (!poll.title) {
                player.tell("§c请先创建投票项目");
                return;
            }
            if (poll.options.length < 2) {
                player.tell("§c至少需要两个投票选项才能开始");
                return;
            }

            poll.active = true;
            poll.votes = {};
            savePoll(poll);
            mc.broadcast(`§6投票已开启§f: ${poll.title}`);
            for (let i = 0; i < poll.options.length; i++) {
                mc.broadcast(`§b${i + 1}. §f${poll.options[i]}`);
            }
            mc.broadcast(`§a使用 /${playerCommand} <编号> 进行投票`);
            return;
        }

        if (action === "end") {
            if (!poll.title) {
                player.tell("§c当前没有投票项目");
                return;
            }

            poll.active = false;
            savePoll(poll);
            mc.broadcast(`§6投票已结束§f: ${poll.title}`);
            const lines = buildResultLines(poll);
            for (const line of lines) {
                mc.broadcast(line);
            }
            return;
        }

        if (action === "clear") {
            resetPoll();
            player.tell("§a当前投票已清空");
            return;
        }

        if (action === "result") {
            showResults(player);
            return;
        }

        if (action === "info") {
            showPoll(player);
            return;
        }

        showAdminUsage(player);
    }, 1);

    mc.regPlayerCmd(floatTextCommand, "悬浮字管理命令", (player, args) => {
        if (!isAdmin(player)) {
            player.tell("§c你没有权限使用该命令");
            return;
        }

        if (!args.length) {
            showFloatTextUsage(player);
            return;
        }

        const action = String(args[0]).toLowerCase();
        const id = args[1];

        if (action === "create") {
            const text = args.slice(2).join(" ").trim();
            if (!id || !text) {
                showFloatTextUsage(player);
                return;
            }
            createFloatText(player, id, text);
            return;
        }

        if (action === "set") {
            const text = args.slice(2).join(" ").trim();
            if (!id || !text) {
                showFloatTextUsage(player);
                return;
            }
            updateFloatText(player, id, text);
            return;
        }

        if (action === "movehere") {
            if (!id) {
                showFloatTextUsage(player);
                return;
            }
            moveFloatTextHere(player, id);
            return;
        }

        if (action === "delete") {
            if (!id) {
                showFloatTextUsage(player);
                return;
            }
            deleteFloatText(player, id);
            return;
        }

        if (action === "list") {
            listFloatTexts(player);
            return;
        }

        showFloatTextUsage(player);
    }, 1);
}

initConfig();
registerCommands();

mc.listen("onServerStarted", () => {
    if (!tryLoadGmlibFloatingText()) {
        logger.warn("GMLIB-LegacyRemoteCallApi 未安装或无法导入，悬浮字功能不可用");
    }
    restoreAllFloatTexts();
    logger.info("LuckyClover-Vote loaded");
});
