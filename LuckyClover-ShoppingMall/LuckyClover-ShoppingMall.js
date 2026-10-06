// LuckyClover-ShoppingMall.js
// LuckyClover 商城插件：官方商店（出售 / 回收）、玩家店铺、交易日志、排行与税收。
// 与 LuckyClover-Panel 对接：通过 ll.export 暴露 mgmt* 接口，面板只做薄封装调用。
const PLUGIN_NAME = "LuckyClover-ShoppingMall";
const PLUGIN_DESC = "LuckyClover shopping mall (official shop, recycle, player shops, trades)";
const PLUGIN_VERSION = [1, 2, 0];
const PLUGIN_EXTRA = { Author: "Mell" };

const NAMESPACE = "LuckyCloverShoppingMall";

const BASE_DIR = "plugins/LuckyClover-ShoppingMall/";
const CONFIG_PATH = `${BASE_DIR}config.json`;
const SHOPS_PATH = `${BASE_DIR}shops.json`;
const OFFICIAL_PATH = `${BASE_DIR}official.json`;
const FORBIDDEN_PATH = `${BASE_DIR}forbidden.json`;
const LOGS_PATH = `${BASE_DIR}logs.json`;
const RANKING_PATH = `${BASE_DIR}ranking.json`;
const TAX_PATH = `${BASE_DIR}tax.json`;
const ITEMS_PATH = `${BASE_DIR}Items.json`;

const WAREHOUSE_PATH = `${BASE_DIR}warehouse.json`;
const REQUESTS_PATH = `${BASE_DIR}requests.json`;
const NOTIFY_PATH = `${BASE_DIR}notifications.json`;
const MIGRATE_FLAG_PATH = `${BASE_DIR}migrated.flag`;
const MIGRATE_REPORT_PATH = `${BASE_DIR}migration-report.json`;

const SCHEMA_VERSION = 2;
const LOG_LIMIT = 500;
const TAX_RECORD_LIMIT = 500;
const TEXTURE_FORM_LIST = "/L ";
const TEXTURE_FORM_TEXT = "/TEXT ";
const DEFAULT_ICON = "textures/ui/store_home_icon";
const ICONS_PATH = `${BASE_DIR}Icons.json`;

// === 按钮图标 ===
// 全部使用客户端自带的原版贴图（textures/ui/*），已逐条核对贴图文件真实存在，
// 不会出现空白或"丢失贴图"的按钮。表单图标只在 sendSimpleForm 的 images 参数里生效。
const ICON = {
    search: "textures/ui/magnifyingGlass",      // 搜索
    filter: "textures/ui/store_filter_icon",    // 分类 / 筛选
    sort: "textures/ui/store_sort_icon",        // 排序
    prev: "textures/ui/arrow_left",             // 上一页
    next: "textures/ui/arrow_right",            // 下一页
    home: "textures/ui/store_home_icon",        // 主菜单 / 商店
    refresh: "textures/ui/refresh",             // 刷新 / 重置
    setting: "textures/ui/icon_setting",        // 设置
    admin: "textures/ui/smithing_icon",         // 管理（锤子）
    anvil: "textures/ui/anvil_icon",            // 铁砧 / 内容管理
    trash: "textures/ui/icon_trash",            // 删除 / 下架
    edit: "textures/ui/pencil_edit_icon",       // 修改 / 改价
    add: "textures/ui/send_icon",               // 新增（加号）
    put: "textures/ui/icon_import",             // 上架 / 存入
    take: "textures/ui/icon_expand",            // 取出 / 领取
    warehouse: "textures/ui/inventory_icon",    // 仓库
    money: "textures/ui/icon_minecoin_9x9",     // 金币 / 余额
    trade: "textures/ui/trade_icon",            // 交易 / 回收
    bell: "textures/ui/icon_bell",              // 提醒
    mail: "textures/ui/mail_icon",              // 提醒箱 / 消息
    timer: "textures/ui/icon_timer",            // 计时 / 到期
    discount: "textures/ui/icon_saleribbon",    // 折扣 / 促销
    book: "textures/ui/recipe_book_icon",       // 物品目录
    tool: "textures/ui/icon_iron_pickaxe",      // 工具 / 武器
    armor: "textures/ui/icon_armor",            // 装备
    food: "textures/ui/icon_apple",             // 食物
    potion: "textures/ui/icon_potion",          // 药水
    nature: "textures/ui/icon_recipe_nature",   // 自然
    block: "textures/ui/icon_recipe_construction", // 方块 / 建筑
    craft: "textures/ui/icon_crafting",         // 材料 / 合成
    equip: "textures/ui/icon_recipe_equipment", // 装备分类
    item: "textures/ui/icon_recipe_item",       // 其它物品
    sign: "textures/ui/icon_sign",              // 公告 / 招牌
    trend: "textures/ui/icon_trending",         // 排行 / 热度
    lock: "textures/ui/icon_lock",              // 关闭 / 锁定
    unlock: "textures/ui/icon_unlocked",        // 开启 / 解锁
    user: "textures/ui/user_icon",              // 玩家
    bookshelf: "textures/ui/icon_bookshelf",    // 附魔 / 书架
    map: "textures/ui/icon_map",                // 目录 / 地图
    fish: "textures/ui/icon_fish_clownfish_raw" // 鱼类
};

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, PLUGIN_EXTRA);
logger.setTitle(PLUGIN_NAME);
File.mkdir(BASE_DIR);

function exportApi(name, fn) {
    ll.export(fn, NAMESPACE, name);
}

// === utils ===
function toInt(value, fallback) {
    const n = Math.floor(Number(value));
    return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
}

function clampInt(value, min, max, fallback) {
    const n = toInt(value, fallback);
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (isNaN(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function limitText(text, size) {
    const value = String(text === null || text === undefined ? "" : text).trim();
    return value.length > size ? value.slice(0, size) : value;
}

function hashString(text) {
    let hash = 5381;
    const value = String(text || "");
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
}

function safeParse(text, fallback) {
    try {
        const parsed = JSON.parse(text);
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
        return fallback;
    }
}

function cloneObject(source) {
    return safeParse(JSON.stringify(source), {});
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pad2(value) {
    return String(value).length >= 2 ? String(value) : "0" + String(value);
}

function formatStamp(ts) {
    const date = new Date(ts || Date.now());
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatDay(ts) {
    const date = new Date(ts || Date.now());
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDurationShort(seconds) {
    const total = Math.max(0, toInt(seconds, 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${minutes}分`;
    if (minutes > 0) return `${minutes}分`;
    return `${total}秒`;
}

function normalizePlayerKey(input) {
    return String(input || "").trim().toLowerCase();
}

function normalizeButtonText(text, index) {
    const value = String(text || "").trim();
    return value || `button_${index + 1}`;
}

// === config ===
const DEFAULT_CONFIG = {
    schemaVersion: SCHEMA_VERSION,
    debug: false,
    command: "shop",
    pageSize: 20,
    allowSelfPurchase: false,
    statistics: true,
    tax: {
        enabled: true,
        rate: 0.05,
        scope: "player",
    },
    categories: ["全部", "武器", "工具", "装备", "方块", "食物", "药水", "附魔书", "材料", "装饰", "其他"],
    shop: {
        allowCreate: true,
        createCost: 0,
        maxItemTypes: 15,
        maxQuantityPerListing: 960,
        minPrice: 1,
        maxPrice: 1000000000,
    },
    official: {
        sortMode: "随机",
    },
    recycle: {
        enabled: true,
    },
    warehouse: {
        enabled: true,
        maxSlots: 50,
        buyoutSlots: 100,
        buyoutPrice: 10000,
    },
    request: {
        enabled: true,
        fee: 0,
        expiryHours: 72,
        notifyAll: true,
    },
    discount: {
        enabled: true,
        notifyAll: true,
    },
    notify: {
        enabled: true,
        inboxLimit: 50,
    },
    menu: {
        buttons: {
            center: true,
            official: true,
            recycle: true,
            myShop: true,
            warehouse: true,
            requests: true,
            notify: true,
            search: true,
            logs: true,
            ranking: true,
        },
    },
};

const config = new JsonConfigFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4));

function cfgSection(name) {
    const fallback = isPlainObject(DEFAULT_CONFIG[name]) ? cloneObject(DEFAULT_CONFIG[name]) : {};
    const value = config.get(name, null);
    return isPlainObject(value) ? value : fallback;
}

function cfgSetSection(name, value) {
    config.set(name, cloneObject(value));
}

function cfgBool(name, fallback) {
    const value = config.get(name, null);
    if (value === null || value === undefined) return fallback;
    return Boolean(value);
}

function cfgNumber(name, fallback) {
    const value = config.get(name, null);
    const n = Number(value);
    return isNaN(n) ? fallback : n;
}

function cfgString(name, fallback) {
    const value = config.get(name, null);
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
}

function getTaxConfig() {
    const tax = cfgSection("tax");
    return {
        enabled: Boolean(tax.enabled),
        rate: clampNumber(tax.rate, 0, 0.5, DEFAULT_CONFIG.tax.rate),
        scope: ["player", "official", "all"].indexOf(String(tax.scope)) >= 0 ? String(tax.scope) : "player",
    };
}

function getCategories() {
    const raw = config.get("categories", null);
    const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_CONFIG.categories.slice();
    const out = [];
    for (const item of list) {
        const name = limitText(item, 24);
        if (name && out.indexOf(name) < 0) out.push(name);
    }
    if (out.indexOf("全部") < 0) out.unshift("全部");
    return out;
}

function getShopConfig() {
    const shop = cfgSection("shop");
    return {
        allowCreate: shop.allowCreate !== false,
        createCost: clampInt(shop.createCost, 0, 100000000, 0),
        maxItemTypes: clampInt(shop.maxItemTypes, 1, 500, DEFAULT_CONFIG.shop.maxItemTypes),
        maxQuantityPerListing: clampInt(shop.maxQuantityPerListing, 1, 99999, DEFAULT_CONFIG.shop.maxQuantityPerListing),
        minPrice: clampInt(shop.minPrice, 1, 1000000000, DEFAULT_CONFIG.shop.minPrice),
        maxPrice: clampInt(shop.maxPrice, 1, 1000000000, DEFAULT_CONFIG.shop.maxPrice),
    };
}

function getPageSize() {
    return clampInt(cfgNumber("pageSize", DEFAULT_CONFIG.pageSize), 1, 100, DEFAULT_CONFIG.pageSize);
}

function getMainCommand() {
    return limitText(cfgString("command", "shop"), 24) || "shop";
}

function ensureConfigMigrated() {
    let changed = false;
    if (!config.get("schemaVersion")) {
        config.set("schemaVersion", SCHEMA_VERSION);
        changed = true;
    }
    for (const key of ["tax", "shop", "official", "recycle", "menu", "warehouse", "request", "discount", "notify"]) {
        if (!isPlainObject(config.get(key, null))) {
            cfgSetSection(key, DEFAULT_CONFIG[key]);
            changed = true;
        }
    }
    if (!Array.isArray(config.get("categories", null))) {
        cfgSetSection("categories", DEFAULT_CONFIG.categories);
        changed = true;
    }
    for (const key of ["command", "pageSize", "allowSelfPurchase", "statistics", "debug"]) {
        if (config.get(key, null) === null || config.get(key, null) === undefined) {
            config.set(key, DEFAULT_CONFIG[key]);
            changed = true;
        }
    }
    const menu = cfgSection("menu");
    if (!isPlainObject(menu.buttons)) {
        menu.buttons = cloneObject(DEFAULT_CONFIG.menu.buttons);
        cfgSetSection("menu", menu);
        changed = true;
    }
    if (changed) logger.info("配置已补齐缺失项");
}

// === data stores ===
const shopsStore = new JsonConfigFile(SHOPS_PATH, "{}");
const officialStore = new JsonConfigFile(OFFICIAL_PATH, "{}");
const forbiddenStore = new JsonConfigFile(FORBIDDEN_PATH, "{}");
const logsStore = new JsonConfigFile(LOGS_PATH, "{}");
const rankingStore = new JsonConfigFile(RANKING_PATH, "{}");
const taxStore = new JsonConfigFile(TAX_PATH, "{}");
const warehouseStore = new JsonConfigFile(WAREHOUSE_PATH, "{}");
const requestStore = new JsonConfigFile(REQUESTS_PATH, "{}");
const notifyStore = new JsonConfigFile(NOTIFY_PATH, "{}");

// === config sections (new) ===
function getWarehouseConfig() {
    const conf = cfgSection("warehouse");
    return {
        enabled: conf.enabled !== false,
        maxSlots: clampInt(conf.maxSlots, 1, 1000, DEFAULT_CONFIG.warehouse.maxSlots),
        buyoutSlots: clampInt(conf.buyoutSlots, 1, 5000, DEFAULT_CONFIG.warehouse.buyoutSlots),
        buyoutPrice: clampInt(conf.buyoutPrice, 0, 100000000, DEFAULT_CONFIG.warehouse.buyoutPrice),
    };
}

function getRequestConfig() {
    const conf = cfgSection("request");
    return {
        enabled: conf.enabled !== false,
        fee: clampInt(conf.fee, 0, 10000000, DEFAULT_CONFIG.request.fee),
        expiryHours: clampInt(conf.expiryHours, 1, 8760, DEFAULT_CONFIG.request.expiryHours),
        notifyAll: conf.notifyAll !== false,
    };
}

function getDiscountConfig() {
    const conf = cfgSection("discount");
    return {
        enabled: conf.enabled !== false,
        notifyAll: conf.notifyAll !== false,
    };
}

function getNotifyConfig() {
    const conf = cfgSection("notify");
    return {
        enabled: conf.enabled !== false,
        inboxLimit: clampInt(conf.inboxLimit, 10, 500, DEFAULT_CONFIG.notify.inboxLimit),
    };
}

function allShops() {
    const value = shopsStore.get("shops", null);
    return isPlainObject(value) ? value : {};
}

function saveAllShops(map) {
    shopsStore.set("shops", map);
}

function getShop(xuid) {
    const key = String(xuid || "");
    if (!key) return null;
    const shops = allShops();
    return isPlainObject(shops[key]) ? shops[key] : null;
}

function officialData() {
    const purchase = officialStore.get("purchaseItems", null);
    const recycle = officialStore.get("recycleItems", null);
    return {
        purchaseItems: isPlainObject(purchase) ? purchase : {},
        recycleItems: isPlainObject(recycle) ? recycle : {},
    };
}

function saveOfficialData(data) {
    officialStore.set("purchaseItems", data.purchaseItems || {});
    officialStore.set("recycleItems", data.recycleItems || {});
}

function forbiddenList() {
    const value = forbiddenStore.get("items", null);
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === "string" && item.indexOf(":") >= 0);
}

function saveForbiddenList(list) {
    const clean = [];
    for (const item of list) {
        const name = String(item || "").trim();
        if (name && clean.indexOf(name) < 0) clean.push(name);
    }
    forbiddenStore.set("items", clean);
}

function tradeLogs() {
    const value = logsStore.get("global", null);
    return Array.isArray(value) ? value : [];
}

function pushTradeLog(entry) {
    const list = tradeLogs();
    list.push(entry);
    while (list.length > LOG_LIMIT) list.shift();
    logsStore.set("global", list);
}

function rankingData() {
    const value = rankingStore.get("players", null);
    return isPlainObject(value) ? value : {};
}

function saveRankingData(map) {
    rankingStore.set("players", map);
}

function taxData() {
    const records = taxStore.get("records", null);
    const total = toInt(taxStore.get("total", 0), 0);
    return { records: Array.isArray(records) ? records : [], total };
}

function pushTaxRecord(entry) {
    const data = taxData();
    data.records.push(entry);
    while (data.records.length > TAX_RECORD_LIMIT) data.records.shift();
    data.total += Math.max(0, toInt(entry.amount, 0));
    taxStore.set("records", data.records);
    taxStore.set("total", data.total);
}

// === data stores: warehouse / requests / notifications ===
function warehouseMap() {
    const value = warehouseStore.get("players", null);
    return isPlainObject(value) ? value : {};
}

function saveWarehouseMap(map) {
    warehouseStore.set("players", map);
}

function warehouseOf(xuid) {
    const key = String(xuid || "");
    if (!key) return null;
    const map = warehouseMap();
    return isPlainObject(map[key]) ? map[key] : null;
}

function ensureWarehouse(xuid, playerName) {
    const key = String(xuid || "");
    if (!key) return null;
    const map = warehouseMap();
    if (!isPlainObject(map[key])) {
        map[key] = {
            playerName: String(playerName || ""),
            purchased: false,
            items: [],
            updatedAt: Date.now(),
        };
        saveWarehouseMap(map);
    } else if (playerName && map[key].playerName !== playerName) {
        map[key].playerName = String(playerName);
        saveWarehouseMap(map);
    }
    return map[key];
}

function activeRequests() {
    const value = requestStore.get("requests", null);
    return Array.isArray(value) ? value : [];
}

function saveActiveRequests(list) {
    requestStore.set("requests", list);
}

function requestHistory() {
    const value = requestStore.get("history", null);
    return Array.isArray(value) ? value : [];
}

function saveRequestHistory(list) {
    requestStore.set("history", list);
}

function notifyMap() {
    const value = notifyStore.get("players", null);
    return isPlainObject(value) ? value : {};
}

function saveNotifyMap(map) {
    notifyStore.set("players", map);
}

// === notifications (提醒) ===
// 字段与参考插件一致：discount / originalPrice / discountEndTime，price 即当前售价（已含折扣）
function pushNotification(xuid, type, text, silent) {
    const conf = getNotifyConfig();
    const key = String(xuid || "");
    if (!conf.enabled || !key) return;
    const map = notifyMap();
    const box = isPlainObject(map[key]) ? map[key] : { unread: 0, items: [] };
    if (!Array.isArray(box.items)) box.items = [];
    box.items.unshift({ ts: Date.now(), type: String(type || "info"), text: limitText(text, 200), read: false });
    while (box.items.length > conf.inboxLimit) box.items.pop();
    box.unread = box.items.filter((item) => !item.read).length;
    map[key] = box;
    saveNotifyMap(map);

    if (!silent) {
        const online = mc.getPlayer(key);
        if (online) {
            try {
                online.tell(`§d[提醒] §f${text}`);
                online.sendToast("商城提醒", String(text).slice(0, 60));
            } catch (error) {
                // 忽略通知失败
            }
        }
    }
}

function unreadCount(xuid) {
    const box = notifyMap()[String(xuid || "")];
    if (!isPlainObject(box) || !Array.isArray(box.items)) return 0;
    return box.items.filter((item) => !item.read).length;
}

function listNotifications(xuid) {
    const box = notifyMap()[String(xuid || "")];
    if (!isPlainObject(box) || !Array.isArray(box.items)) return [];
    return box.items;
}

function markAllRead(xuid) {
    const key = String(xuid || "");
    const map = notifyMap();
    const box = map[key];
    if (!isPlainObject(box) || !Array.isArray(box.items)) return 0;
    let count = 0;
    for (const item of box.items) {
        if (!item.read) {
            item.read = true;
            count++;
        }
    }
    box.unread = 0;
    map[key] = box;
    saveNotifyMap(map);
    return count;
}

function broadcastAll(title, message) {
    try {
        for (const player of mc.getOnlinePlayers()) {
            try {
                player.sendToast(title, message);
            } catch (error) {
                // 忽略单个玩家失败
            }
        }
    } catch (error) {
        // 忽略
    }
}

// === discounts ===
function discountActive(listing) {
    if (!isPlainObject(listing)) return false;
    const rate = Number(listing.discount);
    const end = toInt(listing.discountEndTime, 0);
    if (!rate || rate <= 0 || rate >= 10 || !end) return false;
    return Date.now() < end;
}

function applyDiscount(listing, rate, minutes) {
    const value = clampNumber(rate, 1, 9.9, -1);
    const mins = clampInt(minutes, 1, 10080, -1);
    if (value < 0 || mins < 0) return false;
    if (listing.originalPrice === undefined) listing.originalPrice = toInt(listing.price, 0);
    listing.discount = value;
    listing.discountEndTime = Date.now() + mins * 60 * 1000;
    listing.price = Math.floor(toInt(listing.originalPrice, toInt(listing.price, 0)) * value / 10);
    return true;
}

function clearDiscount(listing) {
    if (!isPlainObject(listing)) return false;
    if (listing.originalPrice !== undefined && listing.originalPrice !== null) {
        listing.price = toInt(listing.originalPrice, listing.price);
    }
    delete listing.originalPrice;
    delete listing.discount;
    delete listing.discountEndTime;
    return true;
}

function discountText(listing) {
    if (!discountActive(listing)) return "";
    const mins = Math.max(1, Math.ceil((toInt(listing.discountEndTime, 0) - Date.now()) / 60000));
    return `${listing.discount}折·剩${formatDurationShort(mins * 60)}`;
}

// 扫描到期折扣：恢复原价 + 提醒店主（可选全服公告）
function checkDiscounts() {
    const now = Date.now();
    const conf = getDiscountConfig();
    let changed = false;

    const shops = allShops();
    for (const xuid of Object.keys(shops)) {
        const shop = shops[xuid];
        if (!isPlainObject(shop) || !isPlainObject(shop.items)) continue;
        for (const key of Object.keys(shop.items)) {
            const item = shop.items[key];
            if (!isPlainObject(item)) continue;
            const end = toInt(item.discountEndTime, 0);
            if (item.discount === undefined || !end || now < end) continue;
            const name = String(item.name || "物品");
            const original = toInt(item.originalPrice, item.price);
            clearDiscount(item);
            changed = true;
            pushNotification(xuid, "discount", `「${name}」折扣已到期，恢复原价 ${item.price} ${economy.name}`, true);
            const online = mc.getPlayer(xuid);
            if (online) {
                try {
                    online.sendToast("折扣结束", `${name} 已恢复原价 ${item.price}`);
                } catch (error) {
                    // 忽略
                }
            }
            if (conf.notifyAll) {
                broadcastAll("§d折扣结束", `${name} 已恢复原价 ${item.price}（原 ${original}）`);
            }
        }
    }
    if (changed) saveAllShops(shops);

    const official = officialData();
    let officialChanged = false;
    for (const key of Object.keys(official.purchaseItems)) {
        const item = official.purchaseItems[key];
        if (!isPlainObject(item)) continue;
        const end = toInt(item.discountEndTime, 0);
        if (item.discount === undefined || !end || now < end) continue;
        const name = String(item.name || "物品");
        clearDiscount(item);
        officialChanged = true;
        if (conf.notifyAll) {
            broadcastAll("§d官方折扣结束", `${name} 已恢复原价 ${item.price}`);
        }
    }
    if (officialChanged) saveOfficialData(official);
}

// === item layer ===
// 物品同一性：类型 + 归一化 NBT（去掉 Count）。同一性决定「背包里哪些格子算同一种可交易物品」。
function itemNbtString(item) {
    try {
        const nbt = item.getNbt();
        return nbt && typeof nbt.toSNBT === "function" ? String(nbt.toSNBT()) : "";
    } catch (error) {
        return "";
    }
}

function normalizeItemNbt(snbt) {
    let text = String(snbt || "").trim();
    if (!text) return "";
    text = text.replace(/"?Count"?\s*:\s*-?\d+[bBsSlLfF]?\s*,?/g, "");
    text = text.replace(/\{\s*,/g, "{").replace(/,\s*\}/g, "}");
    return text;
}

function listingKey(type, snbt) {
    const norm = normalizeItemNbt(snbt);
    if (!norm) return String(type || "air");
    return `${type}#${hashString(norm)}`;
}

function createItemFromNbt(snbt, count) {
    try {
        if (!snbt) return null;
        const nbt = NBT.parseSNBT(String(snbt));
        if (!nbt) return null;
        if (count !== undefined && typeof nbt.setByte === "function") {
            nbt.setByte("Count", clampInt(count, 1, 64, 1));
        }
        const item = mc.newItem(nbt);
        if (!item) return null;
        if (typeof item.isNull === "function" && item.isNull()) return null;
        return item;
    } catch (error) {
        return null;
    }
}

function maxStackOf(item) {
    try {
        const value = toInt(item.maxStackSize, 64);
        return value > 0 ? value : 64;
    } catch (error) {
        return 64;
    }
}

// --- 物品目录（Items.json，缺失时降级为类型名） ---
let catalogStoreCache = null;
let catalogCache = null;

function catalog() {
    if (catalogCache) return catalogCache;
    try {
        if (!catalogStoreCache) {
            catalogStoreCache = new JsonConfigFile(ITEMS_PATH, "{}");
        }
        const raw = catalogStoreCache.get("items", null);
        const list = Array.isArray(raw) ? raw : [];
        const byKey = {};
        for (const entry of list) {
            if (!entry) continue;
            // 目录里个别条目用 typeName 而非 fullName（如钻石）
            const id = String(entry.fullName || entry.typeName || "").trim();
            if (!id) continue;
            entry.fullName = id;
            byKey[`${id}|${toInt(entry.aux, 0)}`] = entry;
        }
        catalogCache = { list, byKey, categories: Array.isArray(catalogStoreCache.get("category", null)) ? catalogStoreCache.get("category", null).slice() : [] };
    } catch (error) {
        logger.warn(`物品目录加载失败: ${error}`);
        catalogCache = { list: [], byKey: {}, categories: [] };
    }
    return catalogCache;
}

function catalogLookup(type, aux) {
    const data = catalog();
    const key = `${type}|${toInt(aux, 0)}`;
    return data.byKey[key] || data.byKey[`${type}|0`] || null;
}

function searchCatalogMatches(keyword) {
    const query = String(keyword || "").trim().toLowerCase();
    const data = catalog();
    const out = [];
    if (!query) return data.list.slice();
    for (const entry of data.list) {
        const fullName = String(entry.fullName || entry.typeName || "").toLowerCase();
        const name = String(entry.name || "").toLowerCase();
        const desc = String(entry.descriptionName || "").toLowerCase();
        if (fullName.indexOf(query) >= 0 || name.indexOf(query) >= 0 || desc.indexOf(query) >= 0) {
            out.push(entry);
        }
    }
    return out;
}

function searchCatalog(keyword, limit) {
    return searchCatalogMatches(keyword).slice(0, limit || 30);
}

function catalogCategories() {
    const data = catalog();
    return Array.isArray(data.categories) ? data.categories : [];
}

function extractCustomName(snbt) {
    const text = String(snbt || "");
    if (!text) return "";
    // 旧式：tag.display.Name（顶层 Name 是物品类型，不能当成自定义名）
    let match = /display\s*:\s*\{\s*"?Name"?\s*:\s*"((?:\\.|[^"])*)"/.exec(text);
    if (!match) {
        // 新式：components 里的 custom_name
        match = /"?(?:minecraft:)?custom_name"?\s*:\s*"((?:\\.|[^"])*)"/.exec(text);
    }
    if (!match) return "";
    let value = match[1];
    try {
        const unescaped = JSON.parse('"' + value.replace(/\\"/g, '"') + '"');
        if (typeof unescaped === "string") value = unescaped;
    } catch (error) {
        // 保持原值
    }
    const component = /"text"\s*:\s*"((?:\\.|[^"])*)"/.exec(value);
    if (component) value = component[1];
    value = String(value).replace(/§./g, "").trim();
    return limitText(value, 64);
}

function resolveItemName(type, aux, snbt) {
    const custom = extractCustomName(snbt);
    if (custom) return custom;
    const entry = catalogLookup(type, aux);
    if (entry) {
        const name = String(entry.name || entry.descriptionName || "").trim();
        if (name) return name;
    }
    const fallback = String(type || "").replace(/^.*:/, "").replace(/_/g, " ").trim();
    return fallback || "未知物品";
}

// --- 物品图标 ---
// Icons.json：物品类型 -> 客户端贴图路径（由 tools/gen-icons.js 依据官方贴图清单生成并逐条校验）。
// 查不到时按物品分类回退，保证每个物品按钮都有图标。
let iconStoreCache = null;
let iconMapCache = null;

function iconMap() {
    if (iconMapCache) return iconMapCache;
    try {
        if (!iconStoreCache) iconStoreCache = new JsonConfigFile(ICONS_PATH, "{}");
        const raw = iconStoreCache.get("icons", null);
        iconMapCache = isPlainObject(raw) ? raw : {};
    } catch (error) {
        logger.warn(`物品图标表加载失败: ${error}`);
        iconMapCache = {};
    }
    return iconMapCache;
}

function categoryIcon(category) {
    const name = String(category || "");
    if (name.indexOf("武器") >= 0 || name.indexOf("战斗") >= 0 || name.indexOf("工具") >= 0) return ICON.tool;
    if (name.indexOf("装备") >= 0 || name.indexOf("盔甲") >= 0 || name.indexOf("防具") >= 0) return ICON.armor;
    if (name.indexOf("食物") >= 0 || name.indexOf("饮品") >= 0) return ICON.food;
    if (name.indexOf("药水") >= 0 || name.indexOf("酿造") >= 0) return ICON.potion;
    if (name.indexOf("附魔") >= 0 || name.indexOf("书") >= 0) return ICON.bookshelf;
    if (name.indexOf("方块") >= 0 || name.indexOf("建筑") >= 0) return ICON.block;
    if (name.indexOf("自然") >= 0 || name.indexOf("植物") >= 0) return ICON.nature;
    if (name.indexOf("材料") >= 0 || name.indexOf("矿物") >= 0) return ICON.craft;
    if (name.indexOf("生物") >= 0 || name.indexOf("刷怪") >= 0) return ICON.user;
    if (name.indexOf("鱼") >= 0 || name.indexOf("水") >= 0) return ICON.fish;
    return ICON.item;
}

function itemIconOf(type, aux, category) {
    const id = String(type || "");
    if (!id || id === "minecraft:air") return categoryIcon(category);
    const hit = iconMap()[id];
    if (hit) return String(hit);
    const entry = catalogLookup(id, aux);
    return categoryIcon((entry && entry.categoryName) || category);
}

// 列表里每一项的图标：优先用物品自己的贴图，其次用调用方给的回退图标
function listingIcon(listing) {
    if (!isPlainObject(listing)) return ICON.item;
    return itemIconOf(listing.type, listing.aux, listing.category);
}

// --- 背包读写 ---
function inventoryOf(player) {
    try {
        return player.getInventory();
    } catch (error) {
        return null;
    }
}

function forEachInventoryItem(player, callback) {
    const inv = inventoryOf(player);
    if (!inv) return;
    const size = toInt(inv.size, 0);
    for (let i = 0; i < size; i++) {
        let item = null;
        try {
            item = inv.getItem(i);
        } catch (error) {
            item = null;
        }
        if (!item) continue;
        try {
            if (typeof item.isNull === "function" && item.isNull()) continue;
        } catch (error) {
            continue;
        }
        const type = String(item.type || "");
        if (!type || type === "minecraft:air") continue;
        callback(item, i);
    }
}

function listInventoryStacks(player, excludeForbidden) {
    const forbidden = excludeForbidden ? forbiddenList() : [];
    const map = {};
    forEachInventoryItem(player, (item, slot) => {
        const type = String(item.type);
        if (forbidden.indexOf(type) >= 0) return;
        const raw = itemNbtString(item);
        const key = listingKey(type, raw);
        const count = toInt(item.count, 0);
        if (count <= 0) return;
        if (!map[key]) {
            const aux = toInt(item.aux, 0);
            map[key] = {
                key,
                type,
                aux,
                nbt: normalizeItemNbt(raw),
                name: resolveItemName(type, aux, raw),
                count: 0,
            };
        }
        map[key].count += count;
    });
    const out = [];
    for (const key of Object.keys(map)) out.push(map[key]);
    out.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return out;
}

function countMatching(player, key) {
    let total = 0;
    forEachInventoryItem(player, (item) => {
        if (listingKey(String(item.type), itemNbtString(item)) === key) {
            total += toInt(item.count, 0);
        }
    });
    return total;
}

// 扣背包：同一个 key（类型 + 归一化 NBT）可能分散在多个槽位。
// 先统计再扣减；扣减中途失败时把已经扣掉的部分还回去，绝不留下"扣了一半"的状态。
function removeMatching(player, key, amount) {
    const inv = inventoryOf(player);
    if (!inv) return false;
    let remaining = toInt(amount, 0);
    if (remaining <= 0) return false;
    const picks = [];
    forEachInventoryItem(player, (item, slot) => {
        if (remaining <= 0) return;
        if (listingKey(String(item.type), itemNbtString(item)) !== key) return;
        const count = toInt(item.count, 0);
        if (count <= 0) return;
        const take = Math.min(count, remaining);
        picks.push({ slot, take, type: String(item.type), snbt: itemNbtString(item) });
        remaining -= take;
    });
    if (remaining > 0) return false; // 数量不够，一个都没扣

    const done = [];
    for (const pick of picks) {
        try {
            inv.removeItem(pick.slot, pick.take);
            done.push(pick);
        } catch (error) {
            logger.warn(`扣除物品失败(槽位 ${pick.slot}): ${error}，已扣部分将退回`);
            restoreRemoved(player, done);
            return false;
        }
    }
    try {
        player.refreshItems();
    } catch (error) {
        // 忽略
    }
    return true;
}

// 把已经扣掉的一批物品退回背包（扣减中途失败时的回滚）
function restoreRemoved(player, picks) {
    const inv = inventoryOf(player);
    for (const pick of picks) {
        let restored = false;
        try {
            const it = inv ? inv.getItem(pick.slot) : null;
            if (it && !(typeof it.isNull === "function" && it.isNull())) {
                it.setCount(toInt(it.count, 0) + pick.take);
                inv.setItem(pick.slot, it);
                restored = true;
            }
        } catch (error) {
            restored = false;
        }
        if (!restored && !giveItems(player, normalizeItemNbt(pick.snbt), pick.take)) {
            logger.error(`回滚物品失败，需要管理员手动补偿：${pick.type} x${pick.take}`);
        }
    }
    try {
        player.refreshItems();
    } catch (error) {
        // 忽略
    }
}

function canReceive(player, snbt, amount) {
    const probe = createItemFromNbt(snbt, 1);
    if (!probe) return false;
    const inv = inventoryOf(player);
    if (!inv) return false;
    const maxStack = maxStackOf(probe);
    const key = listingKey(String(probe.type), snbt);
    let space = 0;
    forEachInventoryItem(player, (item) => {
        if (space >= amount) return;
        if (listingKey(String(item.type), itemNbtString(item)) === key) {
            space += Math.max(0, maxStack - toInt(item.count, 0));
        }
    });
    const size = toInt(inv.size, 0);
    for (let i = 0; i < size && space < amount; i++) {
        let it = null;
        try {
            it = inv.getItem(i);
        } catch (error) {
            it = null;
        }
        if (!it) {
            space += maxStack;
            continue;
        }
        try {
            if ((typeof it.isNull === "function" && it.isNull()) || String(it.type || "") === "minecraft:air") {
                space += maxStack;
            }
        } catch (error) {
            // 忽略该槽位
        }
    }
    return space >= amount;
}

// 发放物品并如实报告"到底发出去了多少"。
// 返回 { want, given, remaining }；调用方据此只退还/回滚没发出去的部分，避免
// "发了一半 + 全额退款"这种可复制的漏洞。
function giveItemsPartial(player, snbt, amount) {
    const want = toInt(amount, 0);
    const out = { want: want, given: 0, remaining: want };
    if (want <= 0) return out;
    // 空间不够就一点都不发（与原 giveItems 语义一致）
    if (!canReceive(player, snbt, want)) return out;
    const probe = createItemFromNbt(snbt, 1);
    if (!probe) return out;
    const inv = inventoryOf(player);
    if (!inv) return out;
    const maxStack = maxStackOf(probe);
    const key = listingKey(String(probe.type), snbt);
    let remain = want;

    forEachInventoryItem(player, (item, slot) => {
        if (remain <= 0) return;
        if (listingKey(String(item.type), itemNbtString(item)) !== key) return;
        const count = toInt(item.count, 0);
        const space = maxStack - count;
        if (space <= 0) return;
        const add = Math.min(space, remain);
        try {
            item.setCount(count + add);
            inv.setItem(slot, item);
            remain -= add;
            out.given += add;
        } catch (error) {
            // 该槽位写入失败，留给后续 giveItem 处理
        }
    });

    while (remain > 0) {
        const portion = Math.min(remain, maxStack);
        const fresh = createItemFromNbt(snbt, portion);
        if (!fresh) break;
        let ok = false;
        try {
            ok = player.giveItem(fresh);
        } catch (error) {
            logger.warn(`发放物品失败: ${error}`);
            break;
        }
        if (ok === false) break;
        remain -= portion;
        out.given += portion;
    }

    out.remaining = remain;
    try {
        player.refreshItems();
    } catch (error) {
        // 忽略
    }
    return out;
}

function giveItems(player, snbt, amount) {
    const result = giveItemsPartial(player, snbt, amount);
    return result.given === result.want;
}

// === economy ===
const economy = {
    get name() {
        return "金币";
    },
    get(xuid) {
        try {
            const value = Number(money.get(String(xuid)));
            return isNaN(value) ? 0 : Math.floor(value);
        } catch (error) {
            return 0;
        }
    },
    add(xuid, amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));
        if (!value) return true;
        try {
            return money.add(String(xuid), value) !== false;
        } catch (error) {
            logger.warn(`金币入账失败: ${error}`);
            return false;
        }
    },
    reduce(xuid, amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));
        if (!value) return true;
        try {
            return money.reduce(String(xuid), value) !== false;
        } catch (error) {
            logger.warn(`金币扣款失败: ${error}`);
            return false;
        }
    },
};

