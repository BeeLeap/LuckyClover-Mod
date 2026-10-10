// LuckyClover-Panel — LSE Node.js 网页面板后端
// 提供静态前端 + REST API + 游戏内 OP 绑定认证，并通过 ll.imports 调用
// LuckyClover 各插件导出的 mgmt* 管理接口。
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PLUGIN_NAME = "LuckyClover-Panel";
const PLUGIN_VERSION = "1.3.0";

logger.setTitle(PLUGIN_NAME);

const BASE_DIR = (typeof __dirname !== "undefined" && __dirname)
    ? __dirname
    : path.join(process.cwd(), "plugins", PLUGIN_NAME);
const WEB_DIR = path.join(BASE_DIR, "web");
const ASSETS_DIR = path.join(BASE_DIR, "assets");
const CONFIG_PATH = path.join(BASE_DIR, "panel.json");

const DEFAULT_CONFIG = {
    port: 30019,
    bind: "0.0.0.0",
    publicUrl: "",
    serverName: "LC生存服",
    checkin: {
        reward: 500,
    },
    site: {
        name: "LC生存服",
        description: "",
        defaultPage: "overview",
        siteBg: "",
        cardBg: "",
        inkColor: "",
        logo: "",
        bgImage: "",
        bgBlur: 0,
        bgMask: 0,
    },
};

const NAMESPACE_MAP = {
    core: "LuckyCloverCore",
    vip: "LuckyCloverVIP",
    tpa: "LuckyCloverTPA",
    seat: "LuckyCloverSeat",
    sidebar: "LuckyCloverSidebar",
    mall: "LuckyCloverShoppingMall",
};


// ---------- config ----------
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
            const merged = Object.assign({}, DEFAULT_CONFIG, parsed);
            merged.site = Object.assign({}, DEFAULT_CONFIG.site, parsed.site || {});
            return merged;
        }
    } catch (error) {
        logger.warn(`读取 panel.json 失败，使用默认配置: ${error}`);
    }
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4), "utf8");
    } catch (error) {
        logger.warn(`写入 panel.json 失败: ${error}`);
    }
    return Object.assign({}, DEFAULT_CONFIG);
}

const config = loadConfig();

function getPublicUrl() {
    const configured = String(config.publicUrl || "").trim();
    if (configured) return configured.replace(/\/$/, "");
    const port = Number(config.port) || 30019;
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const item of (interfaces[name] || [])) {
                if (item && item.family === "IPv4" && !item.internal && item.address) {
                    return `http://${item.address}:${port}`;
                }
            }
        }
    } catch (error) {
        // 网络接口不可读时由管理员通过 publicUrl 显式配置。
    }
    return "";
}

if (typeof ll !== "undefined" && typeof ll.export === "function") {
    ll.export(() => getPublicUrl(), "LuckyCloverPanel", "getPublicUrl");
}

// ---------- cross-plugin imports (lazy) ----------
const importCache = {};

function importMgmt(pluginKey, method) {
    const ns = NAMESPACE_MAP[pluginKey];
    if (!ns) {
        return null;
    }
    const cacheKey = `${ns}.${method}`;
    if (Object.prototype.hasOwnProperty.call(importCache, cacheKey)) {
        return importCache[cacheKey];
    }

    let fn = null;
    try {
        if (typeof ll.hasExported !== "function" || ll.hasExported(ns, method)) {
            const imported = ll.imports(ns, method);
            if (typeof imported === "function") {
                fn = imported;
            }
        }
    } catch (error) {
        fn = null;
    }
    if (fn) {
        importCache[cacheKey] = fn;
    }
    return fn;
}

function safeJson(text, fallback) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return fallback;
    }
}

// ---------- cpu sampler ----------
let prevCpuTimes = os.cpus();
let cpuPercent = 0;
let cpuTimer = null;

function sampleCpu() {
    const current = os.cpus();
    let idle = 0;
    let total = 0;
    for (let i = 0; i < current.length; i++) {
        const now = current[i].times;
        const before = prevCpuTimes[i] ? prevCpuTimes[i].times : now;
        idle += now.idle - before.idle;
        total += (now.user - before.user) + (now.nice - before.nice)
            + (now.sys - before.sys) + (now.idle - before.idle);
    }
    prevCpuTimes = current;
    if (total > 0) {
        cpuPercent = Math.max(0, Math.min(100, (1 - idle / total) * 100));
    }
}

function startCpuSampler() {
    if (cpuTimer) {
        return;
    }
    cpuTimer = setInterval(sampleCpu, 2000);
    sampleCpu();
}

// ---------- server.properties reader ----------
let serverPropsCache = { data: null, mtime: 0 };

function getServerProps() {
    try {
        const propsPath = path.join(process.cwd(), "server.properties");
        const stat = fs.statSync(propsPath);
        if (serverPropsCache.data && serverPropsCache.mtime === stat.mtimeMs) {
            return serverPropsCache.data;
        }
        const data = {};
        const text = fs.readFileSync(propsPath, "utf8");
        for (const line of text.split(/\r?\n/)) {
            const idx = line.indexOf("=");
            if (idx > 0 && !line.startsWith("#")) {
                data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            }
        }
        serverPropsCache = { data, mtime: stat.mtimeMs };
        return data;
    } catch (error) {
        return {};
    }
}

// ---------- auth: in-game password + web login ----------
// 密码存于 passwords.json：{ 名称小写: { name, salt, hash, xuid, updatedAt } }
const PASSWORD_PATH = path.join(BASE_DIR, "passwords.json");
const CHECKIN_PATH = path.join(BASE_DIR, "checkins.json");

