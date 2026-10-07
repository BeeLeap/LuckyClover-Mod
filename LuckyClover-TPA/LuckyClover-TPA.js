// LuckyClover-TPA.js
// 从 LuckyClover-Plugin 拆出：TPA / Home / Warp / Back 传送系统 + 聊天文本输入交互
const PLUGIN_NAME = "LuckyClover-TPA";
const PLUGIN_DESC = "Teleport system: TPA, Home, Warp, Back";
const PLUGIN_VERSION = [1, 0, 0];
const PLUGIN_EXTRA = {
    Author: "Mell",
};

const NAMESPACE = "LuckyCloverTPA";
const VIP_NAMESPACE = "LuckyCloverVIP";

const BASE_DIR = "plugins/LuckyClover-TPA/";
const CONFIG_PATH = `${BASE_DIR}config.json`;
const TELEPORT_DATA_PATH = `${BASE_DIR}teleports.json`;

const OLD_BASE_DIR = "plugins/LuckyClover-Plugin/";

const TEXTURE_FORM_LIST = "/L ";
const TEXTURE_FORM_TEXT = "/TEXT ";
const CONFIG_KEYS = ["teleport"];

const pendingTeleportRequests = {};
const pendingTextInputs = {};
const vipApiCache = {};

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, PLUGIN_EXTRA);

logger.setTitle(PLUGIN_NAME);

function exportApi(name, fn) {
    ll.export(fn, NAMESPACE, name);
}
File.mkdir(BASE_DIR);

// === helpers ===
function escapeCmdString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizePlayerCmdArgs(args) {
    if (Array.isArray(args)) {
        return args;
    }

    const text = String(args || "").trim();
    return text ? text.split(/\s+/) : [];
}

function findOnlinePlayerByName(input) {
    const query = String(input || "").trim();
    if (!query) {
        return null;
    }

    const direct = mc.getPlayer(query);
    if (direct) {
        return direct;
    }

    const lowered = query.toLowerCase();
    const players = mc.getOnlinePlayers();
    for (const player of players) {
        if (String(player.realName || "").toLowerCase() === lowered) {
            return player;
        }
    }

    for (const player of players) {
        if (String(player.realName || "").toLowerCase().indexOf(lowered) >= 0) {
            return player;
        }
    }

    return null;
}

function normalizeTextureButtonText(text, index) {
    const value = String(text || "").trim();
    return value || `button_${index + 1}`;
}

function buildTextureFormTitle(prefix, displayTitle) {
    const suffix = String(displayTitle || "").trim();
    return suffix || "Menu";
}

function jsonOk(extra) {
    return JSON.stringify(Object.assign({ ok: true }, extra || {}));
}

function jsonError(error) {
    return JSON.stringify({ ok: false, error: String(error || "unknown error") });
}

// === cross-plugin import (lazy, never caches failure) ===
function importVip(name) {
    if (Object.prototype.hasOwnProperty.call(vipApiCache, name)) {
        return vipApiCache[name];
    }

    let fn = null;
    try {
        if (typeof ll.hasExported !== "function" || ll.hasExported(VIP_NAMESPACE, name)) {
            const imported = ll.imports(VIP_NAMESPACE, name);
            if (typeof imported === "function") {
                fn = imported;
            }
        }
    } catch (error) {
        fn = null;
    }

    if (fn) {
        vipApiCache[name] = fn;
    }
    return fn;
}

// VIP 缺席时的本地降级：OP 不限、普通玩家用基础配置
function getMaxHomes(player) {
    const base = Math.max(1, Math.floor(Number(getTeleportConfig().maxHomes) || 3));
    const fn = importVip("getMaxHomes");
    if (fn) {
        try {
            return fn(player, base);
        } catch (error) {
            logger.warn(`VIP getMaxHomes failed: ${error}`);
        }
    }
    if (player && typeof player.isOP === "function" && player.isOP()) {
        return Number.MAX_SAFE_INTEGER;
    }
    return base;
}

function getTpTimeoutSeconds(player) {
    const base = Math.max(5, Math.floor(Number(getTeleportConfig().requestTimeoutSeconds) || 60));
    const fn = importVip("getTpTimeoutSeconds");
    if (fn) {
        try {
            return fn(player, base);
        } catch (error) {
            logger.warn(`VIP getTpTimeoutSeconds failed: ${error}`);
        }
    }
    return base;
}

// === data / config migration ===
function fileExists(path) {
    try {
        if (typeof fs !== "undefined" && typeof fs.exists === "function") {
            return fs.exists(path);
        }
    } catch (error) {
        return false;
    }
    return false;
}

