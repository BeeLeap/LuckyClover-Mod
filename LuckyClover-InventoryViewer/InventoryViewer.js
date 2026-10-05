const PLUGIN_NAME = "LuckyClover-InventoryViewer";
const PLUGIN_VERSION = [0, 1, 0];
const PLUGIN_DESC = "View online and offline player inventories";
const BASE_DIR = "plugins/LuckyClover-InventoryViewer/";
const BACKUP_DIR = `${BASE_DIR}backups/`;
const NAME_CACHE_PATH = `${BASE_DIR}names.json`;
const LUCKYCLOVER_ONLINE_TIME_PATH = "plugins/LuckyClover-Plugin/online_time.json";
const INVENTORY_TAGS = ["Armor", "Offhand", "Inventory", "EnderChestInventory"];

const sessions = {};
const nameCache = loadNameCache();

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, { Author: "Mell" });
logger.setTitle(PLUGIN_NAME);
File.mkdir(BASE_DIR);
File.mkdir(BACKUP_DIR);

function loadNameCache() {
    try {
        const raw = File.readFrom(NAME_CACHE_PATH);
        return raw ? JSON.parse(raw) : {};
    } catch (_error) {
        return {};
    }
}

function saveNameCache() {
    File.writeTo(NAME_CACHE_PATH, JSON.stringify(nameCache, null, 4));
}

function loadLuckyCloverNames() {
    try {
        const raw = File.readFrom(LUCKYCLOVER_ONLINE_TIME_PATH);
        if (!raw) return {};
        const data = JSON.parse(raw);
        const players = data && data.players;
        if (!players || typeof players !== "object") return {};

        const names = {};
        for (const key in players) {
            const entry = players[key];
            if (entry && typeof entry === "object" && entry.name) {
                names[String(key)] = String(entry.name);
            }
        }
        return names;
    } catch (_error) {
        return {};
    }
}

function playerKey(player) {
    return String(player.uuid || player.xuid || player.realName || player.name);
}

