// LuckyClover-Seat.js
// 从 LuckyClover-Plugin 拆出：右键台阶/楼梯坐下（配套行为包 LuckyClover-Seat-BP）
const PLUGIN_NAME = "LuckyClover-Seat";
const PLUGIN_DESC = "Right-click slabs/stairs to sit";
const PLUGIN_VERSION = [1, 0, 0];
const PLUGIN_EXTRA = {
    Author: "Mell",
};

const NAMESPACE = "LuckyCloverSeat";

const BASE_DIR = "plugins/LuckyClover-Seat/";
const CONFIG_PATH = `${BASE_DIR}config.json`;
const SEAT_PREFS_DATA_PATH = `${BASE_DIR}seat_prefs.json`;

const OLD_BASE_DIR = "plugins/LuckyClover-Plugin/";

const SEAT_TAG_PREFIX = "luckyclover_seat_";
const SEAT_ENTITY_ID = "luckyclover:seat";
const SEAT_ANCHOR_DRIFT_TOLERANCE = 0.05;
const ABILITY_FLYING = 9;
const CONFIG_KEYS = ["seatFeature"];

const seatSessions = {};
let seatCleanupLoopStarted = false;

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

function jsonOk(extra) {
    return JSON.stringify(Object.assign({ ok: true }, extra || {}));
}

function jsonError(error) {
    return JSON.stringify({ ok: false, error: String(error || "unknown error") });
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
        logger.warn("fs API unavailable, data migration skipped - copy seat_prefs.json manually if upgrading");
        return;
    }

    const name = "seat_prefs.json";
    const oldPath = OLD_BASE_DIR + name;
    const newPath = BASE_DIR + name;
    if (fileExists(oldPath) && !fileExists(newPath)) {
        const text = readFileText(oldPath);
        if (text !== null && writeFileText(newPath, text)) {
            logger.info("Migrated data file from LuckyClover-Plugin: seat_prefs.json");
        }
    }
}