function taxApplies(isOfficial) {
    const tax = getTaxConfig();
    if (!tax.enabled || tax.rate <= 0) return false;
    if (tax.scope === "all") return true;
    if (tax.scope === "official") return isOfficial === true;
    return isOfficial !== true;
}

function calcTax(baseAmount, isOfficial) {
    if (!taxApplies(isOfficial)) return 0;
    return Math.floor(Math.max(0, toInt(baseAmount, 0)) * getTaxConfig().rate);
}

// === domain: stats ===
function officialCounts() {
    const data = officialData();
    return {
        sells: Object.keys(data.purchaseItems).length,
        recycles: Object.keys(data.recycleItems).length,
    };
}

function shopAggregateStats() {
    const shops = allShops();
    let openShops = 0;
    let itemTypes = 0;
    let itemCount = 0;
    for (const xuid of Object.keys(shops)) {
        const shop = shops[xuid];
        if (!isPlainObject(shop)) continue;
        if (shop.isOpen) openShops++;
        const items = isPlainObject(shop.items) ? shop.items : {};
        for (const key of Object.keys(items)) {
            const listing = items[key];
            if (!isPlainObject(listing)) continue;
            itemTypes++;
            itemCount += Math.max(0, toInt(listing.quantity, 0));
        }
    }
    return {
        shops: Object.keys(shops).length,
        openShops,
        itemTypes,
        itemCount,
    };
}

function statsSnapshot() {
    const official = officialCounts();
    const shops = shopAggregateStats();
    return {
        officialSells: official.sells,
        officialRecycles: official.recycles,
        shops: shops.shops,
        openShops: shops.openShops,
        itemTypes: shops.itemTypes,
        itemCount: shops.itemCount,
        listings: official.sells + shops.itemTypes,
        taxTotal: taxData().total,
        logs: tradeLogs().length,
        requests: activeRequests().length,
        warehouseUsers: Object.keys(warehouseMap()).length,
    };
}

// === domain: ranking / logs ===
function bumpRanking(xuid, name, quantity, earnings) {
    const map = rankingData();
    const key = String(xuid || "");
    if (!key) return;
    const entry = isPlainObject(map[key]) ? map[key] : { name, sales: 0, orders: 0, earnings: 0, lastSale: 0 };
    entry.name = String(name || entry.name || key);
    entry.sales = toInt(entry.sales, 0) + Math.max(0, toInt(quantity, 0));
    entry.orders = toInt(entry.orders, 0) + 1;
    entry.earnings = toInt(entry.earnings, 0) + Math.max(0, toInt(earnings, 0));
    entry.lastSale = Date.now();
    map[key] = entry;
    saveRankingData(map);
}

function rankingList(keyword) {
    const map = rankingData();
    const query = normalizePlayerKey(keyword);
    let rows = Object.keys(map).map((xuid) => Object.assign({ xuid }, map[xuid]));
    if (query) {
        rows = rows.filter((row) => normalizePlayerKey(row.name).indexOf(query) >= 0);
    }
    rows.sort((a, b) => toInt(b.earnings, 0) - toInt(a.earnings, 0));
    return rows.map((row, index) => ({
        rank: index + 1,
        xuid: row.xuid,
        name: String(row.name || row.xuid),
        sales: toInt(row.sales, 0),
        orders: toInt(row.orders, 0),
        earnings: toInt(row.earnings, 0),
        lastSale: toInt(row.lastSale, 0),
    }));
}

function logPage(page, keyword) {
    const query = normalizePlayerKey(keyword);
    let rows = tradeLogs().slice().reverse();
    if (query) {
        rows = rows.filter((row) =>
            normalizePlayerKey(row.buyer).indexOf(query) >= 0
            || normalizePlayerKey(row.seller).indexOf(query) >= 0
            || normalizePlayerKey(row.item).indexOf(query) >= 0);
    }
    const size = getPageSize();
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const current = clampInt(page, 1, pages, 1);
    return {
        rows: rows.slice((current - 1) * size, current * size),
        page: current,
        pages,
        total,
    };
}

function logTrade(entry) {
    pushTradeLog(Object.assign({ ts: Date.now() }, entry));
}

// === domain: player shops ===
function createShop(xuid, name, ownerName) {
    const key = String(xuid || "");
    if (!key) return { ok: false, error: "无法识别玩家账号" };
    const shops = allShops();
    if (isPlainObject(shops[key])) return { ok: false, error: "你已经拥有店铺了" };
    const shopConf = getShopConfig();
    if (!shopConf.allowCreate) return { ok: false, error: "服务器当前不允许创建店铺" };
    if (shopConf.createCost > 0) {
        if (economy.get(key) < shopConf.createCost) {
            return { ok: false, error: `开店需要 ${shopConf.createCost} ${economy.name}，余额不足` };
        }
        if (!economy.reduce(key, shopConf.createCost)) {
            return { ok: false, error: "开店费用扣除失败" };
        }
    }
    shops[key] = {
        name: limitText(name, 24) || `${ownerName}的店铺`,
        ownerName: String(ownerName || ""),
        isOpen: true,
        notice: "",
        createdAt: Date.now(),
        items: {},
        earnings: 0,
        pendingEarnings: 0,
        pendingItems: [],
    };
    saveAllShops(shops);
    return { ok: true, shop: shops[key], cost: shopConf.createCost };
}

function shopOpenCount() {
    const shops = allShops();
    let count = 0;
    for (const key of Object.keys(shops)) {
        if (isPlainObject(shops[key]) && shops[key].isOpen) count++;
    }
    return count;
}

function shopListings(shop) {
    const items = isPlainObject(shop && shop.items) ? shop.items : {};
    const out = [];
    for (const key of Object.keys(items)) {
        const listing = items[key];
        if (!isPlainObject(listing)) continue;
        out.push(Object.assign({ key }, listing));
    }
    out.sort((a, b) => toInt(b.price, 0) - toInt(a.price, 0));
    return out;
}

function pendingShopItemsOf(shop) {
    return Array.isArray(shop && shop.pendingItems) ? shop.pendingItems : [];
}

function queuePendingItem(shop, listing, quantity) {
    if (!isPlainObject(shop)) return 0;
    const qty = toInt(quantity, 0);
    // 数量为 0 的条目不能进暂存区，否则上线结算会凭空生成物品
    if (qty <= 0) return 0;
    if (!Array.isArray(shop.pendingItems)) shop.pendingItems = [];
    shop.pendingItems.push({
        type: String(listing.type || ""),
        aux: toInt(listing.aux, 0),
        nbt: String(listing.nbt || ""),
        name: String(listing.name || listing.type || "物品"),
        quantity: qty,
        at: Date.now(),
    });
    return qty;
}

// 官方商品库存：-1 = 无限（必须显式写 -1）；字段缺失/损坏按 0 处理并告警，
// 否则一条坏数据就等于"无限库存免费刷"。
const officialStockWarned = {};
function officialStockOf(listing, key) {
    if (!isPlainObject(listing)) return 0;
    const raw = listing.quantity;
    if (raw === undefined || raw === null || raw === "" || isNaN(Number(raw))) {
        const id = String(key || listing.name || listing.type || "?");
        if (!officialStockWarned[id]) {
            officialStockWarned[id] = true;
            logger.warn(`官方商品「${id}」缺少 quantity 字段，已按库存 0 处理（请在管理市场重新设置库存）`);
        }
        return 0;
    }
    return toInt(raw, 0);
}

// 官方库存显示文本
function officialStockText(listing, key) {
    const stock = officialStockOf(listing, key);
    return stock === -1 ? "无限" : String(stock);
}

// === transactions ===
// 通用购买：官方商店（isOfficial）或玩家店铺。返回 {ok, error, summary}
function executePurchase(player, request) {
    const isOfficial = Boolean(request.isOfficial);
    let qty = toInt(request.qty, 0);
    if (qty <= 0) return { ok: false, error: "购买数量必须是正整数" };

    const buyerXuid = String(player.xuid || "");
    const buyerName = String(player.realName || player.name || "");
    if (!buyerXuid) return { ok: false, error: "无法识别购买者账号" };

    let listing = null;
    let sellerXuid = "";
    let sellerName = "官方商店";
    let ownerShop = null;

    if (isOfficial) {
        const data = officialData();
        listing = data.purchaseItems[request.key];
        if (!isPlainObject(listing)) return { ok: false, error: "该物品已下架，购买失败" };
        // 只有显式写了 -1 才是"无限库存"；数量字段缺失/损坏一律视为 0，避免变成无限刷
        const stock = officialStockOf(listing, request.key);
        if (stock !== -1 && stock < qty) return { ok: false, error: `库存不足（剩余 ${stock}）` };
    } else {
        ownerShop = getShop(request.ownerXuid);
        if (!ownerShop) return { ok: false, error: "该店铺已不存在" };
        if (!ownerShop.isOpen) return { ok: false, error: "该店铺已打烊" };
        listing = isPlainObject(ownerShop.items) ? ownerShop.items[request.key] : null;
        if (!isPlainObject(listing)) return { ok: false, error: "该物品已下架，购买失败" };
        if (toInt(listing.quantity, 0) < qty) return { ok: false, error: `库存不足（剩余 ${toInt(listing.quantity, 0)}）` };
        sellerXuid = String(request.ownerXuid || "");
        sellerName = String(ownerShop.ownerName || ownerShop.name || sellerXuid);
        if (sellerXuid === buyerXuid && !cfgBool("allowSelfPurchase", false)) {
            return { ok: false, error: "当前服务器不允许购买自己店铺的物品" };
        }
    }

    // 自购（允许时）：不收费、不计税、不记排行与交易日志，只扣库存
    const selfBuy = !isOfficial && String(request.ownerXuid || "") === buyerXuid;
    const price = Math.max(0, toInt(listing.price, 0));
    const plannedBase = selfBuy ? 0 : price * qty;
    const plannedTax = selfBuy ? 0 : calcTax(price * qty, isOfficial);
    const plannedTotal = plannedBase + plannedTax;
    const balance = economy.get(buyerXuid);
    if (balance < plannedTotal) {
        return { ok: false, error: `余额不足：需要 ${plannedTotal} ${economy.name}（含税 ${plannedTax}），当前 ${balance}` };
    }
    if (!canReceive(player, listing.nbt, qty)) {
        return { ok: false, error: "背包空间不足，请先清理背包" };
    }
    if (!economy.reduce(buyerXuid, plannedTotal)) {
        return { ok: false, error: "扣款失败，请稍后重试" };
    }

    // 发放物品：可能只发出去一部分（引擎写入失败），此时按"实际到手数量"重新结算，
    // 只退还差额，避免"发了一半又全额退款"的可复制漏洞。
    const delivery = giveItemsPartial(player, listing.nbt, qty);
    const got = delivery.given;
    if (got !== qty) {
        const refundBase = selfBuy ? 0 : price * (qty - got);
        const refundTax = plannedTax - (selfBuy ? 0 : calcTax(price * got, isOfficial));
        const refund = Math.max(0, refundBase + refundTax);
        if (refund > 0) economy.add(buyerXuid, refund);
        if (got <= 0) {
            return { ok: false, error: "物品发放失败，费用已全额退还" };
        }
        logger.warn(`购买只发放了部分物品：${listing.name} x${got}/${qty}，已退还 ${refund}`);
        qty = got;
    }
    const base = selfBuy ? 0 : price * qty;
    const tax = selfBuy ? 0 : calcTax(price * qty, isOfficial);
    const total = base + tax;

    // 库存扣减
    if (isOfficial) {
        const data = officialData();
        const entry = data.purchaseItems[request.key];
        const stock = officialStockOf(entry, request.key);
        entry.sales = toInt(entry.sales, 0) + qty;
        if (stock !== -1) {
            const left = stock - qty;
            if (left <= 0) delete data.purchaseItems[request.key];
            else entry.quantity = left;
        }
        saveOfficialData(data);
    } else {
        const shops = allShops();
        const shop = shops[String(request.ownerXuid || "")];
        if (isPlainObject(shop) && isPlainObject(shop.items) && isPlainObject(shop.items[request.key])) {
            const entry = shop.items[request.key];
            const left = toInt(entry.quantity, 0) - qty;
            entry.sales = toInt(entry.sales, 0) + qty;
            if (left <= 0) delete shop.items[request.key];
            else entry.quantity = left;
            shop.earnings = toInt(shop.earnings, 0) + base;

            if (sellerXuid && sellerXuid !== buyerXuid) {
                const online = mc.getPlayer(sellerXuid);
                if (online) {
                    // 入账失败不能把钱吞掉：退化为"待结算"，等卖家下次上线补账
                    if (!economy.add(sellerXuid, base)) {
                        shop.pendingEarnings = toInt(shop.pendingEarnings, 0) + base;
                        logger.warn(`卖家 ${sellerXuid} 在线但入账失败，${base} 已转为待结算`);
                    }
                    try {
                        online.tell(`§a店铺售出 §d${listing.name} x${qty}§a，获得 ${base} ${economy.name}`);
                        online.sendToast("店铺销售", `售出 ${listing.name} x${qty}`);
                    } catch (error) {
                        // 忽略通知失败
                    }
                } else {
                    // 离线：先记待结算，再落库（顺序不能反，否则改动会丢）
                    shop.pendingEarnings = toInt(shop.pendingEarnings, 0) + base;
                }
            }
            saveAllShops(shops);
        }
    }

    if (tax > 0) {
        pushTaxRecord({
            ts: Date.now(),
            payer: buyerName,
            payerXuid: buyerXuid,
            amount: tax,
            item: String(listing.name || ""),
            official: isOfficial,
        });
    }
    if (!isOfficial && sellerXuid && sellerXuid !== buyerXuid) {
        bumpRanking(sellerXuid, sellerName, qty, base);
        const sellerOnline = Boolean(mc.getPlayer(sellerXuid));
        pushNotification(sellerXuid, "sold",
            `你的店铺售出了 ${listing.name} x${qty}，收入 ${base} ${economy.name}${sellerOnline ? "" : "（离线期间）"}`, true);
    }
    if (!selfBuy) {
        logTrade({
            ts: Date.now(),
            kind: "buy",
            buyer: buyerName,
            buyerXuid,
            seller: sellerName,
            sellerXuid,
            item: String(listing.name || listing.type || "物品"),
            qty,
            price,
            total: base,
            tax,
            official: isOfficial,
        });
    }

    return {
        ok: true,
        item: String(listing.name || listing.type || "物品"),
        qty,
        price,
        base,
        tax,
        total,
        balance: economy.get(buyerXuid),
        official: isOfficial,
    };
}

// 回收：玩家把背包物品卖给官方商店
function executeRecycle(player, stack, qty) {
    const recycleConf = cfgSection("recycle");
    if (recycleConf.enabled === false) return { ok: false, error: "回收功能已关闭" };
    const amount = toInt(qty, 0);
    if (amount <= 0) return { ok: false, error: "回收数量必须是正整数" };

    const data = officialData();
    const listing = data.recycleItems[stack.recycleKey || stack.key];
    if (!isPlainObject(listing)) return { ok: false, error: "该物品当前不在回收清单中" };

    const xuid = String(player.xuid || "");
    const name = String(player.realName || player.name || "");
    const available = countMatching(player, stack.key);
    if (available < amount) return { ok: false, error: `背包中只有 ${available} 个可回收` };
    if (!removeMatching(player, stack.key, amount)) {
        return { ok: false, error: "扣除背包物品失败，请重试" };
    }
    const price = Math.max(0, toInt(listing.price, 0));
    const perCount = Math.max(1, toInt(listing.perCount, 1));
    const total = Math.floor(price * amount / perCount);
    if (!economy.add(xuid, total)) {
        // 回滚：把物品还回去
        giveItems(player, stack.nbt, amount);
        return { ok: false, error: "回收款项发放失败，已归还物品" };
    }
    logTrade({
        ts: Date.now(),
        kind: "recycle",
        buyer: "官方商店",
        buyerXuid: "",
        seller: name,
        sellerXuid: xuid,
        item: String(listing.name || stack.name || "物品"),
        qty: amount,
        price,
        total,
        tax: 0,
        official: true,
    });
    return {
        ok: true,
        item: String(listing.name || stack.name || "物品"),
        qty: amount,
        price,
        total,
        balance: economy.get(xuid),
    };
}

// === form helpers ===
function buildFormTitle(prefix, title) {
    return prefix + (String(title || "").trim() || "Menu");
}

function sendListForm(player, title, content, buttons, images, callback) {
    const safeButtons = (buttons && buttons.length ? buttons : ["返回"]).map(normalizeButtonText);
    const safeImages = Array.isArray(images) && images.length === safeButtons.length
        ? images
        : safeButtons.map(() => "");
    try {
        safeSend(player, () => player.sendSimpleForm(buildFormTitle(TEXTURE_FORM_LIST, title), String(content || " "), safeButtons, safeImages, (_pl, index) => {
            if (index === null || index === undefined) return;
            callback(index);
        }), `列表:${title}`);
    } catch (error) {
        logger.error(`发送表单失败(${title}): ${error}`);
    }
}

function sendInputForm(player, title, fields, callback, onCancel) {
    try {
        const form = mc.newCustomForm();
        form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, title));
        for (const field of fields) {
            form.addInput(String(field.label || "输入"), String(field.placeholder || ""),
                field.value === undefined || field.value === null ? "" : String(field.value));
        }
        safeSend(player, () => player.sendForm(form, (_pl, data) => {
            if (!data) {
                if (typeof onCancel === "function") onCancel();
                return;
            }
            callback(data);
        }), `输入:${title}`);
    } catch (error) {
        logger.error(`发送输入表单失败(${title}): ${error}`);
    }
}

function sendChoiceForm(player, title, label, options, defaultIndex, callback, onCancel) {
    try {
        const form = mc.newCustomForm();
        form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, title));
        form.addDropdown(String(label || "选择"), options, clampInt(defaultIndex, 0, Math.max(0, options.length - 1), 0));
        safeSend(player, () => player.sendForm(form, (_pl, data) => {
            if (!data) {
                if (typeof onCancel === "function") onCancel();
                else callback(-1); // 取消：回调 -1，各调用方都把 -1 当“返回”处理
                return;
            }
            callback(toInt(fieldAt(data, 1, 0), -1));
        }), `选择:${title}`);
    } catch (error) {
        logger.error(`发送选择表单失败(${title}): ${error}`);
    }
}

// 自定义表单回调取值：不同引擎版本对 addLabel 是否在 data 里占一位的处理不一致，
// 这里按「本次表单的输入控件数」自动对齐，两种约定都能取到正确值。
// fieldAt(data, 控件数, 第几个控件)
function fieldAt(data, controls, index) {
    if (!Array.isArray(data)) return undefined;
    const offset = Math.max(0, data.length - controls);
    return data[offset + index];
}

// === 调试日志（config.debug = true 时输出，用于排查实机问题） ===
function dbg(message) {
    try {
        if (cfgBool("debug", false)) logger.info(`[商城调试] ${message}`);
    } catch (error) {
        // 忽略
    }
}

// 表单发送：sendForm/sendSimpleForm 返回 Null 表示发送失败（客户端没弹窗），
// 直接忽略会表现为“点了没反应”，这里自动重试一次并记录。
function safeSend(player, sender, label) {
    let attempts = 0;
    const attempt = () => {
        attempts++;
        let id = null;
        try {
            id = sender();
        } catch (error) {
            logger.error(`发送表单异常(${label}): ${error}`);
            return;
        }
        if (id !== null && id !== undefined) return; // 成功
        if (attempts < 3) {
            logger.warn(`表单发送失败(${label})，${120 * attempts}ms 后重试 (${attempts}/3)`);
            setTimeout(attempt, 120 * attempts);
            return;
        }
        logger.error(`表单发送失败(${label})：重试 3 次仍未成功`);
        try {
            player.tell("§c表单打开失败，请重新打开本页面（详见服务器日志）");
        } catch (error) {
            // 忽略
        }
    };
    attempt();
}

function promptText(player, title, label, value, callback, onCancel) {
    sendInputForm(player, title, [{ label, placeholder: "", value: value || "" }], (data) => {
        callback(String(fieldAt(data, 1, 0) === undefined || fieldAt(data, 1, 0) === null ? "" : fieldAt(data, 1, 0)).trim());
    }, typeof onCancel === "function" ? onCancel : () => {
        // 没指定回退页面时至少给个提示，别让人以为“点了个没反应”
        try {
            player.sendToast("已取消", "未做任何修改");
        } catch (error) {
            // 忽略
        }
    });
}

function promptSearch(player, title, current, callback) {
    promptText(player, title, "输入关键词（留空显示全部）", current || "", (keyword) => {
        callback(keyword);
    }, () => {
        // 取消搜索：当作没改关键词，回到原列表，不把人丢在原地
        callback(String(current || ""));
    });
}

// 通用分页列表
//   物品条目（opts.items + opts.render）
//   顶部导航 opts.topNav（分类、搜索等，显示在物品列表【上方】）
//   底部导航 上一页 / 下一页 / extraNav / 搜索(searchTop 未开时) / 返回
function pagedList(player, opts) {
    const items = opts.items || [];
    const buttons = [];
    const images = [];

    // 顶部导航：分类、搜索等操作放在物品列表上方，先选条件再看商品
    const topNav = [];
    if (Array.isArray(opts.topNav)) {
        for (const entry of opts.topNav) {
            if (entry && typeof entry.action === "function") topNav.push(entry);
        }
    }
    if (opts.searchable !== false && opts.searchTop && typeof opts.onSearch === "function") {
        topNav.push({
            label: opts.searchLabel || "搜索",
            action: opts.onSearch,
            icon: opts.searchIcon || ICON.search,
        });
    }
    for (const entry of topNav) {
        buttons.push(entry.label);
        images.push(entry.icon || "");
    }

    const itemIcon = typeof opts.icon === "function" ? opts.icon : null;
    for (const item of items) {
        buttons.push(normalizeButtonText(opts.render(item), buttons.length));
        images.push(itemIcon ? (itemIcon(item) || "") : "");
    }

    const nav = [];
    if (toInt(opts.page, 1) > 1) nav.push({ label: "← 上一页", action: opts.onPrev, icon: ICON.prev });
    if (toInt(opts.page, 1) < toInt(opts.pages, 1)) nav.push({ label: "下一页 →", action: opts.onNext, icon: ICON.next });
    if (Array.isArray(opts.extraNav)) {
        for (const extra of opts.extraNav) {
            if (extra && typeof extra.action === "function") nav.push(extra);
        }
    }
    if (opts.searchable !== false && !opts.searchTop && typeof opts.onSearch === "function") {
        nav.push({ label: opts.searchLabel || "搜索", action: opts.onSearch, icon: opts.searchIcon || ICON.search });
    }
    nav.push({ label: opts.backLabel || "返回", action: opts.onBack, icon: opts.backIcon || ICON.home });
    for (const entry of nav) {
        buttons.push(entry.label);
        images.push(entry.icon || "");
    }

    sendListForm(player, opts.title, opts.summary, buttons, images, (index) => {
        if (index < topNav.length) {
            const topEntry = topNav[index];
            if (topEntry && typeof topEntry.action === "function") topEntry.action();
            return;
        }
        const itemIndex = index - topNav.length;
        if (itemIndex < items.length) {
            opts.onItem(items[itemIndex], itemIndex);
            return;
        }
        const navEntry = nav[itemIndex - items.length];
        if (navEntry && typeof navEntry.action === "function") navEntry.action();
    });
}

function pageSlice(rows, page, size) {
    const pageSize = size || getPageSize();
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = clampInt(page, 1, pages, 1);
    return {
        rows: rows.slice((current - 1) * pageSize, current * pageSize),
        page: current,
        pages,
        total,
    };
}

function isAdmin(player) {
    try {
        return Boolean(player.isOP());
    } catch (error) {
        return false;
    }
}

function balanceLine(player) {
    const tax = getTaxConfig();
    const taxText = tax.enabled && tax.rate > 0
        ? ` §f(税率 ${(tax.rate * 100).toFixed(1)}%，${{ player: "玩家店铺", official: "官方商店", all: "全部交易" }[tax.scope] || "玩家店铺"})`
        : "";
    return `§e余额：§6${economy.get(player.xuid)} ${economy.name}${taxText}`;
}