function validBrowserId(id) {
    return typeof id === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}

function loadPasswords() {
    try {
        if (fs.existsSync(PASSWORD_PATH)) {
            const data = JSON.parse(fs.readFileSync(PASSWORD_PATH, "utf8"));
            return data && typeof data === "object" ? data : {};
        }
    } catch (error) {
        logger.warn(`读取 passwords.json 失败: ${error}`);
    }
    return {};
}

function savePasswords(db) {
    try {
        fs.writeFileSync(PASSWORD_PATH, JSON.stringify(db, null, 4), "utf8");
        return true;
    } catch (error) {
        logger.warn(`写入 passwords.json 失败: ${error}`);
        return false;
    }
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(String(password), String(salt), 120000, 32, "sha256").toString("hex");
}

function setPasswordForPlayer(player, password) {
    const realName = String(player.realName || player.name || "");
    const key = realName.toLowerCase();
    if (!key) return false;
    const db = loadPasswords();
    const salt = crypto.randomBytes(16).toString("hex");
    db[key] = {
        name: realName,
        salt,
        hash: hashPassword(password, salt),
        xuid: String(player.xuid || ""),
        role: (typeof player.isOP === "function" && player.isOP()) ? "admin" : "player",
        updatedAt: Date.now(),
    };
    return savePasswords(db);
}

function clearPasswordForPlayer(player) {
    const key = String(player.realName || player.name || "").toLowerCase();
    const db = loadPasswords();
    if (!db[key]) return false;
    delete db[key];
    return savePasswords(db);
}

function verifyLogin(username, password) {
    const key = String(username || "").trim().toLowerCase();
    if (!key) return null;
    const rec = loadPasswords()[key];
    if (!rec || !rec.salt || !rec.hash) return null;
    try {
        const calc = Buffer.from(hashPassword(password, rec.salt), "hex");
        const expect = Buffer.from(String(rec.hash), "hex");
        if (calc.length !== expect.length || !crypto.timingSafeEqual(calc, expect)) {
            return null;
        }
        return {
            name: String(rec.name || key),
            role: rec.role === "player" ? "player" : "admin",
        };
    } catch (error) {
        return null;
    }
}

// sessions: browserId -> { name, role, authedAt }（内存会话，重启失效）
const sessions = new Map();

function getSessionStatus(browserId) {
    const session = sessions.get(browserId);
    if (session) {
        return { authed: true, name: session.name, role: session.role };
    }
    return { authed: false, name: "", role: "guest" };
}

function destroySession(browserId) {
    sessions.delete(browserId);
}

// ---------- overview ----------
function getPlayerDimension(player) {
    try {
        if (player.dimension && typeof player.dimension === "object") {
            return String(player.dimension.id || player.dimension.name || "");
        }
        if (typeof player.getDimensionName === "function") {
            return String(player.getDimensionName());
        }
    } catch (error) {
        // fall through
    }
    return "";
}

function dimensionLabel(dim) {
    const text = String(dim || "").toLowerCase();
    if (!text) return "—";
    if (text.includes("nether")) return "下界";
    if (text.includes("end")) return "末地";
    if (text.includes("over") || text === "0") return "主世界";
    return dim;
}

function getPlayerGameMode(player) {
    try {
        if (typeof player.getGameMode === "function") {
            const value = player.getGameMode();
            const map = { 0: "生存", 1: "创造", 2: "冒险", 3: "旁观" };
            return map[Number(value)] || String(value);
        }
        if (player.gamemode !== undefined && player.gamemode !== null) {
            const map = { 0: "生存", 1: "创造", 2: "冒险", 3: "旁观" };
            return map[Number(player.gamemode)] || String(player.gamemode);
        }
    } catch (error) {
        // fall through
    }
    return "—";
}

function getPlayerPing(player) {
    try {
        const device = player.getDevice();
        if (device && typeof device.lastPing === "number") return device.lastPing;
        if (device && typeof device.avgPing === "number") return device.avgPing;
    } catch (error) {
        // fall through
    }
    return 0;
}

function getPlayerHealth(player) {
    try {
        if (typeof player.health === "number") {
            return Math.round(player.health * 10) / 10;
        }
    } catch (error) {
        // fall through
    }
    return null;
}

