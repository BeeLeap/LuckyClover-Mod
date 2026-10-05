// LuckyClover-Sidebar.js
// 从 LuckyClover-Plugin 拆出：侧边栏循环刷新、TPS/MSPT 采样、排行页轮换
const PLUGIN_NAME = "LuckyClover-Sidebar";
const PLUGIN_DESC = "Scoreboard sidebar with metrics and ranking pages";
const PLUGIN_VERSION = [1, 0, 0];
const PLUGIN_EXTRA = {
    Author: "Mell",
};

const NAMESPACE = "LuckyCloverSidebar";
const VIP_NAMESPACE = "LuckyCloverVIP";
const CORE_NAMESPACE = "LuckyCloverCore";

const BASE_DIR = "plugins/LuckyClover-Sidebar/";
const CONFIG_PATH = `${BASE_DIR}config.json`;

const OLD_BASE_DIR = "plugins/LuckyClover-Plugin/";

const SIDEBAR_SORT_DESC = 1;
const CONFIG_KEYS = ["sidebar"];

const vipApiCache = {};
const coreApiCache = {};
let sidebarMetrics = {
    tps: 20,
    mspt: 50,
};
let sidebarLoopStarted = false;
let sidebarTimerId = null;
let sidebarPage = "main";
let sidebarLastPageSwitch = 0;

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, PLUGIN_EXTRA);

logger.setTitle(PLUGIN_NAME);

function exportApi(name, fn) {
    ll.export(fn, NAMESPACE, name);
}
File.mkdir(BASE_DIR);

// === helpers ===
function jsonOk(extra) {
    return JSON.stringify(Object.assign({ ok: true }, extra || {}));
}