// === 主菜单 ===
function showMainMenu(player) {
    const stats = statsSnapshot();
    const buttonsConf = cfgSection("menu").buttons || {};
    const recycleConf = cfgSection("recycle");
    const myShop = getShop(player.xuid);
    const myTypes = myShop && isPlainObject(myShop.items) ? Object.keys(myShop.items).length : 0;
    const latest = tradeLogs();
    const lastLog = latest.length ? latest[latest.length - 1] : null;

    let content = `${balanceLine(player)}\n`;
    if (cfgBool("statistics", true)) {
        content += `§b官方在售 §a${stats.officialSells} §f| §b官方回收 §a${stats.officialRecycles}\n`;
        content += `§b营业店铺 §a${stats.openShops} §f| §b在售商品 §a${stats.itemTypes} §f(共 ${stats.itemCount} 件)\n`;
        if (myShop) {
            content += `§b我的店铺 §f${myShop.isOpen ? "§a营业中" : "§c已关闭"} §f| §b物品 §a${myTypes} §f| §b累计收益 §6${toInt(myShop.earnings, 0)}\n`;
        }
        if (lastLog) {
            const line = lastLog.kind === "recycle"
                ? `${lastLog.seller} 回收了 ${lastLog.item} x${lastLog.qty}`
                : `${lastLog.buyer} 向 ${lastLog.seller} 购买了 ${lastLog.item} x${lastLog.qty}`;
            content += `§d最新交易 §f${limitText(line, 46)}\n`;
        }
    }
    const unread = unreadCount(player.xuid);
    if (unread > 0) content += `§c§l你有 ${unread} 条未读提醒！\n`;
    content += "§b请选择一个操作：";

    const entries = [];
    if (buttonsConf.center !== false) {
        entries.push({
            key: "center",
            text: `§a购物中心\n§f营业店铺 ${stats.openShops} · 在售 ${stats.itemTypes} 件`,
            icon: ICON.home,
            action: () => showShoppingCenter(player, 1, ""),
        });
    }
    if (buttonsConf.official !== false) {
        entries.push({
            key: "official",
            text: `§e官方商店\n§f出售 ${stats.officialSells} 件 · 回收 ${stats.officialRecycles} 件`,
            icon: ICON.money,
            action: () => showOfficialMenu(player),
        });
    }
    if (buttonsConf.recycle !== false && recycleConf.enabled !== false) {
        entries.push({
            key: "recycle",
            text: `§b物品回收\n§f把背包物品卖给官方商店`,
            icon: ICON.trade,
            action: () => showRecycleList(player),
        });
    }
    if (buttonsConf.myShop !== false) {
        entries.push({
            key: "myShop",
            text: myShop
                ? `§b我的店铺 §f${myShop.isOpen ? "§a营业中" : "§c已关闭"}\n§f物品 ${myTypes} · 收益 ${toInt(myShop.earnings, 0)}`
                : "§b我的店铺\n§f尚未开店，点击创建",
            icon: ICON.sign,
            action: () => showMyShop(player),
        });
    }
    if (buttonsConf.warehouse !== false && getWarehouseConfig().enabled) {
        const record = warehouseOf(player.xuid);
        entries.push({
            key: "warehouse",
            text: `§3个人仓库 §f(${warehouseItems(record).length}/${warehouseSlots(player.xuid)} 格)\n§f存入、取出、买断扩容`,
            icon: ICON.warehouse,
            action: () => showWarehouse(player, 1),
        });
    }
    if (buttonsConf.requests !== false && getRequestConfig().enabled) {
        entries.push({
            key: "requests",
            text: `§6悬赏 · 求购 §f(${activeRequests().length} 单进行中)\n§f发布订单 / 履约交货`,
            icon: ICON.book,
            action: () => showRequestsHub(player),
        });
    }
    if (buttonsConf.search !== false) {
        entries.push({
            key: "search",
            text: "§d全局搜索\n§f跨店铺查找物品",
            icon: ICON.search,
            action: () => promptSearch(player, "全局搜索", "", (keyword) => showGlobalSearch(player, keyword, 1)),
        });
    }
    if (buttonsConf.logs !== false) {
        entries.push({
            key: "logs",
            text: `§3交易动态\n§f最近 ${stats.logs} 条记录`,
            icon: ICON.trend,
            action: () => showTradeLogs(player, 1, ""),
        });
    }
    if (buttonsConf.ranking !== false) {
        entries.push({
            key: "ranking",
            text: "§5店铺排行榜\n§f按累计收益排名",
            icon: ICON.discount,
            action: () => showRanking(player, 1, ""),
        });
    }
    if (buttonsConf.notify !== false && getNotifyConfig().enabled) {
        entries.push({
            key: "notify",
            text: unread > 0
                ? `§c提醒箱 §f(未读 ${unread})\n§f售出 / 履约 / 折扣 / 仓库`
                : "§f提醒箱\n§f售出 / 履约 / 折扣 / 仓库",
            icon: ICON.bell,
            action: () => showNotifyInbox(player, 1),
        });
    }
    if (isAdmin(player)) {
        entries.push({
            key: "admin",
            text: "§c管理市场\n§fOP 专属",
            icon: ICON.admin,
            action: () => showAdminMenu(player),
        });
    }

    sendListForm(player, "商店菜单", content, entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
        const entry = entries[index];
        if (entry) entry.action();
    });
}

// === 购物中心（玩家店铺） ===
function openShopsSorted(keyword) {
    const query = normalizePlayerKey(keyword);
    const shops = allShops();
    const rows = [];
    for (const xuid of Object.keys(shops)) {
        const shop = shops[xuid];
        if (!isPlainObject(shop) || !shop.isOpen) continue;
        const items = shopListings(shop);
        const row = {
            xuid,
            name: String(shop.name || `${shop.ownerName || xuid}的店铺`),
            ownerName: String(shop.ownerName || ""),
            itemTypes: items.length,
            itemCount: items.reduce((sum, item) => sum + Math.max(0, toInt(item.quantity, 0)), 0),
            notice: String(shop.notice || ""),
        };
        if (query) {
            const haystack = `${row.name} ${row.ownerName}`.toLowerCase();
            if (haystack.indexOf(query) < 0) {
                const hit = items.some((item) => String(item.name || "").toLowerCase().indexOf(query) >= 0);
                if (!hit) continue;
            }
        }
        rows.push(row);
    }
    rows.sort((a, b) => b.itemTypes - a.itemTypes);
    return rows;
}

function showShoppingCenter(player, page, keyword) {
    const rows = openShopsSorted(keyword);
    const view = pageSlice(rows, page);
    const summary = `§b营业中的店铺共 §a${rows.length} §b家`
        + (keyword ? ` §f(搜索：${keyword})` : "")
        + `\n§f当前第 ${view.page}/${view.pages} 页`;
    pagedList(player, {
        title: "购物中心",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (row) => `§a${row.name}\n§f店主 ${row.ownerName || "—"} · 物品 ${row.itemTypes} 种 / ${row.itemCount} 件`,
        icon: () => ICON.home,
        onItem: (row) => showShopView(player, row.xuid, 1, "", "全部"),
        onPrev: () => showShoppingCenter(player, view.page - 1, keyword),
        onNext: () => showShoppingCenter(player, view.page + 1, keyword),
        onSearch: () => promptSearch(player, "搜索店铺", keyword, (next) => showShoppingCenter(player, 1, next)),
        searchTop: true,
        searchLabel: "搜索店铺",
        onBack: () => showMainMenu(player),
    });
}

// === 店铺内商品 ===
function filterListings(listings, keyword, category) {
    const query = normalizePlayerKey(keyword);
    return listings.filter((item) => {
        if (category && category !== "全部" && String(item.category || "") !== category) return false;
        if (!query) return true;
        return String(item.name || "").toLowerCase().indexOf(query) >= 0
            || String(item.type || "").toLowerCase().indexOf(query) >= 0;
    });
}

function showShopView(player, ownerXuid, page, keyword, category) {
    const shop = getShop(ownerXuid);
    if (!shop) {
        player.tell("§c该店铺已不存在");
        showShoppingCenter(player, 1, "");
        return;
    }
    if (!shop.isOpen && !isAdmin(player)) {
        player.tell("§c该店铺已打烊");
        showShoppingCenter(player, 1, "");
        return;
    }
    const all = shopListings(shop);
    const rows = filterListings(all, keyword, category);
    const view = pageSlice(rows, page);
    const summary = `§e${shop.name} §f(${shop.ownerName || "—"})`
        + (shop.notice ? `\n§d公告：§f${limitText(shop.notice, 80)}` : "")
        + `\n§f分类：${category || "全部"} · 共 ${rows.length} 种 · 第 ${view.page}/${view.pages} 页`
        + (keyword ? ` §f(搜索：${keyword})` : "");
    pagedList(player, {
        title: "店铺商品",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (item) => {
            const disc = discountActive(item) ? ` §d${discountText(item)}` : "";
            const original = discountActive(item) && toInt(item.originalPrice, 0) !== toInt(item.price, 0)
                ? ` §f${toInt(item.originalPrice, 0)}` : "";
            return `§b${item.name}\n§6${item.price} ${economy.name}${original} §f| 库存 ${toInt(item.quantity, 0)}${disc}`;
        },
        onItem: (item) => promptPurchase(player, { isOfficial: false, ownerXuid, key: item.key, listing: item }, () =>
            showShopView(player, ownerXuid, page, keyword, category)),
        icon: (item) => listingIcon(item),
        onPrev: () => showShopView(player, ownerXuid, page - 1, keyword, category),
        onNext: () => showShopView(player, ownerXuid, page + 1, keyword, category),
        onSearch: () => promptSearch(player, "搜索商品", keyword, (next) => showShopView(player, ownerXuid, 1, next, category)),
        // 分类与搜索放在物品列表上方：先选条件，再看商品
        topNav: [{
            label: `分类：${category || "全部"}`,
            icon: ICON.filter,
            action: () => showShopCategories(player, ownerXuid, 1, keyword, category),
        }],
        searchTop: true,
        searchLabel: "搜索商品",
        onBack: () => showShoppingCenter(player, 1, ""),
    });
}

function showShopCategories(player, ownerXuid, page, keyword, category) {
    const shop = getShop(ownerXuid);
    const used = {};
    for (const item of shopListings(shop || {})) {
        const name = String(item.category || "其他");
        used[name] = (used[name] || 0) + 1;
    }
    const options = ["全部"].concat(Object.keys(used));
    sendChoiceForm(player, "选择分类", "分类", options, Math.max(0, options.indexOf(category || "全部")), (index) => {
        if (index < 0) {
            showShopView(player, ownerXuid, page, keyword, category);
            return;
        }
        showShopView(player, ownerXuid, 1, keyword, options[index]);
    });
}

// === 购买确认 ===
function promptPurchase(player, ctx, onDone) {
    const listing = ctx.listing;
    if (!isPlainObject(listing)) {
        player.tell("§c该物品已下架");
        if (onDone) onDone();
        return;
    }
    const isOfficial = Boolean(ctx.isOfficial);
    const stock = isOfficial ? officialStockText(listing, listing.key) : String(toInt(listing.quantity, 0));
    const tax = calcTax(Math.max(0, toInt(listing.price, 0)), isOfficial);
    const taxLine = tax > 0 ? `\n§c每个含税 ${tax}（税率 ${(getTaxConfig().rate * 100).toFixed(1)}%）` : "";
    const stockValue = isOfficial ? officialStockOf(listing, listing.key) : toInt(listing.quantity, 0);
    // 无限库存只表示不受货架库存限制，不应误用单组堆叠上限 64 作为购买上限。
    // 实际能否放入背包仍由 executePurchase -> canReceive 按物品最大堆叠数和空槽校验。
    const maxQty = stockValue === -1 ? 99999 : Math.max(1, stockValue);
    const discLine = discountActive(listing)
        ? `\n§d限时${listing.discount}折 §f(原价 ${toInt(listing.originalPrice, listing.price)}，${discountText(listing)})`
        : "";
    const label = `§e物品：§a${listing.name}\n§e单价：§6${toInt(listing.price, 0)} ${economy.name}`
        + discLine
        + `\n§e库存：§b${stock} §f(单次最多购买 ${maxQty})`
        + taxLine
        + `§e你的余额：§6${economy.get(player.xuid)} ${economy.name}`;

    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "确认购买"));
    form.addLabel(label);
    form.addInput("购买数量", "输入正整数", "1");
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            if (onDone) onDone();
            return;
        }
        const qty = toInt(fieldAt(data, 1, 0), 0);
        if (qty <= 0) {
            pl.tell("§c购买数量必须是正整数");
            if (onDone) onDone();
            return;
        }
        if (qty > maxQty) {
            pl.tell(`§c单次最多购买 ${maxQty} 个`);
            if (onDone) onDone();
            return;
        }
        const result = executePurchase(pl, {
            isOfficial,
            ownerXuid: ctx.ownerXuid || "",
            key: ctx.key,
            qty,
        });
        if (!result.ok) {
            pl.tell(`§c${result.error}`);
        } else {
            pl.sendToast("购买成功", `${result.item} x${result.qty}`);
            pl.tell(`§a购买成功：§d${result.item} x${result.qty}`);
            pl.tell(`§e支付 §6${result.total} ${economy.name}${result.tax > 0 ? `（含税 ${result.tax}）` : ""}，余额 §6${result.balance}`);
        }
        if (onDone) onDone();
    }), `确认购买`);
}

// === 官方商店 ===
function shuffleWithSeed(array, seed) {
    const out = array.slice();
    let state = seed >>> 0;
    const next = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

function officialSellRows(keyword, category) {
    const data = officialData();
    const query = normalizePlayerKey(keyword);
    let rows = Object.keys(data.purchaseItems).map((key) => Object.assign({ key }, data.purchaseItems[key]));
    rows = rows.filter((item) => {
        if (category && category !== "全部" && String(item.category || "") !== category) return false;
        if (!query) return true;
        return String(item.name || "").toLowerCase().indexOf(query) >= 0
            || String(item.type || "").toLowerCase().indexOf(query) >= 0;
    });
    const mode = cfgString("official.sortMode", DEFAULT_CONFIG.official.sortMode);
    if (mode === "名字顺序") {
        rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh"));
    } else if (mode === "价格") {
        rows.sort((a, b) => toInt(a.price, 0) - toInt(b.price, 0));
    } else {
        rows = shuffleWithSeed(rows, Math.floor(Date.now() / 60000));
    }
    return rows;
}

function showOfficialMenu(player) {
    const stats = officialCounts();
    const recycleConf = cfgSection("recycle");
    const entries = [];
    entries.push({
        text: `§e购买物品\n§f在售 ${stats.sells} 种`,
        icon: ICON.money,
        action: () => showOfficialItems(player, 1, "", "全部"),
    });
    if (recycleConf.enabled !== false) {
        entries.push({
            text: `§b回收物品\n§f回收清单 ${stats.recycles} 种`,
            icon: ICON.trade,
            action: () => showRecycleList(player),
        });
    }
    entries.push({ text: "§c返回主菜单", icon: ICON.home, action: () => showMainMenu(player) });
    sendListForm(player, "官方商店",
        `${balanceLine(player)}\n§e出售与回收均由服务器直接结算，不征收交易税。\n§f在售 ${stats.sells} 种 · 回收 ${stats.recycles} 种`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function showOfficialItems(player, page, keyword, category) {
    const rows = officialSellRows(keyword, category);
    const view = pageSlice(rows, page);
    const summary = `§e官方在售共 §a${rows.length} §e种`
        + `\n§f分类：${category || "全部"} · 第 ${view.page}/${view.pages} 页`
        + (keyword ? ` §f(搜索：${keyword})` : "");
    pagedList(player, {
        title: "官方商店 · 出售",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (item) => {
            const stock = officialStockText(item, item.key);
            const disc = discountActive(item) ? ` §d${discountText(item)}` : "";
            const original = discountActive(item) && toInt(item.originalPrice, 0) !== toInt(item.price, 0)
                ? ` §f${toInt(item.originalPrice, 0)}` : "";
            return `§b${item.name}\n§6${toInt(item.price, 0)} ${economy.name}${original} §f| 库存 ${stock}${disc}`;
        },
        onItem: (item) => promptPurchase(player, { isOfficial: true, key: item.key, listing: item }, () =>
            showOfficialItems(player, page, keyword, category)),
        icon: (item) => listingIcon(item),
        onPrev: () => showOfficialItems(player, page - 1, keyword, category),
        onNext: () => showOfficialItems(player, page + 1, keyword, category),
        onSearch: () => promptSearch(player, "搜索官方商品", keyword, (next) => showOfficialItems(player, 1, next, category)),
        // 分类与搜索放在物品列表上方
        topNav: [{
            label: `分类：${category || "全部"}`,
            icon: ICON.filter,
            action: () => showOfficialCategories(player, page, keyword, category),
        }],
        searchTop: true,
        searchLabel: "搜索商品",
        onBack: () => showOfficialMenu(player),
    });
}

function showOfficialCategories(player, page, keyword, category) {
    const options = getCategories();
    sendChoiceForm(player, "官方商店分类", "分类", options, Math.max(0, options.indexOf(category || "全部")), (index) => {
        if (index < 0) {
            showOfficialItems(player, page, keyword, category);
            return;
        }
        showOfficialItems(player, 1, keyword, options[index]);
    });
}

// === 回收 ===
function recyclableStacks(player) {
    const data = officialData();
    const records = [];
    for (const key of Object.keys(data.recycleItems)) {
        const rec = data.recycleItems[key];
        if (isPlainObject(rec)) records.push(Object.assign({ recycleKey: key }, rec));
    }
    if (!records.length) return [];
    const out = [];
    for (const stack of listInventoryStacks(player, false)) {
        let hit = null;
        for (const rec of records) {
            if (matchesEntry(stack, rec)) {
                hit = rec;
                break;
            }
        }
        if (hit) out.push(Object.assign({ recycle: hit, recycleKey: hit.recycleKey }, stack));
    }
    return out;
}

function showRecycleList(player) {
    const recycleConf = cfgSection("recycle");
    if (recycleConf.enabled === false) {
        player.tell("§c回收功能已关闭");
        showMainMenu(player);
        return;
    }
    const rows = recyclableStacks(player);
    if (!rows.length) {
        sendListForm(player, "物品回收",
            "§e背包里没有可回收的物品。\n§f回收清单由管理员维护，可在游戏内 /shop → 管理市场 查看。",
            ["刷新", "返回主菜单"], [ICON.refresh, ICON.home], (index) => {
                if (index === 0) showRecycleList(player);
                else showMainMenu(player);
            });
        return;
    }
    sendListForm(player, "物品回收",
        `${balanceLine(player)}\n§e下列物品可按官方回收价卖出，§c物品将被扣除 §f。\n§f共 ${rows.length} 种`,
        rows.map((stack) => {
            const per = Math.max(1, toInt(stack.recycle.perCount, 1));
            const unit = per > 1 ? `${toInt(stack.recycle.price, 0)} ${economy.name} / ${per} 个` : `${toInt(stack.recycle.price, 0)} ${economy.name} / 个`;
            return `§b${stack.name} §fx${stack.count}\n§6${unit}`;
        }),
        rows.map((stack) => itemIconOf(stack.type, stack.aux, "")),
        (index) => {
            const stack = rows[index];
            if (stack) promptRecycle(player, stack);
        });
}

function promptRecycle(player, stack) {
    const perCount = Math.max(1, toInt(stack.recycle.perCount, 1));
    const defaultQty = perCount === 1 ? stack.count : Math.floor(stack.count / perCount) * perCount;
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "确认回收"));
    form.addLabel(`§e物品：§a${stack.name}\n§e回收价：§6${toInt(stack.recycle.price, 0)} ${economy.name}${perCount > 1 ? ` / ${perCount} 个` : " / 个"}`
        + `\n§e背包持有：§b${stack.count}`
        + (perCount > 1 ? `\n§f需按 ${perCount} 的整数倍回收` : "")
        + `\n§c回收后物品将被扣除，无法找回`);
    form.addInput("回收数量", perCount > 1 ? `必须是 ${perCount} 的倍数` : "输入正整数", String(defaultQty));
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showRecycleList(pl);
            return;
        }
        const qty = toInt(fieldAt(data, 1, 0), 0);
        if (qty <= 0) {
            pl.tell("§c回收数量必须是正整数");
            return;
        }
        if (qty > stack.count) {
            pl.tell(`§c背包中只有 ${stack.count} 个`);
            return;
        }
        if (perCount > 1 && qty % perCount !== 0) {
            pl.tell(`§c数量必须是 ${perCount} 的整数倍（当前 ${qty}）`);
            return;
        }
        const result = executeRecycle(pl, stack, qty);
        if (!result.ok) {
            pl.tell(`§c${result.error}`);
        } else {
            pl.sendToast("回收成功", `${result.item} x${result.qty} → ${result.total} ${economy.name}`);
            pl.tell(`§a回收成功：§d${result.item} x${result.qty} §e+${result.total} ${economy.name}§a，余额 §6${result.balance}`);
        }
        showRecycleList(pl);
    }), `确认回收`);
}

// === 全局搜索 ===
function globalSearchRows(keyword) {
    const query = normalizePlayerKey(keyword);
    const out = [];
    if (!query) return out;
    const official = officialData();
    for (const key of Object.keys(official.purchaseItems)) {
        const item = official.purchaseItems[key];
        if (!isPlainObject(item)) continue;
        if (String(item.name || "").toLowerCase().indexOf(query) < 0 && String(item.type || "").toLowerCase().indexOf(query) < 0) continue;
        out.push({ isOfficial: true, key, listing: Object.assign({ key }, item), shopName: "官方商店", ownerXuid: "" });
    }
    const shops = allShops();
    for (const xuid of Object.keys(shops)) {
        const shop = shops[xuid];
        if (!isPlainObject(shop) || !shop.isOpen) continue;
        for (const item of shopListings(shop)) {
            if (String(item.name || "").toLowerCase().indexOf(query) < 0 && String(item.type || "").toLowerCase().indexOf(query) < 0) continue;
            out.push({ isOfficial: false, key: item.key, listing: item, shopName: String(shop.name || xuid), ownerXuid: xuid });
        }
    }
    out.sort((a, b) => toInt(a.listing.price, 0) - toInt(b.listing.price, 0));
    return out;
}

function showGlobalSearch(player, keyword, page) {
    const rows = globalSearchRows(keyword);
    const view = pageSlice(rows, page);
    const summary = keyword
        ? `§d“${keyword}” §b共找到 §a${rows.length} §b件商品（按价格升序）\n§f第 ${view.page}/${view.pages} 页`
        : "§d请输入搜索关键词。";
    pagedList(player, {
        title: "全局搜索",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (row) => {
            const stock = toInt(row.listing.quantity, -1) === -1 ? "无限" : String(toInt(row.listing.quantity, 0));
            return `§b${row.listing.name} §f· ${row.shopName}\n§6${toInt(row.listing.price, 0)} ${economy.name} §f| 库存 ${stock}`;
        },
        onItem: (row) => promptPurchase(player, { isOfficial: row.isOfficial, ownerXuid: row.ownerXuid, key: row.key, listing: row.listing }, () =>
            showGlobalSearch(player, keyword, page)),
        icon: (row) => (row.isOfficial ? ICON.home : listingIcon(row.listing)),
        onPrev: () => showGlobalSearch(player, keyword, page - 1),
        onNext: () => showGlobalSearch(player, keyword, page + 1),
        onSearch: () => promptSearch(player, "全局搜索", keyword, (next) => showGlobalSearch(player, next, 1)),
        searchTop: true,
        onBack: () => showMainMenu(player),
    });
}

// === 交易动态 ===
function showTradeLogs(player, page, keyword) {
    const view = logPage(page, keyword);
    const summary = `§3最近交易共 §a${view.total} §3条`
        + (keyword ? ` §f(搜索：${keyword})` : "")
        + `\n§f第 ${view.page}/${view.pages} 页`;
    pagedList(player, {
        title: "交易动态",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: true,
        render: (row) => {
            const time = formatStamp(row.ts);
            if (row.kind === "recycle") {
                return `§b${row.seller} §f回收 §d${row.item} x${row.qty}\n§f${time} · §6+${toInt(row.total, 0)} ${economy.name}`;
            }
            return `§a${row.buyer} §f→ §a${row.seller} §f：§d${row.item} x${row.qty}\n§f${time} · §6${toInt(row.total, 0)} ${economy.name}${toInt(row.tax, 0) > 0 ? ` §c(+税 ${row.tax})` : ""}`;
        },
        onItem: () => showTradeLogs(player, page, keyword),
        icon: (row) => (row.kind === "recycle" ? ICON.trade : ICON.money),
        onPrev: () => showTradeLogs(player, view.page - 1, keyword),
        onNext: () => showTradeLogs(player, view.page + 1, keyword),
        onSearch: () => promptSearch(player, "搜索交易", keyword, (next) => showTradeLogs(player, 1, next)),
        searchTop: true,
        searchLabel: "搜索交易",
        onBack: () => showMainMenu(player),
    });
}

// === 排行榜 ===
function showRanking(player, page, keyword) {
    const rows = rankingList(keyword);
    const view = pageSlice(rows, page);
    const myRank = rankingList(String(player.realName || player.name || ""));
    const mine = myRank.length ? myRank[0] : null;
    let summary = `§5店铺排行榜 §f(按累计收益)`;
    if (mine) summary += `\n§e我的排名：§6${mine.rank} §f| 收益 ${mine.earnings} | 销量 ${mine.sales}`;
    else summary += "\n§f我还没有成交记录";
    summary += `\n§f第 ${view.page}/${view.pages} 页`;
    pagedList(player, {
        title: "店铺排行榜",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (row) => `§6${row.rank}. §b${row.name}\n§f收益 ${row.earnings} · 销量 ${row.sales} · 订单 ${row.orders}`,
        icon: (row) => (row.rank <= 3 ? ICON.discount : ICON.trend),
        onItem: () => showRanking(player, page, keyword),
        onPrev: () => showRanking(player, view.page - 1, keyword),
        onNext: () => showRanking(player, view.page + 1, keyword),
        onSearch: () => promptSearch(player, "搜索玩家", keyword, (next) => showRanking(player, 1, next)),
        searchTop: true,
        searchLabel: "搜索玩家",
        onBack: () => showMainMenu(player),
    });
}

// === 我的店铺 ===
function shopMutate(xuid, mutator) {
    const shops = allShops();
    const key = String(xuid || "");
    if (!key || !isPlainObject(shops[key])) return { ok: false, error: "店铺不存在" };
    const result = mutator(shops[key]) || {};
    if (result.ok === false) return result;
    saveAllShops(shops);
    return Object.assign({ ok: true }, result);
}

function showMyShop(player) {
    const shop = getShop(player.xuid);
    if (!shop) {
        const shopConf = getShopConfig();
        const entries = [];
        const lines = ["§e你还没有自己的店铺。", "§f开店后可以把背包物品上架出售，卖给全服玩家。"];
        if (!shopConf.allowCreate) {
            lines.push("§c服务器当前已关闭开店功能。");
        } else {
            lines.push(`§e开店费用：§6${shopConf.createCost} ${economy.name}${shopConf.createCost ? "" : "（免费）"}`);
            lines.push(`§e货架上限：§b${shopConf.maxItemTypes} §e种 · 单件上限 §b${shopConf.maxQuantityPerListing}`);
        }
        if (shopConf.allowCreate) {
            entries.push({ text: "§a创建店铺", icon: ICON.add, action: () => promptCreateShop(player) });
        }
        entries.push({ text: "§c返回主菜单", icon: ICON.home, action: () => showMainMenu(player) });
        sendListForm(player, "我的店铺", `${balanceLine(player)}\n${lines.join("\n")}`,
            entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
                const entry = entries[index];
                if (entry) entry.action();
            });
        return;
    }

    const items = shopListings(shop);
    const pendingItems = pendingShopItemsOf(shop).length;
    let content = `${balanceLine(player)}\n`;
    content += `§e店铺名：§a${shop.name} §f(${shop.ownerName || "—"})\n`;
    content += `§e状态：${shop.isOpen ? "§a营业中" : "§c已关闭"} §f| §e货架 §b${items.length}/${getShopConfig().maxItemTypes}\n`;
    content += `§e累计收益：§6${toInt(shop.earnings, 0)} ${economy.name}`;
    if (toInt(shop.pendingEarnings, 0) > 0) content += ` §f(待结算 ${toInt(shop.pendingEarnings, 0)})`;
    if (shop.notice) content += `\n§d公告：§f${limitText(shop.notice, 60)}`;

    const entries = [
        { text: "§a上架物品", icon: ICON.put, action: () => showListForSale(player) },
        { text: `§b我的货架 §f(${items.length} 种)`, icon: ICON.warehouse, action: () => showMyShelf(player, 1) },
        {
            text: shop.isOpen ? "§c关闭店铺" : "§a开门营业",
            icon: shop.isOpen ? ICON.lock : ICON.unlock,
            action: () => {
                const result = shopMutate(player.xuid, (target) => {
                    target.isOpen = !target.isOpen;
                    return { ok: true, open: target.isOpen };
                });
                if (!result.ok) player.tell(`§c${result.error}`);
                else player.tell(result.open ? "§a店铺已开门营业" : "§e店铺已打烊，玩家暂时看不到你的商品");
                showMyShop(player);
            },
        },
        { text: "§e设置公告", icon: ICON.sign, action: () => promptNotice(player) },
        { text: "§e店铺改名", icon: ICON.edit, action: () => promptRename(player) },
        { text: "§3领取待结算收益", icon: ICON.money, action: () => claimPending(player) },
        { text: "§c关闭并删除店铺", icon: ICON.trash, action: () => confirmDeleteShop(player) },
        { text: "§f返回主菜单", icon: ICON.home, action: () => showMainMenu(player) },
    ];
    if (pendingItems > 0) {
        entries.splice(entries.length - 1, 0, { text: `§6领取暂存物品 §f(${pendingItems} 件)`, icon: ICON.take, action: () => claimPendingItems(player) });
    }
    sendListForm(player, "我的店铺", content, entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
        const entry = entries[index];
        if (entry) entry.action();
    });
}

function promptCreateShop(player) {
    const shopConf = getShopConfig();
    const defaultName = `${String(player.realName || player.name || "玩家")}的店铺`;
    promptText(player, "创建店铺", "店铺名称（最多 24 字）", defaultName, (name) => {
        const result = createShop(player.xuid, name || defaultName, String(player.realName || player.name || ""));
        if (!result.ok) {
            player.tell(`§c${result.error}`);
            showMyShop(player);
            return;
        }
        if (result.cost > 0) player.tell(`§e已扣除开店费用 §6${result.cost} ${economy.name}`);
        player.tell(`§a店铺 §d${result.shop.name} §a创建成功，现在可以上架物品了。`);
        showListForSale(player);
    });
}