function buildDefaultConfig() {
    const defaults = {
        seatFeature: {
            command: "seat",
            defaultEnabled: true,
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
        if (oldConfig.seatFeature !== undefined) {
            defaults.seatFeature = oldConfig.seatFeature;
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
    config.init("seatFeature", {
        command: "seat",
        defaultEnabled: true,
    });
}

initConfig();

const seatPrefsStore = new JsonConfigFile(SEAT_PREFS_DATA_PATH, "{}");

function getSeatFeatureConfig() {
    const seatFeature = config.get("seatFeature", {});
    return seatFeature && typeof seatFeature === "object" ? seatFeature : {};
}

function getSeatFeatureCommand() {
    return String(getSeatFeatureConfig().command || "seat").trim() || "seat";
}

// === prefs ===
function getSeatKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function isSeatFeatureEnabledForPlayer(player) {
    const stored = seatPrefsStore.get(getSeatKey(player));
    if (typeof stored === "boolean") {
        return stored;
    }
    if (typeof stored === "string") {
        const value = stored.trim().toLowerCase();
        if (value === "true") {
            return true;
        }
        if (value === "false") {
            return false;
        }
    }
    if (typeof stored === "number") {
        return stored !== 0;
    }

    return Boolean(getSeatFeatureConfig().defaultEnabled !== false);
}

function setSeatFeatureEnabledForPlayer(player, enabled) {
    seatPrefsStore.set(getSeatKey(player), Boolean(enabled));
}

// === seat entities ===
function getSeatTag(player) {
    return `${SEAT_TAG_PREFIX}${String(getSeatKey(player)).replace(/[^a-zA-Z0-9_:-]/g, "_")}`;
}

function isSeatBlock(block) {
    if (!block) {
        return false;
    }

    const isSlab = typeof block.isSlabBlock === "function"
        ? block.isSlabBlock()
        : Boolean(block.isSlabBlock);
    const isStairs = typeof block.isStairBlock === "function"
        ? block.isStairBlock()
        : Boolean(block.isStairBlock);
    const type = String(block.type || block.typeName || "").toLowerCase();

    return Boolean(isSlab || isStairs || type.indexOf("slab") >= 0 || type.indexOf("stairs") >= 0);
}

function isSeatTopHalf(block) {
    if (!block || typeof block.getBlockState !== "function") {
        return false;
    }

    const states = block.getBlockState() || {};
    return states.top_slot_bit === true
        || states.upside_down_bit === true
        || states.vertical_half === "top"
        || states.vertical_half === "upper"
        || states.half === "top";
}

function getSeatEntityPos(block) {
    const topHalf = isSeatTopHalf(block);
    const baseY = topHalf ? block.pos.y + 0.70 : block.pos.y + 0.20;
    return new FloatPos(block.pos.x + 0.5, baseY, block.pos.z + 0.5, block.pos.dimid);
}

function findSeatEntityByTag(tag) {
    const entities = mc.getAllEntities();
    for (const entity of entities) {
        if (entity.hasTag(tag)) {
            return entity;
        }
    }
    return null;
}

function clearSeatMotion(entity) {
    if (!entity) {
        return;
    }
    try {
        const nbt = entity.getNbt();
        if (!nbt) {
            return;
        }
        nbt.setTag("Motion", new NbtList([
            new NbtFloat(0),
            new NbtFloat(0),
            new NbtFloat(0),
        ]));
        entity.setNbt(nbt);
        nbt.destroy();
    } catch (error) {
        // ignore motion-clear failure; teleport anchoring still applies
    }
}

function anchorSeatEntity(session) {
    if (!session || !session.anchorPos) {
        return;
    }
    const entity = findSeatEntityByTag(session.tag);
    if (!entity) {
        return;
    }
    clearSeatMotion(entity);
    const pos = entity.pos;
    const anchor = session.anchorPos;
    const drift = Math.max(
        Math.abs(pos.x - anchor.x),
        Math.abs(pos.y - anchor.y),
        Math.abs(pos.z - anchor.z)
    );
    if (drift > SEAT_ANCHOR_DRIFT_TOLERANCE) {
        entity.teleport(anchor);
    }
}

function cleanupSeatEntity(playerOrTag) {
    const tag = typeof playerOrTag === "string" ? playerOrTag : getSeatTag(playerOrTag);
    const entity = findSeatEntityByTag(tag);
    if (entity) {
        entity.remove();
    }
}

function isPlayerRiding(player) {
    if (!player) {
        return false;
    }

    if (typeof player.isRiding === "function") {
        return Boolean(player.isRiding());
    }

    return Boolean(player.isRiding);
}

function stopSeatForPlayer(player) {
    const key = getSeatKey(player);
    const session = seatSessions[key];
    if (session) {
        mc.runcmdEx(`ride "${escapeCmdString(player.realName)}" stop_riding`);
        cleanupSeatEntity(session.tag);
        delete seatSessions[key];
        return true;
    }

    cleanupSeatEntity(player);
    return false;
}

function spawnSeatEntity(block, tag) {
    const seatPos = getSeatEntityPos(block);
    const entity = mc.spawnMob(SEAT_ENTITY_ID, seatPos);
    if (!entity) {
        return null;
    }

    entity.addTag(tag);
    entity.teleport(seatPos);
    entity.addEffect(14, 2147483647, 0, false);
    return { entity, pos: seatPos };
}

function trySeatPlayerOnBlock(player, block) {
    if (!isSeatFeatureEnabledForPlayer(player) || !isSeatBlock(block) || isPlayerRiding(player)) {
        return false;
    }

    const tag = getSeatTag(player);
    cleanupSeatEntity(tag);

    try {
        if (typeof player.setAbility === "function") {
            player.setAbility(ABILITY_FLYING, false);
        }
    } catch (error) {
        logger.warn(`Failed to stop flying before seating ${player.realName}: ${error}`);
    }

    const seatResult = spawnSeatEntity(block, tag);
    if (!seatResult) {
        player.tell("§c坐下失败");
        return true;
    }

    const rideResult = mc.runcmdEx(`ride "${escapeCmdString(player.realName)}" start_riding @e[tag=${tag},c=1] teleport_rider until_full`);
    if (!rideResult.success) {
        cleanupSeatEntity(tag);
        logger.warn(`Seat ride failed for ${player.realName}: ${rideResult.output || "unknown error"}`);
        player.tell("§c坐下失败");
        return true;
    }

    seatSessions[getSeatKey(player)] = {
        tag,
        anchorPos: seatResult.pos,
    };
    return true;
}

function scheduleSeatCleanupLoop() {
    if (seatCleanupLoopStarted) {
        return;
    }

    seatCleanupLoopStarted = true;
    const tick = () => {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            const key = getSeatKey(player);
            if (!seatSessions[key]) {
                continue;
            }
            anchorSeatEntity(seatSessions[key]);
            if (!isPlayerRiding(player)) {
                cleanupSeatEntity(seatSessions[key].tag);
                delete seatSessions[key];
            }
        }
    };

    if (typeof mc.setInterval === "function") {
        mc.setInterval(tick, 200);
    } else {
        setInterval(tick, 200);
    }
}

// === command ===
function handleSeatCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    const commandName = getSeatFeatureCommand();
    if (!args.length) {
        player.tell(`§6椅子功能§f: ${isSeatFeatureEnabledForPlayer(player) ? "开启" : "关闭"}`);
        player.tell(`§e/${commandName} on`);
        player.tell(`§e/${commandName} off`);
        return;
    }

    const action = String(args[0]).toLowerCase();
    if (action === "on") {
        setSeatFeatureEnabledForPlayer(player, true);
        player.tell("§a你的椅子功能已开启");
        return;
    }

    if (action === "off") {
        setSeatFeatureEnabledForPlayer(player, false);
        stopSeatForPlayer(player);
        player.tell("§e你的椅子功能已关闭");
        return;
    }

    player.tell(`§e/${commandName} on`);
    player.tell(`§e/${commandName} off`);
}

mc.regPlayerCmd(getSeatFeatureCommand(), "椅子功能开关", (player, args) => {
    handleSeatCommand(player, normalizePlayerCmdArgs(args));
}, 0);

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

exportApi("mgmtGetSessionCount", () => {
    let count = 0;
    for (const key in seatSessions) {
        if (seatSessions[key]) {
            count++;
        }
    }
    return JSON.stringify({ ok: true, sessions: count });
});

exportApi("mgmtSetDefaultEnabled", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const value = Boolean(parsed && parsed.enabled);
        const seatFeature = getSeatFeatureConfig();
        seatFeature.defaultEnabled = value;
        config.set("seatFeature", seatFeature);
        return jsonOk({ defaultEnabled: value });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtCleanupAll", () => {
    try {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            stopSeatForPlayer(player);
        }
        const entities = mc.getAllEntities();
        let removed = 0;
        for (const entity of entities) {
            try {
                const tags = typeof entity.getTags === "function" ? entity.getTags() : [];
                for (const tag of tags) {
                    if (String(tag).indexOf(SEAT_TAG_PREFIX) === 0) {
                        entity.remove();
                        removed++;
                        break;
                    }
                }
            } catch (error) {
                // skip broken entity
            }
        }
        for (const key in seatSessions) {
            delete seatSessions[key];
        }
        return jsonOk({ removed });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtStatus", () => {
    let sessions = 0;
    for (const key in seatSessions) {
        if (seatSessions[key]) {
            sessions++;
        }
    }
    return JSON.stringify({
        ok: true,
        version: PLUGIN_VERSION.join("."),
        entityId: SEAT_ENTITY_ID,
        loop: seatCleanupLoopStarted,
        sessions,
        defaultEnabled: getSeatFeatureConfig().defaultEnabled !== false,
    });
});

// === events ===
mc.listen("onServerStarted", () => {
    scheduleSeatCleanupLoop();
    logger.info("LuckyClover-Seat loaded");
});

mc.listen("onUseItemOn", (player, _item, block) => {
    if (trySeatPlayerOnBlock(player, block)) {
        return false;
    }
});

mc.listen("onSneak", (player, isSneaking) => {
    if (isSneaking) {
        stopSeatForPlayer(player);
    }
});

mc.listen("onJump", (player) => {
    stopSeatForPlayer(player);
});

mc.listen("onChangeDim", (player) => {
    stopSeatForPlayer(player);
});

mc.listen("onRespawn", (player) => {
    stopSeatForPlayer(player);
});

mc.listen("onLeft", (player) => {
    stopSeatForPlayer(player);
});