function jsonError(error) {
    return JSON.stringify({ ok: false, error: String(error || "unknown error") });
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function getCurrentTimeParts() {
    const now = new Date();
    return {
        hour: padNumber(now.getHours()),
        minute: padNumber(now.getMinutes()),
        second: padNumber(now.getSeconds()),
    };
}

function getSidebarLatency(player) {
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

// === cross-plugin imports (lazy, never caches failure) ===
function importCached(cache, namespace, name) {
    if (Object.prototype.hasOwnProperty.call(cache, name)) {
        return cache[name];
    }

    let fn = null;
    try {
        if (typeof ll.hasExported !== "function" || ll.hasExported(namespace, name)) {
            const imported = ll.imports(namespace, name);
            if (typeof imported === "function") {
                fn = imported;
            }
        }
    } catch (error) {
        fn = null;
    }

    if (fn) {
        cache[name] = fn;
    }
    return fn;
}

function importVip(name) {
    return importCached(vipApiCache, VIP_NAMESPACE, name);
}

function importCore(name) {
    return importCached(coreApiCache, CORE_NAMESPACE, name);
}

// 国庆尸潮活动（LuckyClover-Wave）联动：缺席时 importCached 返回 null，占位符全部回退默认值
const waveApiCache = {};

function importWave(name) {
    return importCached(waveApiCache, "LuckyCloverWave", name);
}

function getWaveInfo(player) {
    try {
        const fn = importWave("getStatus");
        if (!fn) return null;
        const raw = fn(JSON.stringify({ player: player.realName || player.name }));
        const w = raw && typeof raw === "object" ? raw : JSON.parse(String(raw || "null"));
        return w && w.ok ? w : null;
    } catch (error) {
        return null;
    }
}

function getPlayerTitle(player) {
    const fn = importVip("getTitle");
    if (!fn) {
        return "";
    }
    try {
        const key = player.xuid || player.uuid || player.realName;
        return String(fn(key) || "");
    } catch (error) {
        return "";
    }
}

function getPlayerDisplayName(player) {
    const fn = importVip("renderDisplayName");
    if (fn) {
        try {
            const value = fn(player);
            if (value) {
                return value;
            }
        } catch (error) {
            // fall through
        }
    }
    return String(player.realName || player.name || "");
}

function getSidebarExtras(player) {
    const fn = importCore("getSidebarExtras");
    if (!fn) {
        return null;
    }
    try {
        const extras = fn(player);
        return extras && typeof extras === "object" ? extras : null;
    } catch (error) {
        return null;
    }
}

// === config migration ===
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

function buildDefaultConfig() {
    const defaults = {
        sidebar: {
            enabled: true,
            title: "§aLuckyClover",
            serverName: "LuckyClover",
            refreshIntervalMs: 1000,
            cycleEnabled: false,
            defaultShow: true,
            cycleIntervalMs: 15000,
            rankingTitle: "§6=== 在线时长排行 ===",
            rankingLines: [
                "{topOnline1}",
                "{topOnline2}",
                "{topOnline3}",
                "{topOnline4}",
                "{topOnline5}",
                "{topOnline6}",
                "{topOnline7}",
                "{topOnline8}",
                "{topOnline9}",
                "{topOnline10}",
            ],
            lines: [
                "§b服务器§f: {serverName}",
                "§b在线玩家§f: {onlinePlayers}",
                "§b玩家§f: {playerName}",
                "§b头衔§f: {sidebarTitle}",
                "§b金币§f: {money}",
                "§b时间§f: {time}",
            ],
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
        if (oldConfig.sidebar !== undefined) {
            defaults.sidebar = oldConfig.sidebar;
        }
        logger.info("Migrated config keys from LuckyClover-Plugin/config.json");
    } catch (error) {
        logger.warn(`Failed to migrate config from LuckyClover-Plugin: ${error}`);
    }
    return defaults;
}

const config = new JsonConfigFile(CONFIG_PATH, JSON.stringify(buildDefaultConfig(), null, 4));

function initConfig() {
    config.init("sidebar", {
        enabled: true,
        title: "§aLuckyClover",
        serverName: "LuckyClover",
        refreshIntervalMs: 1000,
        cycleEnabled: false,
        defaultShow: true,
        cycleIntervalMs: 15000,
        rankingTitle: "§6=== 在线时长排行 ===",
        rankingLines: [
            "{topOnline1}",
            "{topOnline2}",
            "{topOnline3}",
            "{topOnline4}",
            "{topOnline5}",
            "{topOnline6}",
            "{topOnline7}",
            "{topOnline8}",
            "{topOnline9}",
            "{topOnline10}",
        ],
        lines: [
            "§b服务器§f: {serverName}",
            "§b在线玩家§f: {onlinePlayers}",
            "§b玩家§f: {playerName}",
            "§b头衔§f: {sidebarTitle}",
            "§b金币§f: {money}",
            "§b时间§f: {time}",
        ],
    });
}

initConfig();

// === player prefs（/sidebar on|off 显示偏好，键为玩家 key） ===
const PREFS_PATH = BASE_DIR + "prefs.json";
const prefsStore = new JsonConfigFile(PREFS_PATH, "{}");

function getSidebarPref(player) {
    const key = player.xuid || player.uuid || player.realName;
    const stored = prefsStore.get(key);
    if (typeof stored === "boolean") return stored;
    if (typeof stored === "string") return stored === "true";
    return getSidebarConfig().defaultShow !== false;
}

function setSidebarPref(player, enabled) {
    const key = player.xuid || player.uuid || player.realName;
    prefsStore.set(key, Boolean(enabled));
}

mc.regPlayerCmd("sidebar", "侧边栏显示开关 (/sidebar on|off)", (player, args) => {
    const list = Array.isArray(args) ? args : String(args || "").trim().split(/\s+/);
    const action = String(list[0] || "").toLowerCase();
    if (action === "on" || action === "开" || action === "开启") {
        setSidebarPref(player, true);
        player.tell("§a侧边栏已显示");
        updatePlayerSidebar(player);
        return;
    }
    if (action === "off" || action === "关" || action === "关闭") {
        setSidebarPref(player, false);
        player.tell("§e侧边栏已隐藏（再执行 /sidebar on 恢复）");
        player.removeSidebar();
        return;
    }
    player.tell(`§6侧边栏§f: ${getSidebarPref(player) ? "显示" : "隐藏"}，服务器启用: ${getSidebarConfig().enabled !== false ? "是" : "否"}`);
    player.tell("§e/sidebar on|off");
}, 0);

function getSidebarConfig() {
    const sidebar = config.get("sidebar", {});
    return sidebar && typeof sidebar === "object" ? sidebar : {};
}

// === rendering ===
function buildSidebarLines(player, lineTemplatesOverride) {
    const sidebar = getSidebarConfig();
    const serverName = String(sidebar.serverName || "LuckyClover");
    const lineTemplates = Array.isArray(lineTemplatesOverride) && lineTemplatesOverride.length
        ? lineTemplatesOverride
        : (Array.isArray(sidebar.lines)
            ? sidebar.lines
            : [
                "§b服务器§f: {serverName}",
                "§b在线玩家§f: {onlinePlayers}",
                "§b玩家§f: {playerName}",
                "§b头衔§f: {sidebarTitle}",
                "§b金币§f: {money}",
                "§b时间§f: {time}",
            ]);
    const onlinePlayers = mc.getOnlinePlayers().length;
    const ping = getSidebarLatency(player);
    const timeParts = getCurrentTimeParts();
    const playerMoney = player.xuid ? money.get(player.xuid) : 0;
    const playerTitle = getPlayerTitle(player);
    const extras = getSidebarExtras(player);
    const wv = getWaveInfo(player);
    const wavePhaseLabel = !wv ? ""
        : wv.phase === "wave" ? "§c激战中"
        : wv.phase === "intermission" ? "§e补给中"
        : wv.phase === "countdown"
            ? (wv.cdRemaining === -1
                ? "§6等待加入 §7· " + wv.joined + " 人"
                : "§6开局倒计时 " + wv.cdRemaining + "s §7· " + wv.joined + " 人")
        : wv.finalBoard ? "§6最终榜单"
        : wv.phase === "ended" ? "§7已结束" : "";
    const values = {
        serverName,
        onlinePlayers: String(onlinePlayers),
        tps: sidebarMetrics.tps.toFixed(2),
        mspt: sidebarMetrics.mspt.toFixed(2),
        ping: String(ping),
        playerName: getPlayerDisplayName(player),
        sidebarTitle: playerTitle || "无",
        money: String(playerMoney),
        onlineTime: extras && extras.onlineTime !== undefined ? String(extras.onlineTime) : "—",
        dailyTaskTotal: extras && extras.dailyTaskTotal !== undefined ? String(extras.dailyTaskTotal) : "—",
        dailyTaskCompleted: extras && extras.dailyTaskCompleted !== undefined ? String(extras.dailyTaskCompleted) : "—",
        dailyTaskProgress: extras && extras.dailyTaskProgress !== undefined ? String(extras.dailyTaskProgress) : "—",
        hour: timeParts.hour,
        minute: timeParts.minute,
        second: timeParts.second,
        time: `${timeParts.hour}:${timeParts.minute}:${timeParts.second}`,
        // ---- 国庆尸潮活动（LuckyClover-Wave）占位符 ----
        wave: wv ? String(wv.wave) : "—",
        waveTotal: wv ? String(wv.total) : "—",
        eventPhase: wavePhaseLabel,
        coreHp: wv ? String(wv.coreHp) : "—",
        coreMax: wv ? String(wv.coreMax) : "—",
        alive: wv ? String(wv.alive) : "—",
        myKills: wv ? String(wv.myKills) : "—",
        myScore: wv ? String(wv.myScore) : "—",
    };

    for (let i = 1; i <= 10; i++) {
        const key = `topOnline${i}`;
        values[key] = extras && extras[key] !== undefined ? String(extras[key]) : "";
        const killKey = `topKills${i}`;
        const killSlot = wv && Array.isArray(wv.topKills) ? wv.topKills[i - 1] : "";
        values[killKey] = killSlot !== undefined && killSlot !== null && killSlot !== "" ? String(killSlot) : (wv ? "—" : "");
    }

    const lineTexts = [];
    for (const template of lineTemplates) {
        let line = "";
        if (template && typeof template === "object" && Array.isArray(template.frames) && template.frames.length) {
            const interval = Math.max(500, Math.floor(Number(template.intervalMs) || 2000));
            line = String(template.frames[Math.floor(Date.now() / interval) % template.frames.length] || "");
        } else {
            line = String(template);
        }
        for (const key in values) {
            line = line.split(`{${key}}`).join(values[key]);
        }
        lineTexts.push(line);
    }

    return lineTexts;
}

function buildSidebarData(player, lineTemplatesOverride, scores) {
    const lines = buildSidebarLines(player, lineTemplatesOverride);
    const data = {};
    let score = lines.length;

    for (let i = 0; i < lines.length; i++) {
        // scores[i] 提供时（排行页=在线时长秒数）用作计分板分数列
        const value = Array.isArray(scores) && typeof scores[i] === "number" ? scores[i] : score;
        data[lines[i] + "§r".repeat(i + 1)] = value;
        score--;
    }

    return data;
}

function updatePlayerSidebar(player) {
    const sidebar = getSidebarConfig();
    if (!sidebar.enabled || !getSidebarPref(player)) {
        player.removeSidebar();
        return;
    }

    const title = String(sidebar.title || "§aLuckyClover");
    const data = buildSidebarData(player);
    player.removeSidebar();
    player.setSidebar(title, data, SIDEBAR_SORT_DESC);
}

function updateAllSidebars() {
    const players = mc.getOnlinePlayers();
    for (const player of players) {
        try {
            updatePlayerSidebar(player);
        } catch (error) {
            logger.error(`更新玩家 ${player.realName} 的侧边栏失败: ${error}`);
        }
    }
}

function updateRankingSidebar(player) {
    const sidebar = getSidebarConfig();
    if (!sidebar.enabled || !getSidebarPref(player)) return;

    const title = String(sidebar.rankingTitle || "§6=== 在线时长排行 ===");
    // 分数列 = 各名次在线时长（秒），来自 Core 的 getSidebarExtras
    let scores = null;
    try {
        const extras = getSidebarExtras(player);
        if (extras && Array.isArray(extras.topOnlineSeconds)) {
            scores = extras.topOnlineSeconds;
        }
    } catch (error) {
        scores = null;
    }
    const data = buildSidebarData(player, sidebar.rankingLines, scores);
    player.removeSidebar();
    if (Object.keys(data).length > 0) {
        player.setSidebar(title, data, SIDEBAR_SORT_DESC);
    }
}

function updateAllRankingSidebars() {
    const players = mc.getOnlinePlayers();
    for (const player of players) {
        try {
            updateRankingSidebar(player);
        } catch (error) {
            logger.error(`更新玩家 ${player.realName} 的排行侧边栏失败: ${error}`);
        }
    }
}

function isRankingActive() {
    const sidebar = getSidebarConfig();
    return sidebar.cycleEnabled === true
        && Array.isArray(sidebar.rankingLines)
        && sidebar.rankingLines.length > 0;
}

// === loop ===
function scheduleSidebarLoop() {
    if (sidebarLoopStarted) {
        return;
    }

    sidebarLoopStarted = true;
    let lastSampleTime = Date.now();

    function tick() {
        const sidebar = getSidebarConfig();
        const refreshIntervalMs = Math.max(250, Number(sidebar.refreshIntervalMs) || 1000);
        const now = Date.now();
        const elapsed = now - lastSampleTime;
        lastSampleTime = now;

        if (elapsed > 0) {
            sidebarMetrics.tps = Math.min(20, (20 * 1000) / elapsed);
            sidebarMetrics.mspt = elapsed / 20;
        }

        // Page cycling logic
        const cycleEnabled = sidebar.cycleEnabled === true;
        const cycleIntervalMs = Math.max(5000, Math.min(60000, Number(sidebar.cycleIntervalMs) || 15000));
        const hasRankingLines = Array.isArray(sidebar.rankingLines) && sidebar.rankingLines.length > 0;
        if (cycleEnabled && hasRankingLines) {
            if (sidebarLastPageSwitch === 0) {
                sidebarLastPageSwitch = now;
            } else if (now - sidebarLastPageSwitch >= cycleIntervalMs) {
                sidebarPage = sidebarPage === "main" ? "ranking" : "main";
                sidebarLastPageSwitch = now;
            }
        } else if (sidebarPage !== "main") {
            sidebarPage = "main";
            sidebarLastPageSwitch = 0;
        }

        try {
            if (sidebarPage === "ranking" && cycleEnabled && hasRankingLines) {
                updateAllRankingSidebars();
            } else {
                updateAllSidebars();
            }
        } catch (error) {
            logger.error(`侧边栏循环刷新失败: ${error}`);
        }

        const nextIntervalMs = Math.max(250, Number(getSidebarConfig().refreshIntervalMs) || 1000);
        if (nextIntervalMs !== refreshIntervalMs && sidebarTimerId !== null) {
            clearInterval(sidebarTimerId);
            sidebarTimerId = setInterval(tick, nextIntervalMs);
        }
    }

    const intervalMs = Math.max(250, Number(getSidebarConfig().refreshIntervalMs) || 1000);
    if (typeof mc.setInterval === "function") {
        sidebarTimerId = mc.setInterval(tick, intervalMs);
    } else {
        sidebarTimerId = setInterval(tick, intervalMs);
    }
    tick();
}

function refreshSidebarForPlayer(player) {
    if (sidebarPage === "ranking" && isRankingActive()) {
        updateRankingSidebar(player);
    } else {
        updatePlayerSidebar(player);
    }
}

// 单行模板渲染预览（面板「实时预览」的模板文本用）
exportApi("mgmtRenderTemplate", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const template = String(parsed.template || "");
        if (!template) {
            return jsonError("template is required");
        }
        let player = null;
        const name = String(parsed.name || "").trim();
        if (name) {
            const lowered = name.toLowerCase();
            for (const item of mc.getOnlinePlayers()) {
                if (String(item.realName || "").toLowerCase() === lowered) {
                    player = item;
                    break;
                }
            }
        }
        if (!player) player = mc.getOnlinePlayers()[0] || null;
        if (!player) return jsonError("no online player for placeholder resolution");
        const lines = buildSidebarLines(player, [template]);
        return JSON.stringify({ ok: true, line: lines[0], title: String(getSidebarConfig().title || "") });
    } catch (error) {
        return jsonError(error);
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
    const sidebar = getSidebarConfig();
    return JSON.stringify({
        ok: true,
        version: PLUGIN_VERSION.join("."),
        enabled: sidebar.enabled !== false,
        loop: sidebarLoopStarted,
        page: sidebarPage,
        cycleEnabled: sidebar.cycleEnabled === true,
        tps: Number(sidebarMetrics.tps.toFixed(2)),
        mspt: Number(sidebarMetrics.mspt.toFixed(2)),
        onlinePlayers: mc.getOnlinePlayers().length,
        coreConnected: importCore("getSidebarExtras") !== null,
        vipConnected: importVip("getTitle") !== null,
    });
});

exportApi("mgmtGetMetrics", () => {
    return JSON.stringify({
        ok: true,
        tps: Number(sidebarMetrics.tps.toFixed(2)),
        mspt: Number(sidebarMetrics.mspt.toFixed(2)),
        onlinePlayers: mc.getOnlinePlayers().length,
        page: sidebarPage,
    });
});

exportApi("mgmtRenderPreview", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const name = String(parsed && parsed.name || "").trim();
        let target = null;
        if (name) {
            const lowered = name.toLowerCase();
            for (const player of mc.getOnlinePlayers()) {
                if (String(player.realName || "").toLowerCase() === lowered) {
                    target = player;
                    break;
                }
            }
        } else {
            target = mc.getOnlinePlayers()[0] || null;
        }
        if (!target) {
            return jsonError("online player not found");
        }
        return JSON.stringify({
            ok: true,
            name: target.realName,
            title: String(getSidebarConfig().title || "§aLuckyClover"),
            page: sidebarPage,
            lines: buildSidebarLines(target),
        });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtSetPage", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const page = String(parsed && parsed.page || "");
        if (page !== "main" && page !== "ranking") {
            return jsonError("page must be 'main' or 'ranking'");
        }
        if (page === "ranking" && !isRankingActive()) {
            return jsonError("ranking page disabled (cycleEnabled=false or rankingLines empty)");
        }
        sidebarPage = page;
        sidebarLastPageSwitch = Date.now();
        if (page === "ranking") {
            updateAllRankingSidebars();
        } else {
            updateAllSidebars();
        }
        return jsonOk({ page });
    } catch (error) {
        return jsonError(error);
    }
});

// === events ===
mc.listen("onServerStarted", () => {
    scheduleSidebarLoop();
    const vipConnected = importVip("getTitle") !== null;
    const coreConnected = importCore("getSidebarExtras") !== null;
    logger.info(`LuckyClover-Sidebar loaded (VIP API: ${vipConnected ? "ok" : "missing"}, Core API: ${coreConnected ? "ok" : "missing"})`);
});

mc.listen("onJoin", (player) => {
    refreshSidebarForPlayer(player);
});