function showListForSale(player) {
    const shop = getShop(player.xuid);
    if (!shop) {
        showMyShop(player);
        return;
    }
    const shopConf = getShopConfig();
    const currentTypes = Object.keys(shop.items || {}).length;
    const stacks = listInventoryStacks(player, true);
    dbg(`上架页: 可上架堆叠=${stacks.length}`);
    const forbidden = forbiddenList();
    if (!stacks.length) {
        sendListForm(player, "上架物品",
            `§e背包里没有可上架的物品。\n§f管理员设置的禁售物品不会出现在此列表${forbidden.length ? `（当前 ${forbidden.length} 种）` : ""}。`,
            ["刷新", "返回我的店铺"], [ICON.refresh, ICON.home], (index) => {
                if (index === 0) showListForSale(player);
                else showMyShop(player);
            });
        return;
    }
    const blocked = currentTypes >= shopConf.maxItemTypes;
    const texts = stacks.map((stack) => `§b${stack.name} §fx${stack.count}`);
    texts.push("§f← 返回我的店铺");
    sendListForm(player, "上架物品",
        `${blocked ? "§c货架种类已达上限，请先下架部分物品。\n" : "§e选择要上架的物品，上架时会从背包扣除。\n"}`
        + `§f货架 ${currentTypes}/${shopConf.maxItemTypes} · 单件上限 ${shopConf.maxQuantityPerListing}`,
        texts,
        stacks.map((stack) => itemIconOf(stack.type, stack.aux, "")).concat([ICON.home]),
        (index) => {
            if (index >= stacks.length) {
                showMyShop(player);
                return;
            }
            const stack = stacks[index];
            if (!stack) return;
            if (blocked) {
                player.tell("§c货架种类已达上限");
                showMyShelf(player, 1);
                return;
            }
            promptListingForm(player, stack);
        });
}

function promptListingForm(player, stack) {
    const shopConf = getShopConfig();
    const categories = getCategories();
    const shop = getShop(player.xuid);
    const existing = shop && isPlainObject(shop.items) ? shop.items[stack.key] : null;
    const defaultQty = Math.min(stack.count, shopConf.maxQuantityPerListing);
    const defaultCategory = Math.max(0, categories.indexOf("其他"));

    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "上架设置"));
    form.addLabel(`§e物品：§a${stack.name}\n§e背包持有：§b${stack.count}`
        + (existing ? `\n§c货架上已有同种物品（剩余 ${toInt(existing.quantity, 0)}，单价 ${toInt(existing.price, 0)}），本次将合并数量并沿用原价` : "")
        + `\n§e可上架：§b${defaultQty}`);
    form.addInput("单价（金币）", "正整数", existing ? String(toInt(existing.price, 0)) : "10");
    form.addInput("数量", `最多 ${defaultQty}`, String(defaultQty));
    form.addDropdown("分类", categories, defaultCategory);
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showListForSale(pl);
            return;
        }
        const priceRaw = String(fieldAt(data, 3, 0) === undefined || fieldAt(data, 3, 0) === null ? "" : fieldAt(data, 3, 0)).trim();
        const qtyRaw = String(fieldAt(data, 3, 1) === undefined || fieldAt(data, 3, 1) === null ? "" : fieldAt(data, 3, 1)).trim();
        if (priceRaw === "" || isNaN(Number(priceRaw))) {
            pl.tell("§c单价必须是整数");
            showListForSale(pl);
            return;
        }
        if (qtyRaw === "" || isNaN(Number(qtyRaw))) {
            pl.tell("§c数量必须是正整数");
            showListForSale(pl);
            return;
        }
        const price = clampInt(priceRaw, shopConf.minPrice, shopConf.maxPrice, -1);
        const qty = clampInt(qtyRaw, 1, defaultQty, -1);
        const category = categories[clampInt(fieldAt(data, 3, 2), 0, categories.length - 1, 0)] || "其他";
        if (price < shopConf.minPrice || price > shopConf.maxPrice) {
            pl.tell(`§c单价必须在 ${shopConf.minPrice} ~ ${shopConf.maxPrice} 之间`);
            return;
        }
        if (qty <= 0) {
            pl.tell("§c数量必须是正整数");
            return;
        }
        const currentShop = getShop(pl.xuid);
        if (!currentShop) {
            pl.tell("§c店铺不存在");
            return;
        }
        const before = countMatching(pl, stack.key);
        if (before < qty) {
            pl.tell(`§c背包中只有 ${before} 个`);
            return;
        }
        if (!removeMatching(pl, stack.key, qty)) {
            pl.tell("§c从背包扣除物品失败，请重试");
            return;
        }
        const result = shopMutate(pl.xuid, (target) => {
            const items = isPlainObject(target.items) ? target.items : {};
            target.items = items;
            if (isPlainObject(items[stack.key])) {
                const merged = toInt(items[stack.key].quantity, 0) + qty;
                if (merged > shopConf.maxQuantityPerListing) {
                    // 放不下的部分退回背包
                    const overflow = merged - shopConf.maxQuantityPerListing;
                    items[stack.key].quantity = shopConf.maxQuantityPerListing;
                    giveItems(pl, stack.nbt, overflow);
                    return { ok: true, merged: true, added: qty - overflow, overflow };
                }
                items[stack.key].quantity = merged;
                return { ok: true, merged: true, added: qty, overflow: 0 };
            }
            const typeCount = Object.keys(items).length;
            if (typeCount >= shopConf.maxItemTypes) {
                // 回滚统一交给下面处理，这里不要再发一次，避免重复发放
                return { ok: false, error: `货架种类已达上限 ${shopConf.maxItemTypes}` };
            }
            items[stack.key] = {
                type: stack.type,
                aux: toInt(stack.aux, 0),
                nbt: stack.nbt,
                name: stack.name,
                price,
                category,
                quantity: qty,
                createdAt: Date.now(),
                sales: 0,
            };
            return { ok: true, merged: false, added: qty, overflow: 0 };
        });
        if (!result.ok) {
            // 上架失败：背包里已经扣掉的必须原样退回，退不回去就转成店铺暂存，绝不吞物品
            const back = giveItemsPartial(pl, stack.nbt, qty);
            if (back.given < qty) {
                const lost = qty - back.given;
                if (getShop(pl.xuid)) {
                    shopMutate(pl.xuid, (target) => {
                        queuePendingItem(target, { type: stack.type, aux: stack.aux, nbt: stack.nbt, name: stack.name }, lost);
                        return { ok: true };
                    });
                    pl.tell(`§c${result.error}（有 ${lost} 个退回背包失败，已转入店铺待领取）`);
                } else {
                    logger.error(`上架失败且无法退回物品：${stack.name} x${lost}（玩家 ${pl.xuid}）`);
                    pl.tell(`§c${result.error}，且物品退还失败，请联系管理员`);
                }
                return;
            }
            pl.tell(`§c${result.error}`);
            showListForSale(pl);
            return;
        }
        if (result.merged) {
            pl.tell(`§a已并入现有货架 §d${stack.name} §a+${result.added}（沿用原价）`);
        } else {
            pl.tell(`§a上架成功：§d${stack.name} x${result.added} §e单价 ${price} ${economy.name} §f(${category})`);
        }
        if (result.overflow > 0) pl.tell(`§e超出单件上限的 ${result.overflow} 个已退回背包`);
        showListForSale(pl);
    }), `上架设置`);
}

function showMyShelf(player, page) {
    const shop = getShop(player.xuid);
    if (!shop) {
        showMyShop(player);
        return;
    }
    const rows = shopListings(shop);
    const view = pageSlice(rows, page);
    const summary = `§b我的货架 §f共 ${rows.length} 种 · 第 ${view.page}/${view.pages} 页\n§f选中物品可改价或下架（下架会退回背包）`;
    pagedList(player, {
        title: "我的货架",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: false,
        render: (item) => `§b${item.name} §fx${toInt(item.quantity, 0)}\n§6${toInt(item.price, 0)} ${economy.name} §f| 已售 ${toInt(item.sales, 0)} | ${item.category || "其他"}`,
        icon: (item) => listingIcon(item),
        onItem: (item) => showShelfItemMenu(player, item, view.page),
        onPrev: () => showMyShelf(player, view.page - 1),
        onNext: () => showMyShelf(player, view.page + 1),
        extraNav: [{ label: "批量操作 / 打折", icon: ICON.discount, action: () => showBatchList(player, "myshelf", 1) }],
        onBack: () => showMyShop(player),
    });
}

function showShelfItemMenu(player, item, page) {
    const entries = [
        { text: "§e修改单价", icon: ICON.edit, action: () => promptShelfPrice(player, item, page) },
        { text: "§c下架并退回背包", icon: ICON.trash, action: () => delistItem(player, item, page) },
        { text: "§f返回", icon: ICON.home, action: () => showMyShelf(player, page) },
    ];
    sendListForm(player, "货架物品",
        `§e物品：§a${item.name}\n§e单价：§6${toInt(item.price, 0)} ${economy.name}\n§e库存：§b${toInt(item.quantity, 0)} §f| §e分类：${item.category || "其他"}\n§e累计售出：§b${toInt(item.sales, 0)}`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || itemIconOf(item.type, item.aux, item.category)), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function promptShelfPrice(player, item, page) {
    const shopConf = getShopConfig();
    promptText(player, "修改单价", `新的单价（${shopConf.minPrice} ~ ${shopConf.maxPrice}）`, String(toInt(item.price, 0)), (value) => {
        const raw = String(value === undefined || value === null ? "" : value).trim();
        if (raw === "" || isNaN(Number(raw))) {
            player.tell("§c单价必须是整数");
            showMyShelf(player, page);
            return;
        }
        const price = clampInt(raw, shopConf.minPrice, shopConf.maxPrice, -1);
        const result = shopMutate(player.xuid, (target) => {
            const listing = isPlainObject(target.items) ? target.items[item.key] : null;
            if (!isPlainObject(listing)) return { ok: false, error: "该物品已不在货架上" };
            // 折扣生效中直接改价，会让"折扣到期恢复原价"把新价覆盖掉（originalPrice 还是旧值），
            // 所以改价一律先结束该物品的折扣
            const hadDiscount = discountActive(listing);
            if (hadDiscount) clearDiscount(listing);
            listing.price = price;
            return { ok: true, price, discountCleared: hadDiscount };
        });
        if (!result.ok) player.tell(`§c${result.error}`);
        else if (result.discountCleared) player.tell(`§a${item.name} 单价已改为 §6${price} ${economy.name}§a，并结束了该物品的限时折扣`);
        else player.tell(`§a${item.name} 单价已改为 §6${price} ${economy.name}`);
        showMyShelf(player, page);
    });
}

function delistItem(player, item, page) {
    const quantity = toInt(item.quantity, 0);
    if (quantity <= 0) {
        shopMutate(player.xuid, (target) => {
            if (isPlainObject(target.items)) delete target.items[item.key];
            return { ok: true };
        });
        showMyShelf(player, page);
        return;
    }
    if (!canReceive(player, item.nbt, quantity)) {
        player.tell("§c背包空间不足，无法退还物品，请先清理背包");
        showMyShelf(player, page);
        return;
    }
    const result = shopMutate(player.xuid, (target) => {
        const listing = isPlainObject(target.items) ? target.items[item.key] : null;
        if (!isPlainObject(listing)) return { ok: false, error: "该物品已不在货架上" };
        const qty = toInt(listing.quantity, 0);
        delete target.items[item.key];
        return { ok: true, qty };
    });
    if (!result.ok) {
        player.tell(`§c${result.error}`);
        showMyShelf(player, page);
        return;
    }
    // 返还：可能只退回一部分（引擎写入失败），剩下的进待领取区，
    // 不能像以前那样"部分到手 + 全额转暂存"，那等于复制物品
    const back = giveItemsPartial(player, item.nbt, result.qty);
    if (back.given < result.qty) {
        const lost = result.qty - back.given;
        const queued = shopMutate(player.xuid, (target) => {
            const added = queuePendingItem(target, item, lost);
            return added > 0 ? { ok: true } : { ok: false };
        });
        if (queued.ok) player.tell(`§c背包空间不足，${lost} 件已转入店铺待领取（已退回 ${back.given} 件）`);
        else {
            logger.error(`下架退回失败：${item.name} x${lost}（玩家 ${player.xuid}）`);
            player.tell(`§c背包空间不足且转入待领取失败，请联系管理员（${item.name} x${lost}）`);
        }
    } else {
        player.tell(`§a已下架并退回 §d${item.name} x${result.qty}`);
    }
    showMyShelf(player, page);
}

function promptNotice(player) {
    const shop = getShop(player.xuid);
    if (!shop) {
        showMyShop(player);
        return;
    }
    promptText(player, "设置公告", "公告内容（留空清空，最多 100 字）", shop.notice || "", (text) => {
        const notice = limitText(text, 100);
        const result = shopMutate(player.xuid, (target) => {
            target.notice = notice;
            return { ok: true };
        });
        if (!result.ok) player.tell(`§c${result.error}`);
        else player.tell(notice ? `§a公告已更新：§f${notice}` : "§a公告已清空");
        showMyShop(player);
    });
}

function promptRename(player) {
    promptText(player, "店铺改名", "新的店铺名（最多 24 字）", "", (name) => {
        const value = limitText(name, 24);
        if (!value) {
            player.tell("§c店铺名不能为空");
            return;
        }
        const result = shopMutate(player.xuid, (target) => {
            target.name = value;
            return { ok: true };
        });
        if (!result.ok) player.tell(`§c${result.error}`);
        else player.tell(`§a店铺已改名为 §d${value}`);
        showMyShop(player);
    });
}

function claimPending(player) {
    const shop = getShop(player.xuid);
    if (!shop) {
        showMyShop(player);
        return;
    }
    const pending = toInt(shop.pendingEarnings, 0);
    if (pending <= 0) {
        player.tell("§e当前没有待结算收益");
        showMyShop(player);
        return;
    }
    const result = shopMutate(player.xuid, (target) => {
        const amount = toInt(target.pendingEarnings, 0);
        if (amount <= 0) return { ok: false, error: "当前没有待结算收益" };
        target.pendingEarnings = 0;
        return { ok: true, amount };
    });
    if (!result.ok) {
        player.tell(`§c${result.error}`);
    } else if (economy.add(player.xuid, result.amount)) {
        player.tell(`§a已领取待结算收益 §6${result.amount} ${economy.name}`);
    } else {
        shopMutate(player.xuid, (target) => {
            target.pendingEarnings = toInt(target.pendingEarnings, 0) + result.amount;
            return { ok: true };
        });
        player.tell("§c金币入账失败，收益已保留");
    }
    showMyShop(player);
}

function claimPendingItems(player) {
    const shop = getShop(player.xuid);
    if (!shop) {
        showMyShop(player);
        return;
    }
    const pending = pendingShopItemsOf(shop);
    if (!pending.length) {
        player.tell("§e暂存区没有物品");
        showMyShop(player);
        return;
    }
    const deliverable = [];
    for (const entry of pending) {
        if (canReceive(player, entry.nbt, toInt(entry.quantity, 1))) deliverable.push(entry);
    }
    if (!deliverable.length) {
        player.tell("§c背包空间不足，无法领取暂存物品");
        showMyShop(player);
        return;
    }
    const deliveredKeys = deliverable.map((entry) => `${entry.nbt}|${entry.quantity}|${entry.at}`);
    const result = shopMutate(player.xuid, (target) => {
        const list = pendingShopItemsOf(target);
        const remaining = [];
        let count = 0;
        for (const entry of list) {
            const token = `${entry.nbt}|${entry.quantity}|${entry.at}`;
            if (deliveredKeys.indexOf(token) >= 0) {
                if (!giveItems(player, entry.nbt, toInt(entry.quantity, 1))) {
                    remaining.push(entry);
                } else {
                    count += toInt(entry.quantity, 1);
                }
            } else {
                remaining.push(entry);
            }
        }
        target.pendingItems = remaining;
        return { ok: true, count };
    });
    if (result.ok) player.tell(`§a已领取暂存物品共 §d${result.count} §a件`);
    showMyShop(player);
}

function confirmDeleteShop(player) {
    const shop = getShop(player.xuid);
    if (!shop) {
        showMyShop(player);
        return;
    }
    const items = shopListings(shop);
    if (items.length) {
        player.tell(`§c请先清空货架（还有 ${items.length} 种物品），再删除店铺`);
        showMyShelf(player, 1);
        return;
    }
    // 暂存物品与待结算收益会随店铺一起消失，必须先领走
    const pendingItems = pendingShopItemsOf(shop).length;
    const pendingEarnings = toInt(shop.pendingEarnings, 0);
    if (pendingItems > 0 || pendingEarnings > 0) {
        player.tell(`§c你还有 ${pendingItems} 条暂存物品 / ${pendingEarnings} 待结算收益，请先在「我的店铺」里领取后再删除`);
        showMyShop(player);
        return;
    }
    sendListForm(player, "删除店铺",
        "§c确认永久删除你的店铺吗？\n§e店铺名、公告与收益记录将一并清除（排行榜记录保留）。",
        ["确认删除", "再想想"], [ICON.trash, ICON.home], (index) => {
            if (index !== 0) {
                showMyShop(player);
                return;
            }
            const shops = allShops();
            if (isPlainObject(shops[player.xuid])) {
                delete shops[player.xuid];
                saveAllShops(shops);
            }
            player.tell("§a店铺已删除");
            showMainMenu(player);
        });
}

// === 管理后台 ===
function showAdminMenu(player) {
    if (!isAdmin(player)) {
        player.tell("§c此功能仅限管理员使用");
        showMainMenu(player);
        return;
    }
    const stats = statsSnapshot();
    const tax = getTaxConfig();
    const content = `§c管理市场\n§f官方在售 ${stats.officialSells} · 回收 ${stats.officialRecycles} · 营业店铺 ${stats.openShops} · 在售商品 ${stats.itemTypes}\n`
        + `§f税收累计 ${stats.taxTotal} ${economy.name}${tax.enabled ? `（税率 ${(tax.rate * 100).toFixed(1)}%）` : "（已关闭）"}`;
    const entries = [
        { text: "§a市场配置", icon: ICON.setting, action: () => showMarketConfig(player) },
        { text: "§b官方商店管理", icon: ICON.money, action: () => showOfficialAdmin(player) },
        { text: "§d分类管理", icon: ICON.filter, action: () => showCategoryAdmin(player) },
        { text: "§e禁售物品设置", icon: ICON.lock, action: () => showForbiddenAdmin(player) },
        { text: "§6玩家店铺管理", icon: ICON.sign, action: () => showPlayerShopAdmin(player, 1, "") },
        { text: "§3税收统计", icon: ICON.money, action: () => showTaxStats(player) },
        { text: "§f返回主菜单", icon: ICON.home, action: () => showMainMenu(player) },
    ];
    sendListForm(player, "管理市场", content, entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
        const entry = entries[index];
        if (entry) entry.action();
    });
}

function showMarketConfig(player) {
    const tax = getTaxConfig();
    const shopConf = getShopConfig();
    const official = cfgSection("official");
    const recycle = cfgSection("recycle");
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "市场配置"));
    form.addSwitch("启用交易税", tax.enabled);
    form.addInput("税率（0 ~ 0.5，例 0.05 = 5%）", "0.05", String(tax.rate));
    form.addDropdown("征税范围", ["玩家店铺", "官方商店", "全部交易"],
        Math.max(0, ["player", "official", "all"].indexOf(tax.scope)));
    form.addSwitch("允许购买自己店铺的物品", cfgBool("allowSelfPurchase", false));
    form.addSwitch("主菜单显示商城统计", cfgBool("statistics", true));
    form.addSwitch("允许玩家开店", shopConf.allowCreate);
    form.addInput("开店费用", "0", String(shopConf.createCost));
    form.addInput("货架种类上限", "15", String(shopConf.maxItemTypes));
    form.addSwitch("启用官方回收", recycle.enabled !== false);
    form.addDropdown("官方商店排序", ["随机", "名字顺序", "价格"],
        Math.max(0, ["随机", "名字顺序", "价格"].indexOf(String(official.sortMode || "随机"))));
    form.addInput("列表每页条数", "20", String(getPageSize()));
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showAdminMenu(pl);
            return;
        }
        // 空输入（"" → Number 是 0）不能把税率静默改成 0，留空视为"不修改"
        const rateRaw = String(data[1] === undefined || data[1] === null ? "" : data[1]).trim();
        const nextTax = {
            enabled: Boolean(data[0]),
            rate: rateRaw === "" ? tax.rate : clampNumber(rateRaw, 0, 0.5, tax.rate),
            scope: ["player", "official", "all"][clampInt(data[2], 0, 2, 0)],
        };
        cfgSetSection("tax", nextTax);
        config.set("allowSelfPurchase", Boolean(data[3]));
        config.set("statistics", Boolean(data[4]));
        const nextShop = Object.assign({}, shopConf, {
            allowCreate: Boolean(data[5]),
            createCost: clampInt(data[6], 0, 100000000, shopConf.createCost),
            maxItemTypes: clampInt(data[7], 1, 500, shopConf.maxItemTypes),
        });
        cfgSetSection("shop", nextShop);
        cfgSetSection("recycle", { enabled: Boolean(data[8]) });
        cfgSetSection("official", Object.assign({}, official, {
            sortMode: ["随机", "名字顺序", "价格"][clampInt(data[9], 0, 2, 0)],
        }));
        config.set("pageSize", clampInt(data[10], 1, 100, getPageSize()));
        pl.tell("§a市场配置已保存");
        showAdminMenu(pl);
    }), `市场配置`);
}

// --- 从物品目录搜索并选择 ---
// 物品选择器：分页（每页 40）+ 关键词搜索 + 目录分类筛选
function showCatalogPicker(player, title, keyword, onPick, onCancel, page, category) {
    const cancel = typeof onCancel === "function" ? onCancel : () => showAdminMenu(player);
    const cat = category || "全部";
    const all = searchCatalogMatches(keyword).filter((entry) =>
        cat === "全部" || String(entry.categoryName || "") === cat);
    const view = pageSlice(all, page, 40);
    if (!all.length) {
        sendListForm(player, title, `§c没有匹配“${keyword || cat}”的物品。\n§f可换关键词或切回“全部”分类，也可以直接输入完整类型名（如 minecraft:diamond）。`,
            ["重新搜索", "返回"], [ICON.search, ICON.home], (index) => {
                if (index === 0) promptCatalogSearch(player, title, keyword, onPick, onCancel, 1, cat);
                else cancel();
            });
        return;
    }
    pagedList(player, {
        title,
        summary: `§f共 ${all.length} 项 §f· 关键词：${keyword || "无"} · 分类：${cat} · 第 ${view.page}/${view.pages} 页`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: true,
        render: (entry) => `§b${entry.name || entry.fullName}\n§f${entry.fullName}${entry.aux ? ` (${entry.aux})` : ""}${entry.categoryName ? ` §b${entry.categoryName}` : ""}`,
        icon: (entry) => itemIconOf(entry.fullName || entry.typeName, entry.aux, entry.categoryName),
        onItem: (entry) => onPick(entry),
        onPrev: () => showCatalogPicker(player, title, keyword, onPick, onCancel, view.page - 1, cat),
        onNext: () => showCatalogPicker(player, title, keyword, onPick, onCancel, view.page + 1, cat),
        onSearch: () => promptSearch(player, title, keyword, (next) =>
            showCatalogPicker(player, title, next, onPick, onCancel, 1, cat)),
        // 目录分类与搜索放在物品列表上方
        topNav: [{
            label: `分类：${cat}`,
            icon: ICON.filter,
            action: () => showCatalogCategoryPicker(player, title, keyword, onPick, onCancel, cat),
        }],
        searchTop: true,
        searchLabel: "搜索物品",
        onBack: cancel,
    });
}

function showCatalogCategoryPicker(player, title, keyword, onPick, onCancel, current) {
    const options = ["全部"].concat(catalogCategories().filter((name) => name && name !== "全部"));
    sendChoiceForm(player, "物品分类", "目录分类", options,
        Math.max(0, options.indexOf(current || "全部")), (index) => {
            const next = index >= 0 ? options[index] : (current || "全部");
            showCatalogPicker(player, title, keyword, onPick, onCancel, 1, next);
        });
}

function promptCatalogSearch(player, title, keyword, onPick, onCancel, page, category) {
    promptSearch(player, title, keyword || "", (next) =>
        showCatalogPicker(player, title, next, onPick, onCancel, 1, category));
}

// --- 官方商店管理 ---
function showOfficialAdmin(player) {
    const data = officialData();
    const sells = Object.keys(data.purchaseItems).length;
    const recycles = Object.keys(data.recycleItems).length;
    const entries = [
        { text: `§a上架出售物品 §f(在售 ${sells})`, icon: ICON.put, action: () => promptCatalogSearch(player, "上架官方商品", "", (entry) => promptOfficialSellForm(player, entry)) },
        { text: `§b管理在售物品 §f(${sells})`, icon: ICON.edit, action: () => showOfficialSellAdmin(player, 1, "") },
        { text: `§d新增回收物品 §f(回收中 ${recycles})`, icon: ICON.add, action: () => promptCatalogSearch(player, "新增回收物品", "", (entry) => promptOfficialRecycleForm(player, entry)) },
        { text: "§6管理回收清单", icon: ICON.trade, action: () => showOfficialRecycleAdmin(player, 1, "") },
        { text: "§f返回", icon: ICON.home, action: () => showAdminMenu(player) },
    ];
    sendListForm(player, "官方商店管理",
        `§e出售：玩家付钱拿货（不征税）\n§e回收：玩家交货拿钱（不征税）\n§f在售 ${sells} 种 · 回收 ${recycles} 种`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function listingKeyForEntry(entry) {
    const type = String(entry.fullName || entry.type || "");
    return listingKey(type, catalogNbtFor(entry));
}

function buildCatalogListing(entry, price, quantity, category) {
    const type = String(entry.fullName || "");
    const aux = toInt(entry.aux, 0);
    const name = String(entry.name || entry.descriptionName || type);
    return {
        type,
        aux,
        nbt: catalogNbtFor(entry),
        name,
        price,
        quantity,
        category,
        createdAt: Date.now(),
        sales: 0,
    };
}

// 目录条目 → 最小 SNBT（引擎的旧式物品格式，能还原出该物品）
function catalogNbtFor(entry) {
    const aux = toInt(entry.aux, 0);
    const id = String(entry.fullName || "");
    return `{Count:1b,Name:"${id}",Damage:${aux}s,WasPickedUp:0b}`;
}

// 库存堆叠与目录/回收条目的对应关系：类型 + aux
function matchesEntry(stack, entry) {
    return String(stack.type || "") === String(entry.type || "")
        && toInt(stack.aux, 0) === toInt(entry.aux, 0);
}

function promptOfficialSellForm(player, entry) {
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "上架官方商品"));
    form.addLabel(`§e物品：§a${entry.name || entry.fullName}\n§f${entry.fullName}${entry.aux ? ` · aux ${entry.aux}` : ""}`);
    form.addInput("单价（金币）", "正整数", "100");
    form.addInput("库存（-1 = 无限）", "-1", "-1");
    form.addDropdown("分类", getCategories(), Math.max(0, getCategories().indexOf("其他")));
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showOfficialAdmin(pl);
            return;
        }
        const price = clampInt(fieldAt(data, 3, 0), 1, 1000000000, -1);
        const quantity = clampInt(fieldAt(data, 3, 1), -1, 9999999, -1);
        const category = getCategories()[clampInt(fieldAt(data, 3, 2), 0, getCategories().length - 1, 0)] || "其他";
        if (price < 0) {
            pl.tell("§c单价必须是 1 ~ 1000000000 的整数");
            return;
        }
        const data2 = officialData();
        const key = listingKeyForEntry(entry);
        const listing = buildCatalogListing(entry, price, quantity, category);
        if (isPlainObject(data2.purchaseItems[key])) {
            listing.createdAt = data2.purchaseItems[key].createdAt || listing.createdAt;
            listing.sales = toInt(data2.purchaseItems[key].sales, 0);
        }
        data2.purchaseItems[key] = listing;
        saveOfficialData(data2);
        pl.tell(`§a已上架：§d${listing.name} §e单价 ${price} §f库存 ${quantity === -1 ? "无限" : quantity}`);
        showOfficialAdmin(pl);
    }), `上架官方商品`);
}

function promptOfficialRecycleForm(player, entry) {
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "新增回收物品"));
    form.addLabel(`§e物品：§a${entry.name || entry.fullName}\n§f${entry.fullName}${entry.aux ? ` · aux ${entry.aux}` : ""}\n§c玩家上交该物品后按此单价结算`);
    form.addInput("回收单价（金币）", "正整数", "10");
    form.addDropdown("分类", getCategories(), Math.max(0, getCategories().indexOf("材料")));
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showOfficialAdmin(pl);
            return;
        }
        const price = clampInt(fieldAt(data, 2, 0), 1, 1000000000, -1);
        const category = getCategories()[clampInt(fieldAt(data, 2, 1), 0, getCategories().length - 1, 0)] || "其他";
        if (price < 0) {
            pl.tell("§c回收单价必须是正整数");
            return;
        }
        const store = officialData();
        const key = listingKeyForEntry(entry);
        store.recycleItems[key] = {
            type: String(entry.fullName || ""),
            aux: toInt(entry.aux, 0),
            nbt: catalogNbtFor(entry),
            name: String(entry.name || entry.descriptionName || entry.fullName),
            price,
            category,
            createdAt: Date.now(),
        };
        saveOfficialData(store);
        pl.tell(`§a已加入回收清单：§d${store.recycleItems[key].name} §e单价 ${price}`);
        showOfficialAdmin(pl);
    }), `新增回收物品`);
}

function showOfficialSellAdmin(player, page, keyword) {
    const rows = officialSellRows(keyword, "全部");
    const view = pageSlice(rows, page);
    pagedList(player, {
        title: "在售物品管理",
        summary: `§e共 ${rows.length} 种 · 第 ${view.page}/${view.pages} 页\n§f选中可改价 / 改库存 / 下架`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (item) => `§b${item.name}\n§6${toInt(item.price, 0)} ${economy.name} §f| 库存 ${officialStockText(item, item.key)}`,
        icon: (item) => listingIcon(item),
        onItem: (item) => showOfficialSellMenu(player, item, view.page, keyword),
        onPrev: () => showOfficialSellAdmin(player, view.page - 1, keyword),
        onNext: () => showOfficialSellAdmin(player, view.page + 1, keyword),
        onSearch: () => promptSearch(player, "搜索在售物品", keyword, (next) => showOfficialSellAdmin(player, 1, next)),
        searchTop: true,
        searchLabel: "搜索物品",
        extraNav: [{ label: "批量操作 / 打折", icon: ICON.discount, action: () => showBatchList(player, "official", 1) }],
        onBack: () => showOfficialAdmin(player),
    });
}