function readFileText(path) {
    try {
        if (typeof fs !== "undefined" && typeof fs.read === "function") {
            return fs.read(path);
        }
    } catch (error) {
        return null;
    }
    return null;
}

function writeFileText(path, text) {
    try {
        if (typeof fs !== "undefined" && typeof fs.write === "function") {
            fs.write(path, text);
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

function migrateDataFiles() {
    if (typeof fs === "undefined" || typeof fs.exists !== "function" || typeof fs.read !== "function") {
        logger.warn("fs API unavailable, data migration skipped - copy teleports.json manually if upgrading");
        return;
    }

    const name = "teleports.json";
    const oldPath = OLD_BASE_DIR + name;
    const newPath = BASE_DIR + name;
    if (fileExists(oldPath) && !fileExists(newPath)) {
        const text = readFileText(oldPath);
        if (text !== null && writeFileText(newPath, text)) {
            logger.info("Migrated data file from LuckyClover-Plugin: teleports.json");
        }
    }
}

function buildDefaultConfig() {
    const defaults = {
        teleport: {
            enabled: true,
            requestTimeoutSeconds: 60,
            maxHomes: 3,
            tpaCommand: "tpa",
            tpacceptCommand: "tpaccept",
            tpdenyCommand: "tpdeny",
            tpacancelCommand: "tpacancel",
            backCommand: "back",
            homeCommand: "home",
            warpCommand: "warp",
        },
    };

    if (fileExists(CONFIG_PATH)) {
        return defaults;
    }

    const oldText = readFileText(OLD_BASE_DIR + "config.json");
    if (!oldText) {
        return defaults;
    }

    try {
        const oldConfig = JSON.parse(oldText);
        if (oldConfig.teleport !== undefined) {
            defaults.teleport = oldConfig.teleport;
        }
        logger.info("Migrated config keys from LuckyClover-Plugin/config.json");
    } catch (error) {
        logger.warn(`Failed to migrate config from LuckyClover-Plugin: ${error}`);
    }
    return defaults;
}

migrateDataFiles();

const config = new JsonConfigFile(CONFIG_PATH, JSON.stringify(buildDefaultConfig(), null, 4));

function initConfig() {
    config.init("teleport", {
        enabled: true,
        requestTimeoutSeconds: 60,
        maxHomes: 3,
        tpaCommand: "tpa",
        tpacceptCommand: "tpaccept",
        tpdenyCommand: "tpdeny",
        tpacancelCommand: "tpacancel",
        backCommand: "back",
        homeCommand: "home",
        warpCommand: "warp",
    });
}

initConfig();

const teleportStore = new JsonConfigFile(
    TELEPORT_DATA_PATH,
    JSON.stringify({ homes: {}, warps: {}, back: {} }, null, 4),
);

// === config getters ===
function getTeleportConfig() {
    const teleport = config.get("teleport", {});
    return teleport && typeof teleport === "object" ? teleport : {};
}

function getTeleportCommandName(key, fallback) {
    return String(getTeleportConfig()[key] || fallback).trim() || fallback;
}

// === store ===
function getTeleportPlayerKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function normalizeTeleportStoreObject(key) {
    const data = teleportStore.get(key);
    if (data && typeof data === "object") {
        return data;
    }
    teleportStore.set(key, {});
    return {};
}

function getTeleportHomes() {
    return normalizeTeleportStoreObject("homes");
}

function saveTeleportHomes(homes) {
    teleportStore.set("homes", homes);
}

function getTeleportWarps() {
    return normalizeTeleportStoreObject("warps");
}

function saveTeleportWarps(warps) {
    teleportStore.set("warps", warps);
}

function getTeleportBackData() {
    return normalizeTeleportStoreObject("back");
}

function saveTeleportBackData(back) {
    teleportStore.set("back", back);
}

// === positions ===
function captureTeleportPos(player) {
    const pos = player.pos;
    return {
        x: Number(pos.x),
        y: Number(pos.y) - 0.5,
        z: Number(pos.z),
        dimid: Math.floor(Number(pos.dimid) || 0),
        name: player.realName,
        createdAt: Date.now(),
        yMode: "feet",
    };
}

function normalizeTeleportPos(pos) {
    if (!pos || typeof pos !== "object") {
        return null;
    }

    const x = Number(pos.x);
    const y = Number(pos.y);
    const z = Number(pos.z);
    const dimid = Math.floor(Number(pos.dimid));
    if ([x, y, z, dimid].some((value) => isNaN(value))) {
        return null;
    }

    return {
        x,
        y,
        z,
        dimid,
        name: String(pos.name || ""),
        createdAt: Number(pos.createdAt) || 0,
        yMode: String(pos.yMode || ""),
    };
}

function getTeleportTargetY(pos) {
    if (!pos) {
        return 0;
    }

    if (pos.yMode === "feet" || pos.yMode === "feet_v2") {
        return pos.y;
    }

    return pos.y - 1.5;
}

function formatTeleportPos(pos) {
    const normalized = normalizeTeleportPos(pos);
    if (!normalized) {
        return "invalid";
    }
    return `dim=${normalized.dimid} X=${normalized.x.toFixed(1)} Y=${normalized.y.toFixed(1)} Z=${normalized.z.toFixed(1)}`;
}

function captureWarpPos(player) {
    const pos = captureTeleportPos(player);
    pos.ownerKey = getTeleportPlayerKey(player);
    pos.ownerName = player.realName;
    return pos;
}

function canEditWarp(player, warp) {
    if (player.isOP()) {
        return true;
    }
    if (!warp || typeof warp !== "object") {
        return false;
    }

    const ownerKey = String(warp.ownerKey || "");
    return ownerKey && ownerKey === String(getTeleportPlayerKey(player));
}

function getWarpOwnerName(warp) {
    if (!warp || typeof warp !== "object") {
        return "unknown";
    }
    return String(warp.ownerName || warp.name || "unknown");
}

function saveBackLocation(player) {
    const back = getTeleportBackData();
    back[getTeleportPlayerKey(player)] = captureTeleportPos(player);
    saveTeleportBackData(back);
}

function getSavedBackLocation(player) {
    const back = getTeleportBackData();
    return normalizeTeleportPos(back[getTeleportPlayerKey(player)]);
}

function teleportPlayerToPos(player, pos, saveBack) {
    const target = normalizeTeleportPos(pos);
    if (!target) {
        player.tell("§c目标位置无效");
        return false;
    }

    if (saveBack !== false) {
        saveBackLocation(player);
    }

    try {
        if (typeof player.teleport === "function") {
            const result = player.teleport(new FloatPos(target.x, getTeleportTargetY(target), target.z, target.dimid));
            if (result !== false) {
                return true;
            }
        }
    } catch (error) {
        logger.error(`player.teleport failed: ${error}`);
    }

    const result = mc.runcmdEx(`tp "${escapeCmdString(player.realName)}" ${target.x} ${getTeleportTargetY(target)} ${target.z}`);
    return result && result.success;
}

// === forms ===
function sendTeleportSimpleForm(player, title, content, buttons, callback) {
    const safeButtons = (buttons.length ? buttons : ["back"]).map((button, index) => normalizeTextureButtonText(button, index));
    const images = safeButtons.map(() => "");
    player.sendSimpleForm(buildTextureFormTitle(TEXTURE_FORM_LIST, title), String(content || " "), safeButtons, images, (_pl, index) => {
        if (index === null || index === undefined) {
            return;
        }
        callback(index);
    });
}

function sendTeleportConfirmForm(targetPlayer, request) {
    if (!targetPlayer || !request) {
        return;
    }

    const directionText = request.type === "toTarget"
        ? `${request.fromName} wants to teleport to you.`
        : `${request.fromName} wants you to teleport to them.`;
    sendTeleportSimpleForm(targetPlayer, "Teleport Request", directionText, ["Accept", "Deny"], (index) => {
        const current = pendingTeleportRequests[getPendingRequestKey(targetPlayer)];
        if (!current || current.fromKey !== request.fromKey || current.expiresAt !== request.expiresAt) {
            targetPlayer.tell("§cThis teleport request is no longer available");
            return;
        }

        if (index === 0) {
            acceptTeleportRequest(targetPlayer, request.fromName);
            return;
        }

        denyTeleportRequest(targetPlayer, request.fromName);
    });
}

function getPendingTextInputKey(player) {
    return getTeleportPlayerKey(player);
}

function requestTeleportTextInput(player, title, label, placeholder, defaultValue, callback) {
    try {
        if (typeof mc.newCustomForm === "function" && typeof player.sendForm === "function") {
            const form = mc.newCustomForm();
            form.setTitle(buildTextureFormTitle(TEXTURE_FORM_TEXT, title));
            form.addInput(label, placeholder || "", defaultValue || "");
            player.sendForm(form, (_pl, data) => {
                if (!data || data[0] === null || data[0] === undefined) {
                    return;
                }
                callback(String(data[0] || "").trim());
            });
            return;
        }
    } catch (error) {
        logger.error(`custom form failed: ${error}`);
    }

    pendingTextInputs[getPendingTextInputKey(player)] = {
        title,
        callback,
        expiresAt: Date.now() + 30000,
    };
    player.tell(`§e${label}`);
    player.tell("§7Please type the name in chat within 30 seconds. Type cancel to cancel.");
}

function handlePendingTeleportTextInput(player, msg) {
    const key = getPendingTextInputKey(player);
    const pending = pendingTextInputs[key];
    if (!pending) {
        return false;
    }

    delete pendingTextInputs[key];
    if (pending.expiresAt <= Date.now()) {
        player.tell("§cInput timed out");
        return true;
    }

    const text = String(msg || "").trim();
    if (!text || text.toLowerCase() === "cancel") {
        player.tell("§eInput cancelled");
        return true;
    }

    pending.callback(text);
    return true;
}

// === open forms ===
function openHomeForm(player) {
    const command = getTeleportCommandName("homeCommand", "home");
    const data = getPlayerHomeEntry(player);
    const names = Object.keys(data.entry.homes);
    const buttons = [
        "Set home here",
        "Teleport to home",
        "Delete home",
    ];
    sendTeleportSimpleForm(player, "Homes", `Homes: ${names.length ? names.join(", ") : "none"}`, buttons, (index) => {
        if (index === 0) {
            requestTeleportTextInput(player, "Set Home", "Home name", "home", "home", (name) => {
                handleHomeCommand(player, ["set", name]);
            });
            return;
        }
        if (index === 1) {
            openHomeListForm(player, "teleport");
            return;
        }
        if (index === 2) {
            openHomeListForm(player, "delete");
            return;
        }
        player.tell(`§7/${command}`);
    });
}

function openHomeListForm(player, mode) {
    const data = getPlayerHomeEntry(player);
    const names = Object.keys(data.entry.homes);
    if (!names.length) {
        player.tell("§cNo homes yet");
        return;
    }

    const title = mode === "delete" ? "Delete Home" : "Teleport Home";
    sendTeleportSimpleForm(player, title, "Select a home", names, (index) => {
        const name = names[index];
        if (!name) {
            return;
        }
        if (mode === "delete") {
            handleHomeCommand(player, ["del", name]);
            return;
        }
        handleHomeCommand(player, [name]);
    });
}

function openWarpForm(player) {
    const warps = getTeleportWarps();
    const names = Object.keys(warps);
    const editable = names.filter((name) => canEditWarp(player, warps[name]));
    const buttons = [
        "Create/update warp here",
        "Teleport to warp",
        "Delete my warp",
        "Warp info",
    ];
    sendTeleportSimpleForm(player, "Warps", `Public warps: ${names.length ? names.join(", ") : "none"}`, buttons, (index) => {
        if (index === 0) {
            requestTeleportTextInput(player, "Set Warp", "Warp name", "spawn", "", (name) => {
                handleWarpCommand(player, ["set", name]);
            });
            return;
        }
        if (index === 1) {
            openWarpListForm(player, "teleport", names);
            return;
        }
        if (index === 2) {
            openWarpListForm(player, "delete", editable);
            return;
        }
        if (index === 3) {
            openWarpListForm(player, "info", names);
        }
    });
}

function openWarpListForm(player, mode, names) {
    if (!names.length) {
        player.tell(mode === "delete" ? "§cNo editable warps" : "§cNo warps yet");
        return;
    }

    const title = mode === "delete" ? "Delete Warp" : (mode === "info" ? "Warp Info" : "Teleport Warp");
    sendTeleportSimpleForm(player, title, "Select a warp", names, (index) => {
        const name = names[index];
        if (!name) {
            return;
        }
        if (mode === "delete") {
            handleWarpCommand(player, ["del", name]);
            return;
        }
        if (mode === "info") {
            handleWarpCommand(player, ["info", name]);
            return;
        }
        handleWarpCommand(player, [name]);
    });
}

function openTpaForm(player) {
    const buttons = ["Send teleport request", "Accept request", "Deny request", "Cancel outgoing request"];
    sendTeleportSimpleForm(player, "Teleport Request", "Choose an action", buttons, (index) => {
        if (index === 0) {
            openTpaPlayerListForm(player);
            return;
        }
        if (index === 1) {
            acceptTeleportRequest(player);
            return;
        }
        if (index === 2) {
            denyTeleportRequest(player);
            return;
        }
        if (index === 3) {
            cancelTeleportRequest(player);
        }
    });
}

function openTpaPlayerListForm(player) {
    const players = mc.getOnlinePlayers().filter((target) => getTeleportPlayerKey(target) !== getTeleportPlayerKey(player));
    if (!players.length) {
        player.tell("§cNo other players online");
        return;
    }

    const buttons = players.map((target) => target.realName);
    sendTeleportSimpleForm(player, "Select Player", "Choose a target player", buttons, (index) => {
        const target = players[index];
        if (!target) {
            return;
        }
        openTpaDirectionForm(player, target);
    });
}

function openTpaDirectionForm(player, target) {
    const buttons = [
        `Teleport to ${target.realName}`,
        `Invite ${target.realName} here`,
    ];
    sendTeleportSimpleForm(player, "Teleport Direction", "Choose request direction", buttons, (index) => {
        if (index === 0) {
            createTeleportRequest(player, target, "toTarget");
            return;
        }
        if (index === 1) {
            createTeleportRequest(player, target, "toRequester");
        }
    });
}

// === requests ===
function isValidTeleportName(name) {
    return /^[a-zA-Z0-9_\-一-龥]{1,32}$/.test(String(name || ""));
}

function getPendingRequestKey(player) {
    return getTeleportPlayerKey(player);
}

function cleanupTeleportRequests() {
    const now = Date.now();
    for (const key in pendingTeleportRequests) {
        if (!pendingTeleportRequests[key] || pendingTeleportRequests[key].expiresAt <= now) {
            delete pendingTeleportRequests[key];
        }
    }
}

function getRequestTimeoutMs(player) {
    return getTpTimeoutSeconds(player) * 1000;
}

function createTeleportRequest(fromPlayer, toPlayer, type) {
    cleanupTeleportRequests();
    if (!fromPlayer || !toPlayer) {
        return false;
    }
    if (getTeleportPlayerKey(fromPlayer) === getTeleportPlayerKey(toPlayer)) {
        fromPlayer.tell("§c不能向自己发送传送请求");
        return false;
    }

    const key = getPendingRequestKey(toPlayer);
    const timeoutMs = getRequestTimeoutMs(fromPlayer);
    pendingTeleportRequests[key] = {
        fromKey: getTeleportPlayerKey(fromPlayer),
        toKey: getTeleportPlayerKey(toPlayer),
        fromName: fromPlayer.realName,
        toName: toPlayer.realName,
        type,
        expiresAt: Date.now() + timeoutMs,
    };

    if (type === "toTarget") {
        fromPlayer.tell(`§a已向 ${toPlayer.realName} 发送传送请求`);
        toPlayer.tell(`§e${fromPlayer.realName} 请求传送到你身边`);
    } else {
        fromPlayer.tell(`§a已请求 ${toPlayer.realName} 传送到你身边`);
        toPlayer.tell(`§e${fromPlayer.realName} 请求你传送到他身边`);
    }

    toPlayer.tell(`§7输入 /${getTeleportCommandName("tpacceptCommand", "tpaccept")} 接受，/${getTeleportCommandName("tpdenyCommand", "tpdeny")} 拒绝`);
    sendTeleportConfirmForm(toPlayer, pendingTeleportRequests[key]);
    setTimeout(() => {
        const current = pendingTeleportRequests[key];
        if (current && current.expiresAt <= Date.now()) {
            delete pendingTeleportRequests[key];
        }
    }, timeoutMs + 1000);
    return true;
}

function getMatchingTeleportRequest(player, fromName) {
    cleanupTeleportRequests();
    const request = pendingTeleportRequests[getPendingRequestKey(player)];
    if (!request) {
        return null;
    }

    const expected = String(fromName || "").trim().toLowerCase();
    if (expected && String(request.fromName || "").toLowerCase().indexOf(expected) < 0) {
        return null;
    }

    return request;
}

function acceptTeleportRequest(player, fromName) {
    const request = getMatchingTeleportRequest(player, fromName);
    if (!request) {
        player.tell("§c没有可接受的传送请求");
        return;
    }

    const fromPlayer = findOnlinePlayerByName(request.fromName);
    const toPlayer = findOnlinePlayerByName(request.toName);
    delete pendingTeleportRequests[getPendingRequestKey(player)];

    if (!fromPlayer || !toPlayer) {
        player.tell("§c请求玩家已离线");
        return;
    }

    if (request.type === "toTarget") {
        if (teleportPlayerToPos(fromPlayer, captureTeleportPos(toPlayer), true)) {
            fromPlayer.tell(`§a已传送到 ${toPlayer.realName} 身边`);
            toPlayer.tell(`§a已接受 ${fromPlayer.realName} 的传送请求`);
        }
        return;
    }

    if (teleportPlayerToPos(toPlayer, captureTeleportPos(fromPlayer), true)) {
        toPlayer.tell(`§a已传送到 ${fromPlayer.realName} 身边`);
        fromPlayer.tell(`§a${toPlayer.realName} 已传送到你身边`);
    }
}

function denyTeleportRequest(player, fromName) {
    const request = getMatchingTeleportRequest(player, fromName);
    if (!request) {
        player.tell("§c没有可拒绝的传送请求");
        return;
    }

    delete pendingTeleportRequests[getPendingRequestKey(player)];
    const fromPlayer = findOnlinePlayerByName(request.fromName);
    player.tell(`§e已拒绝 ${request.fromName} 的传送请求`);
    if (fromPlayer) {
        fromPlayer.tell(`§e${player.realName} 拒绝了你的传送请求`);
    }
}

function cancelTeleportRequest(player) {
    cleanupTeleportRequests();
    const key = getTeleportPlayerKey(player);
    for (const targetKey in pendingTeleportRequests) {
        const request = pendingTeleportRequests[targetKey];
        if (request && request.fromKey === key) {
            delete pendingTeleportRequests[targetKey];
            const toPlayer = findOnlinePlayerByName(request.toName);
            player.tell(`§e已取消发送给 ${request.toName} 的传送请求`);
            if (toPlayer) {
                toPlayer.tell(`§e${player.realName} 取消了传送请求`);
            }
            return;
        }
    }
    player.tell("§c你没有正在等待的传送请求");
}

function removeTeleportRequestsForPlayer(player) {
    const key = getTeleportPlayerKey(player);
    for (const targetKey in pendingTeleportRequests) {
        const request = pendingTeleportRequests[targetKey];
        if (targetKey === key || (request && (request.fromKey === key || request.toKey === key))) {
            delete pendingTeleportRequests[targetKey];
        }
    }
}

// === home / warp / back ===
function getPlayerHomeEntry(player) {
    const homes = getTeleportHomes();
    const key = getTeleportPlayerKey(player);
    if (!homes[key] || typeof homes[key] !== "object") {
        homes[key] = { name: player.realName, homes: {} };
    }
    homes[key].name = player.realName;
    if (!homes[key].homes || typeof homes[key].homes !== "object") {
        homes[key].homes = {};
    }
    return { homes, key, entry: homes[key] };
}

function handleHomeCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    const cmd = getTeleportCommandName("homeCommand", "home");
    const action = String(args[0] || "list").toLowerCase();
    const data = getPlayerHomeEntry(player);
    const playerHomes = data.entry.homes;

    if (!args.length || action === "list") {
        const names = Object.keys(playerHomes);
        player.tell(`§6Homes§f: ${names.length ? names.join(", ") : "无"}`);
        player.tell(`§7/${cmd} set <name> | /${cmd} <name> | /${cmd} del <name>`);
        return;
    }

    if (action === "set") {
        const name = String(args[1] || "home").trim();
        if (!isValidTeleportName(name)) {
            player.tell("§cHome 名称只能包含字母、数字、中文、下划线和短横线，长度 1-32");
            return;
        }
        const exists = !!playerHomes[name];
        const maxHomes = getMaxHomes(player);
        if (!exists && Object.keys(playerHomes).length >= maxHomes) {
            player.tell(`§c你的 home 数量已达上限 ${maxHomes}`);
            return;
        }
        playerHomes[name] = captureTeleportPos(player);
        saveTeleportHomes(data.homes);
        player.tell(`§a已设置 home: ${name}`);
        return;
    }

    if (action === "del" || action === "delete" || action === "remove") {
        const name = String(args[1] || "").trim();
        if (!name || !playerHomes[name]) {
            player.tell("§c指定 home 不存在");
            return;
        }
        delete playerHomes[name];
        saveTeleportHomes(data.homes);
        player.tell(`§a已删除 home: ${name}`);
        return;
    }

    const targetName = String(args[0] || "home").trim();
    const pos = normalizeTeleportPos(playerHomes[targetName]);
    if (!pos) {
        player.tell("§c指定 home 不存在");
        return;
    }
    if (teleportPlayerToPos(player, pos, true)) {
        player.tell(`§a已传送到 home: ${targetName}`);
    }
}

function handleWarpCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    const cmd = getTeleportCommandName("warpCommand", "warp");
    const action = String(args[0] || "list").toLowerCase();
    const warps = getTeleportWarps();

    if (!args.length || action === "list") {
        const names = Object.keys(warps);
        player.tell(`§6Warps§f: ${names.length ? names.join(", ") : "none"}`);
        player.tell(`§7/${cmd} set <name> | /${cmd} del <name> | /${cmd} <name>`);
        return;
    }

    if (action === "set") {
        const name = String(args[1] || "").trim();
        if (!isValidTeleportName(name)) {
            player.tell("§cWarp name can only contain letters, numbers, Chinese, underscores and hyphens, length 1-32");
            return;
        }
        if (warps[name] && !canEditWarp(player, warps[name])) {
            player.tell(`§cYou can only edit warps you created. Creator: ${getWarpOwnerName(warps[name])}`);
            return;
        }
        warps[name] = captureWarpPos(player);
        saveTeleportWarps(warps);
        player.tell(`§aPublic warp set: ${name}`);
        return;
    }

    if (action === "del" || action === "delete" || action === "remove") {
        const name = String(args[1] || "").trim();
        if (!name || !warps[name]) {
            player.tell("§cWarp not found");
            return;
        }
        if (!canEditWarp(player, warps[name])) {
            player.tell(`§cYou can only delete warps you created. Creator: ${getWarpOwnerName(warps[name])}`);
            return;
        }
        delete warps[name];
        saveTeleportWarps(warps);
        player.tell(`§aWarp deleted: ${name}`);
        return;
    }

    if (action === "info") {
        const name = String(args[1] || "").trim();
        const pos = normalizeTeleportPos(warps[name]);
        if (!pos) {
            player.tell("§cWarp not found");
            return;
        }
        player.tell(`§6${name}§f: ${formatTeleportPos(pos)}`);
        player.tell(`§7Creator: ${getWarpOwnerName(warps[name])}`);
        return;
    }

    const targetName = String(args[0] || "").trim();
    const pos = normalizeTeleportPos(warps[targetName]);
    if (!pos) {
        player.tell("§cWarp not found");
        return;
    }
    if (teleportPlayerToPos(player, pos, true)) {
        player.tell(`§aTeleported to warp: ${targetName}`);
    }
}

function handleBackCommand(player) {
    const pos = getSavedBackLocation(player);
    if (!pos) {
        player.tell("§c没有可返回的位置");
        return;
    }
    if (teleportPlayerToPos(player, pos, true)) {
        player.tell("§a已返回上一个位置");
    }
}
// === command registration ===
function registerTeleportCommands() {
    const teleportCfg = getTeleportConfig();
    if (teleportCfg.enabled === false) {
        logger.info("LuckyClover-TPA: teleport disabled in config, commands not registered");
        return;
    }

    mc.regPlayerCmd(getTeleportCommandName("tpaCommand", "tpa"), "Teleport request menu", (player) => {
        openTpaForm(player);
    }, 0);

    mc.regPlayerCmd(getTeleportCommandName("tpacceptCommand", "tpaccept"), "Accept a teleport request", (player, args) => {
        args = normalizePlayerCmdArgs(args);
        acceptTeleportRequest(player, args[0]);
    }, 0);

    mc.regPlayerCmd(getTeleportCommandName("tpdenyCommand", "tpdeny"), "Deny a teleport request", (player, args) => {
        args = normalizePlayerCmdArgs(args);
        denyTeleportRequest(player, args[0]);
    }, 0);

    mc.regPlayerCmd(getTeleportCommandName("tpacancelCommand", "tpacancel"), "取消传送请求", (player) => {
        cancelTeleportRequest(player);
    }, 0);

    mc.regPlayerCmd(getTeleportCommandName("backCommand", "back"), "返回上一个位置", (player) => {
        handleBackCommand(player);
    }, 0);

    mc.regPlayerCmd(getTeleportCommandName("homeCommand", "home"), "Home menu", (player) => {
        openHomeForm(player);
    }, 0);

    mc.regPlayerCmd(getTeleportCommandName("warpCommand", "warp"), "Warp menu", (player) => {
        openWarpForm(player);
    }, 0);
}

registerTeleportCommands();

// === runtime exports ===
// 主插件 onChat 管线首行调用；true = 消息已被文本输入框消费
exportApi("handleChatInput", (player, msg) => {
    try {
        return handlePendingTeleportTextInput(player, msg) === true;
    } catch (error) {
        logger.warn(`handleChatInput failed: ${error}`);
        return false;
    }
});

// === management exports (JSON string in/out for the web panel) ===
exportApi("mgmtGetConfig", () => {
    const result = {};
    for (const key of CONFIG_KEYS) {
        result[key] = config.get(key);
    }
    return JSON.stringify(result);
});

exportApi("mgmtSetConfig", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return jsonError("config must be a JSON object");
        }
        for (const key of Object.keys(parsed)) {
            if (CONFIG_KEYS.indexOf(key) < 0) {
                return jsonError(`unknown config key: ${key}`);
            }
        }
        for (const key of Object.keys(parsed)) {
            const incoming = parsed[key];
            const existing = config.get(key);
            // 合并写入：未提供的子键保留原值，防止整体替换丢配置
            config.set(key, (incoming && typeof incoming === "object" && !Array.isArray(incoming)
                && existing && typeof existing === "object" && !Array.isArray(existing))
                ? Object.assign({}, existing, incoming)
                : incoming);
        }
        return jsonOk();
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtReload", () => {
    try {
        if (typeof config.refresh === "function") {
            config.refresh();
        }
        return jsonOk();
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtStatus", () => {
    cleanupTeleportRequests();
    const homes = getTeleportHomes();
    const warps = getTeleportWarps();
    let pendingCount = 0;
    for (const key in pendingTeleportRequests) {
        if (pendingTeleportRequests[key]) {
            pendingCount++;
        }
    }
    let pendingInputs = 0;
    for (const key in pendingTextInputs) {
        if (pendingTextInputs[key]) {
            pendingInputs++;
        }
    }
    return JSON.stringify({
        ok: true,
        version: PLUGIN_VERSION.join("."),
        enabled: getTeleportConfig().enabled !== false,
        homeOwners: Object.keys(homes).length,
        warpCount: Object.keys(warps).length,
        pendingRequests: pendingCount,
        pendingTextInputs: pendingInputs,
    });
});

