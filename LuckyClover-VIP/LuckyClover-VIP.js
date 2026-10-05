// LuckyClover-VIP.js
// 从 LuckyClover-Plugin 拆出：头衔 + 显示名字 + VIP 等级特权 + 飞行（VIP 飞行 / 购买飞行）
const PLUGIN_NAME = "LuckyClover-VIP";
const PLUGIN_DESC = "Titles, display names, VIP privileges and flight";
const PLUGIN_VERSION = [1, 0, 0];
const PLUGIN_EXTRA = {
    Author: "Mell",
};

const NAMESPACE = "LuckyCloverVIP";
const CORE_NAMESPACE = "LuckyCloverCore";

const BASE_DIR = "plugins/LuckyClover-VIP/";
const CONFIG_PATH = `${BASE_DIR}config.json`;
const TITLE_DATA_PATH = `${BASE_DIR}titles.json`;
const CUSTOM_NAME_DATA_PATH = `${BASE_DIR}customnames.json`;
const VIP_DATA_PATH = `${BASE_DIR}vips.json`;
const FLIGHT_DATA_PATH = `${BASE_DIR}flight.json`;
const CDK_DATA_PATH = `${BASE_DIR}cdks.json`;

const OLD_BASE_DIR = "plugins/LuckyClover-Plugin/";

const WHITE_RESET = "§r§f";
const ABILITY_FLYING = 9;
const ABILITY_MAYFLY = 10;
const TEXTURE_FORM_LIST = "/L ";

const CONFIG_KEYS = ["chatFormat", "nametagFormat", "titleWrapper", "emptyTitleFallback", "vip", "fly"];
const MIGRATE_DATA_FILES = ["titles.json", "customnames.json", "vips.json", "flight.json"];

let vipFlightLoopStarted = false;
const coreApiCache = {};

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

function applyColorCodes(text) {
    return String(text)
        .replace(/§([0-9a-fk-or])/gi, "§$1")
        .replace(/&([0-9a-fk-or])/gi, "§$1");
}

function renderWhiteText(text) {
    return WHITE_RESET + String(text || "");
}

function formatDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}小时${minutes}分${seconds}秒`;
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function getDateKey(date) {
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getLatency(player) {
    try {
        const device = player.getDevice();
        if (!device) {
            return 0;
        }
        if (typeof device.lastPing === "number" && !isNaN(device.lastPing)) {
            return device.lastPing;
        }
        if (typeof device.avgPing === "number" && !isNaN(device.avgPing)) {
            return device.avgPing;
        }
    } catch (error) {
        return 0;
    }
    return 0;
}

function getDeviceOsValue(device) {
    if (!device || typeof device !== "object") {
        return null;
    }

    const candidates = [
        device.os,
        device.osType,
        device.platform,
        device.platformType,
        device.deviceOS,
    ];
    for (const value of candidates) {
        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }

    return null;
}

function formatPlayerDevice(player) {
    let device = null;
    try {
        device = player.getDevice();
    } catch (error) {
        return "未知";
    }

    const osValue = getDeviceOsValue(device);
    const osMap = {
        1: "Android",
        2: "iOS",
        3: "macOS",
        4: "FireOS",
        5: "GearVR",
        6: "HoloLens",
        7: "Windows",
        8: "Windows",
        9: "Dedicated",
        10: "tvOS",
        11: "PlayStation",
        12: "Switch",
        13: "Xbox",
        14: "Windows Phone",
        15: "Linux",
    };

    if (typeof osValue === "number" && osMap[osValue]) {
        return osMap[osValue];
    }

    const numericOs = Number(osValue);
    if (!isNaN(numericOs) && osMap[numericOs]) {
        return osMap[numericOs];
    }

    if (typeof osValue === "string" && osValue.trim()) {
        return osValue.trim();
    }

    return "未知";
}

function normalizeTextureButtonText(text, index) {
    const value = String(text || "").trim();
    return value || `button_${index + 1}`;
}

function buildTextureFormTitle(prefix, displayTitle) {
    const suffix = String(displayTitle || "").trim();
    return prefix + (suffix || "Menu");
}

function sendListForm(player, title, content, buttons, callback) {
    const safeButtons = (buttons.length ? buttons : ["back"]).map((button, index) => normalizeTextureButtonText(button, index));
    const images = safeButtons.map(() => "");
    player.sendSimpleForm(buildTextureFormTitle(TEXTURE_FORM_LIST, title), String(content || " "), safeButtons, images, (_pl, index) => {
        if (index === null || index === undefined) {
            return;
        }
        callback(index);
    });
}

// === cross-plugin import (lazy, never caches failure) ===
function importCore(name) {
    if (Object.prototype.hasOwnProperty.call(coreApiCache, name)) {
        return coreApiCache[name];
    }

    let fn = null;
    try {
        if (typeof ll.hasExported !== "function" || ll.hasExported(CORE_NAMESPACE, name)) {
            const imported = ll.imports(CORE_NAMESPACE, name);
            if (typeof imported === "function") {
                fn = imported;
            }
        }
    } catch (error) {
        fn = null;
    }

    if (fn) {
        coreApiCache[name] = fn;
    }
    return fn;
}

function getOnlineTimeColor(player) {
    const fn = importCore("getOnlineTimeColor");
    if (!fn) {
        return "";
    }
    try {
        return String(fn(player) || "");
    } catch (error) {
        return "";
    }
}

// === data migration (old LuckyClover-Plugin files -> this plugin) ===
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
        logger.warn("fs API unavailable, data migration skipped - copy titles/customnames/vips/flight json manually if upgrading");
        return;
    }

    const migrated = [];
    for (const name of MIGRATE_DATA_FILES) {
        const oldPath = OLD_BASE_DIR + name;
        const newPath = BASE_DIR + name;
        if (fileExists(oldPath) && !fileExists(newPath)) {
            const text = readFileText(oldPath);
            if (text !== null && writeFileText(newPath, text)) {
                migrated.push(name);
            }
        }
    }
    if (migrated.length) {
        logger.info(`Migrated data files from LuckyClover-Plugin: ${migrated.join(", ")}`);
    }
}

function buildDefaultConfig() {
    const defaults = {
        chatFormat: "§7[{device} {ping}ms]§r {vip}{title}{name}: {msg}",
        nametagFormat: "{title}{name}",
        titleWrapper: "[{title}] ",
        emptyTitleFallback: "",
        vip: {
            enabled: true,
            command: "vip",
            defaultLevel: "vip",
            levels: {
                vip: {
                    display: "VIP",
                    prefixColor: "§6",
                    nameColor: "§e",
                    nameColors: ["§c", "§6", "§e", "§a", "§b", "§d"],
                    maxHomes: 5,
                    dailyRewardMultiplier: 1.2,
                    teleportRequestTimeoutSeconds: 120,
                    allowFlight: true,
                    dailyFlightSeconds: 3600,
                },
                vip_plus: {
                    display: "VIP+",
                    prefixColor: "§d",
                    nameColor: "§b",
                    nameColors: ["§d", "§b", "§f", "§e", "§a", "§6"],
                    maxHomes: 10,
                    dailyRewardMultiplier: 1.5,
                    teleportRequestTimeoutSeconds: 180,
                    allowFlight: true,
                    dailyFlightSeconds: 7200,
                },
            },
        },
        fly: {
            enabled: true,
            command: "fly",
            hourPrice: 5000,
            purchaseSeconds: 3600,
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
        for (const key of CONFIG_KEYS) {
            if (oldConfig[key] !== undefined) {
                defaults[key] = oldConfig[key];
            }
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
    config.init("chatFormat", "§7[{device} {ping}ms]§r {vip}{title}{name}: {msg}");
    config.init("nametagFormat", "{title}{name}");
    config.init("titleWrapper", "[{title}] ");
    config.init("emptyTitleFallback", "");
    config.init("vip", {
        enabled: true,
        command: "vip",
        defaultLevel: "vip",
        levels: {
            vip: {
                display: "VIP",
                prefixColor: "§6",
                nameColor: "§e",
                nameColors: ["§c", "§6", "§e", "§a", "§b", "§d"],
                maxHomes: 5,
                dailyRewardMultiplier: 1.2,
                teleportRequestTimeoutSeconds: 120,
                allowFlight: true,
                dailyFlightSeconds: 3600,
            },
            vip_plus: {
                display: "VIP+",
                prefixColor: "§d",
                nameColor: "§b",
                nameColors: ["§d", "§b", "§f", "§e", "§a", "§6"],
                maxHomes: 10,
                dailyRewardMultiplier: 1.5,
                teleportRequestTimeoutSeconds: 180,
                allowFlight: true,
                dailyFlightSeconds: 7200,
            },
        },
    });
    config.init("fly", {
        enabled: true,
        command: "fly",
        hourPrice: 5000,
        purchaseSeconds: 3600,
    });
}

// === VIP 配置升级：新套餐注入 + 旧 vip/vip_plus 双池字段迁移 ===
// vip / vip_plus 仅为老玩家保留等级定义（vips.json 指向它们），price=0 表示不再售卖
const LEGACY_LEVEL_PATCH = {
    vip: { price: 0, flight5hSeconds: 600, flightWeekSeconds: 7200 },
    vip_plus: { price: 0, flight5hSeconds: 1200, flightWeekSeconds: 14400 },
};
const PACKAGE_LEVELS = {
    plus: {
        display: "VIP Plus",
        prefixColor: "§b",
        nameColor: "§b",
        nameColors: ["§b", "§f", "§e", "§a", "§d"],
        maxHomes: 15,
        dailyRewardMultiplier: 1.8,
        teleportRequestTimeoutSeconds: 240,
        allowFlight: true,
        price: 10000,
        durationDays: 30,
        flight5hSeconds: 2700,
        flightWeekSeconds: 28800,
    },
    pro_5x: {
        display: "Pro 5x",
        prefixColor: "§d",
        nameColor: "§d",
        nameColors: ["§d", "§b", "§f", "§e", "§6"],
        maxHomes: 20,
        dailyRewardMultiplier: 2.0,
        teleportRequestTimeoutSeconds: 300,
        allowFlight: true,
        price: 30000,
        durationDays: 30,
        flight5hSeconds: 5400,
        flightWeekSeconds: 144000,
    },
    pro_20x: {
        display: "Pro 20x",
        prefixColor: "§6",
        nameColor: "§6",
        nameColors: ["§6", "§e", "§a", "§b", "§f"],
        maxHomes: 99,
        dailyRewardMultiplier: 2.5,
        teleportRequestTimeoutSeconds: 600,
        allowFlight: true,
        price: 80000,
        durationDays: 30,
        flight5hSeconds: 10800,
        flightWeekSeconds: 604800,
    },
};

function ensureVipConfigUpgrade() {
    const vipCfg = getVipConfig();
    if (!vipCfg || typeof vipCfg !== "object") return;
    const levels = vipCfg.levels;
    if (!levels || typeof levels !== "object") return;
    let changed = false;

    for (const id in PACKAGE_LEVELS) {
        if (!levels[id]) {
            levels[id] = PACKAGE_LEVELS[id];
            changed = true;
        }
    }
    for (const id in LEGACY_LEVEL_PATCH) {
        if (!levels[id]) continue;
        for (const k in LEGACY_LEVEL_PATCH[id]) {
            if (levels[id][k] === undefined) {
                levels[id][k] = LEGACY_LEVEL_PATCH[id][k];
                changed = true;
            }
        }
    }
    for (const id in levels) {
        const lv = levels[id];
        if (!lv || typeof lv !== "object") continue;
        if (lv.flightWeekSeconds === undefined) {
            lv.flightWeekSeconds = Math.max(600, Number(lv.dailyFlightSeconds) || 7200);
            changed = true;
        }
        if (lv.flight5hSeconds === undefined) {
            lv.flight5hSeconds = Math.max(300, Math.round(Number(lv.flightWeekSeconds) / 6));
            changed = true;
        }
        if (lv.price === undefined) {
            lv.price = 0; // 默认不售卖，需在配置里显式定价才上架
            changed = true;
        }
        if (lv.durationDays === undefined) {
            lv.durationDays = 30;
            changed = true;
        }
    }

    // 套餐 schema 版本：版本变化时同步套餐价格/额度到已有配置（之后的手动修改在下次版本变更前不会被覆盖）
    if (Number(vipCfg.packageVersion) !== 3) {
        for (const id in PACKAGE_LEVELS) {
            if (!levels[id]) continue;
            levels[id].price = PACKAGE_LEVELS[id].price;
            levels[id].durationDays = PACKAGE_LEVELS[id].durationDays;
            levels[id].flight5hSeconds = PACKAGE_LEVELS[id].flight5hSeconds;
            levels[id].flightWeekSeconds = PACKAGE_LEVELS[id].flightWeekSeconds;
        }
        for (const id in LEGACY_LEVEL_PATCH) {
            if (!levels[id]) continue;
            levels[id].price = LEGACY_LEVEL_PATCH[id].price;
            levels[id].flight5hSeconds = LEGACY_LEVEL_PATCH[id].flight5hSeconds;
            levels[id].flightWeekSeconds = LEGACY_LEVEL_PATCH[id].flightWeekSeconds;
        }
        vipCfg.packageVersion = 3;
        changed = true;
    }

    if (changed) {
        vipCfg.levels = levels;
        config.set("vip", vipCfg);
        logger.info("VIP套餐配置已更新：plus=10000 / pro_5x=30000 / pro_20x=80000，vip/vip_plus 已下架（仅老玩家保留）");
    }
}

initConfig();
ensureVipConfigUpgrade();


const titleStore = new JsonConfigFile(TITLE_DATA_PATH, "{}");
const customNameStore = new JsonConfigFile(
    CUSTOM_NAME_DATA_PATH,
    JSON.stringify({ players: {} }, null, 4),
);
const vipStore = new JsonConfigFile(VIP_DATA_PATH, JSON.stringify({ players: {} }, null, 4));
const flightStore = new JsonConfigFile(FLIGHT_DATA_PATH, JSON.stringify({ players: {} }, null, 4));
const cdkStore = new JsonConfigFile(CDK_DATA_PATH, JSON.stringify({ codes: {} }, null, 4));

// === config getters ===
function getVipConfig() {
    const vip = config.get("vip", {});
    return vip && typeof vip === "object" ? vip : {};
}

function getFlyConfig() {
    const fly = config.get("fly", {});
    return fly && typeof fly === "object" ? fly : {};
}

function getFlyCommandName() {
    return String(getFlyConfig().command || "fly").trim() || "fly";
}

function getVipCommandName() {
    return String(getVipConfig().command || "vip").trim() || "vip";
}

function getVipLevels() {
    const levels = getVipConfig().levels;
    return levels && typeof levels === "object" ? levels : {};
}

// === title / display name storage ===
function getTitleKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function getStoredTitle(player) {
    const title = titleStore.get(getTitleKey(player));
    return typeof title === "string" ? title : "";
}

function setStoredTitle(player, title) {
    titleStore.set(getTitleKey(player), title);
}

function clearStoredTitle(player) {
    titleStore.delete(getTitleKey(player));
}

function getStoredCustomName(player) {
    const entry = customNameStore.get(getTitleKey(player));
    if (entry && typeof entry === "object" && typeof entry.name === "string") {
        return entry.name;
    }
    return "";
}

function setStoredCustomName(player, name) {
    customNameStore.set(getTitleKey(player), { name: name });
}

function clearStoredCustomName(player) {
    customNameStore.delete(getTitleKey(player));
}

// === VIP storage ===
function getVipPlayers() {
    const players = vipStore.get("players");
    if (players && typeof players === "object") {
        return players;
    }

    vipStore.set("players", {});
    return {};
}

function saveVipPlayers(players) {
    vipStore.set("players", players && typeof players === "object" ? players : {});
}

function getVipPlayerKey(player) {
    return player && (player.xuid || player.uuid || player.realName);
}

function normalizeVipEntry(entry) {
    if (!entry || typeof entry !== "object") {
        return null;
    }

    const level = String(entry.level || "").trim();
    if (!level) {
        return null;
    }

    return {
        level,
        name: String(entry.name || ""),
        expireAt: Math.max(0, Number(entry.expireAt) || 0),
        grantedAt: Math.max(0, Number(entry.grantedAt) || 0),
        flyEnabled: Boolean(entry.flyEnabled),
        flightDay: String(entry.flightDay || ""),
        flightUsedSeconds: Math.max(0, Math.floor(Number(entry.flightUsedSeconds) || 0)),
        lastFlightTickAt: Math.max(0, Number(entry.lastFlightTickAt) || 0),
        // 双额度池：5小时滚动重置 + 自然周（周一起）重置
        f5LastReset: Math.max(0, Number(entry.f5LastReset) || 0),
        f5Used: Math.max(0, Math.floor(Number(entry.f5Used) || 0)),
        fWeekKey: String(entry.fWeekKey || ""),
        fWeekUsed: Math.max(0, Math.floor(Number(entry.fWeekUsed) || 0)),
    };
}

function isVipEntryActive(entry, now) {
    const normalized = normalizeVipEntry(entry);
    if (!normalized) {
        return false;
    }

    return !normalized.expireAt || normalized.expireAt > now;
}

function getVipEntry(player) {
    if (!getVipConfig().enabled || !player) {
        return null;
    }

    const key = getVipPlayerKey(player);
    if (!key) {
        return null;
    }

    const players = getVipPlayers();
    migrateVipRecordToKey(players, key, player.realName || player.name || "");
    let entry = normalizeVipEntry(players[key]);
    if (!entry) {
        return null;
    }

    const now = Date.now();
    if (!isVipEntryActive(entry, now)) {
        delete players[key];
        saveVipPlayers(players);
        if (!isPurchasedFlightEnabled(player)) {
            setPlayerMayfly(player, false);
        }
        return null;
    }

    const levels = getVipLevels();
    if (!levels[entry.level]) {
        return null;
    }

    return entry;
}

function getVipLevelConfig(level) {
    const levels = getVipLevels();
    const cfg = levels[String(level || "")];
    return cfg && typeof cfg === "object" ? cfg : null;
}

function getActiveVipLevel(player) {
    const entry = getVipEntry(player);
    return entry ? entry.level : "";
}

function getActiveVipLevelConfig(player) {
    const level = getActiveVipLevel(player);
    return level ? getVipLevelConfig(level) : null;
}

function getVipDisplayName(level) {
    const levelCfg = getVipLevelConfig(level);
    if (!levelCfg) {
        return "";
    }
    return String(levelCfg.display || level).trim();
}

function renderVipPrefix(player) {
    const entry = getVipEntry(player);
    if (!entry) {
        return "";
    }

    const levelCfg = getVipLevelConfig(entry.level);
    const display = getVipDisplayName(entry.level);
    if (!levelCfg || !display) {
        return "";
    }

    const color = applyColorCodes(String(levelCfg.prefixColor || "§6"));
    return `${color}[${display}] ${WHITE_RESET}`;
}

function getVipNameColor(player) {
    const levelCfg = getActiveVipLevelConfig(player);
    if (!levelCfg || !levelCfg.nameColor) {
        return "";
    }

    return applyColorCodes(String(levelCfg.nameColor));
}

function getVipNameColors(player) {
    const levelCfg = getActiveVipLevelConfig(player);
    if (!levelCfg) {
        return [];
    }

    const rawColors = Array.isArray(levelCfg.nameColors) ? levelCfg.nameColors : [];
    const colors = rawColors
        .map((color) => applyColorCodes(String(color || "")))
        .filter((color) => color);
    if (colors.length) {
        return colors;
    }

    const fallback = getVipNameColor(player);
    return fallback ? [fallback] : [];
}

function colorizeNameByColors(name, colors) {
    const text = String(name || "");
    if (!text || !colors.length) {
        return text;
    }

    let result = "";
    let colorIndex = 0;
    for (const char of text) {
        if (char === " ") {
            result += char;
            continue;
        }
        result += colors[colorIndex % colors.length] + char;
        colorIndex++;
    }
    return result + WHITE_RESET;
}

function formatPlayerName(player, name) {
    const vipColors = getVipNameColors(player);
    if (vipColors.length > 1) {
        return colorizeNameByColors(name, vipColors);
    }
    const color = vipColors[0] || getOnlineTimeColor(player);
    return color + String(name || "") + WHITE_RESET;
}

function getVipMultiplier(player, key, fallback) {
    const levelCfg = getActiveVipLevelConfig(player);
    if (!levelCfg) {
        return fallback;
    }

    const value = Number(levelCfg[key]);
    return isNaN(value) || value <= 0 ? fallback : value;
}

function applyVipRewardMultiplier(player, reward, key) {
    const base = Math.max(0, Math.floor(Number(reward) || 0));
    const multiplier = getVipMultiplier(player, key, 1);
    return Math.max(0, Math.floor(base * multiplier));
}

// baseMax 来自 LuckyClover-TPA 的 teleport.maxHomes（调用方传入），缺省 3
function getMaxHomesForPlayer(player, baseMax) {
    const baseMaxHomes = Math.max(1, Math.floor(Number(baseMax) || 3));
    if (player && typeof player.isOP === "function" && player.isOP()) {
        return Number.MAX_SAFE_INTEGER;
    }

    const levelCfg = getActiveVipLevelConfig(player);
    const vipMaxHomes = levelCfg ? Math.floor(Number(levelCfg.maxHomes) || 0) : 0;
    return Math.max(baseMaxHomes, vipMaxHomes || 0);
}

// baseSeconds 来自 LuckyClover-TPA 的 teleport.requestTimeoutSeconds（调用方传入），缺省 60
function getTeleportRequestTimeoutSeconds(player, baseSeconds) {
    const base = Math.max(5, Math.floor(Number(baseSeconds) || 60));
    const levelCfg = getActiveVipLevelConfig(player);
    const vipSeconds = levelCfg ? Math.floor(Number(levelCfg.teleportRequestTimeoutSeconds) || 0) : 0;
    return Math.max(base, vipSeconds || 0);
}

const FLIGHT_5H_MS = 5 * 60 * 60 * 1000;

function getFlightWeekKey(date) {
    const d = new Date(date || Date.now());
    const offset = (d.getDay() + 6) % 7; // 周一为一周起点
    d.setDate(d.getDate() - offset);
    return getDateKey(d);
}

// 惰性重置：距上次归零满5小时 → 清空5h池；跨周（周一）→ 清空周池
function resetFlightPools(entry) {
    if (!entry) return null;
    const now = Date.now();
    if (!entry.f5LastReset || now - entry.f5LastReset >= FLIGHT_5H_MS) {
        entry.f5LastReset = now;
        entry.f5Used = 0;
    }
    const week = getFlightWeekKey(now);
    if (entry.fWeekKey !== week) {
        entry.fWeekKey = week;
        entry.fWeekUsed = 0;
    }
    return entry;
}

function getVipFlightQuota(levelCfg) {
    if (!levelCfg || levelCfg.allowFlight !== true) return null;
    return {
        f5: Math.max(0, Math.floor(Number(levelCfg.flight5hSeconds) || 0)),
        week: Math.max(0, Math.floor(Number(levelCfg.flightWeekSeconds) || 0)),
    };
}

// 返回两个池的剩余秒数（只读视图，先做惰性重置）
// 按存档条目计算（离线可用）：不依赖玩家对象
function getVipFlightRemainingForEntry(entry) {
    if (!entry) return { f5: 0, week: 0 };
    const quota = getVipFlightQuota(getVipLevelConfig(entry.level));
    if (!quota) return { f5: 0, week: 0 };
    const normalized = resetFlightPools(entry);
    if (!normalized) return { f5: 0, week: 0 };
    return {
        f5: Math.max(0, quota.f5 - (Number(normalized.f5Used) || 0)),
        week: Math.max(0, quota.week - (Number(normalized.fWeekUsed) || 0)),
    };
}

function getVipFlightRemaining(player) {
    return getVipFlightRemainingForEntry(getVipEntry(player));
}

function canVipFly(player) {
    const entry = getVipEntry(player);
    if (!entry) return false;
    const quota = getVipFlightQuota(getVipLevelConfig(entry.level));
    if (!quota) return false;
    const remaining = getVipFlightRemaining(player);
    return remaining.f5 > 0 && remaining.week > 0;
}

function saveVipEntryForPlayer(player, entry) {
    const key = getVipPlayerKey(player);
    if (!key || !entry) {
        return false;
    }

    const players = getVipPlayers();
    players[key] = {
        ...entry,
        name: player.realName || entry.name || key,
    };
    saveVipPlayers(players);
    return true;
}

function isVipFlightEnabled(player) {
    const entry = getVipEntry(player);
    return Boolean(entry && entry.flyEnabled && canVipFly(player));
}

function settleVipFlightUsage(player) {
    const key = getVipPlayerKey(player);
    if (!key) {
        return null;
    }

    const players = getVipPlayers();
    let entry = normalizeVipEntry(players[key]);
    if (!entry || !isVipEntryActive(entry, Date.now()) || !getVipLevelConfig(entry.level)) {
        return null;
    }

    entry = resetFlightPools(entry);
    if (!entry.flyEnabled) {
        entry.lastFlightTickAt = 0;
        players[key] = {
            ...entry,
            name: player.realName || entry.name || key,
        };
        saveVipPlayers(players);
        return entry;
    }

    const now = Date.now();
    if (entry.lastFlightTickAt > 0) {
        const elapsed = Math.max(0, Math.floor((now - entry.lastFlightTickAt) / 1000));
        if (elapsed > 0) {
            entry.f5Used = (Number(entry.f5Used) || 0) + elapsed;
            entry.fWeekUsed = (Number(entry.fWeekUsed) || 0) + elapsed;
        }
    }
    entry.lastFlightTickAt = now;

    const levelCfg = getVipLevelConfig(entry.level) || {};
    const f5Limit = Math.max(0, Math.floor(Number(levelCfg.flight5hSeconds) || 0));
    const weekLimit = Math.max(0, Math.floor(Number(levelCfg.flightWeekSeconds) || 0));
    let exhausted = "";
    if (f5Limit > 0 && (Number(entry.f5Used) || 0) >= f5Limit) {
        entry.f5Used = f5Limit;
        exhausted = "5小时飞行额度已用完，重置后可继续";
    }
    if (weekLimit > 0 && (Number(entry.fWeekUsed) || 0) >= weekLimit) {
        entry.fWeekUsed = weekLimit;
        exhausted = exhausted || "本周飞行额度已用完";
    }
    if (exhausted) {
        entry.flyEnabled = false;
        entry.lastFlightTickAt = 0;
        players[key] = {
            ...entry,
            name: player.realName || entry.name || key,
        };
        saveVipPlayers(players);
        if (!isPurchasedFlightEnabled(player)) {
            setPlayerMayfly(player, false);
        }
        player.tell("§e" + exhausted);
        return entry;
    }

    players[key] = {
        ...entry,
        name: player.realName || entry.name || key,
    };
    saveVipPlayers(players);
    return entry;
}

function pauseVipFlightUsage(player) {
    const key = getVipPlayerKey(player);
    if (!key) {
        return;
    }

    const players = getVipPlayers();
    let entry = normalizeVipEntry(players[key]);
    if (!entry) {
        return;
    }

    entry = resetFlightPools(entry);
    players[key] = {
        ...entry,
        name: player.realName || entry.name || key,
        lastFlightTickAt: 0,
    };
    saveVipPlayers(players);
}

// === purchased flight storage ===
function getFlightPlayers() {
    const players = flightStore.get("players");
    if (players && typeof players === "object") {
        return players;
    }

    flightStore.set("players", {});
    return {};
}

function saveFlightPlayers(players) {
    flightStore.set("players", players && typeof players === "object" ? players : {});
}

function getFlightPlayerKey(player) {
    return player && (player.xuid || player.uuid || player.realName);
}

function normalizeFlightEntry(entry) {
    if (!entry || typeof entry !== "object") {
        return {
            name: "",
            enabled: false,
            remainingSeconds: 0,
            lastTickAt: 0,
        };
    }

    return {
        name: String(entry.name || ""),
        enabled: Boolean(entry.enabled),
        remainingSeconds: Math.max(0, Math.floor(Number(entry.remainingSeconds) || 0)),
        lastTickAt: Math.max(0, Number(entry.lastTickAt) || 0),
    };
}

function getFlightEntry(player) {
    const key = getFlightPlayerKey(player);
    if (!key) {
        return normalizeFlightEntry(null);
    }

    const players = getFlightPlayers();
    return normalizeFlightEntry(players[key]);
}

function saveFlightEntryForPlayer(player, entry) {
    const key = getFlightPlayerKey(player);
    if (!key) {
        return false;
    }

    const players = getFlightPlayers();
    players[key] = {
        ...normalizeFlightEntry(entry),
        name: player.realName || entry.name || key,
    };
    saveFlightPlayers(players);
    return true;
}

function isPurchasedFlightEnabled(player) {
    const entry = getFlightEntry(player);
    return Boolean(entry.enabled && entry.remainingSeconds > 0);
}

function hasAnyFlightEnabled(player) {
    return isVipFlightEnabled(player) || isPurchasedFlightEnabled(player);
}

function getPurchasedFlightRemainingSeconds(player) {
    const entry = getFlightEntry(player);
    return Math.max(0, Math.floor(Number(entry.remainingSeconds) || 0));
}

function settlePurchasedFlightUsage(player) {
    const key = getFlightPlayerKey(player);
    if (!key) {
        return null;
    }

    const players = getFlightPlayers();
    let entry = normalizeFlightEntry(players[key]);
    if (!entry.enabled) {
        entry.lastTickAt = 0;
        players[key] = {
            ...entry,
            name: player.realName || entry.name || key,
        };
        saveFlightPlayers(players);
        return entry;
    }

    const now = Date.now();
    if (entry.lastTickAt > 0) {
        const elapsed = Math.max(0, Math.floor((now - entry.lastTickAt) / 1000));
        if (elapsed > 0) {
            entry.remainingSeconds = Math.max(0, entry.remainingSeconds - elapsed);
        }
    }
    entry.lastTickAt = entry.remainingSeconds > 0 ? now : 0;
    entry.enabled = entry.remainingSeconds > 0;

    players[key] = {
        ...entry,
        name: player.realName || entry.name || key,
    };
    saveFlightPlayers(players);

    if (!entry.enabled && !isVipFlightEnabled(player)) {
        setPlayerMayfly(player, false);
        player.tell("§e购买的飞行时长已经用完。");
    }

    return entry;
}

function pausePurchasedFlightUsage(player) {
    const key = getFlightPlayerKey(player);
    if (!key) {
        return;
    }

    const players = getFlightPlayers();
    const entry = normalizeFlightEntry(players[key]);
    players[key] = {
        ...entry,
        name: player.realName || entry.name || key,
        lastTickAt: 0,
    };
    saveFlightPlayers(players);
}

function setPurchasedFlightEnabled(player, enabled) {
    settlePurchasedFlightUsage(player);
    const entry = getFlightEntry(player);

    if (enabled && entry.remainingSeconds <= 0) {
        if (!isVipFlightEnabled(player)) {
            setPlayerMayfly(player, false);
        }
        return false;
    }

    const applied = enabled ? setPlayerMayfly(player, true) : true;
    if (enabled && !applied) {
        return false;
    }

    saveFlightEntryForPlayer(player, {
        ...entry,
        enabled: Boolean(enabled),
        lastTickAt: enabled ? Date.now() : 0,
    });

    if (!enabled && !isVipFlightEnabled(player)) {
        setPlayerMayfly(player, false);
    }
    return true;
}

function getFlyHourPrice() {
    return Math.max(1, Math.floor(Number(getFlyConfig().hourPrice) || 5000));
}

function getFlyPurchaseSeconds() {
    return Math.max(60, Math.floor(Number(getFlyConfig().purchaseSeconds) || 3600));
}

function takePlayerMoney(player, amount) {
    if (!player || !player.xuid) {
        player.tell("§c无法识别你的经济账户。");
        return false;
    }

    const cost = Math.max(1, Math.floor(Number(amount) || 0));
    const balance = Math.floor(Number(money.get(player.xuid)) || 0);
    if (balance < cost) {
        player.tell(`§c金币不足，需要 ${cost} 金币，当前只有 ${balance} 金币。`);
        return false;
    }

    if (typeof money.reduce === "function" && money.reduce(player.xuid, cost)) {
        return true;
    }

    if (typeof money.set === "function" && money.set(player.xuid, balance - cost)) {
        return true;
    }

    player.tell("§c扣除金币失败，请检查经济系统。");
    return false;
}

function buyPurchasedFlightHour(player, hours) {
    const offer = getFlightPurchaseOffer(hours || 1);
    if (offer.error) {
        player.tell("§c" + offer.error);
        return false;
    }
    if (!takePlayerMoney(player, offer.price)) {
        return false;
    }

    settlePurchasedFlightUsage(player);
    const key = getFlightPlayerKey(player);
    applyFlightPurchase(key, player.realName || key, offer.seconds);
    player.tell("§a购买成功：已增加 " + formatDuration(offer.seconds * 1000) + " 飞行时长，花费 " + offer.price + " 金币。");
    return true;
}

function setPlayerMayfly(player, enabled) {
    if (!player || !player.realName) {
        return false;
    }

    let apiWorked = false;
    try {
        if (typeof player.setAbility === "function") {
            const mayflyResult = player.setAbility(ABILITY_MAYFLY, Boolean(enabled));
            const flyingResult = player.setAbility(ABILITY_FLYING, Boolean(enabled));
            apiWorked = mayflyResult !== false || flyingResult !== false;
        }
    } catch (error) {
        logger.warn(`LSE setAbility failed for ${player.realName}: ${error}`);
    }

    try {
        const value = enabled ? "true" : "false";
        const safeName = escapeCmdString(player.realName);
        const commands = [
            `ability "${safeName}" mayfly ${value}`,
            `ability "${safeName}" flying ${value}`,
            `ability @a[name="${safeName}"] mayfly ${value}`,
            `ability @a[name="${safeName}"] flying ${value}`,
        ];
        let commandWorked = false;
        for (const command of commands) {
            const result = mc.runcmdEx(command);
            if (!result || result.success !== false) {
                commandWorked = true;
            }
        }
        return apiWorked || commandWorked;
    } catch (error) {
        logger.warn(`Failed to ${enabled ? "enable" : "disable"} VIP flight for ${player.realName}: ${error}`);
        return apiWorked;
    }
}

function setVipFlightEnabled(player, enabled) {
    const key = getVipPlayerKey(player);
    if (!key) {
        return false;
    }

    settleVipFlightUsage(player);
    const players = getVipPlayers();
    let entry = normalizeVipEntry(players[key]);
    if (!entry || !isVipEntryActive(entry, Date.now()) || !getVipLevelConfig(entry.level)) {
        if (!isPurchasedFlightEnabled(player)) {
            setPlayerMayfly(player, false);
        }
        return false;
    }
    entry = resetFlightPools(entry);

    const levelCfg = getVipLevelConfig(entry.level);
    if (!levelCfg || levelCfg.allowFlight !== true) {
        if (!isPurchasedFlightEnabled(player)) {
            setPlayerMayfly(player, false);
        }
        return false;
    }

    if (enabled) {
        const remaining = getVipFlightRemaining(player);
        if (remaining.f5 <= 0 || remaining.week <= 0) {
            if (!isPurchasedFlightEnabled(player)) {
                setPlayerMayfly(player, false);
            }
            return false;
        }
    }

    const applied = enabled ? setPlayerMayfly(player, true) : true;
    if (enabled && !applied) {
        return false;
    }

    players[key] = {
        ...entry,
        name: player.realName || entry.name || key,
        flyEnabled: Boolean(enabled) && applied,
        lastFlightTickAt: enabled && applied ? Date.now() : 0,
    };
    saveVipPlayers(players);
    if (!enabled && !isPurchasedFlightEnabled(player)) {
        setPlayerMayfly(player, false);
    }
    return true;
}

function applyVipFlightState(player) {
    if (!player) {
        return;
    }

    settleVipFlightUsage(player);
    settlePurchasedFlightUsage(player);
    setPlayerMayfly(player, hasAnyFlightEnabled(player));
}

function scheduleVipFlightLoop() {
    if (vipFlightLoopStarted) {
        return;
    }
    vipFlightLoopStarted = true;

    const tick = () => {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            try {
                settleVipFlightUsage(player);
                settlePurchasedFlightUsage(player);
                if (hasAnyFlightEnabled(player)) {
                    setPlayerMayfly(player, true);
                }
            } catch (error) {
                logger.error(`VIP flight tick failed: ${error}`);
            }
        }
    };

    if (typeof mc.setInterval === "function") {
        mc.setInterval(tick, 60000);
    } else {
        setInterval(tick, 60000);
    }
    tick();
}

function scheduleApplyVipFlightState(player, delayMs) {
    if (!player) {
        return;
    }

    const key = getVipPlayerKey(player);
    setTimeout(() => {
        const online = mc.getOnlinePlayers().find((item) => getVipPlayerKey(item) === key);
        if (online) {
            applyVipFlightState(online);
        }
    }, Math.max(0, Number(delayMs) || 0));
}

function formatVipExpireText(expireAt) {
    if (!expireAt) {
        return "permanent";
    }

    const remaining = expireAt - Date.now();
    if (remaining <= 0) {
        return "expired";
    }

    return `${new Date(expireAt).toLocaleString()} (${formatDuration(remaining)} left)`;
}

// === rendering ===
function renderTitlePrefix(title) {
    if (!title) {
        return config.get("emptyTitleFallback") || "";
    }

    const wrapper = String(config.get("titleWrapper") || "[{title}] ");
    const coloredTitle = applyColorCodes(title) + WHITE_RESET;
    return applyColorCodes(wrapper.replace("{title}", coloredTitle));
}

function renderRawTitle(title) {
    if (!title) {
        return "";
    }

    return applyColorCodes(title) + WHITE_RESET;
}

function formatText(template, player, title, msg) {
    const prefix = renderTitlePrefix(title);
    const rawTitle = renderRawTitle(title);
    const vipEntry = getVipEntry(player);
    const vipLevel = vipEntry ? vipEntry.level : "";
    const rawVip = vipLevel ? getVipDisplayName(vipLevel) : "";
    const vip = renderVipPrefix(player);
    const customName = getStoredCustomName(player);
    const formattedCustomName = customName ? applyColorCodes(customName) + WHITE_RESET : "";
    const realName = formattedCustomName || formatPlayerName(player, player.realName);
    const displayName = formattedCustomName || formatPlayerName(player, player.name);
    const message = renderWhiteText(msg);
    const device = formatPlayerDevice(player);
    const ping = String(getLatency(player));

    return String(template)
        .split("{vip}").join(vip)
        .split("{rawVip}").join(rawVip)
        .split("{vipLevel}").join(vipLevel)
        .split("{isVip}").join(vipLevel ? "true" : "false")
        .split("{title}").join(prefix)
        .split("{rawTitle}").join(rawTitle)
        .split("{name}").join(realName)
        .split("{displayName}").join(displayName)
        .split("{customName}").join(customName)
        .split("{device}").join(device)
        .split("{ping}").join(ping)
        .split("{msg}").join(message);
}

function applyPlayerTitle(player) {
    const title = getStoredTitle(player);
    const format = config.get("nametagFormat") || "{title}{name}";
    const displayName = formatText(format, player, title, "");
    player.rename(displayName);
}

function applyAllOnlinePlayers() {
    const players = mc.getOnlinePlayers();
    for (const player of players) {
        applyPlayerTitle(player);
    }
}

// === VIP / flight commands ===
function findVipPlayerKey(input) {
    const query = String(input || "").trim();
    if (!query) {
        return "";
    }

    const online = mc.getPlayer(query);
    if (online) {
        return getVipPlayerKey(online);
    }

    const lower = query.toLowerCase();
    const players = getVipPlayers();
    for (const key in players) {
        const entry = normalizeVipEntry(players[key]);
        if (!entry) {
            continue;
        }
        if (String(key).toLowerCase() === lower || String(entry.name || "").toLowerCase() === lower) {
            return key;
        }
    }

    return query;
}

// 写入用规范键：优先 xuid（读取端 getVipPlayerKey 也以 xuid 为准），避免同一玩家产生两条记录
function resolveVipRecordKey(name, xuid) {
    const x = String(xuid || "").trim();
    if (x) {
        return x;
    }
    return findVipPlayerKey(name) || String(name || "").trim();
}

// 删除与 keepKey 指向同一玩家的其它记录（按名字匹配），保证一人一条
function dedupeVipRecords(players, keepKey, name) {
    const lower = String(name || "").trim().toLowerCase();
    if (!lower) {
        return false;
    }
    let changed = false;
    for (const k of Object.keys(players)) {
        if (k === keepKey) {
            continue;
        }
        const e = players[k];
        if (e && typeof e === "object" && String(e.name || "").trim().toLowerCase() === lower) {
            delete players[k];
            changed = true;
        }
    }
    return changed;
}

// 规范键无记录而同名旧记录（名字/uuid 键）存在时，先把旧记录并入规范键；
// 续费叠加、补差价、读取都基于同一条记录
function migrateVipRecordToKey(players, key, name) {
    if (players[key]) {
        return false;
    }
    const lower = String(name || "").trim().toLowerCase();
    if (!lower) {
        return false;
    }
    for (const k of Object.keys(players)) {
        if (k === key) {
            continue;
        }
        const e = players[k];
        if (e && typeof e === "object" && String(e.name || "").trim().toLowerCase() === lower) {
            players[key] = e;
            delete players[k];
            saveVipPlayers(players);
            return true;
        }
    }
    return false;
}

function setVipForPlayer(targetPlayer, level, days) {
    const key = getVipPlayerKey(targetPlayer);
    if (!key) {
        return false;
    }

    const levelCfg = getVipLevelConfig(level);
    if (!levelCfg) {
        return false;
    }

    const durationDays = Number(days);
    const expireAt = durationDays > 0 ? Date.now() + Math.floor(durationDays * 86400000) : 0;
    const players = getVipPlayers();
    players[key] = {
        level,
        name: targetPlayer.realName || targetPlayer.name || key,
        expireAt,
        grantedAt: Date.now(),
        flyEnabled: Boolean(players[key] && players[key].flyEnabled),
        flightDay: String(players[key] && players[key].flightDay || ""),
        flightUsedSeconds: Math.max(0, Math.floor(Number(players[key] && players[key].flightUsedSeconds) || 0)),
        lastFlightTickAt: Math.max(0, Number(players[key] && players[key].lastFlightTickAt) || 0),
        f5LastReset: Math.max(0, Number(players[key] && players[key].f5LastReset) || 0),
        f5Used: Math.max(0, Math.floor(Number(players[key] && players[key].f5Used) || 0)),
        fWeekKey: String(players[key] && players[key].fWeekKey || ""),
        fWeekUsed: Math.max(0, Math.floor(Number(players[key] && players[key].fWeekUsed) || 0)),
    };
    dedupeVipRecords(players, key, targetPlayer.realName || targetPlayer.name);
    saveVipPlayers(players);
    applyPlayerTitle(targetPlayer);
    applyVipFlightState(targetPlayer);
    return true;
}

function removeVipByKey(key) {
    const players = getVipPlayers();
    if (!players[key]) {
        return false;
    }

    delete players[key];
    saveVipPlayers(players);
    const online = mc.getOnlinePlayers().find((player) => getVipPlayerKey(player) === key);
    if (online) {
        if (!isPurchasedFlightEnabled(online)) {
            setPlayerMayfly(online, false);
        }
        applyPlayerTitle(online);
    }
    return true;
}

function buildVipShopText(player) {
    const levels = getVipLevels();
    const entry = player ? getVipEntry(player) : null;
    const curLevel = entry ? entry.level : "";
    const curCfg = curLevel ? getVipLevelConfig(curLevel) : null;
    const curPrice = curCfg ? Math.max(0, Math.floor(Number(curCfg.price) || 0)) : 0;
    const lines = ["=== VIP 套餐（金币购买，到期后失效） ==="];
    for (const id in levels) {
        const lv = levels[id];
        if (!lv || typeof lv !== "object") continue;
        const price = Math.max(0, Math.floor(Number(lv.price) || 0));
        if (price <= 0) continue;
        const days = Math.max(1, Math.floor(Number(lv.durationDays) || 30));
        const f5min = Math.round((Number(lv.flight5hSeconds) || 0) / 60);
        const weekH = Math.round((Number(lv.flightWeekSeconds) || 0) / 60) / 10;
        let priceText = price + " 金币";
        if (curLevel) {
            if (id === curLevel) {
                priceText = price + " 金币（续费叠加时长）";
            } else if (price > curPrice) {
                priceText = (price - curPrice) + " 金币（升级补差价，原价 " + price + "）";
            } else {
                priceText = "不可购买（不高于当前套餐）";
            }
        }
        lines.push(
            id + " [" + (lv.display || id) + "] " + priceText + " / " + days + "天"
            + " | 5h池 " + f5min + "分钟 · 周池 " + weekH + "小时"
        );
    }
    lines.push("购买: /vip buy <套餐ID>    查看: /vip shop    兑换: /vip code <兑换码>");
    return lines.join("\n");
}

// currentLevelId: 当前生效套餐（空=无）。同级=原价续费；高等级=补差价；低等级/同价不同级=不可购买
function getVipPurchaseOffer(levelId, currentLevelId) {
    const cfg = getVipLevelConfig(levelId);
    if (!cfg) return { error: "未知套餐: " + levelId };
    const price = Math.max(0, Math.floor(Number(cfg.price) || 0));
    if (price <= 0) return { error: "该套餐不可直接购买" };
    const days = Math.max(1, Math.floor(Number(cfg.durationDays) || 30));
    const cur = String(currentLevelId || "");
    if (cur && cur !== levelId) {
        const curCfg = getVipLevelConfig(cur);
        const curPrice = curCfg ? Math.max(0, Math.floor(Number(curCfg.price) || 0)) : 0;
        if (price <= curPrice) {
            const curDisp = (curCfg && curCfg.display) || cur;
            return { error: "不可购买：" + (cfg.display || levelId) + " 不高于当前套餐 " + curDisp };
        }
        return { cfg, price: price - curPrice, days, upgradeFrom: cur, upgradePrice: price };
    }
    return { cfg, price, days };
}

// 写入/续期（不负责扣费）；同级续费叠加时长，永久保持永久；days<=0 = 永久
function applyVipPurchase(key, name, levelId, days) {
    const players = getVipPlayers();
    migrateVipRecordToKey(players, key, name);
    const existing = normalizeVipEntry(players[key]);
    const d = Math.max(0, Math.floor(Number(days) || 0));
    let expireAt = d > 0 ? Date.now() + d * 86400000 : 0;
    if (existing && existing.level === levelId) {
        if (existing.expireAt === 0) {
            expireAt = 0;
        } else if (d > 0 && existing.expireAt > Date.now()) {
            expireAt = existing.expireAt + d * 86400000;
        }
    }
    players[key] = Object.assign({}, existing || {}, {
        level: levelId,
        name: name || key,
        expireAt,
        grantedAt: (existing && existing.grantedAt) || Date.now(),
    });
    dedupeVipRecords(players, key, name);
    saveVipPlayers(players);
    const online = mc.getOnlinePlayers().find((item) => getVipPlayerKey(item) === key);
    if (online) {
        applyPlayerTitle(online);
        applyVipFlightState(online);
    }
    return expireAt;
}

function purchaseVip(player, levelId) {
    const current = getVipEntry(player);
    const offer = getVipPurchaseOffer(levelId, current ? current.level : "");
    if (offer.error) {
        player.tell("§c" + offer.error);
        return false;
    }
    if (!takePlayerMoney(player, offer.price)) {
        return false;
    }
    const key = getVipPlayerKey(player);
    const expireAt = applyVipPurchase(key, player.realName || key, levelId, offer.days);
    const upgradeTip = offer.upgradeFrom ? "（升级补差价 " + offer.price + " 金币）" : "";
    player.tell("§a购买成功：" + (offer.cfg.display || levelId) + upgradeTip + "，有效期至 " + formatVipExpireText(expireAt));
    return true;
}

// xuid 扣费（网页端无 player 对象时使用）
function takeMoneyByXuid(xuid, amount) {
    if (!xuid) return { error: "无法确定账户（缺少 xuid）" };
    const cost = Math.max(1, Math.floor(Number(amount) || 0));
    const balance = Math.floor(Number(money.get(xuid)) || 0);
    if (balance < cost) {
        return { error: "金币不足，需要 " + cost + "，当前只有 " + balance };
    }
    if (typeof money.reduce === "function" && money.reduce(xuid, cost)) {
        return { ok: true, balance: balance - cost };
    }
    if (typeof money.set === "function" && money.set(xuid, balance - cost)) {
        return { ok: true, balance: balance - cost };
    }
    return { error: "扣除金币失败" };
}

// 飞行时长购买：offer + 落库（命令与网页共用）
function getFlightPurchaseOffer(hours) {
    if (getFlyConfig().enabled === false) return { error: "飞行购买功能未开启" };
    const h = Math.max(1, Math.min(168, Math.floor(Number(hours) || 1)));
    const price = getFlyHourPrice() * h;
    const seconds = getFlyPurchaseSeconds() * h;
    return { hours: h, price, seconds };
}

function applyFlightPurchase(key, name, seconds) {
    const players = getFlightPlayers();
    const entry = normalizeFlightEntry(players[key]);
    players[key] = {
        ...entry,
        name: name || entry.name || key,
        remainingSeconds: Math.max(0, Math.floor(Number(entry.remainingSeconds) || 0)) + Math.max(0, Math.floor(Number(seconds) || 0)),
        lastTickAt: entry.lastTickAt,
    };
    saveFlightPlayers(players);
    return players[key].remainingSeconds;
}

function buildVipInfoText(player) {
    settleVipFlightUsage(player);
    const entry = getVipEntry(player);
    if (!entry) {
        return ["你还不是 VIP。", "", buildVipShopText(player)].join("\n");
    }

    const levelCfg = getVipLevelConfig(entry.level) || {};
    const display = getVipDisplayName(entry.level) || entry.level;
    const maxHomes = getMaxHomesForPlayer(player, 3);
    const dailyMultiplier = getVipMultiplier(player, "dailyRewardMultiplier", 1);
    const tpaSeconds = getTeleportRequestTimeoutSeconds(player, 60);
    const flightText = canVipFly(player) ? (isVipFlightEnabled(player) ? "on" : "off") : "not available";
    const remaining = getVipFlightRemaining(player);
    return [
        "Level: " + display,
        "Expires: " + formatVipExpireText(entry.expireAt),
        "Name color: " + String(levelCfg.nameColor || "none"),
        "Max homes: " + maxHomes,
        "Daily reward: x" + dailyMultiplier,
        "TPA timeout: " + tpaSeconds + "s",
        "Flight: " + flightText,
        "  5h额度剩余: " + formatDuration(remaining.f5 * 1000) + "（每5小时重置）",
        "  本周额度剩余: " + formatDuration(remaining.week * 1000),
    ].join("\n");
}

function openVipForm(player) {
    const buttons = canVipFly(player)
        ? [isVipFlightEnabled(player) ? "Disable flight" : "Enable flight", "Refresh"]
        : ["Refresh"];
    sendListForm(player, "VIP", buildVipInfoText(player), buttons, (index) => {
        if (canVipFly(player) && index === 0) {
            const next = !isVipFlightEnabled(player);
            if (setVipFlightEnabled(player, next)) {
                player.tell(next ? "§aVIP flight enabled." : "§eVIP flight disabled.");
            } else {
                player.tell("§cVIP flight is not available.");
            }
        }
        openVipForm(player);
    });
}

function buildFlyInfoText(player) {
    settleVipFlightUsage(player);
    settlePurchasedFlightUsage(player);
    const price = getFlyHourPrice();
    const seconds = getFlyPurchaseSeconds();
    const balance = player.xuid ? Math.floor(Number(money.get(player.xuid)) || 0) : 0;
    const purchasedRemaining = getPurchasedFlightRemainingSeconds(player);
    const vipRemaining = canVipFly(player) ? getVipFlightRemaining(player) : { f5: 0, week: 0 };
    const status = hasAnyFlightEnabled(player) ? "已开启" : "已关闭";

    return [
        "状态：" + status,
        "金币：" + balance,
        "购买飞行剩余：" + formatDuration(purchasedRemaining * 1000),
        "VIP 5h额度剩余：" + (canVipFly(player) ? formatDuration(vipRemaining.f5 * 1000) : "无"),
        "VIP 本周额度剩余：" + (canVipFly(player) ? formatDuration(vipRemaining.week * 1000) : "无"),
        "价格：" + price + " 金币 / " + formatDuration(seconds * 1000),
    ].join("\n");
}

function openFlyForm(player) {
    if (getFlyConfig().enabled === false) {
        player.tell("§c飞行购买功能未开启。");
        return;
    }

    const buttons = [
        hasAnyFlightEnabled(player) ? "关闭飞行" : "开启飞行",
        `购买 1 小时`,
        "刷新",
    ];
    sendListForm(player, "飞行", buildFlyInfoText(player), buttons, (index) => {
        if (index === 0) {
            const next = !hasAnyFlightEnabled(player);
            if (next) {
                if (isVipFlightEnabled(player) || setPurchasedFlightEnabled(player, true) || setVipFlightEnabled(player, true)) {
                    player.tell("§a飞行已开启。");
                } else {
                    player.tell("§c没有可用飞行时长，请先购买。");
                }
            } else {
                setPurchasedFlightEnabled(player, false);
                if (isVipFlightEnabled(player)) {
                    setVipFlightEnabled(player, false);
                }
                player.tell("§e飞行已关闭。");
            }
            openFlyForm(player);
            return;
        }

        if (index === 1) {
            buyPurchasedFlightHour(player);
            openFlyForm(player);
            return;
        }

        openFlyForm(player);
    });
}

function handleFlyCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    if (getFlyConfig().enabled === false) {
        player.tell("§c飞行购买功能未开启。");
        return;
    }

    if (!args.length) {
        openFlyForm(player);
        return;
    }

    const action = String(args[0] || "").toLowerCase();
    if (action === "buy" || action === "购买") {
        buyPurchasedFlightHour(player);
        return;
    }

    if (action === "time" || action === "remaining" || action === "剩余") {
        player.tell(buildFlyInfoText(player));
        return;
    }

    if (action === "on" || action === "开" || action === "开启") {
        if (isVipFlightEnabled(player) || setPurchasedFlightEnabled(player, true) || setVipFlightEnabled(player, true)) {
            player.tell("§a飞行已开启。");
        } else {
            player.tell("§c没有可用飞行时长，请先购买。");
        }
        return;
    }

    if (action === "off" || action === "关" || action === "关闭") {
        setPurchasedFlightEnabled(player, false);
        if (isVipFlightEnabled(player)) {
            setVipFlightEnabled(player, false);
        }
        player.tell("§e飞行已关闭。");
        return;
    }

    openFlyForm(player);
}

function handleVipCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    if (!args.length) {
        openVipForm(player);
        return;
    }

    const action = String(args[0] || "").toLowerCase();
    if (action === "fly" || action === "flight") {
        if (!canVipFly(player)) {
            if (!isPurchasedFlightEnabled(player)) {
                setPlayerMayfly(player, false);
            }
            player.tell("§cYour VIP level does not include flight.");
            return;
        }

        const requested = String(args[1] || "").toLowerCase();
        if (requested === "time" || requested === "remaining") {
            settleVipFlightUsage(player);
            const remaining = getVipFlightRemaining(player);
            player.tell("§aVIP 5h额度剩余: " + formatDuration(remaining.f5 * 1000));
            player.tell("§aVIP 本周额度剩余: " + formatDuration(remaining.week * 1000));
            return;
        }

        const next = requested === "on" || requested === "true" || requested === "1"
            ? true
            : (requested === "off" || requested === "false" || requested === "0" ? false : !isVipFlightEnabled(player));
        if (setVipFlightEnabled(player, next)) {
            player.tell(next ? "§aVIP flight enabled." : "§eVIP flight disabled.");
        } else {
            player.tell("§cVIP flight is not available.");
        }
        return;
    }

    if (action === "shop" || action === "store" || action === "套餐") {
        player.tell(buildVipShopText(player));
        return;
    }

    if (action === "buy" || action === "购买") {
        const levelId = String(args[1] || "").trim().toLowerCase();
        if (!levelId) {
            player.tell(buildVipShopText(player));
            return;
        }
        purchaseVip(player, levelId);
        return;
    }

    if (action === "code" || action === "cdk" || action === "兑换码" || action === "兑换") {
        const input = String(args[1] || "").trim();
        if (!input) {
            player.tell("§e用法: /" + getVipCommandName() + " code <兑换码>");
            return;
        }
        const result = redeemCdk(input, player.realName || player.name, player.xuid);
        if (result.error) {
            player.tell("§c" + result.error);
            return;
        }
        player.tell("§a兑换成功：" + result.desc);
        return;
    }

    if (!player.isOP()) {
        player.tell("§cOnly OP can manage VIP.");
        return;
    }

    const levels = getVipLevels();
    if (action === "set") {
        const targetName = String(args[1] || "").trim();
        const level = String(args[2] || getVipConfig().defaultLevel || "vip").trim();
        const days = args[3] === undefined ? 0 : Number(args[3]);
        const target = mc.getPlayer(targetName);
        if (!target) {
            player.tell("§cTarget player must be online when setting VIP.");
            return;
        }
        if (!levels[level]) {
            player.tell(`§cUnknown VIP level: ${level}`);
            player.tell(`§7Levels: ${Object.keys(levels).join(", ") || "none"}`);
            return;
        }
        if (!setVipForPlayer(target, level, days)) {
            player.tell("§cFailed to set VIP.");
            return;
        }
        player.tell(`§aSet ${target.realName} VIP level to ${level}.`);
        target.tell(`§aYour VIP level is now ${getVipDisplayName(level)}.`);
        return;
    }

    if (action === "remove") {
        const key = findVipPlayerKey(args[1]);
        if (!key || !removeVipByKey(key)) {
            player.tell("§cVIP player not found.");
            return;
        }
        player.tell("§aVIP removed.");
        return;
    }

    if (action === "info") {
        const targetName = String(args[1] || player.realName).trim();
        const target = mc.getPlayer(targetName);
        if (target) {
            player.tell(buildVipInfoText(target));
            return;
        }

        const key = findVipPlayerKey(targetName);
        const entry = normalizeVipEntry(getVipPlayers()[key]);
        if (!entry) {
            player.tell("§cVIP player not found.");
            return;
        }
        player.tell(`Name: ${entry.name || key}`);
        player.tell(`Level: ${entry.level}`);
        player.tell(`Expires: ${formatVipExpireText(entry.expireAt)}`);
        return;
    }

    if (action === "list") {
        const players = getVipPlayers();
        const lines = [];
        for (const key in players) {
            const entry = normalizeVipEntry(players[key]);
            if (entry && isVipEntryActive(entry, Date.now())) {
                lines.push(`${entry.name || key}: ${entry.level}, ${formatVipExpireText(entry.expireAt)}`);
            }
        }
        player.tell(lines.length ? lines.join("\n") : "§eNo active VIP players.");
        return;
    }

    player.tell("§e/" + getVipCommandName() + " shop   查看金币套餐");
    player.tell("§e/" + getVipCommandName() + " buy <套餐ID>   购买套餐");
    player.tell("§e/" + getVipCommandName());
    player.tell("§e/" + getVipCommandName() + " fly [on|off|time]");
    player.tell("§e/" + getVipCommandName() + " set <player> <level> [days]");
    player.tell("§e/" + getVipCommandName() + " remove <player>");
    player.tell("§e/" + getVipCommandName() + " info [player]");
    player.tell("§e/" + getVipCommandName() + " list");
}

// === command registration ===
function requireOp(sender) {
    if (!sender) {
        return false;
    }
    if (!sender.isOP || !sender.isOP()) {
        sender.tell("§c你没有权限");
        return false;
    }
    return true;
}

function registerTitleCommands() {
    mc.regPlayerCmd("settitle", "给玩家设置头衔", (sender, args) => {
        if (!requireOp(sender)) {
            return;
        }

        args = normalizePlayerCmdArgs(args);
        const targetName = String(args[0] || "").trim();
        const title = args.slice(1).join(" ").trim();
        const target = findOnlinePlayerByName(targetName);
        if (!target || !title) {
            sender.tell("§e/settitle <玩家> <头衔>");
            return;
        }

        setStoredTitle(target, title);
        applyPlayerTitle(target);
        target.tell(`你的头衔已更新为 ${renderTitlePrefix(title)}`);
        sender.tell(`§a已为玩家 ${target.realName} 设置头衔: ${title}`);
    }, 1);

    mc.regPlayerCmd("cleartitle", "清除玩家头衔", (sender, args) => {
        if (!requireOp(sender)) {
            return;
        }

        args = normalizePlayerCmdArgs(args);
        const target = findOnlinePlayerByName(args[0]);
        if (!target) {
            sender.tell("§e/cleartitle <玩家>");
            return;
        }

        clearStoredTitle(target);
        applyPlayerTitle(target);
        target.tell("你的头衔已被清除");
        sender.tell(`§a已清除玩家 ${target.realName} 的头衔`);
    }, 1);

    mc.regPlayerCmd("setname", "设置玩家显示名字", (sender, args) => {
        if (!requireOp(sender)) {
            return;
        }

        args = normalizePlayerCmdArgs(args);
        const targetName = String(args[0] || "").trim();
        const newName = args.slice(1).join(" ").trim();
        const target = findOnlinePlayerByName(targetName);
        if (!target || !newName) {
            sender.tell("§e/setname <玩家> <名字>");
            return;
        }

        setStoredCustomName(target, newName);
        applyPlayerTitle(target);
        target.tell(`你的显示名字已更新为 ${applyColorCodes(newName)}`);
        sender.tell(`§a已为玩家 ${target.realName} 设置显示名字: ${newName}`);
    }, 1);

    mc.regPlayerCmd("clearname", "清除玩家显示名字", (sender, args) => {
        if (!requireOp(sender)) {
            return;
        }

        args = normalizePlayerCmdArgs(args);
        const target = findOnlinePlayerByName(args[0]);
        if (!target) {
            sender.tell("§e/clearname <玩家>");
            return;
        }

        clearStoredCustomName(target);
        applyPlayerTitle(target);
        target.tell("你的显示名字已被清除");
        sender.tell(`§a已清除玩家 ${target.realName} 的显示名字`);
    }, 1);
}

function registerFlyCommand() {
    const commandName = getFlyCommandName();
    mc.regPlayerCmd(commandName, "购买和开关飞行", (player, args) => {
        handleFlyCommand(player, normalizePlayerCmdArgs(args));
    }, 0);
}

function registerVipCommand() {
    const commandName = getVipCommandName();
    mc.regPlayerCmd(commandName, "VIP", (player, args) => {
        handleVipCommand(player, normalizePlayerCmdArgs(args));
    }, 0);
}

// === management helpers (offline-friendly, for web panel) ===
registerTitleCommands();
registerFlyCommand();
registerVipCommand();

function setVipByKey(key, name, level, days) {
    if (!key || !getVipLevelConfig(level)) {
        return false;
    }

    const durationDays = Number(days);
    const expireAt = durationDays > 0 ? Date.now() + Math.floor(durationDays * 86400000) : 0;
    const players = getVipPlayers();
    const existing = normalizeVipEntry(players[key]);
    players[key] = {
        level,
        name: String(name || key),
        expireAt,
        grantedAt: Date.now(),
        flyEnabled: Boolean(existing && existing.flyEnabled),
        flightDay: String((existing && existing.flightDay) || ""),
        flightUsedSeconds: Math.max(0, Math.floor(Number(existing && existing.flightUsedSeconds) || 0)),
        lastFlightTickAt: Math.max(0, Number(existing && existing.lastFlightTickAt) || 0),
        f5LastReset: Math.max(0, Number(existing && existing.f5LastReset) || 0),
        f5Used: Math.max(0, Math.floor(Number(existing && existing.f5Used) || 0)),
        fWeekKey: String((existing && existing.fWeekKey) || ""),
        fWeekUsed: Math.max(0, Math.floor(Number(existing && existing.fWeekUsed) || 0)),
    };
    dedupeVipRecords(players, key, name);
    saveVipPlayers(players);

    const online = mc.getOnlinePlayers().find((player) => getVipPlayerKey(player) === key);
    if (online) {
        applyPlayerTitle(online);
        applyVipFlightState(online);
    }
    return true;
}

function jsonOk(extra) {
    return JSON.stringify(Object.assign({ ok: true }, extra || {}));
}

function jsonError(error) {
    return JSON.stringify({ ok: false, error: String(error || "unknown error") });
}

// === runtime exports ===
// template 传 null/undefined 时使用本插件 config 的 chatFormat（主插件 onChat 走这条路径）
exportApi("format", (template, player, msg) => {
    const tpl = (template === null || template === undefined)
        ? String(config.get("chatFormat") || "{title}{name}: {msg}")
        : String(template);
    return formatText(tpl, player, getStoredTitle(player), String(msg || ""));
});

exportApi("refreshNametag", (player) => {
    if (player) {
        applyPlayerTitle(player);
    }
});

exportApi("getTitle", (key) => {
    if (!key) {
        return "";
    }
    const title = titleStore.get(String(key));
    return typeof title === "string" ? title : "";
});

exportApi("renderDisplayName", (player) => {
    if (!player) {
        return "";
    }
    const customName = getStoredCustomName(player);
    if (customName) {
        return applyColorCodes(customName) + WHITE_RESET;
    }
    return formatPlayerName(player, player.realName);
});

exportApi("getVipStatus", (player) => {
    const entry = player ? getVipEntry(player) : null;
    if (!entry) {
        return { isVip: false, level: "", display: "", expireAt: 0 };
    }
    return {
        isVip: true,
        level: entry.level,
        display: getVipDisplayName(entry.level),
        expireAt: entry.expireAt,
    };
});

exportApi("getRewardMultiplier", (player, key, fallback) => {
    return getVipMultiplier(player, String(key || "dailyRewardMultiplier"), Number(fallback) || 1);
});

exportApi("getMaxHomes", (player, baseMax) => {
    return getMaxHomesForPlayer(player, baseMax);
});

exportApi("getTpTimeoutSeconds", (player, baseSeconds) => {
    return getTeleportRequestTimeoutSeconds(player, baseSeconds);
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
    const players = getVipPlayers();
    let activeCount = 0;
    let onlineVip = 0;
    const now = Date.now();
    for (const key in players) {
        const entry = normalizeVipEntry(players[key]);
        if (entry && isVipEntryActive(entry, now)) {
            activeCount++;
        }
    }
    for (const player of mc.getOnlinePlayers()) {
        if (getVipEntry(player)) {
            onlineVip++;
        }
    }
    return JSON.stringify({
        ok: true,
        version: PLUGIN_VERSION.join("."),
        enabled: getVipConfig().enabled !== false,
        flyEnabled: getFlyConfig().enabled !== false,
        flightLoop: vipFlightLoopStarted,
        activeVipCount: activeCount,
        onlineVipCount: onlineVip,
        dataFiles: {
            titles: fileExists(TITLE_DATA_PATH),
            customNames: fileExists(CUSTOM_NAME_DATA_PATH),
            vips: fileExists(VIP_DATA_PATH),
            flight: fileExists(FLIGHT_DATA_PATH),
        },
    });
});

exportApi("mgmtListVips", () => {
    const players = getVipPlayers();
    const now = Date.now();
    const list = [];
    for (const key in players) {
        const entry = normalizeVipEntry(players[key]);
        if (entry && isVipEntryActive(entry, now)) {
            list.push({
                key,
                name: entry.name || key,
                level: entry.level,
                display: getVipDisplayName(entry.level),
                expireAt: entry.expireAt,
            });
        }
    }
    return JSON.stringify({ ok: true, players: list });
});

exportApi("mgmtSetVip", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        const level = String(parsed && parsed.level || getVipConfig().defaultLevel || "vip").trim();
        const days = Number(parsed && parsed.days) || 0;
        if (!name) {
            return jsonError("name is required");
        }
        const key = String(parsed.key || "").trim() || resolveVipRecordKey(name, String(parsed.xuid || ""));
        if (!setVipByKey(key, name, level, days)) {
            return jsonError(`unknown VIP level or invalid name: ${level}`);
        }
        return jsonOk({ key, level, days });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtRemoveVip", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) {
            return jsonError("name is required");
        }
        const key = findVipPlayerKey(name);
        if (!removeVipByKey(key)) {
            return jsonError("VIP player not found");
        }
        return jsonOk({ key });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtSetTitle", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        const title = String(parsed && parsed.title || "").trim();
        if (!name || !title) {
            return jsonError("name and title are required");
        }
        const key = String(parsed.key || "").trim() || findVipPlayerKey(name);
        titleStore.set(key, title);
        const online = findOnlinePlayerByName(name);
        if (online) {
            applyPlayerTitle(online);
        }
        return jsonOk({ key, title });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtClearTitle", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) {
            return jsonError("name is required");
        }
        const key = String(parsed.key || "").trim() || findVipPlayerKey(name);
        titleStore.delete(key);
        const online = findOnlinePlayerByName(name);
        if (online) {
            applyPlayerTitle(online);
        }
        return jsonOk({ key });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtSetDisplayName", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        const displayName = String(parsed && parsed.displayName || "").trim();
        if (!name || !displayName) {
            return jsonError("name and displayName are required");
        }
        const key = String(parsed.key || "").trim() || findVipPlayerKey(name);
        customNameStore.set(key, { name: displayName });
        const online = findOnlinePlayerByName(name);
        if (online) {
            applyPlayerTitle(online);
        }
        return jsonOk({ key, displayName });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtClearDisplayName", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) {
            return jsonError("name is required");
        }
        const key = String(parsed.key || "").trim() || findVipPlayerKey(name);
        customNameStore.delete(key);
        const online = findOnlinePlayerByName(name);
        if (online) {
            applyPlayerTitle(online);
        }
        return jsonOk({ key });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtGetFlight", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) {
            return jsonError("name is required");
        }
        const key = findVipPlayerKey(name);
        const online = findOnlinePlayerByName(name);
        const vipEntry = normalizeVipEntry(getVipPlayers()[key]);
        const flightEntry = normalizeFlightEntry(getFlightPlayers()[key]);
        return JSON.stringify({
            ok: true,
            key,
            vip: {
                active: Boolean(vipEntry && isVipEntryActive(vipEntry, Date.now())),
                canFly: online ? canVipFly(online) : Boolean(vipEntry && getVipLevelConfig(vipEntry.level) && getVipLevelConfig(vipEntry.level).allowFlight === true),
                remaining5h: vipEntry ? getVipFlightRemainingForEntry(vipEntry).f5 : null,
                remainingWeek: vipEntry ? getVipFlightRemainingForEntry(vipEntry).week : null,
                flyEnabled: Boolean(vipEntry && vipEntry.flyEnabled),
            },
            purchased: {
                enabled: flightEntry.enabled,
                remainingSeconds: flightEntry.remainingSeconds,
            },
        });
    } catch (error) {
        return jsonError(error);
    }
});


// === 兑换码（CDK）：生成 / 兑换 / 列表 ===
// 职责边界：本插件持有 cdks.json 并执行兑换；网页面板只通过 mgmt 接口调用生成与兑换。
// cdks.json: { codes: { "ABCD-EFGH-IJKL": { type, level, days, amount, batch, createdAt,
//                                              usedBy: { name, xuid, at } | null, expiresAt } } }
const CDK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混的 I/O/0/1
const CDK_RAW_LEN = 12;

function getCdkDb() {
    const codes = cdkStore.get("codes");
    return codes && typeof codes === "object" && !Array.isArray(codes) ? codes : {};
}

function saveCdkDb(db) {
    cdkStore.set("codes", db && typeof db === "object" ? db : {});
}

// 归一化：忽略大小写/空格/连字符，统一为 ABCD-EFGH-IJKL；格式不对返回 ""
function normalizeCdkInput(code) {
    const raw = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw.length !== CDK_RAW_LEN) {
        return "";
    }
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function randomCdk() {
    let raw = "";
    for (let i = 0; i < CDK_RAW_LEN; i++) {
        raw += CDK_ALPHABET[Math.floor(Math.random() * CDK_ALPHABET.length)];
    }
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function describeCdk(entry) {
    if (entry.type === "coins") {
        return `${Math.floor(Number(entry.amount) || 0)} 金币`;
    }
    const lv = getVipLevelConfig(entry.level);
    const display = lv ? (lv.display || entry.level) : String(entry.level);
    const d = Math.max(0, Math.floor(Number(entry.days) || 0));
    return d > 0 ? `${display} × ${d} 天` : `${display} 永久`;
}

// 生成一批兑换码；opts: { type:"vip"|"coins", level, days, amount, count, batch, expiresHours }
function generateCdk(opts) {
    const type = String(opts && opts.type || "").toLowerCase() === "coins" ? "coins" : "vip";
    const count = Math.max(1, Math.min(100, Math.floor(Number(opts && opts.count) || 1)));
    const batch = String(opts && opts.batch || "").slice(0, 60);

    const entry = { type, batch, createdAt: Date.now(), usedBy: null, expiresAt: 0 };
    if (type === "vip") {
        const level = String(opts && opts.level || "").trim().toLowerCase();
        if (!getVipLevelConfig(level)) {
            return { error: "未知套餐: " + level };
        }
        entry.level = level;
        entry.days = Math.max(0, Math.floor(Number(opts && opts.days) || 0));
    } else {
        const amount = Math.floor(Number(opts && opts.amount) || 0);
        if (amount < 1 || amount > 10000000) {
            return { error: "金币数量需在 1 ~ 10000000 之间" };
        }
        entry.amount = amount;
    }
    const expiresHours = Math.max(0, Math.floor(Number(opts && opts.expiresHours) || 0));
    if (expiresHours > 0) {
        entry.expiresAt = Date.now() + expiresHours * 3600000;
    }

    const db = getCdkDb();
    const codes = [];
    let guard = 0;
    while (codes.length < count && guard < count * 10 + 50) {
        guard++;
        const code = randomCdk();
        if (db[code]) continue;
        db[code] = Object.assign({}, entry);
        codes.push(code);
    }
    if (!codes.length) {
        return { error: "生成失败（随机冲突）" };
    }
    saveCdkDb(db);
    logger.info(`生成兑换码 x${codes.length}: ${describeCdk(entry)}${batch ? "（" + batch + "）" : ""}`);
    return { ok: true, codes, type, desc: describeCdk(entry), batch };
}

// 兑换；返回 { ok, desc, ... } 或 { error }
function redeemCdk(inputCode, name, xuid) {
    const code = normalizeCdkInput(inputCode);
    if (!code) {
        return { error: "兑换码格式不正确（应为 12 位，如 ABCD-EFGH-IJKL）" };
    }
    const db = getCdkDb();
    const entry = db[code];
    if (!entry || typeof entry !== "object") {
        return { error: "兑换码不存在" };
    }
    if (entry.usedBy) {
        return { error: "兑换码已被使用" + (entry.usedBy.name ? "（" + entry.usedBy.name + "）" : "") };
    }
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
        return { error: "兑换码已过期" };
    }
    const who = String(name || "").trim();
    if (!who) {
        return { error: "无法确定兑换者" };
    }

    const desc = describeCdk(entry);
    if (entry.type === "coins") {
        const x = String(xuid || "");
        if (!x) {
            return { error: "金币兑换需要 xuid，请先进入游戏或在网页登录后兑换" };
        }
        if (typeof money === "undefined" || typeof money.add !== "function") {
            return { error: "经济接口不可用" };
        }
        if (!money.add(x, Math.floor(Number(entry.amount) || 0))) {
            return { error: "发放金币失败" };
        }
    } else {
        const level = String(entry.level || "");
        if (!getVipLevelConfig(level)) {
            return { error: "套餐已失效: " + level };
        }
        const key = resolveVipRecordKey(who, xuid);
        applyVipPurchase(key, who, level, Math.max(0, Math.floor(Number(entry.days) || 0)));
    }

    // 发放成功后再标记已用（单线程无并发；发放失败不消耗码）
    entry.usedBy = { name: who, xuid: String(xuid || ""), at: Date.now() };
    db[code] = entry;
    saveCdkDb(db);
    logger.info(`兑换码使用: ${code} ${who} → ${desc}`);
    return { ok: true, code, type: entry.type, desc };
}

exportApi("mgmtGenerateCdk", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const result = generateCdk(parsed || {});
        if (result.error) return jsonError(result.error);
        return jsonOk(result);
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtRedeemCdk", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const code = String(parsed && parsed.code || "");
        const name = String(parsed && parsed.name || "");
        const xuid = String(parsed && parsed.xuid || "");
        const result = redeemCdk(code, name, xuid);
        if (result.error) return jsonError(result.error);
        return jsonOk(result);
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtListCdk", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const filter = String(parsed && parsed.filter || "all"); // all | unused | used
        const db = getCdkDb();
        const items = [];
        for (const code in db) {
            const entry = db[code];
            if (!entry || typeof entry !== "object") continue;
            const used = Boolean(entry.usedBy);
            if (filter === "used" && !used) continue;
            if (filter === "unused" && used) continue;
            items.push({
                code,
                type: entry.type === "coins" ? "coins" : "vip",
                desc: describeCdk(entry),
                batch: String(entry.batch || ""),
                createdAt: Math.floor(Number(entry.createdAt) || 0),
                expiresAt: Math.floor(Number(entry.expiresAt) || 0),
                usedBy: used ? String(entry.usedBy.name || "") : "",
                usedAt: used ? Math.floor(Number(entry.usedBy.at) || 0) : 0,
            });
        }
        items.sort((a, b) => b.createdAt - a.createdAt);
        return jsonOk({ total: items.length, items: items.slice(0, 200) });
    } catch (error) {
        return jsonError(error);
    }
});


// === 商店相关导出（面板 /api/shop 使用） ===
exportApi("mgmtListPackages", () => {
    try {
        const levels = getVipLevels();
        const packages = [];
        for (const id in levels) {
            const lv = levels[id];
            if (!lv || typeof lv !== "object") continue;
            const price = Math.max(0, Math.floor(Number(lv.price) || 0));
            if (price <= 0) continue;
            packages.push({
                id,
                display: String(lv.display || id),
                price,
                durationDays: Math.max(1, Math.floor(Number(lv.durationDays) || 30)),
                flight5hSeconds: Math.max(0, Math.floor(Number(lv.flight5hSeconds) || 0)),
                flightWeekSeconds: Math.max(0, Math.floor(Number(lv.flightWeekSeconds) || 0)),
                maxHomes: Number(lv.maxHomes) || 0,
                dailyRewardMultiplier: Number(lv.dailyRewardMultiplier) || 1,
            });
        }
        return JSON.stringify({ ok: true, packages });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtGetMyVip", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) return jsonError("name is required");
        const key = findVipPlayerKey(name);
        const entry = normalizeVipEntry(getVipPlayers()[key]);
        if (!entry || !isVipEntryActive(entry, Date.now())) {
            return JSON.stringify({ ok: true, active: false });
        }
        return JSON.stringify({
            ok: true,
            active: true,
            level: entry.level,
            display: getVipDisplayName(entry.level) || entry.level,
            expireAt: entry.expireAt,
        });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtBuyVip", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        const level = String(parsed && parsed.level || "").trim().toLowerCase();
        const xuid = String(parsed && parsed.xuid || "");
        if (!name || !level) return jsonError("name 与 level 必填");

        const key = resolveVipRecordKey(name, xuid);
        const players = getVipPlayers();
        migrateVipRecordToKey(players, key, name);
        const existing = normalizeVipEntry(players[key]);
        const curLevel = existing && isVipEntryActive(existing, Date.now()) ? existing.level : "";
        const offer = getVipPurchaseOffer(level, curLevel);
        if (offer.error) return jsonError(offer.error);

        const paid = takeMoneyByXuid(xuid, offer.price);
        if (paid.error) return jsonError(paid.error);

        const expireAt = applyVipPurchase(key, name, level, offer.days);
        logger.info("网页购买VIP: " + name + " -> " + level + " 消耗" + offer.price + "金币"
            + (offer.upgradeFrom ? "（" + offer.upgradeFrom + " 升级补差价）" : ""));
        return JSON.stringify({
            ok: true,
            level,
            display: offer.cfg.display || level,
            expireAt,
            paid: offer.price,
            balance: paid.balance,
            upgradeFrom: offer.upgradeFrom || "",
        });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtBuyFlight", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        const xuid = String(parsed && parsed.xuid || "");
        const offer = getFlightPurchaseOffer(parsed && parsed.hours);
        if (offer.error) return jsonError(offer.error);
        if (!name || !xuid) return jsonError("无法确定账户");

        const paid = takeMoneyByXuid(xuid, offer.price);
        if (paid.error) return jsonError(paid.error);

        applyFlightPurchase(xuid, name, offer.seconds);
        logger.info("网页购买飞行: " + name + " +" + offer.seconds + "秒 消耗" + offer.price + "金币");
        return JSON.stringify({
            ok: true,
            hours: offer.hours,
            seconds: offer.seconds,
            paid: offer.price,
            balance: paid.balance,
        });
    } catch (error) {
        return jsonError(error);
    }
});

// === events ===
mc.listen("onServerStarted", () => {
    applyAllOnlinePlayers();
    scheduleVipFlightLoop();
    const coreConnected = importCore("getOnlineTimeColor") !== null;
    logger.info(coreConnected
        ? "LuckyClover-VIP: core API connected"
        : "LuckyClover-VIP: LuckyCloverCore not found, online-time name colors disabled");
    logger.info("LuckyClover-VIP loaded");
});

mc.listen("onJoin", (player) => {
    applyPlayerTitle(player);
    applyVipFlightState(player);
    scheduleApplyVipFlightState(player, 1500);
});

mc.listen("onLeft", (player) => {
    settleVipFlightUsage(player);
    pauseVipFlightUsage(player);
    settlePurchasedFlightUsage(player);
    pausePurchasedFlightUsage(player);
});

mc.listen("onRespawn", (player) => {
    scheduleApplyVipFlightState(player, 1000);
});