function showOfficialSellMenu(player, item, page, keyword) {
    const entries = [
        { text: "§e修改单价", icon: ICON.edit, action: () => promptListingPrice(player, "sell", item, page, keyword) },
        { text: "§b修改库存", icon: ICON.craft, action: () => promptListingStock(player, item, page, keyword) },
        { text: "§c下架", icon: ICON.trash, action: () => removeOfficialListing(player, "sell", item, page, keyword) },
        { text: "§f返回", icon: ICON.home, action: () => showOfficialSellAdmin(player, page, keyword) },
    ];
    sendListForm(player, "在售物品",
        `§e物品：§a${item.name}\n§e单价：§6${toInt(item.price, 0)} ${economy.name}\n§e库存：§b${officialStockText(item, item.key)}\n§e分类：${item.category || "其他"} §f| §e累计售出 ${toInt(item.sales, 0)}`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function promptListingPrice(player, mode, item, page, keyword) {
    promptText(player, "修改单价", "新的单价（正整数）", String(toInt(item.price, 0)), (value) => {
        const raw = String(value === undefined || value === null ? "" : value).trim();
        if (raw === "" || isNaN(Number(raw))) {
            player.tell("§c单价必须是正整数");
            if (mode === "sell") showOfficialSellAdmin(player, page, keyword);
            else showOfficialRecycleAdmin(player, page, keyword);
            return;
        }
        const price = clampInt(raw, 1, 1000000000, -1);
        const store = officialData();
        const bucket = mode === "sell" ? store.purchaseItems : store.recycleItems;
        if (!isPlainObject(bucket[item.key])) {
            player.tell("§c该条目已不存在");
        } else {
            bucket[item.key].price = price;
            saveOfficialData(store);
            player.tell(`§a${item.name} 单价已改为 §6${price}`);
        }
        if (mode === "sell") showOfficialSellAdmin(player, page, keyword);
        else showOfficialRecycleAdmin(player, page, keyword);
    });
}

function promptListingStock(player, item, page, keyword) {
    const current = officialStockOf(item, item.key);
    promptText(player, "修改库存", "库存数量（-1 = 无限，0 = 下架）", String(current), (value) => {
        const raw = String(value === undefined || value === null ? "" : value).trim();
        if (raw === "" || isNaN(Number(raw))) {
            player.tell("§c库存必须是整数（-1 表示无限，0 表示下架）");
            showOfficialSellAdmin(player, page, keyword);
            return;
        }
        const stock = clampInt(raw, -1, 9999999, -1);
        const store = officialData();
        if (!isPlainObject(store.purchaseItems[item.key])) {
            player.tell("§c该条目已不存在");
        } else if (stock === 0) {
            delete store.purchaseItems[item.key];
            saveOfficialData(store);
            player.tell(`§e${item.name} 库存为 0，已自动下架`);
        } else {
            store.purchaseItems[item.key].quantity = stock;
            saveOfficialData(store);
            player.tell(`§a${item.name} 库存已改为 §b${stock === -1 ? "无限" : stock}`);
        }
        showOfficialSellAdmin(player, page, keyword);
    });
}

function removeOfficialListing(player, mode, item, page, keyword) {
    const store = officialData();
    if (mode === "sell") delete store.purchaseItems[item.key];
    else delete store.recycleItems[item.key];
    saveOfficialData(store);
    player.tell(`§a已下架：§d${item.name}`);
    if (mode === "sell") showOfficialSellAdmin(player, page, keyword);
    else showOfficialRecycleAdmin(player, page, keyword);
}

function showOfficialRecycleAdmin(player, page, keyword) {
    const store = officialData();
    const query = normalizePlayerKey(keyword);
    let rows = Object.keys(store.recycleItems).map((key) => Object.assign({ key }, store.recycleItems[key]));
    if (query) rows = rows.filter((item) => String(item.name || "").toLowerCase().indexOf(query) >= 0);
    rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh"));
    const view = pageSlice(rows, page);
    pagedList(player, {
        title: "回收清单管理",
        summary: `§e共 ${rows.length} 种 · 第 ${view.page}/${view.pages} 页\n§f选中可改价 / 删除`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (item) => `§b${item.name}\n§6${toInt(item.price, 0)} ${economy.name} / 个`,
        icon: (item) => listingIcon(item),
        onItem: (item) => showOfficialRecycleMenu(player, item, view.page, keyword),
        onPrev: () => showOfficialRecycleAdmin(player, view.page - 1, keyword),
        onNext: () => showOfficialRecycleAdmin(player, view.page + 1, keyword),
        onSearch: () => promptSearch(player, "搜索回收物品", keyword, (next) => showOfficialRecycleAdmin(player, 1, next)),
        searchTop: true,
        searchLabel: "搜索物品",
        extraNav: [{ label: "批量改价 / 改分类", icon: ICON.discount, action: () => showBatchList(player, "recycle", 1) }],
        onBack: () => showOfficialAdmin(player),
    });
}

function showOfficialRecycleMenu(player, item, page, keyword) {
    const entries = [
        { text: "§e修改回收单价", icon: ICON.edit, action: () => promptListingPrice(player, "recycle", item, page, keyword) },
        { text: "§c移出回收清单", icon: ICON.trash, action: () => removeOfficialListing(player, "recycle", item, page, keyword) },
        { text: "§f返回", icon: ICON.home, action: () => showOfficialRecycleAdmin(player, page, keyword) },
    ];
    sendListForm(player, "回收物品",
        `§e物品：§a${item.name}\n§e回收单价：§6${toInt(item.price, 0)} ${economy.name}\n§e分类：${item.category || "其他"}`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

// --- 分类管理 ---
function showCategoryAdmin(player) {
    const categories = getCategories();
    const rows = categories.filter((name) => name !== "全部");
    const texts = rows.map((name) => `§b${name}`);
    texts.push("§a+ 新增分类");
    texts.push("§f← 返回");
    sendListForm(player, "分类管理",
        `§f共 ${rows.length} 个分类（“全部”为固定项，不可删除）`, texts,
        rows.map(() => ICON.filter).concat([ICON.add, ICON.home]), (index) => {
            if (index < rows.length) {
                promptDeleteCategory(player, rows[index]);
            } else if (index === rows.length) {
                promptText(player, "新增分类", "分类名称（最多 12 字）", "", (name) => {
                    const value = limitText(name, 12);
                    if (!value) {
                        player.tell("§c分类名不能为空");
                        showCategoryAdmin(player);
                        return;
                    }
                    const list = getCategories();
                    if (list.indexOf(value) >= 0) {
                        player.tell("§c分类已存在");
                    } else {
                        list.push(value);
                        cfgSetSection("categories", list);
                        player.tell(`§a已新增分类 §d${value}`);
                    }
                    showCategoryAdmin(player);
                });
            } else {
                showAdminMenu(player);
            }
        });
}

function promptDeleteCategory(player, name) {
    sendListForm(player, "删除分类",
        `§c确认删除分类 §e${name} §c吗？\n§f使用该分类的货架商品会显示为“其他”，物品不受影响。`,
        ["确认删除", "取消"], [ICON.trash, ICON.home], (index) => {
            if (index === 0) {
                const list = getCategories().filter((item) => item !== name);
                cfgSetSection("categories", list);
                player.tell(`§a已删除分类 §d${name}`);
            }
            showCategoryAdmin(player);
        });
}

// --- 禁售物品 ---
function showForbiddenAdmin(player) {
    const list = forbiddenList();
    const texts = list.map((type) => `§c${type}`);
    texts.push("§a+ 新增禁售物品");
    texts.push("§f← 返回");
    sendListForm(player, "禁售物品",
        `§f禁售后玩家无法把该物品上架（仍可购买与回收）。\n§e当前 ${list.length} 种`,
        texts, list.map((type) => itemIconOf(type, 0, "")).concat([ICON.add, ICON.home]), (index) => {
            if (index < list.length) {
                promptDeleteForbidden(player, list[index]);
            } else if (index === list.length) {
                promptCatalogSearch(player, "新增禁售物品", "", (entry) => {
                    const type = String(entry.fullName || "");
                    const next = forbiddenList();
                    if (next.indexOf(type) >= 0) {
                        player.tell("§c该物品已在禁售列表中");
                    } else {
                        next.push(type);
                        saveForbiddenList(next);
                        player.tell(`§a已禁售 §c${type}`);
                    }
                    showForbiddenAdmin(player);
                });
            } else {
                showAdminMenu(player);
            }
        });
}

function promptDeleteForbidden(player, type) {
    saveForbiddenList(forbiddenList().filter((item) => item !== type));
    player.tell(`§a已解除禁售 §d${type}`);
    showForbiddenAdmin(player);
}

// --- 玩家店铺管理 ---
function showPlayerShopAdmin(player, page, keyword) {
    const shops = allShops();
    const query = normalizePlayerKey(keyword);
    let rows = Object.keys(shops).map((xuid) => {
        const shop = shops[xuid];
        const items = shopListings(shop);
        return {
            xuid,
            name: String(shop.name || xuid),
            ownerName: String(shop.ownerName || ""),
            isOpen: Boolean(shop.isOpen),
            itemTypes: items.length,
            earnings: toInt(shop.earnings, 0),
            pending: toInt(shop.pendingEarnings, 0),
        };
    });
    if (query) {
        rows = rows.filter((row) => normalizePlayerKey(row.name).indexOf(query) >= 0
            || normalizePlayerKey(row.ownerName).indexOf(query) >= 0
            || row.xuid.indexOf(query) >= 0);
    }
    rows.sort((a, b) => b.itemTypes - a.itemTypes);
    const view = pageSlice(rows, page);
    pagedList(player, {
        title: "玩家店铺管理",
        summary: `§e共 ${rows.length} 家店铺 · 第 ${view.page}/${view.pages} 页`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        render: (row) => `§b${row.name} §f(${row.ownerName || "—"})\n§f${row.isOpen ? "§a营业中" : "§c已关闭"} · 物品 ${row.itemTypes} · 收益 ${row.earnings}`,
        icon: (row) => (row.isOpen ? ICON.unlock : ICON.lock),
        onItem: (row) => showPlayerShopDetail(player, row.xuid, view.page, keyword),
        onPrev: () => showPlayerShopAdmin(player, view.page - 1, keyword),
        onNext: () => showPlayerShopAdmin(player, view.page + 1, keyword),
        onSearch: () => promptSearch(player, "搜索店铺", keyword, (next) => showPlayerShopAdmin(player, 1, next)),
        searchTop: true,
        searchLabel: "搜索店铺",
        onBack: () => showAdminMenu(player),
    });
}

function showPlayerShopDetail(player, xuid, page, keyword) {
    const shop = getShop(xuid);
    if (!shop) {
        player.tell("§c该店铺已不存在");
        showPlayerShopAdmin(player, page, keyword);
        return;
    }
    const items = shopListings(shop);
    const entries = [
        {
            text: shop.isOpen ? "§c强制打烊" : "§a强制开业",
            icon: shop.isOpen ? ICON.lock : ICON.unlock,
            action: () => {
                shopMutate(xuid, (target) => {
                    target.isOpen = !target.isOpen;
                    return { ok: true };
                });
                showPlayerShopDetail(player, xuid, page, keyword);
            },
        },
        { text: "§b查看货架", icon: ICON.warehouse, action: () => showPlayerShopItems(player, xuid, 0, page, keyword) },
        { text: "§e修改公告", icon: ICON.sign, action: () => promptAdminNotice(player, xuid, page, keyword) },
        { text: "§c删除店铺", icon: ICON.trash, action: () => confirmAdminDeleteShop(player, xuid, page, keyword) },
        { text: "§f返回", icon: ICON.home, action: () => showPlayerShopAdmin(player, page, keyword) },
    ];
    sendListForm(player, "店铺详情",
        `§e店铺：§a${shop.name}\n§e店主：§b${shop.ownerName || "—"} §f(${xuid})`
        + `\n§e状态：${shop.isOpen ? "§a营业中" : "§c已关闭"} §f| §e货架 §b${items.length}`
        + `\n§e收益：§6${toInt(shop.earnings, 0)} §f| §e待结算：§6${toInt(shop.pendingEarnings, 0)}`
        + (shop.notice ? `\n§d公告：§f${limitText(shop.notice, 60)}` : ""),
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function showPlayerShopItems(player, xuid, itemPage, page, keyword) {
    const shop = getShop(xuid);
    if (!shop) {
        showPlayerShopAdmin(player, page, keyword);
        return;
    }
    const rows = shopListings(shop);
    const view = pageSlice(rows, itemPage);
    pagedList(player, {
        title: "店铺货架",
        summary: `§e${shop.name} · 共 ${rows.length} 种 · 第 ${view.page}/${view.pages} 页\n§f选中可强制下架（物品转入店主待领取区）`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: false,
        render: (item) => `§b${item.name} §fx${toInt(item.quantity, 0)}\n§6${toInt(item.price, 0)} ${economy.name} §f| ${item.category || "其他"}`,
        icon: (item) => listingIcon(item),
        onItem: (item) => {
            const result = shopMutate(xuid, (target) => {
                const listing = isPlainObject(target.items) ? target.items[item.key] : null;
                if (!isPlainObject(listing)) return { ok: false, error: "该物品已不在货架上" };
                const qty = toInt(listing.quantity, 0);
                queuePendingItem(target, listing, qty);
                delete target.items[item.key];
                return { ok: true, name: listing.name, qty };
            });
            if (!result.ok) player.tell(`§c${result.error}`);
            else player.tell(`§a已强制下架 §d${result.name} x${result.qty}§a，已转入店主待领取区`);
            showPlayerShopItems(player, xuid, itemPage, page, keyword);
        },
        onPrev: () => showPlayerShopItems(player, xuid, view.page - 1, page, keyword),
        onNext: () => showPlayerShopItems(player, xuid, view.page + 1, page, keyword),
        onBack: () => showPlayerShopDetail(player, xuid, page, keyword),
    });
}

function promptAdminNotice(player, xuid, page, keyword) {
    const shop = getShop(xuid);
    if (!shop) {
        showPlayerShopAdmin(player, page, keyword);
        return;
    }
    promptText(player, "修改公告", "公告内容（留空清空）", shop.notice || "", (text) => {
        const notice = limitText(text, 100);
        const result = shopMutate(xuid, (target) => {
            target.notice = notice;
            return { ok: true };
        });
        player.tell(result.ok ? "§a公告已更新" : `§c${result.error}`);
        showPlayerShopDetail(player, xuid, page, keyword);
    });
}

function confirmAdminDeleteShop(player, xuid, page, keyword) {
    const shop = getShop(xuid);
    if (!shop) {
        showPlayerShopAdmin(player, page, keyword);
        return;
    }
    const items = shopListings(shop);
    if (items.length) {
        player.tell(`§c该店铺还有 ${items.length} 种物品，请先逐个强制下架再删除`);
        showPlayerShopItems(player, xuid, 0, page, keyword);
        return;
    }
    sendListForm(player, "删除店铺",
        `§c确认永久删除店铺 §e${shop.name} §c吗？\n§f待结算收益与待领取物品会一并丢弃。`,
        ["确认删除", "取消"], [ICON.trash, ICON.home], (index) => {
            if (index === 0) {
                const shops = allShops();
                if (isPlainObject(shops[xuid])) {
                    delete shops[xuid];
                    saveAllShops(shops);
                    player.tell(`§a已删除店铺 §d${shop.name}`);
                }
            }
            showPlayerShopAdmin(player, page, keyword);
        });
}

// --- 税收统计 ---
function showTaxStats(player) {
    const data = taxData();
    const recent = data.records.slice(-10).reverse();
    const lines = [`§f累计税收：§6${data.total} ${economy.name}`, "§e最近 10 笔："];
    if (!recent.length) lines.push("§f暂无记录");
    for (const record of recent) {
        lines.push(`§f${formatStamp(record.ts)} §a${record.payer} §f-§6${record.amount} §f(${record.item})`);
    }
    sendListForm(player, "税收统计", lines.join("\n"), ["返回"], [ICON.home], () => showAdminMenu(player));
}

// === management exports (LuckyClover-Panel) ===
// 所有 mgmt* 接口：入参接受 JSON 字符串或对象，出参统一 JSON 字符串。
function argObject(value) {
    if (typeof value === "string") return safeParse(value, {}) || {};
    if (Array.isArray(value)) {
        const first = value[0];
        if (typeof first === "string") return safeParse(first, {}) || {};
        if (isPlainObject(first)) return first;
        return {};
    }
    return isPlainObject(value) ? value : {};
}

function jsonOk(extra) {
    return JSON.stringify(Object.assign({ ok: true }, extra || {}));
}

function jsonError(error) {
    return JSON.stringify({ ok: false, error: String(error || "unknown error") });
}

function pageInfo(rows, page, size) {
    const view = pageSlice(rows, page, size);
    return { rows: view.rows, page: view.page, pages: view.pages, total: view.total };
}

function shopSummaryRow(xuid, shop) {
    const items = shopListings(shop);
    return {
        xuid: String(xuid),
        name: String(shop.name || ""),
        ownerName: String(shop.ownerName || ""),
        isOpen: Boolean(shop.isOpen),
        notice: String(shop.notice || ""),
        itemTypes: items.length,
        itemCount: items.reduce((sum, item) => sum + Math.max(0, toInt(item.quantity, 0)), 0),
        earnings: toInt(shop.earnings, 0),
        pendingEarnings: toInt(shop.pendingEarnings, 0),
        pendingItems: pendingShopItemsOf(shop).length,
        createdAt: toInt(shop.createdAt, 0),
    };
}

function listingRow(key, listing) {
    return {
        key: String(key),
        type: String(listing.type || ""),
        aux: toInt(listing.aux, 0),
        name: String(listing.name || ""),
        price: toInt(listing.price, 0),
        quantity: toInt(listing.quantity, 0),
        category: String(listing.category || "其他"),
        sales: toInt(listing.sales, 0),
        createdAt: toInt(listing.createdAt, 0),
        perCount: Math.max(1, toInt(listing.perCount, 1)),
        remark: String(listing.remark || ""),
        displayName: String(listing.displayName || ""),
        discount: discountActive(listing) ? listing.discount : null,
        originalPrice: discountActive(listing) ? toInt(listing.originalPrice, listing.price) : null,
        discountEndTime: discountActive(listing) ? toInt(listing.discountEndTime, 0) : 0,
    };
}

function currentConfigForExport() {
    return {
        command: getMainCommand(),
        pageSize: getPageSize(),
        allowSelfPurchase: cfgBool("allowSelfPurchase", false),
        statistics: cfgBool("statistics", true),
        tax: getTaxConfig(),
        categories: getCategories(),
        shop: getShopConfig(),
        official: cfgSection("official"),
        recycle: cfgSection("recycle"),
        menu: cfgSection("menu"),
        warehouse: getWarehouseConfig(),
        request: getRequestConfig(),
        discount: getDiscountConfig(),
        notify: getNotifyConfig(),
    };
}

exportApi("mgmtStatus", () => jsonOk(Object.assign({
    version: PLUGIN_VERSION.join("."),
    namespace: NAMESPACE,
}, statsSnapshot())));

exportApi("mgmtOverview", () => {
    const tax = getTaxConfig();
    const recent = tradeLogs().slice(-8).reverse();
    return jsonOk({
        stats: statsSnapshot(),
        tax,
        shop: getShopConfig(),
        recycleEnabled: cfgSection("recycle").enabled !== false,
        recent,
        top: rankingList("").slice(0, 8),
    });
});

exportApi("mgmtGetConfig", () => jsonOk({ config: currentConfigForExport() }));

exportApi("mgmtSetConfig", (payload) => {
    const input = argObject(payload);
    const sectionKeys = ["tax", "shop", "official", "recycle", "menu", "warehouse", "request", "discount", "notify"];
    for (const key of sectionKeys) {
        if (isPlainObject(input[key])) {
            cfgSetSection(key, Object.assign(cfgSection(key), input[key]));
        }
    }
    if (Array.isArray(input.categories)) {
        const list = input.categories.map((item) => limitText(item, 24)).filter((item) => item);
        if (list.length) cfgSetSection("categories", list);
    }
    if (input.command !== undefined) config.set("command", limitText(input.command, 24) || "shop");
    if (input.pageSize !== undefined) config.set("pageSize", clampInt(input.pageSize, 1, 100, getPageSize()));
    if (input.allowSelfPurchase !== undefined) config.set("allowSelfPurchase", Boolean(input.allowSelfPurchase));
    if (input.statistics !== undefined) config.set("statistics", Boolean(input.statistics));
    logger.info("面板已更新商城配置");
    return jsonOk({ config: currentConfigForExport() });
});

exportApi("mgmtReload", () => {
    ensureConfigMigrated();
    catalogCache = null;
    catalogStoreCache = null;
    return jsonOk({ config: currentConfigForExport(), stats: statsSnapshot() });
});

// --- 玩家店铺 ---
exportApi("mgmtListShops", (payload) => {
    const input = argObject(payload);
    const query = normalizePlayerKey(input.keyword);
    const shops = allShops();
    let rows = Object.keys(shops).map((xuid) => shopSummaryRow(xuid, shops[xuid]));
    if (query) {
        rows = rows.filter((row) => normalizePlayerKey(row.name).indexOf(query) >= 0
            || normalizePlayerKey(row.ownerName).indexOf(query) >= 0
            || row.xuid.indexOf(query) >= 0);
    }
    rows.sort((a, b) => b.itemTypes - a.itemTypes);
    return jsonOk(pageInfo(rows, input.page, 20));
});

exportApi("mgmtGetShop", (payload) => {
    const input = argObject(payload);
    const shop = getShop(input.xuid);
    if (!shop) return jsonError("店铺不存在");
    const items = shopListings(shop).map((item) => listingRow(item.key, item));
    return jsonOk(Object.assign({ items, pendingItems: pendingShopItemsOf(shop) }, shopSummaryRow(input.xuid, shop)));
});

exportApi("mgmtSetShopOpen", (payload) => {
    const input = argObject(payload);
    const target = Boolean(input.open);
    const result = shopMutate(input.xuid, (shop) => {
        shop.isOpen = target;
        return { ok: true };
    });
    if (!result.ok) return jsonError(result.error);
    return jsonOk({ xuid: String(input.xuid), isOpen: target });
});

exportApi("mgmtSetShopNotice", (payload) => {
    const input = argObject(payload);
    const notice = limitText(input.notice, 100);
    const result = shopMutate(input.xuid, (shop) => {
        shop.notice = notice;
        return { ok: true };
    });
    if (!result.ok) return jsonError(result.error);
    return jsonOk({ xuid: String(input.xuid), notice });
});

exportApi("mgmtSetShopPrice", (payload) => {
    const input = argObject(payload);
    const shopConf = getShopConfig();
    // 注意：不能用 clampInt(x, min, max, -1) 来判非法——clampInt 会把 NaN/负数钳成 min，
    // 于是 "price < 0" 永远不成立，非法入参会被静默写成最低价。
    const price = toInt(input.price, -1);
    if (price < shopConf.minPrice || price > shopConf.maxPrice) {
        return jsonError(`单价必须在 ${shopConf.minPrice} ~ ${shopConf.maxPrice} 之间`);
    }
    let discountCleared = false;
    const result = shopMutate(input.xuid, (shop) => {
        const listing = isPlainObject(shop.items) ? shop.items[input.key] : null;
        if (!isPlainObject(listing)) return { ok: false, error: "货架上没有该物品" };
        // 折扣生效中改价：先结束折扣，避免到期 clearDiscount 用旧原价覆盖新价
        if (discountActive(listing)) {
            clearDiscount(listing);
            discountCleared = true;
        }
        listing.price = price;
        return { ok: true };
    });
    if (!result.ok) return jsonError(result.error);
    return jsonOk({ xuid: String(input.xuid), key: String(input.key), price, discountCleared });
});

exportApi("mgmtRemoveShopItem", (payload) => {
    const input = argObject(payload);
    const result = shopMutate(input.xuid, (shop) => {
        const listing = isPlainObject(shop.items) ? shop.items[input.key] : null;
        if (!isPlainObject(listing)) return { ok: false, error: "货架上没有该物品" };
        const qty = toInt(listing.quantity, 0);
        // 只有确实有库存才进暂存区；Math.max(1, 0) 会凭空造出一件物品
        queuePendingItem(shop, listing, qty);
        delete shop.items[input.key];
        return { ok: true, name: String(listing.name || ""), quantity: qty };
    });
    if (!result.ok) return jsonError(result.error);
    return jsonOk({ xuid: String(input.xuid), key: String(input.key), name: result.name, quantity: result.quantity });
});

exportApi("mgmtDeleteShop", (payload) => {
    const input = argObject(payload);
    const shop = getShop(input.xuid);
    if (!shop) return jsonError("店铺不存在");
    if (shopListings(shop).length) return jsonError("货架未清空，请先逐个下架物品");
    // 暂存物品与待结算收益会随店铺一起消失，必须先处理掉
    const pendingItems = pendingShopItemsOf(shop).length;
    const pendingEarnings = toInt(shop.pendingEarnings, 0);
    if (pendingItems > 0 || pendingEarnings > 0) {
        return jsonError(`该店铺还有 ${pendingItems} 条暂存物品 / ${pendingEarnings} 待结算收益，请先让店主领取`);
    }
    const shops = allShops();
    delete shops[String(input.xuid)];
    saveAllShops(shops);
    logger.info(`面板删除店铺: ${shop.name} (${input.xuid})`);
    return jsonOk({ xuid: String(input.xuid) });
});

// --- 官方商店 ---
exportApi("mgmtListOfficial", (payload) => {
    const input = argObject(payload);
    const rows = officialSellRows(input.keyword, input.category || "全部").map((item) => listingRow(item.key, item));
    return jsonOk(pageInfo(rows, input.page, 20));
});

exportApi("mgmtAddOfficial", (payload) => {
    const input = argObject(payload);
    const type = String(input.type || "").trim();
    if (!type || type.indexOf(":") < 0) return jsonError("type 必须是完整物品类型，如 minecraft:diamond");
    const price = toInt(input.price, -1);
    if (price < 1 || price > 1000000000) return jsonError("单价必须是 1 ~ 1000000000 的整数");
    const aux = toInt(input.aux, 0);
    const entry = catalogLookup(type, aux) || { fullName: type, aux, name: String(input.name || type) };
    // 数量：未传 = 无限（-1）；传了就必须是 -1 或 0 ~ 9999999，不能把 NaN 静默当成无限
    let quantity = -1;
    if (input.quantity !== undefined && input.quantity !== null && String(input.quantity).trim() !== "") {
        quantity = toInt(input.quantity, NaN);
        if (isNaN(quantity) || quantity < -1 || quantity > 9999999) {
            return jsonError("quantity 必须是 -1（无限）或 0 ~ 9999999 的整数");
        }
    }
    const categories = getCategories();
    const category = categories.indexOf(String(input.category || "")) >= 0 ? String(input.category)
        : (categories.indexOf("其他") >= 0 ? "其他" : categories[categories.length - 1]);
    const listing = buildCatalogListing(entry, price, quantity, category);
    const data = officialData();
    const key = listingKeyForEntry(entry);
    if (isPlainObject(data.purchaseItems[key])) {
        listing.createdAt = data.purchaseItems[key].createdAt || listing.createdAt;
        listing.sales = toInt(data.purchaseItems[key].sales, 0);
    }
    data.purchaseItems[key] = listing;
    saveOfficialData(data);
    return jsonOk({ key, listing: listingRow(key, listing) });
});

exportApi("mgmtSetOfficialPrice", (payload) => {
    const input = argObject(payload);
    const price = toInt(input.price, -1);
    if (price < 1 || price > 1000000000) return jsonError("单价必须是 1 ~ 1000000000 的整数");
    const data = officialData();
    if (!isPlainObject(data.purchaseItems[input.key])) return jsonError("该商品不存在");
    data.purchaseItems[input.key].price = price;
    saveOfficialData(data);
    return jsonOk({ key: String(input.key), price });
});

exportApi("mgmtSetOfficialStock", (payload) => {
    const input = argObject(payload);
    // 关键：非法/缺失的数量不能落到 -1，否则会变成"无限库存"
    const raw = input.quantity;
    if (raw === undefined || raw === null || String(raw).trim() === "" || isNaN(Number(raw))) {
        return jsonError("quantity 必须是 -1（无限）或 0 ~ 9999999 的整数");
    }
    const quantity = toInt(raw, NaN);
    if (isNaN(quantity) || quantity < -1 || quantity > 9999999) {
        return jsonError("quantity 必须是 -1（无限）或 0 ~ 9999999 的整数");
    }
    const data = officialData();
    if (!isPlainObject(data.purchaseItems[input.key])) return jsonError("该商品不存在");
    if (quantity === 0) delete data.purchaseItems[input.key];
    else data.purchaseItems[input.key].quantity = quantity;
    saveOfficialData(data);
    return jsonOk({ key: String(input.key), quantity, removed: quantity === 0 });
});

exportApi("mgmtRemoveOfficial", (payload) => {
    const input = argObject(payload);
    const data = officialData();
    if (!isPlainObject(data.purchaseItems[input.key])) return jsonError("该商品不存在");
    const name = String(data.purchaseItems[input.key].name || "");
    delete data.purchaseItems[input.key];
    saveOfficialData(data);
    return jsonOk({ key: String(input.key), name });
});

// --- 回收清单 ---
exportApi("mgmtListRecycle", (payload) => {
    const input = argObject(payload);
    const query = normalizePlayerKey(input.keyword);
    const data = officialData();
    let rows = Object.keys(data.recycleItems).map((key) => listingRow(key, data.recycleItems[key]));
    if (query) rows = rows.filter((row) => row.name.toLowerCase().indexOf(query) >= 0 || row.type.toLowerCase().indexOf(query) >= 0);
    rows.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return jsonOk(pageInfo(rows, input.page, 20));
});

exportApi("mgmtAddRecycle", (payload) => {
    const input = argObject(payload);
    const type = String(input.type || "").trim();
    if (!type || type.indexOf(":") < 0) return jsonError("type 必须是完整物品类型，如 minecraft:cobblestone");
    const price = toInt(input.price, -1);
    if (price < 1 || price > 1000000000) return jsonError("回收单价必须是 1 ~ 1000000000 的整数");
    const aux = toInt(input.aux, 0);
    const entry = catalogLookup(type, aux) || { fullName: type, aux, name: String(input.name || type) };
    const categories = getCategories();
    const category = categories.indexOf(String(input.category || "")) >= 0 ? String(input.category)
        : (categories.indexOf("材料") >= 0 ? "材料" : categories[categories.length - 1]);
    const data = officialData();
    const key = listingKeyForEntry(entry);
    data.recycleItems[key] = {
        type: String(entry.fullName || type),
        aux,
        nbt: catalogNbtFor(entry),
        name: String(entry.name || entry.descriptionName || type),
        price,
        perCount: clampInt(input.perCount, 1, 64, 1),
        category,
        createdAt: Date.now(),
    };
    saveOfficialData(data);
    return jsonOk({ key, listing: listingRow(key, data.recycleItems[key]) });
});

exportApi("mgmtSetRecyclePrice", (payload) => {
    const input = argObject(payload);
    const price = toInt(input.price, -1);
    if (price < 1 || price > 1000000000) return jsonError("回收单价必须是 1 ~ 1000000000 的整数");
    const data = officialData();
    if (!isPlainObject(data.recycleItems[input.key])) return jsonError("该回收条目不存在");
    data.recycleItems[input.key].price = price;
    saveOfficialData(data);
    return jsonOk({ key: String(input.key), price });
});

exportApi("mgmtRemoveRecycle", (payload) => {
    const input = argObject(payload);
    const data = officialData();
    if (!isPlainObject(data.recycleItems[input.key])) return jsonError("该回收条目不存在");
    const name = String(data.recycleItems[input.key].name || "");
    delete data.recycleItems[input.key];
    saveOfficialData(data);
    return jsonOk({ key: String(input.key), name });
});

exportApi("mgmtSearchItems", (payload) => {
    const input = argObject(payload);
    const limit = clampInt(input.limit, 1, 50, 20);
    const rows = searchCatalog(input.keyword, limit).map((entry) => ({
        name: String(entry.name || entry.descriptionName || ""),
        type: String(entry.fullName || ""),
        aux: toInt(entry.aux, 0),
        category: String(entry.categoryName || ""),
    }));
    return jsonOk({ rows, total: rows.length });
});

// --- 分类 / 禁售 ---
exportApi("mgmtListCategories", () => jsonOk({ categories: getCategories() }));

exportApi("mgmtAddCategory", (payload) => {
    const input = argObject(payload);
    const name = limitText(input.name, 12);
    if (!name) return jsonError("分类名不能为空");
    const list = getCategories();
    if (list.indexOf(name) >= 0) return jsonError("分类已存在");
    list.push(name);
    cfgSetSection("categories", list);
    return jsonOk({ categories: getCategories() });
});

exportApi("mgmtRemoveCategory", (payload) => {
    const input = argObject(payload);
    const name = String(input.name || "");
    if (!name || name === "全部") return jsonError("无法删除该分类");
    const list = getCategories().filter((item) => item !== name);
    cfgSetSection("categories", list);
    return jsonOk({ categories: getCategories() });
});

exportApi("mgmtGetForbidden", () => jsonOk({ items: forbiddenList() }));

exportApi("mgmtSetForbidden", (payload) => {
    const input = argObject(payload);
    const list = Array.isArray(input.items) ? input.items : [];
    saveForbiddenList(list);
    return jsonOk({ items: forbiddenList() });
});

// --- 交易 / 排行 / 税收 ---
exportApi("mgmtListLogs", (payload) => {
    const input = argObject(payload);
    const result = logPage(input.page, input.keyword);
    return jsonOk({ rows: result.rows, page: result.page, pages: result.pages, total: result.total });
});

exportApi("mgmtGetRanking", (payload) => {
    const input = argObject(payload);
    const all = rankingList(input.keyword);
    const view = pageInfo(all, input.page, 20);
    return jsonOk(view);
});

exportApi("mgmtGetTaxStats", () => {
    const data = taxData();
    return jsonOk({
        total: data.total,
        count: data.records.length,
        recent: data.records.slice(-20).reverse(),
        config: getTaxConfig(),
    });
});

exportApi("mgmtSetTax", (payload) => {
    const input = argObject(payload);
    const current = getTaxConfig();
    const next = {
        enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
        rate: input.rate === undefined ? current.rate : clampNumber(input.rate, 0, 0.5, current.rate),
        scope: ["player", "official", "all"].indexOf(String(input.scope)) >= 0 ? String(input.scope) : current.scope,
    };
    cfgSetSection("tax", next);
    logger.info(`面板已更新税收配置: enabled=${next.enabled} rate=${next.rate} scope=${next.scope}`);
    return jsonOk({ tax: next });
});

// === commands ===
const MAIN_COMMAND = getMainCommand();
mc.regPlayerCmd(MAIN_COMMAND, "打开商城 (/shop)", (player) => {
    showMainMenu(player);
}, 0);

mc.regPlayerCmd("smgm", "打开官方商店购买页", (player) => {
    showOfficialItems(player, 1, "", "全部");
}, 0);

mc.regPlayerCmd("smhs", "打开物品回收页", (player) => {
    showRecycleList(player);
}, 0);

mc.regPlayerCmd("smck", "打开个人仓库", (player) => {
    showWarehouse(player, 1);
}, 0);

mc.regPlayerCmd("smreq", "打开悬赏求购大厅", (player) => {
    showRequestsHub(player);
}, 0);

// === 上线结算：待结算收益 + 店铺暂存物品 ===
function settleOnJoin(player) {
    const shop = getShop(player.xuid);
    if (!shop) return;
    const pending = toInt(shop.pendingEarnings, 0);
    if (pending > 0) {
        const result = shopMutate(player.xuid, (target) => {
            const amount = toInt(target.pendingEarnings, 0);
            if (amount <= 0) return { ok: false };
            target.pendingEarnings = 0;
            return { ok: true, amount };
        });
        if (result.ok) {
            if (economy.add(player.xuid, result.amount)) {
                player.tell(`§a你的店铺离线期间售出了物品，已入账 §6${result.amount} ${economy.name}§a。`);
            } else {
                shopMutate(player.xuid, (target) => {
                    target.pendingEarnings = toInt(target.pendingEarnings, 0) + result.amount;
                    return { ok: true };
                });
            }
        }
    }

    const queue = pendingShopItemsOf(getShop(player.xuid) || {});
    if (!queue.length) return;
    let delivered = 0;
    const rest = [];
    for (const entry of queue) {
        const qty = Math.max(1, toInt(entry.quantity, 1));
        if (canReceive(player, entry.nbt, qty) && giveItems(player, entry.nbt, qty)) {
            delivered += qty;
        } else {
            rest.push(entry);
        }
    }
    if (delivered > 0 || rest.length !== queue.length) {
        shopMutate(player.xuid, (target) => {
            target.pendingItems = rest;
            return { ok: true };
        });
    }
    if (delivered > 0) player.tell(`§a店铺暂存物品已发放到背包，共 §d${delivered} §a件。`);
    if (rest.length) player.tell("§e背包空间不足，剩余暂存物品请清理背包后再领取（/shop → 我的店铺）。");

    try {
        const unread = unreadCount(player.xuid);
        if (unread > 0) {
            player.tell(`§d§l你有 ${unread} 条未读提醒 §f（/shop → 提醒箱 查看）`);
        }
    } catch (error) {
        // 忽略提醒查询失败
    }
}

mc.listen("onJoin", (player) => {
    setTimeout(() => {
        try {
            settleOnJoin(player);
        } catch (error) {
            logger.warn(`上线结算失败: ${error}`);
        }
    }, 3000);
});

// === lifecycle ===
function startPeriodicTasks() {
    const run = () => {
        try {
            checkDiscounts();
            checkExpiredRequests();
        } catch (error) {
            logger.warn(`定时任务失败: ${error}`);
        }
    };
    run();
    try {
        if (typeof mc.setInterval === "function") {
            mc.setInterval(run, 60000);
        } else {
            const loop = () => {
                run();
                setTimeout(loop, 60000);
            };
            setTimeout(loop, 60000);
        }
    } catch (error) {
        logger.warn(`设置定时任务失败: ${error}`);
    }
}

mc.listen("onServerStarted", () => {
    ensureConfigMigrated();
    runLegacyMigration();
    const stats = statsSnapshot();
    logger.info(`${PLUGIN_NAME} v${PLUGIN_VERSION.join(".")} loaded`);
    logger.info(`官方在售 ${stats.officialSells} · 回收 ${stats.officialRecycles} · 店铺 ${stats.shops} 家(营业 ${stats.openShops}) · 在售商品 ${stats.itemTypes} 种`);
    startPeriodicTasks();
});


// === warehouse (个人仓库) ===
function warehouseSlots(xuid) {
    const conf = getWarehouseConfig();
    const record = warehouseOf(xuid);
    return record && record.purchased ? conf.buyoutSlots : conf.maxSlots;
}

function warehouseItems(record) {
    return record && Array.isArray(record.items) ? record.items : [];
}

function makeWarehouseId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 读一次 → 改同一份 → 存同一份（JsonConfigFile.get 在真引擎里每次返回新副本，
// 若存的时候又去 get 一遍，会把刚做的修改覆盖掉）
function mutateWarehouse(xuid, playerName, mutator) {
    const key = String(xuid || "");
    if (!key) return { ok: false, error: "无法识别账号" };
    const map = warehouseMap();
    if (!isPlainObject(map[key])) {
        map[key] = {
            playerName: String(playerName || ""),
            purchased: false,
            items: [],
            updatedAt: Date.now(),
        };
    } else if (playerName && map[key].playerName !== playerName) {
        map[key].playerName = String(playerName);
    }
    const record = map[key];
    if (!Array.isArray(record.items)) record.items = [];
    const result = mutator(record) || {};
    if (result.ok === false) return result; // 失败不写盘
    record.updatedAt = Date.now();
    warehouseStore.set("players", map); // 存的就是刚改过的那一份
    return Object.assign({ ok: true }, result);
}

function slotsOfRecord(record) {
    const conf = getWarehouseConfig();
    return record && record.purchased ? conf.buyoutSlots : conf.maxSlots;
}

function storeToWarehouse(xuid, playerName, entry) {
    const conf = getWarehouseConfig();
    if (!conf.enabled) return { ok: false, error: "仓库功能已关闭" };
    // 0 件不能进仓库（Math.max(1, 0) 会凭空造出一件物品）
    const qty = toInt(entry.quantity, 0);
    if (qty <= 0) return { ok: false, error: "入库数量无效" };
    const key = listingKey(entry.type, entry.nbt);
    return mutateWarehouse(xuid, playerName, (record) => {
        let hit = null;
        for (const item of record.items) {
            if (listingKey(item.type, item.nbt) === key && String(item.description || "") === String(entry.description || "")) {
                hit = item;
                break;
            }
        }
        if (hit) {
            hit.quantity = toInt(hit.quantity, 0) + qty;
        } else {
            const slots = slotsOfRecord(record);
            if (record.items.length >= slots) {
                return { ok: false, error: `仓库已满（${record.items.length}/${slots} 格）` };
            }
            record.items.push({
                id: makeWarehouseId(),
                type: String(entry.type || ""),
                aux: toInt(entry.aux, 0),
                nbt: String(entry.nbt || ""),
                name: String(entry.name || entry.type || "物品"),
                quantity: qty,
                description: limitText(entry.description, 60),
                at: Date.now(),
            });
        }
        return { ok: true, used: record.items.length, slots: slotsOfRecord(record) };
    });
}

function takeFromWarehouse(xuid, itemId, amount) {
    // 数量必须先校验：负数被 Math.max(1, ...) 钳成 1 会多扣玩家东西
    const want = amount === undefined || amount === null ? null : toInt(amount, NaN);
    if (want !== null && (isNaN(want) || want <= 0)) return { ok: false, error: "取出数量无效" };
    return mutateWarehouse(xuid, "", (record) => {
        const idx = record.items.findIndex((item) => String(item.id) === String(itemId));
        if (idx < 0) return { ok: false, error: "该物品已不在仓库" };
        const item = record.items[idx];
        const qty = toInt(item.quantity, 0);
        const take = want === null ? qty : Math.min(qty, want);
        if (take <= 0) return { ok: false, error: "取出数量无效" };
        const left = qty - take;
        if (left <= 0) record.items.splice(idx, 1);
        else item.quantity = left;
        return { ok: true, item, take };
    });
}

// 买断：把"判定 + 扣款 + 落标记"收进同一次 mutate 里，避免并发/连点重复扣款
function buyoutWarehouse(xuid) {
    const conf = getWarehouseConfig();
    return mutateWarehouse(xuid, "", (record) => {
        if (record.purchased) return { ok: false, error: "已经买断过了" };
        if (conf.buyoutPrice > 0) {
            if (economy.get(xuid) < conf.buyoutPrice) {
                return { ok: false, error: `买断需要 ${conf.buyoutPrice} ${economy.name}，余额不足` };
            }
            if (!economy.reduce(xuid, conf.buyoutPrice)) {
                return { ok: false, error: "扣款失败" };
            }
        }
        record.purchased = true;
        return { ok: true, price: conf.buyoutPrice, slots: conf.buyoutSlots };
    });
}

function showWarehouse(player, page) {
    const conf = getWarehouseConfig();
    if (!conf.enabled) {
        player.tell("§c仓库功能已关闭");
        showMainMenu(player);
        return;
    }
    const record = ensureWarehouse(player.xuid, player.realName || player.name || "");
    const items = warehouseItems(record);
    const slots = warehouseSlots(player.xuid);
    const view = pageSlice(items, page, 8);
    const purchased = Boolean(record && record.purchased);
    let summary = `§e我的仓库 §f${items.length}/${slots} 格`;
    summary += purchased ? " §a(已买断)" : ` §f(买断价 ${conf.buyoutPrice} ${economy.name} → ${conf.buyoutSlots} 格)`;
    summary += `\n§f第 ${view.page}/${view.pages} 页 · 点物品取出`;
    pagedList(player, {
        title: "个人仓库",
        summary,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: false,
        render: (entry) => `§b${entry.name} §fx${toInt(entry.quantity, 0)}${entry.description ? `\n§f${limitText(entry.description, 30)}` : ""}`,
        icon: (entry) => itemIconOf(entry.type, entry.aux, ""),
        onItem: (entry) => showWarehouseItemMenu(player, entry, view.page),
        onPrev: () => showWarehouse(player, view.page - 1),
        onNext: () => showWarehouse(player, view.page + 1),
        extraNav: [
            { label: "存入物品", icon: ICON.put, action: () => promptWarehouseStore(player, view.page) },
            purchased ? null : { label: "买断扩容", icon: ICON.money, action: () => promptWarehouseBuyout(player, view.page) },
        ].filter(Boolean),
        onBack: () => showMainMenu(player),
    });
}

function showWarehouseItemMenu(player, entry, page) {
    const entries = [
        { text: "§a取出全部", icon: ICON.take, action: () => withdrawWarehouseItem(player, entry, 0, page) },
        { text: "§e取出指定数量", icon: ICON.edit, action: () => promptWarehouseWithdraw(player, entry, page) },
        { text: "§f返回", icon: ICON.home, action: () => showWarehouse(player, page) },
    ];
    sendListForm(player, "仓库物品",
        `§e物品：§a${entry.name}\n§e数量：§b${toInt(entry.quantity, 0)}\n§e备注：${entry.description ? "§f" + entry.description : "§f无"}`
        + `\n§f存入时间：${formatStamp(entry.at)}`,
        entries.map((item) => item.text), entries.map((entry) => entry.icon || ""), (index) => {
            const item = entries[index];
            if (item) item.action();
        });
}

function promptWarehouseWithdraw(player, entry, page) {
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "取出物品"));
    form.addLabel(`§e${entry.name}\n§e仓库持有：§b${toInt(entry.quantity, 0)}`);
    form.addInput("取出数量", "留空=全部", String(toInt(entry.quantity, 0)));
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showWarehouse(pl, page);
            return;
        }
        const raw = String(fieldAt(data, 1, 0) === undefined || fieldAt(data, 1, 0) === null ? "" : fieldAt(data, 1, 0)).trim();
        const qty = raw === "" ? 0 : toInt(raw, -1);
        if (qty < 0) {
            pl.tell("§c数量必须是正整数");
            return;
        }
        withdrawWarehouseItem(pl, entry, qty, page);
    }), `取出物品`);
}