function resolvePlayerKeyParam(parsed) {
    const key = String(parsed && parsed.key || "").trim();
    if (key) {
        return key;
    }
    const name = String(parsed && parsed.name || "").trim();
    if (!name) {
        return "";
    }
    const online = findOnlinePlayerByName(name);
    if (online) {
        return getTeleportPlayerKey(online);
    }
    const homes = getTeleportHomes();
    if (homes[name]) {
        return name;
    }
    for (const homeKey in homes) {
        if (homes[homeKey] && String(homes[homeKey].name || "").toLowerCase() === name.toLowerCase()) {
            return homeKey;
        }
    }
    return name;
}

exportApi("mgmtListHomes", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const key = resolvePlayerKeyParam(parsed);
        if (!key) {
            return jsonError("name or key is required");
        }
        const homes = getTeleportHomes();
        const entry = homes[key];
        const list = [];
        if (entry && entry.homes && typeof entry.homes === "object") {
            for (const name in entry.homes) {
                list.push({ name, pos: entry.homes[name] });
            }
        }
        return JSON.stringify({ ok: true, key, name: (entry && entry.name) || key, homes: list });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtListWarps", () => {
    const warps = getTeleportWarps();
    const list = [];
    for (const name in warps) {
        list.push({
            name,
            ownerName: getWarpOwnerName(warps[name]),
            pos: warps[name],
        });
    }
    return JSON.stringify({ ok: true, warps: list });
});