function getDayInfo() {
    // LSE 各版本暴露不同：尽力探测，缺省返回 null
    try {
        if (typeof mc.getDayTime === "function") {
            const ticks = Number(mc.getDayTime()) || 0;
            const day = Math.floor(ticks / 24000) + 1;
            const tod = ticks % 24000;
            const hour = Math.floor(((tod / 1000) + 6) % 24);
            const minute = Math.floor((tod % 1000) / 1000 * 60);
            return { day, label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
        }
    } catch (error) {
        // fall through
    }
    return null;
}

function getDiskUsage() {
    try {
        if (typeof fs.statfsSync === "function") {
            const root = path.parse(process.cwd()).root;
            const stat = fs.statfsSync(root);
            const total = Number(stat.blocks) * Number(stat.bsize);
            const free = Number(stat.bavail) * Number(stat.bsize);
            if (total > 0) {
                return { total, used: total - free };
            }
        }
    } catch (error) {
        // fall through
    }
    return null;
}

function buildOverview() {
    const props = getServerProps();

    // 侧边栏指标（TPS/MSPT）
    let tps = null;
    let mspt = null;
    const metricsFn = importMgmt("sidebar", "mgmtGetMetrics");
    if (metricsFn) {
        try {
            const metrics = safeJson(metricsFn(), null);
            if (metrics && metrics.ok) {
                tps = metrics.tps;
                mspt = metrics.mspt;
            }
        } catch (error) {
            logger.warn(`sidebar mgmtGetMetrics 失败: ${error}`);
        }
    }

    // 实体统计
    let entities = 0;
    let itemDrops = 0;
    try {
        const list = mc.getAllEntities();
        entities = list.length;
        for (const entity of list) {
            const type = String(entity.type || entity.typeName || "");
            if (type.endsWith(":item")) {
                itemDrops++;
            }
        }
    } catch (error) {
        logger.warn(`实体统计失败: ${error}`);
    }

    // 在线玩家
    const players = [];
    let online = 0;
    try {
        const list = mc.getOnlinePlayers();
        online = list.length;
        const extrasFn = importMgmt("core", "getSidebarExtras");
        for (const player of list) {
            let onlineTime = "—";
            if (extrasFn) {
                try {
                    const extras = extrasFn(player);
                    if (extras && extras.onlineTime !== undefined) {
                        onlineTime = String(extras.onlineTime);
                    }
                } catch (error) {
                    // 忽略单个玩家失败
                }
            }
            players.push({
                name: String(player.realName || player.name || ""),
                health: getPlayerHealth(player),
                dimension: dimensionLabel(getPlayerDimension(player)),
                gameMode: getPlayerGameMode(player),
                ping: getPlayerPing(player),
                onlineTime,
            });
        }
    } catch (error) {
        logger.warn(`在线玩家统计失败: ${error}`);
    }

    // 系统信息
    const cpus = os.cpus();
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const disk = getDiskUsage();
    const dayInfo = getDayInfo();

    return {
        ok: true,
        serverName: config.serverName,
        version: PLUGIN_VERSION,
        server: {
            tps,
            mspt,
            online,
            maxPlayers: Number(props["max-players"]) || null,
            entities,
            itemDrops,
            uptimeSeconds: Math.floor(process.uptime()),
            worldName: props["level-name"] || "—",
            gamemode: props["gamemode"] || "—",
            seed: props["level-seed"] ? String(props["level-seed"]) : null,
            day: dayInfo ? dayInfo.day : null,
            timeLabel: dayInfo ? dayInfo.label : null,
        },
        system: {
            cpu: {
                model: cpus.length && cpus[0].model ? String(cpus[0].model).trim() : "未知 CPU",
                percent: Math.round(cpuPercent * 10) / 10,
            },
            mem: {
                total: memTotal,
                used: memTotal - memFree,
                percent: memTotal > 0 ? Math.round(((memTotal - memFree) / memTotal) * 1000) / 10 : 0,
            },
            disk: disk
                ? {
                    total: disk.total,
                    used: disk.used,
                    percent: disk.total > 0 ? Math.round((disk.used / disk.total) * 1000) / 10 : 0,
                }
                : null,
        },
        players,
    };
}

// ---------- http helpers ----------
function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Panel-Session",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end(text);
}

function readBody(req, maxBytes) {
    return new Promise((resolve) => {
        const chunks = [];
        const limit = maxBytes || 1024 * 1024;
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limit) {
                req.destroy();
                resolve(null);
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (!chunks.length) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                resolve(null);
            }
        });
        req.on("error", () => resolve(null));
    });
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
};

function serveStatic(res, urlPath) {
    let rel = urlPath === "/" ? "/index.html" : urlPath;
    rel = rel.split("?")[0];
    const resolved = path.normalize(path.join(WEB_DIR, rel));
    if (!resolved.startsWith(WEB_DIR)) {
        sendJson(res, 403, { ok: false, error: "forbidden" });
        return;
    }
    fs.readFile(resolved, (error, data) => {
        if (error) {
            sendJson(res, 404, { ok: false, error: "not found" });
            return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Cache-Control": "no-cache",
        });
        res.end(data);
    });
}

function getSessionRole(req) {
    const browserId = req.headers["x-panel-session"];
    if (!validBrowserId(browserId)) {
        return null;
    }
    const status = getSessionStatus(browserId);
    return status.authed ? status : null;
}

// ---------- admin invoke ----------
function invokeAdmin(pluginKey, method, args) {
    if (!Object.prototype.hasOwnProperty.call(NAMESPACE_MAP, pluginKey)) {
        return { ok: false, error: `unknown plugin: ${pluginKey}` };
    }
    if (!/^mgmt[A-Za-z0-9]+$/.test(String(method || ""))) {
        return { ok: false, error: `method not allowed: ${method}` };
    }
    const fn = importMgmt(pluginKey, method);
    if (!fn) {
        return { ok: false, error: `${NAMESPACE_MAP[pluginKey]} 未导出 ${method}（插件未安装或版本过旧）` };
    }
    try {
        const list = Array.isArray(args) ? args : [];
        const raw = fn(...list);
        if (typeof raw === "string") {
            const parsed = safeJson(raw, null);
            if (parsed !== null && typeof parsed === "object" && parsed.ok === undefined) {
                parsed.ok = true; // 兼容未返回 ok 字段的 mgmt 接口（如 mgmtGetConfig）
            }
            return parsed !== null ? parsed : { ok: true, raw };
        }
        if (raw !== null && typeof raw === "object" && raw.ok === undefined) {
            return Object.assign({}, raw, { ok: true });
        }
        return { ok: true, data: raw };
    } catch (error) {
        return { ok: false, error: String(error) };
    }
}