function withdrawWarehouseItem(player, entry, qty, page) {
    const amount = qty > 0 ? qty : toInt(entry.quantity, 0);
    if (amount <= 0) {
        player.tell("§c数量必须是正整数");
        return;
    }
    if (!canReceive(player, entry.nbt, amount)) {
        player.tell("§c背包空间不足，请先清理背包");
        showWarehouse(player, page);
        return;
    }
    const result = takeFromWarehouse(player.xuid, entry.id, amount);
    if (!result.ok) {
        player.tell(`§c${result.error}`);
        showWarehouse(player, page);
        return;
    }
    if (!giveItems(player, entry.nbt, result.take)) {
        // 回滚必须确认真的放回去了；仓库满时退回会失败，此时再把物品塞回原仓库条目
        const back = storeToWarehouse(player.xuid, player.realName || player.name || "", {
            type: entry.type, aux: entry.aux, nbt: entry.nbt,
            name: entry.name, quantity: result.take, description: entry.description,
        });
        if (!back.ok) {
            const forced = mutateWarehouse(player.xuid, player.realName || player.name || "", (record) => {
                // 这是刚刚取出去的东西，允许超出容量上限放回，避免物品凭空消失
                record.items.push({
                    id: makeWarehouseId(),
                    type: String(entry.type || ""),
                    aux: toInt(entry.aux, 0),
                    nbt: String(entry.nbt || ""),
                    name: String(entry.name || entry.type || "物品"),
                    quantity: result.take,
                    description: limitText(entry.description, 60),
                    at: Date.now(),
                });
                return { ok: true };
            });
            if (!forced.ok) {
                logger.error(`取出仓库回滚失败，需要管理员补偿：${entry.name} x${result.take}（玩家 ${player.xuid}）`);
                player.tell(`§c背包空间异常，物品回退失败，请联系管理员（${entry.name} x${result.take}）`);
                showWarehouse(player, page);
                return;
            }
        }
        player.tell("§c背包空间异常，物品已退回仓库");
    } else {
        player.tell(`§a已取出 §d${entry.name} x${result.take}`);
    }
    showWarehouse(player, page);
}

function promptWarehouseStore(player, page) {
    const record = ensureWarehouse(player.xuid, player.realName || player.name || "");
    const used = warehouseItems(record).length;
    const slots = warehouseSlots(player.xuid);
    if (used >= slots) {
        player.tell(`§c仓库已满（${used}/${slots}），可买断扩容`);
        showWarehouse(player, page);
        return;
    }
    const stacks = listInventoryStacks(player, false);
    let invSize = -1;
    try {
        const probe = player.getInventory();
        invSize = probe && probe.size !== undefined ? Number(probe.size) : -2;
    } catch (error) {
        invSize = -3;
    }
    dbg(`存入页: 背包槽位=${invSize} 可入堆叠=${stacks.length} 已用=${used}/${slots}`);
    if (!stacks.length) {
        dbg("存入页: 背包里列举不到任何堆叠（若背包其实有东西 → 枚举失败，需看 getInventory/size）");
        player.tell("§e背包里没有可存入的物品");
        showWarehouse(player, page);
        return;
    }
    const texts = stacks.map((stack) => `§b${stack.name} §fx${stack.count}`);
    texts.push("§f← 返回仓库");
    sendListForm(player, "存入物品",
        `§e选择要存入的物品 §f(已用 ${used}/${slots} 格，同种物品会堆叠)`, texts,
        stacks.map((stack) => itemIconOf(stack.type, stack.aux, "")).concat([ICON.home]), (index) => {
            if (index >= stacks.length) {
                showWarehouse(player, page);
                return;
            }
            promptWarehouseStoreForm(player, stacks[index], page);
        });
}

function promptWarehouseStoreForm(player, stack, page) {
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "存入物品"));
    form.addLabel(`§e${stack.name}\n§e背包持有：§b${stack.count}`);
    form.addInput("存入数量", "最多 " + stack.count, String(stack.count));
    form.addInput("备注（可选）", "如：待送人", "");
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showWarehouse(pl, page);
            return;
        }
        dbg(`存入回调 data=${JSON.stringify(data)}`);
        const qtyRaw = String(fieldAt(data, 2, 0) === undefined || fieldAt(data, 2, 0) === null ? "" : fieldAt(data, 2, 0)).trim();
        const qty = qtyRaw === "" ? -1 : toInt(qtyRaw, -1);
        if (qty <= 0 || qty > stack.count) {
            pl.tell(`§c数量必须是 1 ~ ${stack.count}`);
            showWarehouse(pl, page);
            return;
        }
        const description = String(fieldAt(data, 2, 1) === undefined || fieldAt(data, 2, 1) === null ? "" : fieldAt(data, 2, 1)).trim();
        dbg(`存入 qty=${qty} desc=${description} 堆叠=${stack.name} key=${stack.key}`);
        if (!removeMatching(pl, stack.key, qty)) {
            dbg("存入失败: removeMatching 扣背包失败（key 不匹配？）");
            pl.tell("§c从背包扣除物品失败，请重试");
            return;
        }
        const result = storeToWarehouse(pl.xuid, pl.realName || pl.name || "", {
            type: stack.type, aux: stack.aux, nbt: stack.nbt,
            name: stack.name, quantity: qty, description,
        });
        if (!result.ok) {
            dbg(`存入失败: ${result.error}`);
            // 回滚：退回背包；退不回去就当成"不存了"，用强制写回避免物品消失
            const back = giveItemsPartial(pl, stack.nbt, qty);
            if (back.given < qty) {
                const lost = qty - back.given;
                const forced = mutateWarehouse(pl.xuid, pl.realName || pl.name || "", (record) => {
                    record.items.push({
                        id: makeWarehouseId(),
                        type: String(stack.type || ""),
                        aux: toInt(stack.aux, 0),
                        nbt: String(stack.nbt || ""),
                        name: String(stack.name || stack.type || "物品"),
                        quantity: lost,
                        description: limitText(description, 60),
                        at: Date.now(),
                    });
                    return { ok: true };
                });
                if (!forced.ok) {
                    logger.error(`存入回滚失败，需要管理员补偿：${stack.name} x${lost}（玩家 ${pl.xuid}）`);
                    pl.tell(`§c${result.error}，且物品回退失败，请联系管理员`);
                    showWarehouse(pl, page);
                    return;
                }
                pl.tell(`§c${result.error}（退回背包失败的 ${lost} 个已放回仓库）`);
                showWarehouse(pl, page);
                return;
            }
            pl.tell(`§c${result.error}`);
        } else {
            dbg(`存入成功: ${result.used}/${result.slots} 格`);
            pl.tell(`§a已存入 §d${stack.name} x${qty}§a（${result.used}/${result.slots} 格）`);
            pushNotification(pl.xuid, "warehouse", `存入 ${stack.name} x${qty} 到仓库`, true);
        }
        showWarehouse(pl, page);
    }), `存入物品`);
}

function promptWarehouseBuyout(player, page) {
    const conf = getWarehouseConfig();
    sendListForm(player, "买断仓库扩容",
        `§e一次性买断后永久解锁 §b${conf.buyoutSlots} §e格仓库\n§e价格：§6${conf.buyoutPrice} ${economy.name}\n§e你的余额：§6${economy.get(player.xuid)} ${economy.name}`,
        ["确认买断", "再想想"], [ICON.money, ICON.home], (index) => {
            if (index !== 0) {
                showWarehouse(player, page);
                return;
            }
            const result = buyoutWarehouse(player.xuid);
            if (!result.ok) {
                player.tell(`§c${result.error}`);
            } else {
                player.tell(`§a仓库已买断，容量提升到 §b${result.slots} §a格`);
                player.sendToast("仓库扩容", `容量已提升到 ${result.slots} 格`);
            }
            showWarehouse(player, page);
        });
}

// === purchase requests (悬赏求购) ===
// 按"类型 + 归一化 NBT"统计背包（求购履约用，避免把不同 NBT 的同类物品混在一起）
function inventoryCountByKey(player, key) {
    let total = 0;
    forEachInventoryItem(player, (item) => {
        if (listingKey(String(item.type || ""), itemNbtString(item)) === key) total += toInt(item.count, 0);
    });
    return total;
}

function inventoryCountByType(player, type) {
    let total = 0;
    forEachInventoryItem(player, (item) => {
        if (String(item.type || "") === String(type)) total += toInt(item.count, 0);
    });
    return total;
}

function generateRequestId() {
    return `R${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

function requestExpiryMs() {
    return getRequestConfig().expiryHours * 3600 * 1000;
}

function requestExpiresAt(request) {
    return toInt(request.expiresAt, 0) || (toInt(request.createdTime, 0) + requestExpiryMs());
}

function archiveRequest(request) {
    const list = activeRequests().filter((item) => String(item.id) !== String(request.id));
    saveActiveRequests(list);
    appendRequestHistory([request]);
}

// 只往历史里追加（不再重读/回写进行中列表），供批量归档使用，避免覆盖刚发生的改动
function appendRequestHistory(items) {
    if (!items || !items.length) return;
    const history = requestHistory();
    for (const item of items) history.push(item);
    while (history.length > 300) history.shift();
    saveRequestHistory(history);
}

function createRequest(player, payload) {
    const conf = getRequestConfig();
    if (!conf.enabled) return { ok: false, error: "求购功能已关闭" };
    const priceRaw = String(payload.priceEach === undefined || payload.priceEach === null ? "" : payload.priceEach).trim();
    const qtyRaw = String(payload.quantity === undefined || payload.quantity === null ? "" : payload.quantity).trim();
    if (priceRaw === "" || qtyRaw === "" || isNaN(Number(priceRaw)) || isNaN(Number(qtyRaw))) {
        return { ok: false, error: "单价与数量必须是正整数" };
    }
    const priceEach = clampInt(priceRaw, 1, 1000000000, -1);
    const quantity = clampInt(qtyRaw, 1, 1000000, -1);
    if (priceEach < 1 || quantity < 1) return { ok: false, error: "单价与数量必须是正整数" };
    const totalAmount = priceEach * quantity;
    const totalCost = totalAmount + conf.fee;
    const xuid = String(player.xuid || "");
    if (!xuid) return { ok: false, error: "无法识别账号" };
    if (economy.get(xuid) < totalCost) {
        return { ok: false, error: `余额不足：需要 ${totalCost} ${economy.name}（含手续费 ${conf.fee}），当前 ${economy.get(xuid)}` };
    }
    if (!economy.reduce(xuid, totalCost)) return { ok: false, error: "扣款失败" };
    const itemType = String(payload.itemType || "");
    // 记下"要的到底是哪一种"（含 NBT / aux）：履约时按它收货、也按它发货，
    // 否则会把附魔/命名的同类物品当成普通物品收走
    const nbt = String(payload.itemNbt || "").trim();
    const request = {
        id: generateRequestId(),
        itemName: String(payload.itemName || payload.itemType || "物品"),
        itemType,
        itemNbt: nbt || catalogNbtFor({ fullName: itemType, aux: toInt(payload.itemAux, 0) }),
        itemAux: toInt(payload.itemAux, 0),
        requesterName: String(player.realName || player.name || ""),
        requesterXuid: xuid,
        priceEach,
        quantity,
        totalAmount,
        remark: limitText(payload.remark, 60),
        createdTime: Date.now(),
        status: "active",
        expiresAt: Date.now() + requestExpiryMs(),
    };
    const list = activeRequests();
    list.push(request);
    saveActiveRequests(list);
    if (conf.notifyAll) {
        broadcastAll("§3新求购订单", `${request.requesterName} 求购 ${request.itemName} x${quantity}，单价 ${priceEach} ${economy.name}`);
    }
    return { ok: true, request, totalCost };
}

// 可退金额 = 剩余未履约部分 + 手续费（部分履约后取消，不能把已交货的钱也退了）
function requestRefund(request) {
    const remaining = Math.max(0, toInt(request.quantity, 0));
    return toInt(request.priceEach, 0) * remaining + getRequestConfig().fee;
}

function cancelRequestById(xuid, requestId) {
    const list = activeRequests();
    const idx = list.findIndex((item) => String(item.id) === String(requestId));
    if (idx < 0) return { ok: false, error: "求购订单不存在或已结束" };
    const request = list[idx];
    if (String(request.requesterXuid) !== String(xuid)) return { ok: false, error: "只能取消自己的求购订单" };
    request.status = "cancelled";
    request.closedTime = Date.now();
    archiveRequest(request);
    const refund = requestRefund(request);
    const refunded = economy.add(xuid, refund);
    return { ok: true, request, refund, refunded };
}

// 履约交货：只收"订单指定的那一种"（类型 + NBT），并把收到的同一种发给求购方，
// 避免把附魔/改名物品与普通物品混着收、混着发。
function fulfillRequest(player, request, qty) {
    const sellerXuid = String(player.xuid || "");
    const sellerName = String(player.realName || player.name || "");
    if (!sellerXuid) return { ok: false, error: "无法识别账号" };
    // 订单状态必须现查现用：可能已经被取消 / 到期退款 / 被别的玩家履约完了
    const live = activeRequests().find((item) => String(item.id) === String(request.id));
    if (!live) return { ok: false, error: "该求购订单已结束" };
    if (String(live.status || "active") !== "active") return { ok: false, error: "该求购订单已结束" };
    if (Date.now() > requestExpiresAt(live)) return { ok: false, error: "该求购订单已到期" };
    if (sellerXuid === String(live.requesterXuid)) return { ok: false, error: "不能履约自己的求购" };

    const amount = clampInt(qty, 1, toInt(live.quantity, 0), -1);
    if (amount <= 0) return { ok: false, error: "履约数量无效" };

    // 订单要的东西：老订单没有 itemNbt，退化为"背包里第一种同类物品"
    let nbt = String(live.itemNbt || "");
    let aux = toInt(live.itemAux, 0);
    if (!nbt) {
        const sample = listInventoryStacks(player, false).find((stack) => stack.type === live.itemType);
        if (!sample) return { ok: false, error: `背包里没有 ${live.itemName}` };
        nbt = sample.nbt;
        aux = toInt(sample.aux, 0);
    }
    const key = listingKey(String(live.itemType), nbt);
    const have = inventoryCountByKey(player, key);
    if (have < amount) {
        return { ok: false, error: `背包中符合该订单要求的 ${live.itemName} 只有 ${have} 个` };
    }
    if (!removeMatching(player, key, amount)) {
        return { ok: false, error: "扣除背包物品失败，请重试" };
    }
    const name = String(live.itemName || live.itemType);

    const payout = toInt(live.priceEach, 0) * amount;
    if (!economy.add(sellerXuid, payout)) {
        // 回滚：把物品还给履约者
        if (!giveItems(player, nbt, amount)) {
            logger.error(`履约回滚失败，需要管理员补偿：${name} x${amount}（玩家 ${sellerXuid}）`);
            return { ok: false, error: "款项发放失败，且物品退还失败，请联系管理员" };
        }
        return { ok: false, error: "款项发放失败，已归还物品" };
    }

    // 发货：求购方在线且背包够就直接给，否则进仓库
    const desc = `求购 #${live.id} 履约`;
    let delivered = "warehouse";
    const requester = mc.getPlayer(String(live.requesterXuid));
    if (requester && canReceive(requester, nbt, amount) && giveItems(requester, nbt, amount)) {
        delivered = "inventory";
    } else {
        const stored = storeToWarehouse(live.requesterXuid, live.requesterName, {
            type: live.itemType, aux, nbt, name, quantity: amount, description: desc,
        });
        if (!stored.ok) {
            // 仓库也放不下：退回履约者并终止
            economy.reduce(sellerXuid, payout);
            if (!giveItems(player, nbt, amount)) {
                logger.error(`履约回滚失败，需要管理员补偿：${name} x${amount}（玩家 ${sellerXuid}）`);
                return { ok: false, error: `对方仓库也已满：${stored.error}，且物品退还失败，请联系管理员` };
            }
            return { ok: false, error: `对方仓库也已满：${stored.error}` };
        }
    }

    // 写回收到的这份"最新订单"（而不是调用方传来的旧快照）
    live.quantity = toInt(live.quantity, 0) - amount;
    live.fulfilled = toInt(live.fulfilled, 0) + amount;
    const done = live.quantity <= 0;
    if (done) {
        live.status = "fulfilled";
        live.closedTime = Date.now();
        archiveRequest(live);
    } else {
        const list = activeRequests();
        const idx = list.findIndex((item) => String(item.id) === String(live.id));
        if (idx >= 0) {
            list[idx].quantity = live.quantity;
            list[idx].fulfilled = live.fulfilled;
            saveActiveRequests(list);
        } else {
            // 极端情况：订单在本次履约过程中被移除，退回已发的钱与货，避免凭空增发
            logger.error(`履约时订单 #${live.id} 已不在进行中列表，已回滚本次交易`);
            economy.reduce(sellerXuid, payout);
            giveItems(player, nbt, amount);
            return { ok: false, error: "订单状态已变化，本次履约已撤销" };
        }
    }

    pushNotification(String(live.requesterXuid), "fulfilled",
        `${sellerName} 履约 ${name} x${amount}，${delivered === "inventory" ? "已放入背包" : "已存入仓库"}${done ? "，订单已完成" : "，剩余 " + live.quantity}`, true);
    if (requester) {
        try {
            requester.tell(`§a求购 #${live.id} 已履约：§d${name} x${amount}${done ? "（订单完成）" : `§a，剩余 ${live.quantity}`}`);
        } catch (error) {
            // 忽略
        }
    }
    pushNotification(sellerXuid, "fulfilled", `求购 #${live.id} 履约成功，收入 ${payout} ${economy.name}`, true);
    return { ok: true, payout, amount, delivered, done };
}