function backupPath(uuid) {
    return `${BACKUP_DIR}${String(uuid).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}

function cloneNbt(nbt) {
    if (!nbt || typeof nbt.toSNBT !== "function" || typeof NBT === "undefined") {
        return null;
    }
    try {
        return NBT.parseSNBT(nbt.toSNBT());
    } catch (error) {
        logger.error(`NBT clone failed: ${error}`);
        return null;
    }
}

function cloneTag(compound, key) {
    if (!compound || typeof compound.hasTag !== "function" || !compound.hasTag(key)) {
        return null;
    }
    return cloneNbt(compound.getTag(key));
}

function copyInventoryTags(source, destination) {
    for (const key of INVENTORY_TAGS) {
        const value = cloneTag(source, key);
        if (value) {
            destination.setTag(key, value);
        } else if (destination.hasTag(key)) {
            destination.removeTag(key);
        }
    }
}

function saveBackup(player, nbt) {
    const data = {
        uuid: String(player.uuid),
        snbt: nbt.toSNBT(),
        savedAt: Date.now(),
    };
    return File.writeTo(backupPath(player.uuid), JSON.stringify(data));
}

function loadBackup(uuid) {
    const raw = File.readFrom(backupPath(uuid));
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!data.snbt || typeof NBT === "undefined") return null;
        return NBT.parseSNBT(data.snbt);
    } catch (error) {
        logger.error(`Backup load failed for ${uuid}: ${error}`);
        return null;
    }
}

function deleteBackup(uuid) {
    const path = backupPath(uuid);
    if (File.exists(path)) {
        File.delete(path);
    }
}

function getOnlinePlayer(uuidOrName) {
    return mc.getPlayer(String(uuidOrName));
}

function getTargetNbt(uuid) {
    const online = getOnlinePlayer(uuid);
    if (online) {
        return online.getNbt();
    }
    return mc.getPlayerNbt(uuid);
}

function getOfflinePlayerName(uuid) {
    const key = String(uuid);
    if (nameCache[key]) return String(nameCache[key]);

    const luckyCloverNames = loadLuckyCloverNames();
    if (luckyCloverNames[key]) {
        nameCache[key] = luckyCloverNames[key];
        saveNameCache();
        return luckyCloverNames[key];
    }

    return key;
}

function getSavedPlayers() {
    const result = {};
    try {
        const onlinePlayers = mc.getOnlinePlayers() || [];
        for (const player of onlinePlayers) {
            if (player.uuid && (player.realName || player.name)) {
                nameCache[String(player.uuid)] = String(player.realName || player.name);
            }
            result[String(player.uuid)] = {
                uuid: String(player.uuid),
                name: String(player.realName || player.name),
                online: true,
            };
        }
        saveNameCache();
    } catch (error) {
        logger.warn(`Cannot enumerate online players: ${error}`);
    }

    let uuids = [];
    try {
        // Some LLSE builds reject the optional mode argument.
        uuids = mc.getAllPlayerUuids() || [];
    } catch (error) {
        logger.warn(`Cannot enumerate saved players: ${error}`);
    }

    for (const uuid of uuids) {
        const key = String(uuid);
        if (!result[key]) {
            result[key] = {
                uuid: key,
                name: getOfflinePlayerName(key),
                online: false,
            };
        }
    }

    return Object.values(result).sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function restoreFromNbt(player, backupNbt) {
    if (!player || !backupNbt) return false;
    const current = player.getNbt();
    if (!current) return false;
    copyInventoryTags(backupNbt, current);
    const success = player.setNbt(current);
    if (success && typeof player.refreshItems === "function") player.refreshItems();
    return success;
}

function restoreViewer(player, removeFile = true) {
    const key = playerKey(player);
    const session = sessions[key];
    const backup = session ? session.backup : loadBackup(player.uuid);
    if (!backup) {
        player.tell("§e没有找到需要恢复的背包备份");
        return false;
    }

    const success = restoreFromNbt(player, backup);
    if (success) {
        delete sessions[key];
        if (removeFile) deleteBackup(player.uuid);
        player.tell("§a已恢复你的背包");
    } else {
        player.tell("§c背包恢复失败，请不要继续操作物品并联系管理员");
    }
    return success;
}

function applyTargetSnapshot(player, session) {
    if (session.applying) return true;
    const current = player.getNbt();
    if (!current || !session.targetNbt) return false;
    session.applying = true;
    try {
        copyInventoryTags(session.targetNbt, current);
        const success = player.setNbt(current);
        if (success && typeof player.refreshItems === "function") player.refreshItems();
        return success;
    } finally {
        session.applying = false;
    }
}

function startViewing(viewer, target) {
    const viewerKey = playerKey(viewer);
    if (sessions[viewerKey]) {
        viewer.tell("§e你正在查看玩家背包，请先使用 /invsee restore");
        return;
    }
    if (String(target.uuid) === String(viewer.uuid)) {
        viewer.tell("§c不能查看自己的背包");
        return;
    }

    const viewerNbt = viewer.getNbt();
    const targetNbt = getTargetNbt(target.uuid);
    const backup = cloneNbt(viewerNbt);
    const targetSnapshot = cloneNbt(targetNbt);
    if (!viewerNbt || !targetNbt || !backup || !targetSnapshot) {
        viewer.tell("§c无法读取玩家背包 NBT");
        return;
    }

    if (!saveBackup(viewer, backup)) {
        viewer.tell("§c无法创建背包备份，已取消查看");
        return;
    }

    const session = {
        viewerUuid: String(viewer.uuid),
        targetUuid: String(target.uuid),
        targetName: target.name,
        backup,
        targetNbt: targetSnapshot,
        applying: false,
    };
    sessions[viewerKey] = session;

    if (!applyTargetSnapshot(viewer, session)) {
        delete sessions[viewerKey];
        deleteBackup(viewer.uuid);
        viewer.tell("§c无法显示目标玩家背包，已取消查看");
        return;
    }

    viewer.tell(`§a正在查看 ${target.name} 的背包 §7(只读)`);
    viewer.tell("§e查看结束后使用 /invsee restore 恢复自己的背包");
}

function openViewedEnderChest(viewer) {
    const session = sessions[playerKey(viewer)];
    if (!session) {
        viewer.tell("§e当前没有正在查看的玩家背包");
        return;
    }
    viewer.tell(`§a当前查看内容已包含 ${session.targetName} 的末影箱`);
    viewer.tell("§e请直接打开一个末影箱查看目标内容，结束后使用 /invsee restore");
}

function openPlayerList(viewer) {
    const allPlayers = getSavedPlayers();
    const players = allPlayers.filter((entry) => entry.uuid !== String(viewer.uuid));
    logger.info(`Inventory list requested by ${viewer.realName || viewer.name}: ${allPlayers.length} total, ${players.length} selectable`);
    if (!players.length) {
        viewer.tell(`§e没有找到其他在线或历史玩家（当前记录 ${allPlayers.length} 人）`);
        return;
    }

    const buttons = players.map((entry) => `${entry.online ? "§a在线" : "§7离线"} §f${entry.name}`);
    const images = buttons.map(() => "");
    viewer.tell(`§7已找到 ${players.length} 名玩家`);
    viewer.sendSimpleForm("§l玩家背包查看", "选择要查看的玩家", buttons, images, (_player, index) => {
        if (index === null || index === undefined || !players[index]) return;
        startViewing(viewer, players[index]);
    });
}

function registerCommands() {
    mc.regPlayerCmd("invsee", "查看在线或离线玩家背包", (player, args) => {
        if (!player || !player.isOP || !player.isOP()) {
            player.tell("§c你没有权限使用该命令");
            return;
        }

        const action = String(args && args[0] || "").trim();
        if (!action) {
            openPlayerList(player);
            return;
        }
        if (action.toLowerCase() === "restore") {
            restoreViewer(player);
            return;
        }
        if (action.toLowerCase() === "ender") {
            openViewedEnderChest(player);
            return;
        }

        const target = getSavedPlayers().find((entry) =>
            entry.name.toLowerCase() === action.toLowerCase() || entry.uuid === action
        );
        if (!target) {
            player.tell("§c找不到该玩家。使用 /invsee 查看玩家列表");
            return;
        }
        startViewing(player, target);
    }, 1);
}

registerCommands();

mc.listen("onInventoryChange", (player) => {
    const session = sessions[playerKey(player)];
    if (!session) return;
    setTimeout(() => {
        if (sessions[playerKey(player)]) applyTargetSnapshot(player, session);
    }, 1);
});

mc.listen("onDropItem", (player) => {
    if (sessions[playerKey(player)]) return false;
});

mc.listen("onTakeItem", (player) => {
    if (sessions[playerKey(player)]) return false;
});

mc.listen("onSetArmor", (player) => {
    if (sessions[playerKey(player)]) return false;
});

mc.listen("onUseItem", (player) => {
    if (sessions[playerKey(player)]) return false;
});

mc.listen("onUseItemOn", (player, _item, block) => {
    if (!sessions[playerKey(player)]) return;
    if (block && String(block.type) === "minecraft:ender_chest") return;
    return false;
});

mc.listen("onPlaceBlock", (player) => {
    if (sessions[playerKey(player)]) return false;
});

mc.listen("onOpenContainer", (player, block) => {
    if (!sessions[playerKey(player)]) return;
    if (block && String(block.type) === "minecraft:ender_chest") return;
    return false;
});

mc.listen("onLeft", (player) => {
    if (sessions[playerKey(player)]) {
        logger.info(`Inventory view session ended for ${player.realName || player.name}; backup retained`);
        delete sessions[playerKey(player)];
    }
});

mc.listen("onJoin", (player) => {
    if (player.uuid && (player.realName || player.name)) {
        nameCache[String(player.uuid)] = String(player.realName || player.name);
        saveNameCache();
    }
    const backup = loadBackup(player.uuid);
    if (backup) {
        logger.warn(`Restoring unfinished inventory view for ${player.realName || player.name}`);
        restoreViewer(player, true);
    }
});

mc.listen("onServerStarted", () => {
    logger.info(`${PLUGIN_NAME} loaded; using local and LuckyClover-Plugin name caches`);
});