const PUBLIC_MALL_METHODS = new Set([
    "mgmtOverview",
    "mgmtListOfficial",
    "mgmtListRecycle",
    "mgmtListShops",
    "mgmtGetShop",
    "mgmtListCategories",
]);

function invokePublicMall(method, args) {
    if (!PUBLIC_MALL_METHODS.has(method)) {
        return { ok: false, error: "商城查询接口不允许此操作" };
    }
    return invokeAdmin("mall", method, args);
}

function publicShopRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
        id: publicShopToken(row.xuid),
        name: String(row.name || row.shopName || "未命名店铺"),
        ownerName: String(row.ownerName || row.owner || "未知店主"),
        isOpen: row.isOpen !== false,
        itemTypes: Number(row.itemTypes) || 0,
        itemCount: Number(row.itemCount) || 0,
    }));
}

function publicShopToken(xuid) {
    return crypto.createHash("sha256").update(String(xuid || "")).digest("hex").slice(0, 20);
}

function resolvePublicShopXuid(token) {
    const wanted = String(token || "").toLowerCase();
    if (!/^[a-f0-9]{20}$/.test(wanted)) return "";
    for (let page = 1; page <= 100; page += 1) {
        const result = invokePublicMall("mgmtListShops", [JSON.stringify({ page })]);
        if (!result || !result.ok) return "";
        for (const row of (result.rows || [])) {
            if (publicShopToken(row.xuid) === wanted) return String(row.xuid || "");
        }
        if (!result.pages || page >= Number(result.pages)) break;
    }
    return "";
}

function saveConfigFile() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), "utf8");
        return true;
    } catch (error) {
        logger.warn("写入 panel.json 失败: " + error);
        return false;
    }
}

function isAdminSession(req) {
    const session = getSessionRole(req);
    return Boolean(session && session.role === "admin");
}

function serveAsset(res, urlPath) {
    const rel = urlPath.slice("/assets/".length).split("?")[0];
    const resolved = path.normalize(path.join(ASSETS_DIR, rel));
    if (!resolved.startsWith(ASSETS_DIR)) {
        sendJson(res, 403, { ok: false, error: "forbidden" });
        return;
    }
    fs.readFile(resolved, (error, data) => {
        if (error) {
            sendJson(res, 404, { ok: false, error: "asset not found" });
            return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Cache-Control": "no-cache",
        });
        res.end(data);
    });
}

// ---------- routes ----------
// 按玩家名解析 xuid：在线玩家优先，回退到密码档案
function resolveXuid(name) {
    const lower = String(name || "").toLowerCase();
    if (!lower) return "";
    try {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            if (String(player.realName || "").toLowerCase() === lower && player.xuid) {
                return String(player.xuid);
            }
        }
    } catch (error) {
        // 忽略
    }
    try {
        const rec = loadPasswords()[lower];
        if (rec && rec.xuid) return String(rec.xuid);
    } catch (error) {
        // 忽略
    }
    return "";
}

// ---------- daily check-in ----------
function loadCheckins() {
    try {
        if (fs.existsSync(CHECKIN_PATH)) {
            const data = JSON.parse(fs.readFileSync(CHECKIN_PATH, "utf8"));
            return data && typeof data === "object" ? data : {};
        }
    } catch (error) {
        logger.warn("读取 checkins.json 失败: " + error);
    }
    return {};
}

function saveCheckins(db) {
    try {
        fs.writeFileSync(CHECKIN_PATH, JSON.stringify(db, null, 4), "utf8");
        return true;
    } catch (error) {
        logger.warn("写入 checkins.json 失败: " + error);
        return false;
    }
}

function checkinKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function checkinMonthPrefix() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

function checkinRewardAmount() {
    const value = config.checkin && Number(config.checkin.reward);
    return value && value > 0 ? Math.floor(value) : 500;
}

function findXuidByName(name) {
    const lower = String(name || "").toLowerCase();
    try {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            if (String(player.realName || "").toLowerCase() === lower && player.xuid) {
                return String(player.xuid);
            }
        }
    } catch (error) {
        // 忽略
    }
    try {
        const db = loadPasswords();
        const rec = db[lower];
        if (rec && rec.xuid) {
            return String(rec.xuid);
        }
    } catch (error) {
        // 忽略
    }
    return "";
}

function checkinMonthDays(rec) {
    const days = {};
    const prefix = checkinMonthPrefix();
    const source = (rec && rec.days) || {};
    for (const day of Object.keys(source)) {
        if (day.indexOf(prefix) === 0 && source[day]) {
            days[day] = true;
        }
    }
    return days;
}