function checkExpiredRequests() {
    const list = activeRequests();
    if (!list.length) return;
    const now = Date.now();
    const kept = [];
    const expired = [];
    for (const request of list) {
        if (String(request.status || "active") !== "active" || now <= requestExpiresAt(request)) {
            kept.push(request);
            continue;
        }
        request.status = "expired";
        request.closedTime = now;
        expired.push(request);
        const refund = requestRefund(request);
        economy.add(String(request.requesterXuid), refund);
        pushNotification(String(request.requesterXuid), "expired",
            `求购 #${request.id}（${request.itemName}）已到期，已退还 ${refund} ${economy.name}`, true);
        const online = mc.getPlayer(String(request.requesterXuid));
        if (online) {
            try {
                online.sendToast("求购到期", `#${request.id} 已到期，退款 ${refund}`);
            } catch (error) {
                // 忽略
            }
        }
    }
    if (!expired.length) return;
    // 先写"剔除到期项后的进行中列表"，再统一追加历史：
    // 不用 archiveRequest（它会重读列表再回写，可能把期间的新改动覆盖掉）
    saveActiveRequests(kept);
    appendRequestHistory(expired);
}

// --- 求购 UI ---
function showRequestsHub(player) {
    const conf = getRequestConfig();
    if (!conf.enabled) {
        player.tell("§c求购功能已关闭");
        showMainMenu(player);
        return;
    }
    const mine = activeRequests().filter((item) => String(item.requesterXuid) === String(player.xuid));
    const entries = [
        { text: "§a发布求购\n§f花钱悬赏，等人交货", icon: ICON.add, action: () => promptPublishRequest(player) },
        { text: `§b求购大厅 §f(${activeRequests().length} 单进行中)`, icon: ICON.book, action: () => showActiveRequests(player, 1) },
        { text: `§e我的求购 §f(${mine.length} 单)`, icon: ICON.user, action: () => showActiveRequests(player, 1, true) },
        { text: "§f历史记录", icon: ICON.timer, action: () => showRequestHistory(player, 1) },
        { text: "§c返回主菜单", icon: ICON.home, action: () => showMainMenu(player) },
    ];
    sendListForm(player, "悬赏 · 求购",
        `${balanceLine(player)}\n§e发布时全额托管，履约后把钱付给交货方；${conf.expiryHours} 小时未完成自动退款。\n§e手续费：§6${conf.fee} ${economy.name}`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function promptPublishRequest(player) {
    showCatalogPicker(player, "发布求购 · 选物品", "", (entry) => promptPublishForm(player, entry), () => showRequestsHub(player));
}

function promptPublishForm(player, entry) {
    const conf = getRequestConfig();
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "发布求购"));
    form.addLabel(`§e物品：§a${entry.name || entry.fullName}\n§f${entry.fullName}`
        + `\n§e手续费：§6${conf.fee} ${economy.name} §f(${conf.expiryHours} 小时后自动退款)`
        + `\n§e余额：§6${economy.get(player.xuid)} ${economy.name}\n§f货到付款：交货方会把东西放进你的仓库`);
    form.addInput("单价（金币）", "正整数", "10");
    form.addInput("数量", "正整数", "1");
    form.addInput("备注（可选）", "如：大量收，长期收", "");
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showRequestsHub(pl);
            return;
        }
        const priceEach = toInt(fieldAt(data, 3, 0), 0);
        const quantity = toInt(fieldAt(data, 3, 1), 0);
        if (priceEach <= 0 || quantity <= 0) {
            pl.tell("§c单价与数量必须是正整数");
            return;
        }
        const result = createRequest(pl, {
            itemName: String(entry.name || entry.fullName || entry.type || "物品"),
            itemType: String(entry.fullName || entry.type || ""),
            itemNbt: catalogNbtFor(entry),
            itemAux: toInt(entry.aux, 0),
            priceEach,
            quantity,
            remark: String(fieldAt(data, 3, 2) || ""),
        });
        if (!result.ok) {
            pl.tell(`§c${result.error}`);
            return;
        }
        pl.sendToast("求购已发布", `${result.request.itemName} x${quantity}`);
        pl.tell(`§a已发布求购 §d${result.request.itemName} x${quantity} §e共托管 ${result.totalCost} ${economy.name} §f(单号 ${result.request.id})`);
        showRequestsHub(pl);
    }), `发布求购`);
}

// 求购单指定的"类型 + NBT"键；老订单没有 NBT 时返回空串（调用方退化为按类型处理）
function requestItemKey(request) {
    if (!isPlainObject(request)) return "";
    const type = String(request.itemType || "");
    if (!type) return "";
    const nbt = String(request.itemNbt || "").trim();
    if (!nbt) return "";
    return listingKey(type, nbt);
}

function requestRow(request, viewerXuid) {
    const left = Math.max(0, requestExpiresAt(request) - Date.now());
    const isMine = String(request.requesterXuid) === String(viewerXuid);
    return `§b${request.itemName} §fx${toInt(request.quantity, 0)}`
        + `\n§6${toInt(request.priceEach, 0)} ${economy.name}/个 §f| ${request.requesterName}${isMine ? " §a(我的)" : ""} §f| 剩${formatDurationShort(Math.floor(left / 1000))}`;
}

function showActiveRequests(player, page, onlyMine) {
    const all = activeRequests().filter((item) => !onlyMine || String(item.requesterXuid) === String(player.xuid));
    const view = pageSlice(all, page, 8);
    pagedList(player, {
        title: onlyMine ? "我的求购" : "求购大厅",
        summary: `§e共 ${all.length} 单进行中 · 第 ${view.page}/${view.pages} 页\n§f选中可履约（你有货时）或取消（自己的单）`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: false,
        render: (request) => requestRow(request, player.xuid),
        icon: (request) => itemIconOf(request.itemType, 0, ""),
        onItem: (request) => showRequestDetail(player, request, view.page, onlyMine),
        onPrev: () => showActiveRequests(player, view.page - 1, onlyMine),
        onNext: () => showActiveRequests(player, view.page + 1, onlyMine),
        onBack: () => showRequestsHub(player),
    });
}

function showRequestDetail(player, request, page, onlyMine) {
    const fresh = activeRequests().find((item) => String(item.id) === String(request.id));
    if (!fresh) {
        player.tell("§e该订单已结束");
        showActiveRequests(player, page, onlyMine);
        return;
    }
    const isMine = String(fresh.requesterXuid) === String(player.xuid);
    // 只统计"符合订单要求的那一种"（类型 + NBT），避免显示能履约但实际交不了
    const key = requestItemKey(fresh);
    const have = key ? inventoryCountByKey(player, key) : inventoryCountByType(player, fresh.itemType);
    const total = toInt(fresh.priceEach, 0) * toInt(fresh.quantity, 0);
    const entries = [];
    if (!isMine && have > 0) {
        entries.push({ text: `§a履约交货 §f(我有 ${have} 个)`, icon: ICON.trade, action: () => promptFulfill(player, fresh, page, onlyMine) });
    }
    if (isMine) {
        entries.push({ text: "§c取消并退款", icon: ICON.trash, action: () => confirmCancelRequest(player, fresh, page, onlyMine) });
    }
    entries.push({ text: "§f返回", icon: ICON.home, action: () => showActiveRequests(player, page, onlyMine) });
    sendListForm(player, "求购订单",
        `§e单号：§f#${fresh.id}\n§e物品：§a${fresh.itemName} §f(${fresh.itemType})`
        + `\n§e数量：§b${toInt(fresh.quantity, 0)} §f| §e单价：§6${toInt(fresh.priceEach, 0)} §f| §e总额：§6${total} ${economy.name}`
        + `\n§e求购人：§b${fresh.requesterName}`
        + (fresh.remark ? `\n§e备注：§f${fresh.remark}` : "")
        + `\n§f剩余 ${formatDurationShort(Math.floor(Math.max(0, requestExpiresAt(fresh) - Date.now()) / 1000))} · 我的库存 ${have} 个`,
        entries.map((entry) => entry.text), entries.map((entry) => entry.icon || ""), (index) => {
            const entry = entries[index];
            if (entry) entry.action();
        });
}

function promptFulfill(player, request, page, onlyMine) {
    const key = requestItemKey(request);
    const have = key ? inventoryCountByKey(player, key) : inventoryCountByType(player, request.itemType);
    const maxQty = Math.min(have, toInt(request.quantity, 0));
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "履约交货"));
    form.addLabel(`§e${request.itemName}\n§e我的库存：§b${have} §f| 订单需求：§b${request.quantity}`
        + `\n§e每件收入：§6${toInt(request.priceEach, 0)} ${economy.name}`
        + `\n§f交货后：钱立刻入账，货直接进对方背包/仓库`);
    form.addInput("交货数量", `最多 ${maxQty}`, String(maxQty));
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showActiveRequests(pl, page, onlyMine);
            return;
        }
        const qty = toInt(fieldAt(data, 1, 0), 0);
        if (qty <= 0) {
            pl.tell("§c交货数量必须是正整数");
            return;
        }
        const result = fulfillRequest(pl, request, qty);
        if (!result.ok) {
            pl.tell(`§c${result.error}`);
        } else {
            pl.sendToast("履约成功", `+${result.payout} 金币`);
            pl.tell(`§a交货成功：§d${request.itemName} x${result.amount} §e收入 ${result.payout} ${economy.name}`);
        }
        if (result.done) showRequestsHub(pl);
        else showActiveRequests(pl, page, onlyMine);
    }), `履约交货`);
}

function confirmCancelRequest(player, request, page, onlyMine) {
    // 与实际退款口径保持一致：部分履约后只能退"剩余部分 + 手续费"
    const refund = requestRefund(request);
    sendListForm(player, "取消求购",
        `§c确认取消求购 §e${request.itemName} x${request.quantity} §c吗？\n§e将退还 §6${refund} ${economy.name}`,
        ["确认取消", "再想想"], [ICON.trash, ICON.home], (index) => {
            if (index !== 0) {
                showActiveRequests(player, page, onlyMine);
                return;
            }
            const result = cancelRequestById(player.xuid, request.id);
            if (!result.ok) player.tell(`§c${result.error}`);
            else player.tell(`§a已取消并退还 §6${result.refund} ${economy.name}${result.refunded ? "" : "（入账失败，请联系管理员）"}`);
            showRequestsHub(player);
        });
}

function showRequestHistory(player, page) {
    const rows = requestHistory().slice().reverse();
    const view = pageSlice(rows, page, 8);
    pagedList(player, {
        title: "求购历史",
        summary: `§f共 ${rows.length} 条（已完成 / 已取消 / 已到期）· 第 ${view.page}/${view.pages} 页`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: false,
        render: (request) => {
            const status = { fulfilled: "§a完成", cancelled: "§e取消", expired: "§c到期" }[request.status] || request.status;
            return `${status} §b${request.itemName} §fx${toInt(request.quantity, 0)}\n§f${request.requesterName} · ${formatStamp(request.closedTime || request.createdTime)}`;
        },
        icon: (request) => itemIconOf(request.itemType, 0, ""),
        onItem: () => showRequestHistory(player, page),
        onPrev: () => showRequestHistory(player, view.page - 1),
        onNext: () => showRequestHistory(player, view.page + 1),
        onBack: () => showRequestsHub(player),
    });
}

// === notifications UI (提醒箱) ===
const NOTIFY_LABELS = {
    sold: "店铺售出",
    fulfilled: "求购履约",
    expired: "求购到期",
    discount: "折扣变动",
    warehouse: "仓库",
    info: "通知",
};

function clearNotifications(xuid) {
    const key = String(xuid || "");
    const map = notifyMap();
    if (!isPlainObject(map[key])) return 0;
    const count = map[key].items ? map[key].items.length : 0;
    delete map[key];
    saveNotifyMap(map);
    return count;
}

function showNotifyInbox(player, page) {
    const rows = listNotifications(player.xuid);
    const unread = rows.filter((item) => !item.read).length;
    const view = pageSlice(rows, page, 8);
    pagedList(player, {
        title: "提醒箱",
        summary: `§e共 ${rows.length} 条提醒 §f(未读 ${unread}) · 第 ${view.page}/${view.pages} 页`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: false,
        render: (item) => {
            const tag = NOTIFY_LABELS[item.type] || "通知";
            const state = item.read ? "§f已读" : "§a未读";
            return `${state} §e[${tag}] §f${limitText(item.text, 44)}\n§f${formatStamp(item.ts)}`;
        },
        icon: (item) => {
            if (item.type === "sold") return ICON.money;
            if (item.type === "fulfilled") return ICON.trade;
            if (item.type === "expired") return ICON.timer;
            if (item.type === "discount") return ICON.discount;
            if (item.type === "warehouse") return ICON.warehouse;
            return ICON.bell;
        },
        onItem: (item) => showNotifyDetail(player, item, view.page),
        onPrev: () => showNotifyInbox(player, view.page - 1),
        onNext: () => showNotifyInbox(player, view.page + 1),
        extraNav: [
            { label: "全部标为已读", icon: ICON.book, action: () => { markAllRead(player.xuid); showNotifyInbox(player, view.page); } },
            { label: "清空提醒", icon: ICON.trash, action: () => clearNotifyConfirm(player, view.page) },
        ],
        onBack: () => showMainMenu(player),
    });
}

function showNotifyDetail(player, item, page) {
    if (!item.read) markAllRead(player.xuid);
    sendListForm(player, "提醒详情",
        `§e类型：§b${NOTIFY_LABELS[item.type] || "通知"}\n§e时间：§f${formatStamp(item.ts)}\n\n§f${item.text}`,
        ["返回提醒箱"], [ICON.home], () => showNotifyInbox(player, page));
}

function clearNotifyConfirm(player, page) {
    sendListForm(player, "清空提醒",
        "§c确认清空全部提醒记录吗？",
        ["确认清空", "取消"], [ICON.trash, ICON.home], (index) => {
            if (index === 0) {
                const count = clearNotifications(player.xuid);
                player.tell(`§a已清空 ${count} 条提醒`);
            }
            showNotifyInbox(player, page);
        });
}

// === batch operations + discounts (批量 / 折扣) ===
// scope: myshelf=我的货架 | official=官方在售 | recycle=回收清单
const batchState = {};

function batchStateOf(xuid, scope) {
    const key = `${xuid}|${scope}`;
    if (!isPlainObject(batchState[key])) {
        batchState[key] = { selected: [] };
    }
    if (!Array.isArray(batchState[key].selected)) batchState[key].selected = [];
    return batchState[key];
}

function toggleBatchSelection(xuid, scope, itemKey) {
    const state = batchStateOf(xuid, scope);
    const at = state.selected.indexOf(itemKey);
    if (at >= 0) state.selected.splice(at, 1);
    else state.selected.push(itemKey);
}

function batchRows(player, scope) {
    if (scope === "myshelf") {
        const shop = getShop(player.xuid);
        return shop ? shopListings(shop) : [];
    }
    if (scope === "official") return officialSellRows("", "全部");
    if (scope === "recycle") {
        const data = officialData();
        return Object.keys(data.recycleItems).map((key) => Object.assign({ key }, data.recycleItems[key]));
    }
    return [];
}

function filteredBatchRows(player, scope) {
    const state = batchStateOf(player.xuid, scope);
    let rows = batchRows(player, scope);
    const query = normalizePlayerKey(state.keyword);
    rows = rows.filter((item) => {
        if (state.category && state.category !== "全部" && String(item.category || "") !== state.category) return false;
        if (!query) return true;
        return String(item.name || "").toLowerCase().indexOf(query) >= 0;
    });
    if (scope === "recycle") rows = rows.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh"));
    return rows;
}

function withSelectedListings(player, scope, mutator) {
    const state = batchStateOf(player.xuid, scope);
    const keys = state.selected.slice();
    if (!keys.length) return { ok: false, error: "请先勾选至少一个物品" };
    let count = 0;
    if (scope === "myshelf") {
        const result = shopMutate(player.xuid, (shop) => {
            for (const key of keys) {
                const listing = isPlainObject(shop.items) ? shop.items[key] : null;
                if (isPlainObject(listing)) {
                    mutator(listing);
                    count++;
                }
            }
            return { ok: true };
        });
        if (!result.ok) return result;
    } else {
        const data = officialData();
        const bucket = scope === "official" ? data.purchaseItems : data.recycleItems;
        for (const key of keys) {
            if (isPlainObject(bucket[key])) {
                mutator(bucket[key]);
                count++;
            }
        }
        if (!count) return { ok: false, error: "选中的物品已不存在" };
        saveOfficialData(data);
    }
    if (!count) return { ok: false, error: "选中的物品已不在货架上" };
    state.selected = [];
    return { ok: true, count };
}

function showBatchList(player, scope, page) {
    const state = batchStateOf(player.xuid, scope);
    const rows = filteredBatchRows(player, scope);
    const view = pageSlice(rows, page, 10);
    const titles = { myshelf: "我的货架 · 批量", official: "官方在售 · 批量", recycle: "回收清单 · 批量" };
    const scopeDesc = {
        myshelf: "选中后可批量改价 / 打折 / 改分类 / 下架（下架退回背包）",
        official: "选中后可批量改价 / 打折 / 改分类 / 下架",
        recycle: "选中后可批量改价 / 改分类 / 移出清单",
    };
    const nav = [
        { label: `改价（已选 ${state.selected.length}）`, icon: ICON.edit, action: () => promptBatchPrice(player, scope, view.page) },
    ];
    if (scope !== "recycle") {
        nav.push({ label: "设置折扣", icon: ICON.discount, action: () => promptBatchDiscount(player, scope, view.page) });
    }
    nav.push({ label: "改分类", icon: ICON.filter, action: () => promptBatchCategory(player, scope, view.page) });
    nav.push({ label: "下架 / 移除", icon: ICON.trash, action: () => confirmBatchRemove(player, scope, view.page) });
    nav.push({ label: "清空选择", icon: ICON.refresh, action: () => { state.selected = []; showBatchList(player, scope, view.page); } });

    pagedList(player, {
        title: titles[scope] || "批量操作",
        summary: `§e${scopeDesc[scope]}\n§f共 ${rows.length} 项 · 已选 §a${state.selected.length} §f· 第 ${view.page}/${view.pages} 页`,
        items: view.rows,
        page: view.page,
        pages: view.pages,
        searchable: true,
        render: (item) => {
            const on = state.selected.indexOf(item.key) >= 0;
            const mark = on ? "§a[✓] " : "§f[　] ";
            const extra = scope === "recycle" ? "" : ` §6${toInt(item.price, 0)}`;
            const disc = discountActive(item) ? ` §d${discountText(item)}` : "";
            return `${mark}§b${item.name}${extra}${disc}`;
        },
        icon: (item) => listingIcon(item),
        onItem: (item) => {
            toggleBatchSelection(player.xuid, scope, item.key);
            showBatchList(player, scope, view.page);
        },
        onPrev: () => showBatchList(player, scope, view.page - 1),
        onNext: () => showBatchList(player, scope, view.page + 1),
        onSearch: () => promptSearch(player, titles[scope], state.keyword, (next) => {
            state.keyword = next;
            showBatchList(player, scope, 1);
        }),
        searchTop: true,
        searchLabel: "搜索物品",
        extraNav: nav,
        onBack: () => showBatchBack(player, scope),
    });
}

function showBatchBack(player, scope) {
    if (scope === "myshelf") showMyShelf(player, 1);
    else if (scope === "official") showOfficialSellAdmin(player, 1, "");
    else if (scope === "recycle") showOfficialRecycleAdmin(player, 1, "");
    else showAdminMenu(player);
}

function promptBatchPrice(player, scope, page) {
    const state = batchStateOf(player.xuid, scope);
    if (!state.selected.length) {
        player.tell("§c请先勾选至少一个物品");
        showBatchList(player, scope, page);
        return;
    }
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "批量改价"));
    form.addLabel(`§e已选 §b${state.selected.length} §e个物品\n§f原价不会被记录，改完直接生效`);
    form.addDropdown("方式", ["统一改成固定价", "按百分比调整（+/- %）"], 0);
    form.addInput("数值", "固定价填正整数；百分比填如 10 或 -20", "10");
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showBatchList(pl, scope, page);
            return;
        }
        const mode = toInt(fieldAt(data, 2, 0), 0) === 1 ? "percent" : "fixed";
        const value = Number(fieldAt(data, 2, 1));
        if (isNaN(value)) {
            pl.tell("§c数值无效");
            return;
        }
        const result = withSelectedListings(pl, scope, (listing) => {
            const active = discountActive(listing);
            const base = active ? toInt(listing.originalPrice, listing.price) : toInt(listing.price, 0);
            let nextBase = mode === "fixed" ? Math.floor(value) : Math.floor(base * (1 + value / 100));
            nextBase = Math.max(1, nextBase);
            if (active) {
                // 折扣生效中：改的是原价，现价按折扣比例重算
                listing.originalPrice = nextBase;
                listing.price = Math.max(1, Math.floor(nextBase * toInt(listing.discount, 10) / 10));
            } else {
                listing.price = nextBase;
                delete listing.originalPrice;
                delete listing.discount;
                delete listing.discountEndTime;
            }
        });
        if (!result.ok) pl.tell(`§c${result.error}`);
        else pl.tell(`§a已批量更新 ${result.count} 个物品的价格`);
        showBatchList(pl, scope, page);
    }), `批量改价`);
}

function promptBatchDiscount(player, scope, page) {
    const state = batchStateOf(player.xuid, scope);
    if (!state.selected.length) {
        player.tell("§c请先勾选至少一个物品");
        showBatchList(player, scope, page);
        return;
    }
    const conf = getDiscountConfig();
    const form = mc.newCustomForm();
    form.setTitle(buildFormTitle(TEXTURE_FORM_TEXT, "批量设置折扣"));
    form.addLabel(`§e已选 §b${state.selected.length} §e个物品\n§e折扣单位是“折”：7 = 打七折（按原价计算）\n§f到期自动恢复原价${conf.notifyAll ? "，并全服公告" : ""}`);
    form.addInput("折扣（1 ~ 9.9 折）", "如 7", "7");
    form.addInput("持续时间（分钟）", "如 60", "60");
    safeSend(player, () => player.sendForm(form, (pl, data) => {
        if (!data) {
            showBatchList(pl, scope, page);
            return;
        }
        const rate = Number(fieldAt(data, 2, 0));
        const minutes = toInt(fieldAt(data, 2, 1), 0);
        if (isNaN(rate) || rate < 1 || rate > 9.9) {
            pl.tell("§c折扣必须在 1 ~ 9.9 之间");
            return;
        }
        if (minutes <= 0) {
            pl.tell("§c持续时间必须是正整数");
            return;
        }
        const result = withSelectedListings(pl, scope, (listing) => applyDiscount(listing, rate, minutes));
        if (!result.ok) {
            pl.tell(`§c${result.error}`);
        } else {
            pl.tell(`§d已为 ${result.count} 个物品设置 ${rate} 折，持续 ${minutes} 分钟`);
            if (conf.notifyAll) {
                const label = scope === "official" ? "官方商店" : "店铺";
                broadcastAll("§d折扣开始", `${label} ${result.count} 个物品 ${rate} 折，限时 ${minutes} 分钟`);
            }
        }
        showBatchList(pl, scope, page);
    }), `批量设置折扣`);
}

function promptBatchCategory(player, scope, page) {
    const state = batchStateOf(player.xuid, scope);
    if (!state.selected.length) {
        player.tell("§c请先勾选至少一个物品");
        showBatchList(player, scope, page);
        return;
    }
    const categories = getCategories().filter((item) => item !== "全部");
    sendChoiceForm(player, "批量改分类", `把 ${state.selected.length} 个物品改成`, categories,
        Math.max(0, categories.indexOf("其他")), (index) => {
            if (index < 0) {
                showBatchList(player, scope, page);
                return;
            }
            const target = categories[index];
            const result = withSelectedListings(player, scope, (listing) => { listing.category = target; });
            if (!result.ok) player.tell(`§c${result.error}`);
            else player.tell(`§a已把 ${result.count} 个物品改成分类 §d${target}`);
            showBatchList(player, scope, page);
        });
}

function confirmBatchRemove(player, scope, page) {
    const state = batchStateOf(player.xuid, scope);
    if (!state.selected.length) {
        player.tell("§c请先勾选至少一个物品");
        showBatchList(player, scope, page);
        return;
    }
    const verb = scope === "myshelf" ? "下架并退回背包" : scope === "official" ? "从官方商店下架" : "移出回收清单";
    sendListForm(player, "批量下架",
        `§c确认对 ${state.selected.length} 个物品执行“${verb}”吗？${scope === "myshelf" ? "\n§e库存会退回你的背包（空间不足的部分会保留）" : ""}`,
        ["确认执行", "取消"], [ICON.trash, ICON.home], (index) => {
            if (index !== 0) {
                showBatchList(player, scope, page);
                return;
            }
            if (scope === "myshelf") batchDelistMyShelf(player, page);
            else {
                const result = batchRemoveListings(player, scope);
                if (!result.ok) {
                    player.tell(`§c${result.error}`);
                } else {
                    player.tell(`§a已下架 / 移除 ${result.count} 项`);
                }
                showBatchList(player, scope, page);
            }
        });
}

// 批量删除需真正移除条目（withSelectedListings 只做修改），这里单独实现
function batchRemoveListings(player, scope) {
    const state = batchStateOf(player.xuid, scope);
    const keys = state.selected.slice();
    if (!keys.length) return { ok: false, error: "请先勾选至少一个物品" };
    const data = officialData();
    const bucket = scope === "official" ? data.purchaseItems : data.recycleItems;
    let count = 0;
    for (const key of keys) {
        if (isPlainObject(bucket[key])) {
            delete bucket[key];
            count++;
        }
    }
    if (!count) return { ok: false, error: "选中的条目已不存在" };
    saveOfficialData(data);
    state.selected = [];
    return { ok: true, count };
}

function batchDelistMyShelf(player, page) {
    const state = batchStateOf(player.xuid, "myshelf");
    const keys = state.selected.slice();
    let removed = 0;
    let returned = 0;
    let pending = 0;
    const failed = [];
    for (const key of keys) {
        const shop = getShop(player.xuid);
        const listing = shop && isPlainObject(shop.items) ? shop.items[key] : null;
        if (!isPlainObject(listing)) continue;
        const result = shopMutate(player.xuid, (target) => {
            const item = isPlainObject(target.items) ? target.items[key] : null;
            if (!isPlainObject(item)) return { ok: false };
            delete target.items[key];
            return { ok: true, qty: toInt(item.quantity, 0) };
        });
        if (!result.ok) continue;
        removed++;
        if (result.qty <= 0) continue;
        // 先试着退回背包；退不回去就转成店铺暂存，绝不丢物品
        const back = giveItemsPartial(player, listing.nbt, result.qty);
        returned += back.given;
        if (back.given < result.qty) {
            const lost = result.qty - back.given;
            const queued = shopMutate(player.xuid, (target) => {
                const added = queuePendingItem(target, listing, lost);
                return added > 0 ? { ok: true, added } : { ok: false };
            });
            if (queued.ok) pending += lost;
            else {
                failed.push(listing.name);
                logger.error(`批量下架无法退回也无法暂存：${listing.name} x${lost}（玩家 ${player.xuid}）`);
            }
        }
    }
    state.selected = [];
    if (failed.length) player.tell(`§c以下物品退回与暂存都失败，请联系管理员：${failed.join("、")}`);
    if (pending > 0) player.tell(`§e背包空间不足的 ${pending} 件已转入店铺待领取区`);
    player.tell(`§a已下架 ${removed} 项，退回 ${returned} 件物品`);
    showBatchList(player, "myshelf", page);
}

// --- 求购 / 仓库 / 批量（面板侧） ---
exportApi("mgmtListRequests", (payload) => {
    const input = argObject(payload);
    const query = normalizePlayerKey(input.keyword);
    let rows = (input.history ? requestHistory().slice().reverse() : activeRequests().slice());
    if (query) {
        rows = rows.filter((row) => normalizePlayerKey(row.itemName).indexOf(query) >= 0
            || normalizePlayerKey(row.requesterName).indexOf(query) >= 0
            || String(row.id || "").toLowerCase().indexOf(query) >= 0);
    }
    const view = pageInfo(rows, input.page, 20);
    view.rows = view.rows.map((row) => ({
        id: String(row.id || ""),
        itemName: String(row.itemName || ""),
        itemType: String(row.itemType || ""),
        requesterName: String(row.requesterName || ""),
        requesterXuid: String(row.requesterXuid || ""),
        priceEach: toInt(row.priceEach, 0),
        quantity: toInt(row.quantity, 0),
        totalAmount: toInt(row.totalAmount, 0),
        fulfilled: toInt(row.fulfilled, 0),
        remark: String(row.remark || ""),
        status: String(row.status || "active"),
        createdTime: toInt(row.createdTime, 0),
        expiresAt: row.status === "active" ? requestExpiresAt(row) : 0,
    }));
    return jsonOk(view);
});