exportApi("mgmtDeleteWarp", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) {
            return jsonError("name is required");
        }
        const warps = getTeleportWarps();
        if (!warps[name]) {
            return jsonError("warp not found");
        }
        delete warps[name];
        saveTeleportWarps(warps);
        return jsonOk({ name });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtClearHomes", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const key = resolvePlayerKeyParam(parsed);
        if (!key) {
            return jsonError("name or key is required");
        }
        const homes = getTeleportHomes();
        if (!homes[key]) {
            return jsonError("no homes for this player");
        }
        homes[key].homes = {};
        saveTeleportHomes(homes);
        return jsonOk({ key });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtGetPendingRequests", () => {
    cleanupTeleportRequests();
    const list = [];
    for (const key in pendingTeleportRequests) {
        const request = pendingTeleportRequests[key];
        if (request) {
            list.push({
                toKey: request.toKey,
                fromName: request.fromName,
                toName: request.toName,
                type: request.type,
                expiresAt: request.expiresAt,
            });
        }
    }
    return JSON.stringify({ ok: true, requests: list });
});

// === events ===
mc.listen("onServerStarted", () => {
    const vipConnected = importVip("getMaxHomes") !== null;
    logger.info(vipConnected
        ? "LuckyClover-TPA: VIP API connected"
        : "LuckyClover-TPA: LuckyCloverVIP not found, using base home/timeout config");
    logger.info("LuckyClover-TPA loaded");
});

mc.listen("onLeft", (player) => {
    removeTeleportRequestsForPlayer(player);
    delete pendingTextInputs[getPendingTextInputKey(player)];
});

// 玩家死亡时记录死亡点，供 /back 使用（原主插件 onMobDie 中的逻辑）
mc.listen("onMobDie", (mob) => {
    if (mob && mob.isPlayer && mob.isPlayer()) {
        const deadPlayer = mob.toPlayer();
        if (deadPlayer) {
            saveBackLocation(deadPlayer);
        }
    }
});