function performCheckin(name, xuid) {
    const reward = checkinRewardAmount();
    const key = String(name || "").toLowerCase();
    if (!key) return { ok: false, error: "无效的玩家名" };

    const db = loadCheckins();
    const rec = db[key] && typeof db[key] === "object"
        ? Object.assign({ streak: 0, days: {}, last: "" }, db[key])
        : { streak: 0, days: {}, last: "" };
    rec.days = rec.days && typeof rec.days === "object" ? rec.days : {};

    const today = checkinKey(new Date());
    if (rec.days[today]) {
        // 网页端与游戏端共用同一份 checkins.json，同一天只记一次，天然防重复签到
        return {
            ok: true, already: true, today: true, name,
            streak: Number(rec.streak) || 0,
            days: checkinMonthDays(rec), reward, granted: false,
        };
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    rec.streak = rec.last === checkinKey(yesterday) ? (Number(rec.streak) || 0) + 1 : 1;
    rec.days[today] = true;
    rec.last = today;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 70);
    const cKey = checkinKey(cutoff);
    for (const day of Object.keys(rec.days)) {
        if (day < cKey) delete rec.days[day];
    }
    db[key] = rec;
    if (!saveCheckins(db)) {
        return { ok: false, error: "签到数据保存失败" };
    }

    let granted = false;
    let note = "";
    const effectiveXuid = xuid || findXuidByName(name);
    if (!effectiveXuid) {
        note = "未找到账号绑定，奖励未发放";
    } else if (typeof money === "undefined" || typeof money.add !== "function") {
        note = "经济 API 不可用，奖励未发放";
    } else {
        try {
            granted = Boolean(money.add(effectiveXuid, reward));
        } catch (error) {
            granted = false;
            note = "奖励发放失败: " + error;
        }
    }

    logger.info("签到: " + name + " 连续" + rec.streak + "天 奖励" + (granted ? "已发放" : "未发放"));
    return {
        ok: true, today: true, name,
        streak: Number(rec.streak) || 0,
        days: checkinMonthDays(rec), reward, granted, note,
    };
}

// 游戏内签到：/signin（与网页端共用 checkins.json，同日防重复）
mc.regPlayerCmd("signin", "每日签到 (/signin)", (player) => {
    const result = performCheckin(player.realName || player.name || "", player.xuid || "");
    if (!result || !result.ok) {
        player.tell("§c" + ((result && result.error) || "签到失败"));
        return;
    }
    if (result.already) {
        player.tell("§e今天已签到过了，已连续签到 " + result.streak + " 天");
        return;
    }
    if (result.granted) {
        player.tell("§a签到成功！+" + result.reward + " 金币，已连续签到 " + result.streak + " 天");
    } else {
        player.tell("§a签到成功，已连续签到 " + result.streak + " 天" + (result.note ? "（" + result.note + "）" : ""));
    }
}, 0);