exportApi("mgmtCancelRequest", (payload) => {
    const input = argObject(payload);
    const id = String(input.id === undefined || input.id === null ? "" : input.id).trim();
    if (!id) return jsonError("id 不能为空");
    const list = activeRequests();
    const request = list.find((item) => String(item.id) === id);
    if (!request) return jsonError("求购订单不存在或已结束");
    request.status = "cancelled";
    request.closedTime = Date.now();
    archiveRequest(request);
    const refund = requestRefund(request);
    const refunded = economy.add(String(request.requesterXuid), refund);
    pushNotification(String(request.requesterXuid), "expired",
        `求购 #${request.id}（${request.itemName}）已被管理员取消，退还 ${refund} ${economy.name}`, true);
    logger.info(`面板取消求购: #${request.id} (${request.itemName})`);
    return jsonOk({ id: String(request.id), refund, refunded });
});

exportApi("mgmtListWarehouse", (payload) => {
    const input = argObject(payload);
    const query = normalizePlayerKey(input.keyword);
    const map = warehouseMap();
    let rows = Object.keys(map).map((xuid) => {
        const record = map[xuid];
        const items = warehouseItems(record);
        return {
            xuid,
            name: String(record.playerName || xuid),
            purchased: Boolean(record.purchased),
            used: items.length,
            slots: warehouseSlots(xuid),
            pieces: items.reduce((sum, item) => sum + Math.max(0, toInt(item.quantity, 0)), 0),
            updatedAt: toInt(record.updatedAt, 0),
        };
    });
    if (query) rows = rows.filter((row) => normalizePlayerKey(row.name).indexOf(query) >= 0 || row.xuid.indexOf(query) >= 0);
    rows.sort((a, b) => b.used - a.used);
    return jsonOk(pageInfo(rows, input.page, 20));
});

exportApi("mgmtGetWarehouse", (payload) => {
    const input = argObject(payload);
    const record = warehouseOf(input.xuid);
    if (!record) return jsonError("该玩家还没有仓库数据");
    const items = warehouseItems(record).map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        type: String(item.type || ""),
        quantity: toInt(item.quantity, 0),
        description: String(item.description || ""),
        at: toInt(item.at, 0),
    }));
    return jsonOk({
        xuid: String(input.xuid),
        name: String(record.playerName || ""),
        purchased: Boolean(record.purchased),
        used: items.length,
        slots: warehouseSlots(input.xuid),
        items,
    });
});

// 面板批量：action = price(固定价) | percent(±%) | category | discount | clearDiscount | remove
exportApi("mgmtBatchList", (payload) => {
    const input = argObject(payload);
    const scope = ["official", "recycle", "shop"].indexOf(String(input.scope)) >= 0 ? String(input.scope) : "";
    if (!scope) return jsonError("scope 必须是 official / recycle / shop");
    const keys = Array.isArray(input.keys) ? input.keys.map(String) : [];
    if (!keys.length) return jsonError("keys 不能为空");
    const action = String(input.action || "");
    let count = 0;

    const applyCommon = (listing) => {
        if (action === "price") {
            const price = clampInt(input.value, 1, 1000000000, -1);
            if (price < 0) throw new Error("单价必须是正整数");
            if (discountActive(listing)) {
                listing.originalPrice = price;
                listing.price = Math.max(1, Math.floor(price * toInt(listing.discount, 10) / 10));
            } else {
                listing.price = price;
                delete listing.originalPrice;
                delete listing.discount;
                delete listing.discountEndTime;
            }
        } else if (action === "percent") {
            const pct = clampNumber(input.value, -99, 1000, 0);
            const base = discountActive(listing) ? toInt(listing.originalPrice, listing.price) : toInt(listing.price, 0);
            const next = Math.max(1, Math.floor(base * (1 + pct / 100)));
            if (discountActive(listing)) {
                listing.originalPrice = next;
                listing.price = Math.max(1, Math.floor(next * toInt(listing.discount, 10) / 10));
            } else {
                listing.price = next;
                delete listing.originalPrice;
                delete listing.discount;
                delete listing.discountEndTime;
            }
        } else if (action === "category") {
            const categories = getCategories();
            const name = String(input.category || "");
            listing.category = categories.indexOf(name) >= 0 ? name : "其他";
        } else if (action === "discount") {
            const rate = clampNumber(input.rate, 1, 9.9, -1);
            const minutes = clampInt(input.minutes, 1, 10080, -1);
            if (rate < 0 || minutes < 0) throw new Error("折扣 1~9.9 折、时长 1~10080 分钟");
            applyDiscount(listing, rate, minutes);
        } else if (action === "clearDiscount") {
            clearDiscount(listing);
        } else if (action === "remove") {
            throw new Error("remove 不走统一路径");
        } else {
            throw new Error(`未知 action: ${action}`);
        }
        count++;
    };

    try {
        if (scope === "shop") {
            const result = shopMutate(input.xuid, (shop) => {
                if (action === "remove") {
                    for (const key of keys) {
                        if (isPlainObject(shop.items) && isPlainObject(shop.items[key])) {
                            // 0 库存的条目不能进暂存区（否则上线结算会凭空生成物品）
                            queuePendingItem(shop, shop.items[key], toInt(shop.items[key].quantity, 0));
                            delete shop.items[key];
                            count++;
                        }
                    }
                } else {
                    for (const key of keys) {
                        const listing = isPlainObject(shop.items) ? shop.items[key] : null;
                        if (isPlainObject(listing)) applyCommon(listing);
                    }
                }
                return { ok: true };
            });
            if (!result.ok) return jsonError(result.error);
        } else {
            const data = officialData();
            const bucket = scope === "official" ? data.purchaseItems : data.recycleItems;
            if (action === "remove") {
                for (const key of keys) {
                    if (isPlainObject(bucket[key])) {
                        delete bucket[key];
                        count++;
                    }
                }
            } else {
                for (const key of keys) {
                    if (isPlainObject(bucket[key])) applyCommon(bucket[key]);
                }
            }
            if (count) saveOfficialData(data);
        }
    } catch (error) {
        return jsonError(error && error.message ? error.message : String(error));
    }
    logger.info(`面板批量操作: scope=${scope} action=${action} 影响 ${count} 项`);
    return jsonOk({ scope, action, count });
});

// === 数据迁移：旧版 ShoppingMall（子邪）→ 本插件 ===
// 旧插件 3.x 把数据存进了引擎私有的 KVDatabase（plugins/ShoppingMall/database），
// Node 侧读不了，因此只能在服务器内、用同一个引擎 API 读取（读不到则回退旧版 JSON 文件）。
function detectLegacyPlugin() {
    const candidates = [
        "plugins/ShoppingMall/",
        ".\\plugins\\ShoppingMall\\",
        "plugins\\ShoppingMall\\",
        "./plugins/ShoppingMall/",
    ];
    if (typeof File === "undefined" || typeof File.exists !== "function") return null;
    for (const dir of candidates) {
        try {
            if (File.exists(dir + "manifest.json") || File.exists(dir + "ShoppingMall.js")) return dir;
        } catch (error) {
            // 忽略探测失败
        }
    }
    return null;
}

function legacyDbOpen(dir) {
    try {
        if (typeof KVDatabase !== "function") return null;
        return new KVDatabase(dir + "database");
    } catch (error) {
        logger.warn(`旧商城 KVDatabase 打开失败，改用 JSON 回退: ${error}`);
        return null;
    }
}

function legacyRead(db, dir, key, jsonFile, fallback) {
    if (db) {
        try {
            const value = db.get(key);
            if (value !== null && value !== undefined) return value;
        } catch (error) {
            // 回退到 JSON
        }
    }
    try {
        if (typeof File !== "undefined" && typeof File.exists === "function" && File.exists(dir + jsonFile)) {
            const raw = File.readFrom(dir + jsonFile);
            if (raw && String(raw).trim()) {
                const parsed = JSON.parse(raw);
                if (parsed !== null && parsed !== undefined) return parsed;
            }
        }
    } catch (error) {
        logger.warn(`旧商城 JSON 读取失败(${jsonFile}): ${error}`);
    }
    return fallback;
}

function itemTypeFromNbt(snbt) {
    const text = String(snbt || "");
    const match = /"?Name"?\s*:\s*"([^"]+)"/.exec(text) || /"?id"?\s*:\s*"([^"]+)"/.exec(text);
    return match ? match[1] : "";
}

function itemAuxFromNbt(snbt) {
    const match = /Damage\s*:\s*(-?\d+)s/.exec(String(snbt || ""));
    return match ? toInt(match[1], 0) : 0;
}

function cleanLegacyText(text) {
    return limitText(String(text || "").replace(/§./g, ""), 80);
}

// 旧货架条目 → 我们的 listing
function convertLegacyListing(item, extra) {
    const raw = String(item.itemData || "");
    const nbt = normalizeItemNbt(raw);
    const type = itemTypeFromNbt(raw);
    if (!nbt || !type) return null;
    const listing = {
        type,
        aux: itemAuxFromNbt(raw),
        nbt,
        name: cleanLegacyText(item.name) || resolveItemName(type, itemAuxFromNbt(raw), raw),
        price: Math.max(1, toInt(item.price, 1)),
        quantity: toInt(item.quantity, -1),
        category: limitText(item.category, 24) || "其他",
        remark: limitText(item.remark, 60),
        createdAt: Date.now(),
        sales: 0,
    };
    if (extra) Object.assign(listing, extra);
    // 折扣三字段与旧版同名，直接保留（price 已是折后价）
    if (item.discount !== undefined) listing.discount = item.discount;
    if (item.originalPrice !== undefined) listing.originalPrice = toInt(item.originalPrice, listing.price);
    if (item.discountEndTime !== undefined) listing.discountEndTime = toInt(item.discountEndTime, 0);
    return { key: listingKey(type, nbt), listing };
}

function legacyPlayerName(xuid, playerRecords, shops) {
    const record = playerRecords && playerRecords[xuid];
    if (record && record.name) return String(record.name);
    const shop = shops && shops[xuid];
    if (shop && (shop.owner || shop.ownerName)) return String(shop.owner || shop.ownerName);
    return String(xuid);
}

function writeMigrationReport(report) {
    try {
        if (typeof File !== "undefined" && typeof File.writeTo === "function") {
            File.writeTo(MIGRATE_REPORT_PATH, JSON.stringify(report, null, 2));
            return true;
        }
    } catch (error) {
        logger.warn(`迁移报告写入失败: ${error}`);
    }
    try {
        const store = new JsonConfigFile(MIGRATE_REPORT_PATH, "{}");
        store.set("report", report);
        return true;
    } catch (error) {
        logger.warn(`迁移报告写入失败(回退): ${error}`);
        return false;
    }
}

function writeMigrationFlag(report) {
    try {
        if (typeof File !== "undefined" && typeof File.writeTo === "function") {
            File.writeTo(MIGRATE_FLAG_PATH, JSON.stringify({
                at: Date.now(),
                source: report.source,
                counts: report.counts,
            }, null, 2));
            return true;
        }
    } catch (error) {
        // 继续走回退
    }
    try {
        const store = new JsonConfigFile(MIGRATE_FLAG_PATH, "{}");
        store.set("migrated", { at: Date.now(), source: report.source, counts: report.counts });
        return true;
    } catch (error) {
        logger.warn(`迁移标记写入失败: ${error}`);
        return false;
    }
}

function migrationDone() {
    try {
        if (typeof File !== "undefined" && typeof File.exists === "function") return File.exists(MIGRATE_FLAG_PATH);
    } catch (error) {
        // 忽略
    }
    try {
        const store = new JsonConfigFile(MIGRATE_FLAG_PATH, "{}");
        return Boolean(store.get("migrated", null));
    } catch (error) {
        return false;
    }
}

function runLegacyMigration() {
    if (migrationDone()) return;
    const dir = detectLegacyPlugin();
    if (!dir) {
        // 未发现旧插件：不写标记，等真正部署到生产服时再迁
        return;
    }
    logger.info("§e检测到旧版 ShoppingMall 数据，开始迁移…");
    logger.warn("§e请确认旧插件 ShoppingMall 已停止/卸载，否则两边数据会分叉！（本插件只读旧目录，不会写入）");

    const db = legacyDbOpen(dir);
    const report = {
        startedAt: new Date().toISOString(),
        source: { dir, backend: db ? "kvdb" : "json" },
        counts: {},
        configMapped: [],
        warnings: [],
    };

    const playerRecords = legacyRead(db, dir, "player_records", "playerRecords.json", {});
    const legacyShops = legacyRead(db, dir, "shops_data", "ShoppingMall.json", {});
    const legacyOfficial = legacyRead(db, dir, "official_shop", "OfficialShop.json", { purchaseItems: {}, recycleItems: {} });
    const legacyForbidden = legacyRead(db, dir, "forbidden_items", "forbiddenItems.json", []);
    const legacyRanking = legacyRead(db, dir, "ranking_data", "rankingData.json", {});
    const legacyWarehouse = legacyRead(db, dir, "warehouse", "warehouse.json", {});
    const legacyRequests = legacyRead(db, dir, "purchase_requests", "purchaseRequests.json", { requests: [], history: [] });
    const legacyLogs = legacyRead(db, dir, "purchase_logs", "purchaseLogs.json", { global: [] });
    const legacyTax = legacyRead(db, dir, "tax_records", "taxRecords.json", { totalCollected: 0 });
    // 旧插件的配置是 data.openConfig 写的 JSON 文件（不在 KVDatabase 里）
    const legacyConf = legacyRead(db, dir, "config", "config.json", null);
    if (legacyConf && typeof legacyConf === "object") {
        const mapPairs = [
            ["cmd", "command"],
            ["pageSizeLimit", "pageSize"],
            ["allowSelfPurchase", "allowSelfPurchase"],
        ];
        for (const [from, to] of mapPairs) {
            if (legacyConf[from] !== undefined && legacyConf[from] !== null) {
                config.set(to, legacyConf[from]);
                report.configMapped.push(`${from}→${to}`);
            }
        }
        const legacyTaxRate = Number(legacyConf.taxRate);
        if (!isNaN(legacyTaxRate)) {
            const next = getTaxConfig();
            next.enabled = legacyConf.enableTaxSystem !== false;
            next.rate = clampNumber(legacyTaxRate, 0, 0.5, next.rate);
            next.scope = legacyConf.taxOnlyOfficialShop === true ? "official" : "player";
            cfgSetSection("tax", next);
            report.configMapped.push("taxRate/enableTaxSystem/taxOnlyOfficialShop→tax");
        }
        if (Array.isArray(legacyConf.itemCategories) && legacyConf.itemCategories.length) {
            cfgSetSection("categories", legacyConf.itemCategories);
            report.configMapped.push("itemCategories→categories");
        }
        const legacyShop = getShopConfig();
        if (legacyConf.shopCreationCost !== undefined) legacyShop.createCost = clampInt(legacyConf.shopCreationCost, 0, 100000000, 0);
        if (legacyConf.shopDefaultItemTypes !== undefined) legacyShop.maxItemTypes = clampInt(legacyConf.shopDefaultItemTypes, 1, 500, 15);
        if (legacyConf.shopDefaultTotalItems !== undefined) legacyShop.maxQuantityPerListing = clampInt(legacyConf.shopDefaultTotalItems, 1, 99999, 960);
        cfgSetSection("shop", legacyShop);
        report.configMapped.push("shopCreation*/shopDefault*→shop");

        const legacyReq = getRequestConfig();
        if (legacyConf.enablePurchaseRequests !== undefined) legacyReq.enabled = legacyConf.enablePurchaseRequests !== false;
        if (legacyConf.purchaseRequestFee !== undefined) legacyReq.fee = clampInt(legacyConf.purchaseRequestFee, 0, 10000000, 0);
        if (legacyConf.purchaseRequestExpiry !== undefined) legacyReq.expiryHours = clampInt(legacyConf.purchaseRequestExpiry, 1, 8760, 72);
        if (legacyConf.notifyPurchaseRequestToAll !== undefined) legacyReq.notifyAll = legacyConf.notifyPurchaseRequestToAll !== false;
        cfgSetSection("request", legacyReq);
        report.configMapped.push("purchaseRequest*→request");

        const legacyWh = getWarehouseConfig();
        if (legacyConf.maxWarehouseSlots !== undefined) legacyWh.maxSlots = clampInt(legacyConf.maxWarehouseSlots, 1, 1000, 50);
        if (legacyConf.warehouseBuyoutPrice !== undefined) legacyWh.buyoutPrice = clampInt(legacyConf.warehouseBuyoutPrice, 0, 100000000, 10000);
        if (legacyConf.enableWarehousePurchase !== undefined && Number(legacyConf.enableWarehousePurchase) === 0) {
            legacyWh.buyoutPrice = 0;
        }
        cfgSetSection("warehouse", legacyWh);
        report.configMapped.push("warehouse*→warehouse");

        if (legacyConf.notifyDiscountToAll !== undefined) {
            const disc = getDiscountConfig();
            disc.notifyAll = legacyConf.notifyDiscountToAll !== false;
            cfgSetSection("discount", disc);
            report.configMapped.push("notifyDiscountToAll→discount.notifyAll");
        }
        const legacyButtons = legacyConf.mainMenuButtons;
        if (legacyButtons && typeof legacyButtons === "object") {
            const menu = cfgSection("menu");
            menu.buttons = menu.buttons && typeof menu.buttons === "object" ? menu.buttons : {};
            const buttonMap = {
                shoppingCenter: "center", officialShop: "official", myShop: "myShop",
                purchaseRequests: "requests", warehouse: "warehouse", shopRanking: "ranking",
                tradeLogs: "logs", globalSearch: "search",
            };
            for (const from of Object.keys(buttonMap)) {
                if (legacyButtons[from] && legacyButtons[from].enabled !== undefined) {
                    menu.buttons[buttonMap[from]] = legacyButtons[from].enabled !== false;
                }
            }
            cfgSetSection("menu", menu);
            report.configMapped.push("mainMenuButtons→menu.buttons");
        }
    }

    // ---- 2. 玩家店铺 ----
    let shopCount = 0;
    let shopItemCount = 0;
    const shops = allShops();
    for (const xuid of Object.keys(legacyShops || {})) {
        const old = legacyShops[xuid];
        if (!old || typeof old !== "object") continue;
        const items = {};
        const oldItems = old.items && typeof old.items === "object" ? old.items : {};
        for (const itemKey of Object.keys(oldItems)) {
            const converted = convertLegacyListing(oldItems[itemKey]);
            if (converted) {
                items[converted.key] = converted.listing;
                shopItemCount++;
            } else {
                report.warnings.push(`店铺 ${xuid} 有一件物品无法解析 NBT，已跳过`);
            }
        }
        if (isPlainObject(shops[xuid])) {
            report.warnings.push(`店铺 ${xuid} 已存在，跳过（不覆盖）`);
            continue;
        }
        shops[xuid] = {
            name: limitText(old.name, 24) || `${legacyPlayerName(xuid, playerRecords, legacyShops)}的店铺`,
            ownerName: legacyPlayerName(xuid, playerRecords, legacyShops),
            isOpen: old.isOpen !== false,
            notice: limitText(old.announcement || old.notice, 100),
            createdAt: toInt(old.createdAt, Date.now()),
            items,
            earnings: 0,
            pendingEarnings: Math.max(0, toInt(old.pendingEarnings, 0)),
            pendingItems: [],
            legacy: {
                shopLevel: toInt(old.shopLevel, 1),
                maxItemTypes: toInt(old.maxItemTypes, 0),
                advertSlot: toInt(old.advertSlot, 0),
                iconName: String(old.iconName || ""),
            },
        };
        shopCount++;
    }
    saveAllShops(shops);
    report.counts.shops = shopCount;
    report.counts.shopItems = shopItemCount;

    // ---- 3. 官方商店 ----
    const official = officialData();
    let sellCount = 0;
    let recycleCount = 0;
    const oldSells = legacyOfficial.purchaseItems && typeof legacyOfficial.purchaseItems === "object" ? legacyOfficial.purchaseItems : {};
    for (const itemKey of Object.keys(oldSells)) {
        const old = oldSells[itemKey];
        const converted = convertLegacyListing(old, { displayName: cleanLegacyText(old.displayName) });
        if (!converted) {
            report.warnings.push(`官方出售条目解析失败，已跳过: ${itemKey.slice(0, 40)}`);
            continue;
        }
        if (!isPlainObject(official.purchaseItems[converted.key])) sellCount++;
        official.purchaseItems[converted.key] = converted.listing;
    }
    const oldRecycles = legacyOfficial.recycleItems && typeof legacyOfficial.recycleItems === "object" ? legacyOfficial.recycleItems : {};
    for (const itemKey of Object.keys(oldRecycles)) {
        const old = oldRecycles[itemKey];
        const raw = String(old.itemData || "");
        const nbt = normalizeItemNbt(raw);
        const type = itemTypeFromNbt(raw);
        if (!nbt || !type) {
            report.warnings.push(`回收条目解析失败，已跳过: ${itemKey.slice(0, 40)}`);
            continue;
        }
        const key = listingKey(type, nbt);
        if (!isPlainObject(official.recycleItems[key])) recycleCount++;
        official.recycleItems[key] = {
            type,
            aux: itemAuxFromNbt(raw),
            nbt,
            name: cleanLegacyText(old.name) || resolveItemName(type, 0, raw),
            price: Math.max(1, toInt(old.price, 1)),
            perCount: Math.max(1, toInt(old.perCount, 1)),
            category: limitText(old.category, 24) || "其他",
            createdAt: Date.now(),
        };
    }
    saveOfficialData(official);
    report.counts.officialSells = sellCount;
    report.counts.officialRecycles = recycleCount;

    // ---- 4. 禁售 / 排行 ----
    if (Array.isArray(legacyForbidden) && legacyForbidden.length) {
        const merged = forbiddenList();
        for (const type of legacyForbidden) {
            if (typeof type === "string" && merged.indexOf(type) < 0) merged.push(type);
        }
        saveForbiddenList(merged);
        report.counts.forbidden = merged.length;
    } else {
        report.counts.forbidden = forbiddenList().length;
    }

    const ranking = rankingData();
    let rankingCount = 0;
    for (const xuid of Object.keys(legacyRanking || {})) {
        const old = legacyRanking[xuid];
        if (!old || typeof old !== "object") continue;
        if (!isPlainObject(ranking[xuid])) {
            ranking[xuid] = {
                name: legacyPlayerName(xuid, playerRecords, legacyShops),
                sales: 0,
                orders: 0,
                earnings: 0,
                lastSale: 0,
            };
            rankingCount++;
        }
        const entry = ranking[xuid];
        entry.sales = Math.max(toInt(entry.sales, 0), toInt(old.salesCount, 0) + toInt(old.sales, 0));
        entry.earnings = Math.max(toInt(entry.earnings, 0), toInt(old.totalEarnings, 0) + toInt(old.earnings, 0));
        entry.orders = Math.max(toInt(entry.orders, 0), toInt(old.orders, 0));
    }
    saveRankingData(ranking);
    report.counts.ranking = rankingCount;

    // ---- 5. 仓库 ----
    const warehouse = warehouseMap();
    let warehouseUsers = 0;
    let warehouseItems = 0;
    for (const xuid of Object.keys(legacyWarehouse || {})) {
        const old = legacyWarehouse[xuid];
        if (!old || typeof old !== "object") continue;
        if (!isPlainObject(warehouse[xuid])) {
            warehouse[xuid] = {
                playerName: String(old.playerName || legacyPlayerName(xuid, playerRecords, legacyShops)),
                purchased: Boolean(old.purchased),
                items: [],
                updatedAt: Date.now(),
            };
            warehouseUsers++;
        }
        const target = warehouse[xuid];
        if (!Array.isArray(target.items)) target.items = [];
        const existing = {};
        for (const item of target.items) existing[String(item.id)] = true;
        for (const oldItem of (Array.isArray(old.items) ? old.items : [])) {
            const raw = String(oldItem.itemData || "");
            const nbt = normalizeItemNbt(raw);
            const type = itemTypeFromNbt(raw);
            if (!nbt || !type) {
                report.warnings.push(`仓库 ${xuid} 有一件物品无法解析 NBT，已跳过`);
                continue;
            }
            const id = String(oldItem.id || makeWarehouseId());
            if (existing[id]) continue;
            target.items.push({
                id,
                type,
                aux: itemAuxFromNbt(raw),
                nbt,
                name: resolveItemName(type, itemAuxFromNbt(raw), raw),
                quantity: Math.max(1, toInt(oldItem.quantity, 1)),
                description: limitText(oldItem.description, 60),
                at: toInt(oldItem.timestamp, Date.now()),
            });
            warehouseItems++;
            existing[id] = true;
        }
    }
    saveWarehouseMap(warehouse);
    report.counts.warehouseUsers = warehouseUsers;
    report.counts.warehouseItems = warehouseItems;

    // ---- 6. 求购 ----
    const expiryMs = getRequestConfig().expiryHours * 3600 * 1000;
    const active = activeRequests();
    const activeIds = {};
    for (const item of active) activeIds[String(item.id)] = true;
    const legacyActive = Array.isArray(legacyRequests.requests) ? legacyRequests.requests : [];
    let requestActive = 0;
    let requestHistoryCount = 0;
    const migratedIds = {};
    for (const old of legacyActive) {
        if (!old || typeof old !== "object") continue;
        const id = String(old.id || generateRequestId());
        migratedIds[id] = true;
        if (activeIds[id]) continue;
        const created = toInt(old.createdTime, Date.now());
        const mapped = {
            id,
            itemName: cleanLegacyText(old.itemName) || "物品",
            itemType: String(old.itemType || ""),
            requesterName: String(old.requesterName || ""),
            requesterXuid: String(old.requesterXuid || ""),
            priceEach: Math.max(1, toInt(old.priceEach, 1)),
            quantity: Math.max(1, toInt(old.quantity, 1)),
            totalAmount: Math.max(0, toInt(old.totalAmount, toInt(old.priceEach, 1) * toInt(old.quantity, 1))),
            remark: limitText(old.remark, 60),
            createdTime: created,
            expiresAt: created + expiryMs,
            status: String(old.status || "active"),
        };
        if (mapped.status === "active") {
            active.push(mapped);
            requestActive++;
        } else {
            const history = requestHistory();
            history.push(mapped);
            saveRequestHistory(history);
            requestHistoryCount++;
        }
    }
    if (requestActive) saveActiveRequests(active);
    const legacyHistory = Array.isArray(legacyRequests.history) ? legacyRequests.history : [];
    for (const old of legacyHistory) {
        if (!old || typeof old !== "object") continue;
        const id = String(old.id || "");
        if (!id || migratedIds[id]) continue;
        migratedIds[id] = true;
        const history = requestHistory();
        history.push({
            id,
            itemName: cleanLegacyText(old.itemName) || "物品",
            itemType: String(old.itemType || ""),
            requesterName: String(old.requesterName || ""),
            requesterXuid: String(old.requesterXuid || ""),
            priceEach: Math.max(1, toInt(old.priceEach, 1)),
            quantity: Math.max(1, toInt(old.quantity, 1)),
            totalAmount: Math.max(0, toInt(old.totalAmount, 0)),
            remark: limitText(old.remark, 60),
            createdTime: toInt(old.createdTime, 0),
            status: String(old.status || "fulfilled"),
            closedTime: toInt(old.closedTime, toInt(old.createdTime, 0)),
        });
        saveRequestHistory(history);
        requestHistoryCount++;
    }
    report.counts.requestsActive = requestActive;
    report.counts.requestsHistory = requestHistoryCount;

    // ---- 7. 交易日志（取最近 500 条） ----
    const legacyLogRows = Array.isArray(legacyLogs.global) ? legacyLogs.global : [];
    let logCount = 0;
    if (legacyLogRows.length) {
        const existing = tradeLogs();
        const seen = {};
        for (const row of existing) seen[`${row.buyer}|${row.seller}|${row.item}|${row.qty}|${row.ts}`] = true;
        const tail = legacyLogRows.slice(-LOG_LIMIT);
        let fallbackTs = Date.now() - tail.length * 1000;
        for (const row of tail) {
            let ts = Date.parse(String(row.time || ""));
            if (isNaN(ts)) ts = fallbackTs;
            fallbackTs -= 1000;
            const entry = {
                ts,
                kind: "buy",
                buyer: String(row.buyerName || ""),
                buyerXuid: String(row.buyerXuid || ""),
                seller: String(row.sellerName || ""),
                sellerXuid: String(row.sellerXuid || ""),
                item: cleanLegacyText(row.itemName) || "物品",
                qty: toInt(row.quantity, 1),
                price: toInt(row.priceEach, 0),
                total: toInt(row.totalPrice, 0),
                tax: 0,
                official: String(row.sellerXuid || "") === "OFFICIAL",
            };
            const token = `${entry.buyer}|${entry.seller}|${entry.item}|${entry.qty}|${entry.ts}`;
            if (seen[token]) continue;
            existing.push(entry);
            seen[token] = true;
            logCount++;
        }
        while (existing.length > LOG_LIMIT) existing.shift();
        logsStore.set("global", existing);
    }
    report.counts.logsMigrated = logCount;

    // ---- 8. 税收累计 ----
    const legacyTaxTotal = toInt(legacyTax.totalCollected, 0);
    if (legacyTaxTotal > 0) {
        const tax = taxData();
        if (tax.total < legacyTaxTotal) {
            taxStore.set("total", legacyTaxTotal);
            report.counts.taxTotal = legacyTaxTotal;
        } else {
            report.counts.taxTotal = tax.total;
        }
    } else {
        report.counts.taxTotal = taxData().total;
    }

    report.finishedAt = new Date().toISOString();
    writeMigrationReport(report);
    writeMigrationFlag(report);

    logger.info(`§a§l旧商城数据迁移完成：`);
    logger.info(`§a  店铺 ${report.counts.shops} 家 / 货架 ${report.counts.shopItems} 项`);
    logger.info(`§a  官方出售 ${report.counts.officialSells} 项 / 回收 ${report.counts.officialRecycles} 项`);
    logger.info(`§a  仓库 ${report.counts.warehouseUsers} 人 / ${report.counts.warehouseItems} 件 · 求购 ${report.counts.requestsActive} 单进行中`);
    logger.info(`§a  交易日志 ${report.counts.logsMigrated} 条 · 排行 ${report.counts.ranking} 人 · 禁售 ${report.counts.forbidden} 种`);
    if (report.warnings.length) logger.warn(`迁移警告 ${report.warnings.length} 条，详见 migration-report.json`);
    logger.info(`迁移报告: ${MIGRATE_REPORT_PATH}`);
}

// __APPEND_POINT__