async function handleApi(req, res, url) {
    const route = `${req.method} ${url.pathname}`;

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, X-Panel-Session",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        res.end();
        return;
    }

    if (route === "GET /api/overview") {
        try {
            sendJson(res, 200, buildOverview());
        } catch (error) {
            sendJson(res, 500, { ok: false, error: String(error) });
        }
        return;
    }

    if (route === "GET /api/site") {
        sendJson(res, 200, { ok: true, site: config.site || {} });
        return;
    }

    if (route === "POST /api/site") {
        if (!isAdminSession(req)) {
            sendJson(res, 403, { ok: false, error: "需要管理员权限" });
            return;
        }
        const body = await readBody(req);
        const incoming = body && body.site;
        if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
            sendJson(res, 400, { ok: false, error: "invalid site payload" });
            return;
        }
        const allow = ["name", "description", "defaultPage", "siteBg", "cardBg", "inkColor", "bgBlur", "bgMask"];
        const next = Object.assign({}, config.site || {});
        for (const key of allow) {
            if (incoming[key] === undefined) continue;
            if (key === "bgBlur" || key === "bgMask") {
                const max = key === "bgMask" ? 1 : 50;
                next[key] = Math.max(0, Math.min(max, Number(incoming[key]) || 0));
            } else if (key === "defaultPage") {
                next[key] = incoming[key] === "admin" ? "admin" : "overview";
            } else {
                const limit = key === "description" ? 2000 : 200;
                next[key] = String(incoming[key] === null ? "" : incoming[key]).slice(0, limit);
            }
        }
        config.site = next;
        if (!saveConfigFile()) {
            sendJson(res, 500, { ok: false, error: "写入 panel.json 失败" });
            return;
        }
        logger.info("站点设置已更新: " + next.name);
        sendJson(res, 200, { ok: true, site: config.site });
        return;
    }

    if (route === "POST /api/site/asset") {
        if (!isAdminSession(req)) {
            sendJson(res, 403, { ok: false, error: "需要管理员权限" });
            return;
        }
        const body = await readBody(req, 8 * 1024 * 1024);
        if (!body) {
            sendJson(res, 400, { ok: false, error: "图片过大或请求无效（上限 8MB）" });
            return;
        }
        const kind = body.kind === "background" ? "background" : "logo";
        const field = kind === "background" ? "bgImage" : "logo";
        const prefix = kind === "background" ? "bg." : "logo.";
        try {
            fs.mkdirSync(ASSETS_DIR, { recursive: true });
        } catch (error) {
            // 目录已存在
        }
        const clearExisting = () => {
            for (const file of fs.readdirSync(ASSETS_DIR)) {
                if (file.startsWith(prefix)) {
                    try {
                        fs.unlinkSync(path.join(ASSETS_DIR, file));
                    } catch (error) {
                        // 忽略删除失败
                    }
                }
            }
        };
        if (body.action === "clear") {
            clearExisting();
            config.site[field] = "";
            saveConfigFile();
            sendJson(res, 200, { ok: true, site: config.site });
            return;
        }
        const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ""));
        if (!match) {
            sendJson(res, 400, { ok: false, error: "仅支持 png / jpeg / webp / gif 图片" });
            return;
        }
        const buf = Buffer.from(match[2], "base64");
        if (buf.length > 3 * 1024 * 1024) {
            sendJson(res, 400, { ok: false, error: "图片不能超过 3MB" });
            return;
        }
        clearExisting();
        const ext = (match[1] === "jpeg" ? "jpg" : match[1]);
        const filename = prefix + ext;
        fs.writeFileSync(path.join(ASSETS_DIR, filename), buf);
        config.site[field] = filename;
        if (!saveConfigFile()) {
            sendJson(res, 500, { ok: false, error: "写入 panel.json 失败" });
            return;
        }
        sendJson(res, 200, { ok: true, site: config.site, url: "/assets/" + filename });
        return;
    }

    if (route === "GET /api/market") {
        const keyword = String(url.searchParams.get("keyword") || "").trim().slice(0, 40);
        const category = String(url.searchParams.get("category") || "全部").trim().slice(0, 20) || "全部";
        const payload = JSON.stringify({ page: 1, keyword, category });
        const overview = invokePublicMall("mgmtOverview", []);
        const official = invokePublicMall("mgmtListOfficial", [payload]);
        const recycle = invokePublicMall("mgmtListRecycle", [JSON.stringify({ page: 1, keyword, category })]);
        const shops = invokePublicMall("mgmtListShops", [JSON.stringify({ page: 1, keyword })]);
        const categories = invokePublicMall("mgmtListCategories", []);
        const unavailable = [overview, official, recycle, shops].find((item) => item && item.ok === false);
        if (unavailable && /未导出|未安装|未就绪/.test(String(unavailable.error || ""))) {
            sendJson(res, 503, { ok: false, error: "商城插件未就绪" });
            return;
        }
        sendJson(res, 200, {
            ok: true,
            keyword,
            category,
            stats: overview && overview.stats ? overview.stats : {},
            official: official && official.ok ? Object.assign({}, official, { rows: (official.rows || []).slice(0, 12) }) : { rows: [] },
            recycle: recycle && recycle.ok ? Object.assign({}, recycle, { rows: (recycle.rows || []).slice(0, 12) }) : { rows: [] },
            shops: shops && shops.ok ? Object.assign({}, shops, { rows: publicShopRows((shops.rows || []).slice(0, 12)) }) : { rows: [] },
            categories: categories && categories.ok && Array.isArray(categories.categories) ? categories.categories : [],
        });
        return;
    }

    if (route === "GET /api/market/shop") {
        const xuid = resolvePublicShopXuid(url.searchParams.get("id"));
        if (!xuid) {
            sendJson(res, 404, { ok: false, error: "店铺不存在" });
            return;
        }
        const result = invokePublicMall("mgmtGetShop", [JSON.stringify({ xuid })]);
        if (!result || !result.ok) {
            sendJson(res, 404, { ok: false, error: (result && result.error) || "店铺不存在" });
            return;
        }
        sendJson(res, 200, {
            ok: true,
            name: String(result.name || "未命名店铺"),
            ownerName: String(result.ownerName || "未知店主"),
            notice: String(result.notice || ""),
            isOpen: result.isOpen !== false,
            items: Array.isArray(result.items) ? result.items.slice(0, 100) : [],
        });
        return;
    }

    if (route === "GET /api/shop") {
        const browserId = url.searchParams.get("browserId") || "";
        const session = validBrowserId(browserId) ? getSessionStatus(browserId) : { authed: false };
        const out = {
            ok: true,
            authed: session.authed,
            name: session.authed ? session.name : "",
            packages: [],
            fly: null,
            balance: null,
            myVip: null,
            flight: null,
        };

        const pkgFn = importMgmt("vip", "mgmtListPackages");
        if (pkgFn) {
            try {
                const r = safeJson(pkgFn(), null);
                if (r && r.ok) out.packages = r.packages;
            } catch (error) {
                out.packagesError = String(error);
            }
        } else {
            out.packagesError = "LuckyClover-VIP 未就绪";
        }

        const cfgFn = importMgmt("vip", "mgmtGetConfig");
        let vipLevels = null;
        if (cfgFn) {
            try {
                const r = safeJson(cfgFn(), null);
                if (r && r.fly) out.fly = r.fly;
                if (r && r.vip && r.vip.levels) vipLevels = r.vip.levels;
            } catch (error) {
                // 忽略
            }
        }

        if (session.authed) {
            const xuid = resolveXuid(session.name);
            out.balance = (xuid && typeof money !== "undefined" && typeof money.get === "function")
                ? Math.floor(Number(money.get(xuid)) || 0)
                : null;
            const myFn = importMgmt("vip", "mgmtGetMyVip");
            if (myFn) {
                try {
                    out.myVip = safeJson(myFn(JSON.stringify({ name: session.name })), null);
                } catch (error) {
                    // 忽略
                }
            }
            const flightFn = importMgmt("vip", "mgmtGetFlight");
            if (flightFn) {
                try {
                    out.flight = safeJson(flightFn(JSON.stringify({ name: session.name })), null);
                } catch (error) {
                    // 忽略
                }
            }
        }

        // 按当前生效套餐计算每个套餐的实付价：同级=续费原价；高等级=补差价；低等级=禁购
        const curLevel = out.myVip && out.myVip.ok && out.myVip.active ? String(out.myVip.level || "") : "";
        let curPrice = 0;
        if (curLevel && vipLevels && vipLevels[curLevel]) {
            curPrice = Math.max(0, Math.floor(Number(vipLevels[curLevel].price) || 0));
        }
        for (const pkg of out.packages) {
            const price = Math.max(0, Math.floor(Number(pkg.price) || 0));
            if (!curLevel || pkg.id === curLevel) {
                pkg.buyPrice = price;
                pkg.buyable = true;
                pkg.reason = curLevel ? "续费叠加时长" : "";
            } else if (price > curPrice) {
                pkg.buyPrice = price - curPrice;
                pkg.buyable = true;
                pkg.reason = "升级补差价";
            } else {
                pkg.buyPrice = price;
                pkg.buyable = false;
                pkg.reason = "不可购买低等级";
            }
        }
        sendJson(res, 200, out);
        return;
    }

    if (route === "POST /api/shop/buy-vip") {
        const body = await readBody(req);
        const browserId = body && body.browserId;
        if (!validBrowserId(browserId)) {
            sendJson(res, 400, { ok: false, error: "invalid browserId" });
            return;
        }
        const session = getSessionStatus(browserId);
        if (!session.authed) {
            sendJson(res, 401, { ok: false, error: "请先登录" });
            return;
        }
        const level = String((body && body.level) || "").trim().toLowerCase();
        if (!level) {
            sendJson(res, 400, { ok: false, error: "缺少套餐 ID" });
            return;
        }
        const xuid = resolveXuid(session.name);
        if (!xuid) {
            sendJson(res, 400, { ok: false, error: "无法确定账户，请先进入游戏执行 /panel passwd 重新设置密码" });
            return;
        }
        const fn = importMgmt("vip", "mgmtBuyVip");
        if (!fn) {
            sendJson(res, 503, { ok: false, error: "LuckyClover-VIP 未就绪" });
            return;
        }
        const result = safeJson(fn(JSON.stringify({ name: session.name, xuid, level })), { ok: false, error: "返回解析失败" });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
    }

    if (route === "POST /api/shop/buy-flight") {
        const body = await readBody(req);
        const browserId = body && body.browserId;
        if (!validBrowserId(browserId)) {
            sendJson(res, 400, { ok: false, error: "invalid browserId" });
            return;
        }
        const session = getSessionStatus(browserId);
        if (!session.authed) {
            sendJson(res, 401, { ok: false, error: "请先登录" });
            return;
        }
        const hours = Math.max(1, Math.min(168, Math.floor(Number(body && body.hours) || 1)));
        const xuid = resolveXuid(session.name);
        if (!xuid) {
            sendJson(res, 400, { ok: false, error: "无法确定账户，请先进入游戏执行 /panel passwd 重新设置密码" });
            return;
        }
        const fn = importMgmt("vip", "mgmtBuyFlight");
        if (!fn) {
            sendJson(res, 503, { ok: false, error: "LuckyClover-VIP 未就绪" });
            return;
        }
        const result = safeJson(fn(JSON.stringify({ name: session.name, xuid, hours })), { ok: false, error: "返回解析失败" });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
    }

    // 玩家网页兑换（任意已登录角色）；生成/列表走 /api/admin/invoke（mgmt 白名单）
    if (route === "POST /api/cdk/redeem") {
        const body = await readBody(req);
        const browserId = body && body.browserId;
        if (!validBrowserId(browserId)) {
            sendJson(res, 400, { ok: false, error: "invalid browserId" });
            return;
        }
        const session = getSessionStatus(browserId);
        if (!session.authed) {
            sendJson(res, 401, { ok: false, error: "请先登录" });
            return;
        }
        const code = String((body && body.code) || "").trim();
        if (!code) {
            sendJson(res, 400, { ok: false, error: "请输入兑换码" });
            return;
        }
        const fn = importMgmt("vip", "mgmtRedeemCdk");
        if (!fn) {
            sendJson(res, 503, { ok: false, error: "LuckyClover-VIP 未就绪" });
            return;
        }
        const xuid = resolveXuid(session.name);
        const result = safeJson(fn(JSON.stringify({ code, name: session.name, xuid })), { ok: false, error: "返回解析失败" });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
    }

    if (route === "GET /api/checkin") {
        const browserId = url.searchParams.get("browserId") || "";
        const reward = checkinRewardAmount();
        const session = validBrowserId(browserId) ? getSessionStatus(browserId) : { authed: false };
        if (!session.authed) {
            sendJson(res, 200, { ok: true, authed: false, reward, streak: 0, today: false, days: {} });
            return;
        }
        const key = String(session.name).toLowerCase();
        const db = loadCheckins();
        const rec = db[key] && typeof db[key] === "object" ? db[key] : { streak: 0, days: {} };
        const today = checkinKey(new Date());
        sendJson(res, 200, {
            ok: true,
            authed: true,
            name: session.name,
            today: Boolean(rec.days && rec.days[today]),
            streak: Number(rec.streak) || 0,
            days: checkinMonthDays(rec),
            reward,
        });
        return;
    }

    if (route === "POST /api/checkin") {
        const body = await readBody(req);
        const browserId = body && body.browserId;
        if (!validBrowserId(browserId)) {
            sendJson(res, 400, { ok: false, error: "invalid browserId" });
            return;
        }
        const session = getSessionStatus(browserId);
        if (!session.authed) {
            sendJson(res, 401, { ok: false, error: "请先登录" });
            return;
        }
        const result = performCheckin(session.name, findXuidByName(session.name));
        if (!result || !result.ok) {
            sendJson(res, 500, { ok: false, error: (result && result.error) || "签到失败" });
            return;
        }
        result.authed = true;
        sendJson(res, 200, result);
        return;
    }

    if (route === "GET /api/auth/status") {
        const browserId = url.searchParams.get("browserId") || "";
        if (!validBrowserId(browserId)) {
            sendJson(res, 400, { ok: false, error: "invalid browserId" });
            return;
        }
        sendJson(res, 200, Object.assign({ ok: true }, getSessionStatus(browserId)));
        return;
    }

    if (route === "POST /api/auth/login") {
        const body = await readBody(req);
        if (!body) {
            sendJson(res, 400, { ok: false, error: "invalid json body" });
            return;
        }
        const browserId = body.browserId;
        if (!validBrowserId(browserId)) {
            sendJson(res, 400, { ok: false, error: "invalid browserId" });
            return;
        }
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        if (!username || !password) {
            sendJson(res, 400, { ok: false, error: "请输入账号和密码" });
            return;
        }
        const account = verifyLogin(username, password);
        if (!account) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            sendJson(res, 401, { ok: false, error: "账号或密码错误" });
            return;
        }
        const role = account.role === "player" ? "player" : "admin";
        sessions.set(browserId, { name: account.name, role, authedAt: Date.now() });
        logger.info("面板登录成功: " + account.name + " (" + role + ")");
        sendJson(res, 200, { ok: true, name: account.name, role });
        return;
    }

    if (route === "POST /api/auth/logout") {
        const body = await readBody(req);
        const browserId = body && body.browserId;
        if (validBrowserId(browserId)) {
            destroySession(browserId);
        }
        sendJson(res, 200, { ok: true });
        return;
    }

    if (route === "POST /api/admin/invoke") {
        const session = getSessionRole(req);
        if (!session || session.role !== "admin") {
            sendJson(res, 403, { ok: false, error: "需要管理员权限" });
            return;
        }
        const body = await readBody(req);
        if (!body) {
            sendJson(res, 400, { ok: false, error: "invalid json body" });
            return;
        }
        const result = invokeAdmin(body.plugin, body.method, body.args);
        sendJson(res, result.ok === false && result.error && result.error.startsWith("unknown") ? 400 : 200, result);
        return;
    }

    sendJson(res, 404, { ok: false, error: "api not found" });
}

let server = null;

function startHttpServer() {
    if (server) {
        return;
    }
    server = http.createServer((req, res) => {
        let url;
        try {
            url = new URL(req.url, "http://localhost");
        } catch (error) {
            sendJson(res, 400, { ok: false, error: "bad request" });
            return;
        }

        if (url.pathname.startsWith("/api/")) {
            handleApi(req, res, url).catch((error) => {
                sendJson(res, 500, { ok: false, error: String(error) });
            });
            return;
        }
        if (url.pathname.startsWith("/assets/")) {
            serveAsset(res, url.pathname);
            return;
        }
        serveStatic(res, url.pathname);
    });

    try {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
    } catch (error) {
        // 目录已存在
    }
    const port = Number(config.port) || 30019;
    const bind = config.bind || "0.0.0.0";
    server.on("error", (error) => {
        logger.error(`面板 HTTP 服务启动失败 (${bind}:${port}): ${error}`);
        server = null;
    });
    server.listen(port, bind, () => {
        logger.info(`LuckyClover-Panel 已启动: http://${bind === "0.0.0.0" ? "127.0.0.1" : bind}:${port}`);
        const missing = [];
        for (const key of Object.keys(NAMESPACE_MAP)) {
            if (key === "core") continue;
            if (!importMgmt(key, "mgmtStatus")) {
                missing.push(NAMESPACE_MAP[key]);
            }
        }
        if (missing.length) {
            logger.warn(`以下插件的管理接口未就绪（未安装或旧版本）: ${missing.join(", ")}`);
        } else {
            logger.info("全部插件管理接口连通");
        }
    });
}

// ---------- game command: /panel passwd <密码> ----------
mc.regPlayerCmd("panel", "管理面板 (/panel passwd <密码|clear>)", (player, args) => {
    const list = Array.isArray(args) ? args : String(args || "").trim().split(/\s+/);
    const action = String(list[0] || "").toLowerCase();

    if (action === "passwd" || action === "password") {
        if (!list[1]) {
            player.tell("§e/panel passwd <密码>   注册/修改网页登录密码（至少 6 位）");
            player.tell("§7OP 注册 → 管理员；普通玩家注册 → 观察者（可签到、不可管理）");
            player.tell("§e/panel passwd clear   清除已设置的密码");
            return;
        }
        if (String(list[1]).toLowerCase() === "clear") {
            player.tell(clearPasswordForPlayer(player) ? "§a面板密码已清除" : "§e你还没有设置过面板密码");
            return;
        }
        const password = list.slice(1).join(" "); // 支持密码含空格（取首个参数之后的全部）
        if (password.length < 6) {
            player.tell("§c密码至少 6 位");
            return;
        }
        if (setPasswordForPlayer(player, password)) {
            const role = (typeof player.isOP === "function" && player.isOP()) ? "admin" : "player";
            if (role === "admin") {
                player.tell("§a面板密码已设置：§e管理员§a 权限，可在网页端管理面板");
            } else {
                player.tell("§a面板密码已设置：§e观察者§a 权限，可登录并签到，不能进入管理配置");
            }
        } else {
            player.tell("§c密码保存失败，请查看服务器日志");
        }
        return;
    }

    player.tell("§e/panel passwd <密码>   注册/修改网页登录密码（所有人可用）");
    player.tell("§e/panel passwd clear   清除密码");
}, 0);

// ---------- lifecycle ----------
mc.listen("onServerStarted", () => {
    startCpuSampler();
    startHttpServer();
    logger.info(`${PLUGIN_NAME} v${PLUGIN_VERSION} loaded`);
});

if (typeof ll.onUnload === "function") {
    ll.onUnload(() => {
        if (cpuTimer) {
            clearInterval(cpuTimer);
            cpuTimer = null;
        }
        if (server) {
            try {
                server.close();
            } catch (error) {
                // 忽略关闭失败
            }
            server = null;
        }
    });
}
