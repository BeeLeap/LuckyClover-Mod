// LuckyClover-ShoppingMall 冒烟测试：stub LSE 环境后加载插件，驱动表单回调，
// 验证 官方出售/回收、玩家开店上架、税收、离线结算、mgmt* 导出。
"use strict";
const fs = require("fs");
const path = require("path");

const PLUGIN = path.join(__dirname, "..", "LuckyClover-ShoppingMall", "LuckyClover-ShoppingMall.js");
const ITEMS = path.join(__dirname, "..", "LuckyClover-ShoppingMall", "Items.json");
const CONFIG_PATH = "plugins/LuckyClover-ShoppingMall/config.json";
const SHOPS_PATH = "plugins/LuckyClover-ShoppingMall/shops.json";
const OFFICIAL_PATH = "plugins/LuckyClover-ShoppingMall/official.json";
const LOGS_PATH = "plugins/LuckyClover-ShoppingMall/logs.json";
const RANKING_PATH = "plugins/LuckyClover-ShoppingMall/ranking.json";
const TAX_PATH = "plugins/LuckyClover-ShoppingMall/tax.json";
const WAREHOUSE_PATH = "plugins/LuckyClover-ShoppingMall/warehouse.json";
const REQUESTS_PATH = "plugins/LuckyClover-ShoppingMall/requests.json";
const NOTIFY_PATH = "plugins/LuckyClover-ShoppingMall/notifications.json";

// ---- LSE stubs ----
const exported = {};
global.ll = {
    registerPlugin() {},
    export(fn, ns, name) { exported[name] = fn; },
    imports() { return null; },
    hasExported() { return false; },
};
const logs = [];
global.logger = {
    setTitle() {},
    info(m) { logs.push(String(m)); },
    warn(m) { logs.push(String(m)); },
    error(m) { logs.push(String(m)); },
};
global.File = {
    _vfs: {},
    mkdir() {},
    exists(p) { return Object.prototype.hasOwnProperty.call(this._vfs, String(p)); },
    readFrom(p) { return this._vfs[String(p)]; },
    writeTo(p, content) { this._vfs[String(p)] = String(content); return true; },
    read() { return ""; },
    write() {},
};
const legacyDb = {};
global.KVDatabase = class {
    constructor(p) { this.p = p; }
    get(k) { return Object.prototype.hasOwnProperty.call(legacyDb, k) ? legacyDb[k] : null; }
    set(k, v) { legacyDb[k] = v; return true; }
};

const files = {};
global.JsonConfigFile = class {
    constructor(p, def) {
        this.p = p;
        if (files[this.p] === undefined) files[this.p] = def ? JSON.parse(def) : {};
    }
    // 模拟真引擎：每次 get 返回新副本（深拷贝）。
    // 「读一次 → 改 → 又读一次 → 存」这种写法会把改动覆盖掉，在这里能暴露出来。
    get(k, d) {
        const v = files[this.p][k];
        if (v === undefined) return d;
        if (v === null || typeof v !== "object") return v;
        return JSON.parse(JSON.stringify(v));
    }
    set(k, v) { files[this.p][k] = (v && typeof v === "object") ? JSON.parse(JSON.stringify(v)) : v; }
    delete(k) { delete files[this.p][k]; }
    refresh() {}
    init(k, v) { if (files[this.p][k] === undefined) this.set(k, v); }
};
// 预置真实物品目录，验证中文物品名解析
files["plugins/LuckyClover-ShoppingMall/Items.json"] = JSON.parse(fs.readFileSync(ITEMS, "utf8"));

global.NBT = {
    parseSNBT(raw) {
        const text = String(raw);
        if (text.indexOf("{") < 0) throw new Error("bad snbt: " + text);
        const state = { _raw: text };
        state.setByte = function (key, value) {
            const re = new RegExp(`${key}\\s*:\\s*-?\\d+b`);
            if (re.test(this._raw)) this._raw = this._raw.replace(re, `${key}:${value}b`);
            else this._raw = this._raw.replace(/^\{/, `{${key}:${value}b,`);
            return this;
        };
        state.toSNBT = function () { return this._raw; };
        return state;
    },
};

function parseType(raw) {
    const m = /Name\s*:\s*"([^"]+)"/.exec(raw) || /id\s*:\s*"([^"]+)"/.exec(raw);
    const auxM = /Damage\s*:\s*(-?\d+)s/.exec(raw);
    const countM = /Count\s*:\s*(-?\d+)b/.exec(raw);
    return {
        type: m ? m[1] : "minecraft:air",
        aux: auxM ? Number(auxM[1]) : 0,
        count: countM ? Number(countM[1]) : 1,
    };
}

global.mc = {
    _cmds: {},
    _listeners: {},
    regPlayerCmd(name, desc, cb) { this._cmds[name] = cb; },
    setInterval(fn) { this._periodic = fn; return 1; },
    listen(event, cb) { (this._listeners[event] = this._listeners[event] || []).push(cb); },
    getOnlinePlayers() { return players.filter((p) => p._online); },
    getPlayer(key) {
        return players.find((p) => p._online && (p.xuid === key || p.realName === key || p.name === key)) || null;
    },
    newCustomForm() {
        const form = { _controls: [] };
        form.setTitle = (t) => { form._title = t; return form; };
        form.addLabel = (v) => { form._controls.push({ kind: "label", value: v }); return form; };
        form.addInput = (l, p, d) => { form._controls.push({ kind: "input", label: l, value: d }); return form; };
        form.addDropdown = (l, items, idx) => { form._controls.push({ kind: "dropdown", label: l, items, index: idx }); return form; };
        form.addSwitch = (l, v) => { form._controls.push({ kind: "switch", label: l, value: Boolean(v) }); return form; };
        return form;
    },
    newItem(nbt) {
        const raw = typeof nbt === "string" ? nbt : nbt.toSNBT();
        const parsed = parseType(raw);
        return {
            type: parsed.type,
            aux: parsed.aux,
            count: parsed.count,
            maxStackSize: 64,
            _raw: raw.replace(/Count\s*:\s*-?\d+b/, "Count:Nb"),
            isNull() { return this.type === "minecraft:air"; },
            getNbt() { const o = { _raw: raw, toSNBT: () => raw, setByte: () => {} }; return o; },
            setCount(c) { this.count = c; },
        };
    },
};

global.money = {
    _bal: {},
    get(x) { return this._bal[x] || 0; },
    add(x, v) { this._bal[x] = (this._bal[x] || 0) + v; return true; },
    reduce(x, v) { if ((this._bal[x] || 0) < v) return false; this._bal[x] -= v; return true; },
    set(x, v) { this._bal[x] = v; return true; },
};

const players = [];
function makePlayer(name, xuid) {
    const slots = new Array(36).fill(null);
    const forms = [];
    const player = {
        name,
        realName: name,
        xuid,
        _online: true,
        _op: false,
        _forms: forms,
        _tells: [],
        isOP() { return this._op; },
        tell(msg) { this._tells.push(String(msg)); },
        sendToast() {},
        refreshItems() {},
        getInventory() {
            return {
                size: 36,
                getItem(i) { return slots[i]; },
                setItem(i, it) { slots[i] = it; },
                removeItem(i, n) {
                    if (!slots[i]) return;
                    slots[i].count -= n;
                    if (slots[i].count <= 0) slots[i] = null;
                },
            };
        },
        giveItem(item) {
            for (let i = 0; i < 36; i++) {
                const s = slots[i];
                if (s && s.type === item.type && s._raw === item._raw && s.count < 64) {
                    const add = Math.min(64 - s.count, item.count);
                    s.count += add;
                    item.count -= add;
                    if (item.count <= 0) return true;
                }
            }
            for (let i = 0; i < 36; i++) {
                if (!slots[i]) { slots[i] = item; return true; }
            }
            return false;
        },
        sendSimpleForm(title, content, buttons, images, cb) {
            forms.push({ kind: "simple", title, content, buttons, cb });
            return forms.length; // 引擎成功时返回表单 ID
        },
        sendForm(form, cb) {
            forms.push({ kind: "custom", form, cb });
            return forms.length;
        },
        count(type) {
            let total = 0;
            for (const slot of slots) if (slot && slot.type === type) total += slot.count;
            return total;
        },
        giveDirect(type, count, aux) {
            const nbt = `{Count:${count}b,Name:"${type}",Damage:${aux || 0}s,WasPickedUp:0b}`;
            const item = global.mc.newItem({ toSNBT: () => nbt });
            this.giveItem(item);
        },
        clearForms() { forms.length = 0; },
    };
    players.push(player);
    return player;
}

// ---- form driving ----
function takeForm(player) {
    const form = player._forms.shift();
    if (!form) throw new Error(`表单队列为空（${player.realName}）`);
    return form;
}
function pick(player, matcher) {
    const form = takeForm(player);
    if (form.kind !== "simple") throw new Error("期望简单表单，实际是自定义表单: " + form.title);
    const idx = form.buttons.findIndex((b) => matcher(String(b)));
    if (idx < 0) throw new Error(`按钮未匹配，现有: ${JSON.stringify(form.buttons)}`);
    form.cb(player, idx);
    return form;
}
function pickExact(player, text) {
    return pick(player, (b) => b.indexOf(text) >= 0);
}
function submit(player, values) {
    const form = takeForm(player);
    if (form.kind !== "custom") throw new Error("期望自定义表单: " + form.title);
    form.cb(player, values);
    return form;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay) => realSetTimeout(fn, delay >= 1000 ? 0 : delay);

// ---- test helpers ----
let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log("PASS " + name); }
    else { fail++; console.log("FAIL " + name + (extra !== undefined ? " | " + JSON.stringify(extra) : "")); }
}
const call = (name, obj) => JSON.parse(exported[name](obj === undefined ? undefined : JSON.stringify(obj)));
const official = () => files[OFFICIAL_PATH];
const shops = () => files[SHOPS_PATH].shops;

async function main() {
    require(PLUGIN);
    const onJoin = (mc._listeners.onJoin || [])[0];
    const cmd = (name, player) => mc._cmds[name](player);

    const admin = makePlayer("Admin", "xuid-admin");
    admin._op = true;
    const bob = makePlayer("Bob", "xuid-bob");
    const alice = makePlayer("Alice", "xuid-alice");

    // --- 1. 状态与配置 ---
    let res = call("mgmtStatus");
    const manifestVersion = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "LuckyClover-ShoppingMall", "manifest.json"), "utf8")).version;
    check("mgmtStatus", res.ok && res.version === manifestVersion, res);
    res = call("mgmtGetConfig");
    check("mgmtGetConfig", res.ok && res.config.command === "shop" && res.config.tax.rate === 0.05, res.config);

    // --- 2. 官方上架 / 回收清单 ---
    res = call("mgmtAddOfficial", { type: "minecraft:diamond", price: 100, quantity: -1, category: "材料" });
    check("mgmtAddOfficial", res.ok && res.listing.name === "钻石", res);
    const diamondKey = res.key;
    res = call("mgmtAddRecycle", { type: "minecraft:cobblestone", price: 2, category: "方块" });
    check("mgmtAddRecycle", res.ok && res.listing.name === "圆石", res);
    res = call("mgmtListOfficial", { page: 1 });
    check("mgmtListOfficial", res.ok && res.total === 1 && res.rows[0].quantity === -1, res);
    res = call("mgmtListRecycle", { page: 1 });
    check("mgmtListRecycle", res.ok && res.total === 1, res);

    // --- 3. 玩家购买官方商品 ---
    money.set(alice.xuid, 1000);
    alice.clearForms();
    cmd("shop", alice);
    pickExact(alice, "官方商店");
    pickExact(alice, "购买物品");
    pickExact(alice, "钻石");
    submit(alice, ["", "3"]);
    check("官方购买：扣款", money.get(alice.xuid) === 1000 - 300, money.get(alice.xuid));
    check("官方购买：到货", alice.count("minecraft:diamond") === 3, alice.count("minecraft:diamond"));
    res = call("mgmtListLogs", { page: 1 });
    check("官方购买：交易日志", res.ok && res.total === 1 && res.rows[0].qty === 3 && res.rows[0].official === true, res.rows);
    res = call("mgmtListOfficial", { page: 1 });
    check("官方购买：无限库存不减", res.rows[0].quantity === -1 && res.rows[0].sales === 3, res.rows[0]);

    // 无限库存以前在购买表单被硬编码为单次最多 64 个；确认现在可跨组购买。
    money.set(alice.xuid, 10000);
    alice.clearForms();
    cmd("smgm", alice);
    pickExact(alice, "钻石");
    submit(alice, ["", "65"]);
    check("官方购买：无限库存允许超过一组", alice.count("minecraft:diamond") === 68,
        alice.count("minecraft:diamond"));

    // --- 4. 库存有限时扣减 ---
    res = call("mgmtAddOfficial", { type: "minecraft:bread", price: 10, quantity: 5, category: "食物" });
    check("上架有限库存", res.ok, res);
    alice.clearForms();
    cmd("smgm", alice);
    pickExact(alice, "面包");
    submit(alice, ["", "2"]);
    res = call("mgmtListOfficial", { page: 1, keyword: "面包" });
    check("有限库存扣减", res.ok && res.rows[0].quantity === 3 && res.rows[0].sales === 2, res.rows);
    check("面包到货", alice.count("minecraft:bread") === 2);

    // --- 5. 玩家开店 + 上架 ---
    bob._online = false;
    bob.giveDirect("minecraft:cobblestone", 10);
    bob.clearForms();
    cmd("shop", bob);
    pickExact(bob, "我的店铺");
    pickExact(bob, "创建店铺");
    submit(bob, ["Bob的店铺"]);
    // 创建后自动进入上架页
    pickExact(bob, "圆石");
    submit(bob, ["", "5", "10", 4]); // 单价5 / 数量10 / 分类=方块
    check("上架：背包扣除", bob.count("minecraft:cobblestone") === 0, bob.count("minecraft:cobblestone"));
    const shopKeys = Object.keys(shops()["xuid-bob"].items);
    check("上架：货架写入", shopKeys.length === 1 && shops()["xuid-bob"].items[shopKeys[0]].quantity === 10, shops()["xuid-bob"].items);
    check("上架：中文物品名", shops()["xuid-bob"].items[shopKeys[0]].name === "圆石", shops()["xuid-bob"].items[shopKeys[0]].name);
    const bobShopKey = shopKeys[0];

    // --- 6. 面板侧店铺信息 ---
    res = call("mgmtGetShop", { xuid: "xuid-bob" });
    check("mgmtGetShop", res.ok && res.items.length === 1 && res.name === "Bob的店铺", res);

    // --- 7. 税收配置 ---
    res = call("mgmtSetTax", { enabled: true, rate: 0.1, scope: "player" });
    check("mgmtSetTax", res.ok && res.tax.rate === 0.1, res);

    // --- 8. 玩家间购买（离线卖家 → 待结算） ---
    money.set(alice.xuid, 1000);
    alice.clearForms();
    cmd("shop", alice);
    pickExact(alice, "购物中心");
    pickExact(alice, "Bob的店铺");
    pickExact(alice, "圆石");
    submit(alice, ["", "4"]);
    check("玩家店购买：买家含税扣款", money.get(alice.xuid) === 1000 - (20 + 2), money.get(alice.xuid));
    check("玩家店购买：到货", alice.count("minecraft:cobblestone") === 4, alice.count("minecraft:cobblestone"));
    check("玩家店购买：卖家离线进待结算", shops()["xuid-bob"].pendingEarnings === 20, shops()["xuid-bob"].pendingEarnings);
    check("玩家店购买：货架扣减", shops()["xuid-bob"].items[bobShopKey].quantity === 6, shops()["xuid-bob"].items[bobShopKey]);
    res = call("mgmtGetTaxStats");
    check("税收记账", res.ok && res.total === 2 && res.recent[0].amount === 2, res);

    // --- 9. 卖家上线结算 ---
    bob._online = true;
    money.set(bob.xuid, 0);
    onJoin(bob);
    await sleep(20);
    check("上线结算：待结算收益入账", money.get(bob.xuid) === 20, money.get(bob.xuid));
    check("上线结算：待结算清零", shops()["xuid-bob"].pendingEarnings === 0, shops()["xuid-bob"].pendingEarnings);

    // --- 10. 排行榜 ---
    res = call("mgmtGetRanking", { page: 1 });
    check("mgmtGetRanking", res.ok && res.rows.length === 1 && res.rows[0].name === "Bob" && res.rows[0].earnings === 20 && res.rows[0].sales === 4, res.rows);

    // --- 11. 回收 ---
    money.set(alice.xuid, 0);
    alice.giveDirect("minecraft:cobblestone", 5);
    const beforeRecycle = alice.count("minecraft:cobblestone");
    alice.clearForms();
    cmd("smhs", alice);
    pickExact(alice, "圆石");
    submit(alice, ["", "5"]);
    check("回收：到款", money.get(alice.xuid) === 10, money.get(alice.xuid));
    check("回收：物品扣除", alice.count("minecraft:cobblestone") === beforeRecycle - 5,
        { before: beforeRecycle, after: alice.count("minecraft:cobblestone") });

    // --- 12. 禁售物品 ---
    res = call("mgmtSetForbidden", { items: ["minecraft:bedrock"] });
    check("mgmtSetForbidden", res.ok && res.items.length === 1, res);
    check("禁售：圆石未被禁", res.items.indexOf("minecraft:cobblestone") < 0);
    res = call("mgmtGetForbidden");
    check("mgmtGetForbidden", res.ok && res.items[0] === "minecraft:bedrock", res);

    // --- 13. 分类 ---
    res = call("mgmtAddCategory", { name: "建材" });
    check("mgmtAddCategory", res.ok && res.categories.indexOf("建材") >= 0, res.categories);
    res = call("mgmtRemoveCategory", { name: "建材" });
    check("mgmtRemoveCategory", res.ok && res.categories.indexOf("建材") < 0, res.categories);
    res = call("mgmtRemoveCategory", { name: "全部" });
    check("mgmtRemoveCategory 拒删全部", res.ok === false, res);

    // --- 14. 店铺管理接口 ---
    res = call("mgmtSetShopOpen", { xuid: "xuid-bob", open: false });
    check("mgmtSetShopOpen", res.ok && res.isOpen === false, res);
    res = call("mgmtSetShopOpen", { xuid: "xuid-bob", open: true });
    check("mgmtSetShopOpen 恢复", res.ok && res.isOpen === true, res);
    res = call("mgmtSetShopPrice", { xuid: "xuid-bob", key: bobShopKey, price: 8 });
    check("mgmtSetShopPrice", res.ok && res.price === 8, res);
    res = call("mgmtRemoveShopItem", { xuid: "xuid-bob", key: bobShopKey });
    check("mgmtRemoveShopItem", res.ok && res.quantity === 6, res);
    check("下架转入待领取", shops()["xuid-bob"].pendingItems.length === 1, shops()["xuid-bob"].pendingItems);
    // 管理员修复项：有未领取资产（暂存物品/待结算）时禁止删店
    res = call("mgmtDeleteShop", { xuid: "xuid-bob" });
    check("mgmtDeleteShop：有暂存物品时拒绝", res.ok === false && /暂存/.test(String(res.error || "")), res);
    // 店主先领取，才能删
    bob.clearForms();
    cmd("shop", bob);
    pickExact(bob, "我的店铺");
    pickExact(bob, "领取暂存物品");
    check("领取暂存物品后清空", (shops()["xuid-bob"].pendingItems || []).length === 0,
        shops()["xuid-bob"].pendingItems);
    res = call("mgmtDeleteShop", { xuid: "xuid-bob" });
    check("mgmtDeleteShop：清空后可删", res.ok, res);
    check("店铺已删除", !shops()["xuid-bob"], Object.keys(shops()));

    // --- 15. 概览 / 配置写入 ---
    res = call("mgmtOverview");
    check("mgmtOverview", res.ok && res.stats.officialSells === 2 && res.stats.logs >= 3, res.stats);
    res = call("mgmtSetConfig", { pageSize: 30, tax: { rate: 0.2 } });
    check("mgmtSetConfig", res.ok && res.config.pageSize === 30 && res.config.tax.rate === 0.2, res.config);
    res = call("mgmtReload");
    check("mgmtReload", res.ok && res.config.pageSize === 30, res.config);
    res = call("mgmtSearchItems", { keyword: "钻石" });
    check("mgmtSearchItems", res.ok && res.rows.some((r) => r.type === "minecraft:diamond" && r.name === "钻石"), res.rows);

    // --- 16. 排序 / 分页不出错 ---
    res = call("mgmtListLogs", { page: 99 });
    check("mgmtListLogs 越界页归一", res.ok && res.page === res.pages, res);

    // --- 17. 生产数据迁移（模拟旧版 ShoppingMall 的 KVDatabase） ---
    const goldSnbt = '{Count:1b,Name:"minecraft:gold_ingot",Damage:0s,WasPickedUp:0b}';
    const cobbleSnbt = '{Count:1b,Name:"minecraft:cobblestone",Damage:0s,WasPickedUp:0b}';
    File._vfs["plugins/ShoppingMall/manifest.json"] = "{}";
    File._vfs["plugins/ShoppingMall/config.json"] = JSON.stringify({
        cmd: "sm", pageSizeLimit: 25, taxRate: 0.08, enableTaxSystem: true, taxOnlyOfficialShop: false,
        itemCategories: ["全部", "旧分类", "其他"],
        shopCreationCost: 500, shopDefaultItemTypes: 20, shopDefaultTotalItems: 800,
        enablePurchaseRequests: true, purchaseRequestFee: 5, purchaseRequestExpiry: 48,
        maxWarehouseSlots: 60, warehouseBuyoutPrice: 8000,
        notifyDiscountToAll: false,
        mainMenuButtons: { myShop: { enabled: true }, warehouse: { enabled: true }, tradeLogs: { enabled: false } },
    });
    Object.assign(legacyDb, {
        shops_data: {
            "9001": {
                name: "旧店", owner: "OldOwner", ownerXuid: "9001", isOpen: true, announcement: "欢迎光临",
                createdAt: 1700000000000, pendingEarnings: 55,
                items: { [goldSnbt]: { itemData: goldSnbt, name: "金锭", price: 25, quantity: 32, remark: "老货", category: "材料" } },
            },
        },
        official_shop: {
            purchaseItems: { [goldSnbt]: { itemData: goldSnbt, name: "金锭", displayName: "", price: 30, quantity: -1, remark: "", category: "材料" } },
            recycleItems: { [cobbleSnbt]: { itemData: cobbleSnbt, name: "圆石", price: 5, perCount: 64 } },
        },
        forbidden_items: ["minecraft:bedrock"],
        ranking_data: { "9001": { salesCount: 7, totalEarnings: 175 } },
        warehouse: {
            "9001": { playerName: "OldOwner", purchased: true, items: [{ itemData: goldSnbt, quantity: 5, description: "遗产", timestamp: 1700000000000, id: "w1" }] },
        },
        purchase_requests: {
            requests: [{ id: "RLEGACY1", itemName: "钻石", itemType: "minecraft:diamond", requesterName: "OldOwner", requesterXuid: "9001", priceEach: 100, quantity: 3, totalAmount: 300, remark: "老单", createdTime: Date.now() - 60000, status: "active" }],
            history: [{ id: "RLEGACY0", itemName: "圆石", itemType: "minecraft:cobblestone", requesterName: "OldOwner", requesterXuid: "9001", priceEach: 1, quantity: 10, totalAmount: 10, remark: "", createdTime: 1, status: "fulfilled" }],
        },
        purchase_logs: {
            global: [{ buyerName: "Buyer", buyerXuid: "9002", sellerName: "OldOwner", sellerXuid: "9001", itemName: "金锭", quantity: 2, priceEach: 25, totalPrice: 50, time: new Date().toLocaleString() }],
        },
        tax_records: { totalCollected: 888 },
        player_records: { "9001": { name: "OldOwner" } },
    });
    // onServerStarted 会先跑迁移再注册定时任务；连跑两次验证幂等
    (mc._listeners.onServerStarted || []).forEach((cb) => cb());
    (mc._listeners.onServerStarted || []).forEach((cb) => cb());

    res = call("mgmtListShops", { page: 1 });
    check("迁移：店铺", res.ok && res.rows.some((r) => r.xuid === "9001" && r.name === "旧店" && r.notice === "欢迎光临" && r.itemTypes === 1), res.rows);
    res = call("mgmtGetShop", { xuid: "9001" });
    check("迁移：货架条目", res.ok && res.items[0].name === "金锭" && res.items[0].price === 25 && res.items[0].quantity === 32, res.items);
    check("迁移：离线待结算", res.pendingEarnings === 55, res.pendingEarnings);
    res = call("mgmtListOfficial", { page: 1, keyword: "金锭" });
    check("迁移：官方出售", res.ok && res.rows.length === 1 && res.rows[0].price === 30 && res.rows[0].quantity === -1, res.rows);
    res = call("mgmtListRecycle", { page: 1, keyword: "圆石" });
    check("迁移：回收 perCount", res.ok && res.rows.some((r) => r.perCount === 64 && r.price === 5), res.rows);
    res = call("mgmtGetWarehouse", { xuid: "9001" });
    check("迁移：仓库", res.ok && res.purchased === true && res.slots === 100 && res.items.length === 1 && res.items[0].quantity === 5, res);
    res = call("mgmtListRequests", { page: 1 });
    check("迁移：求购进行中", res.ok && res.rows.some((r) => r.id === "RLEGACY1" && r.quantity === 3), res.rows);
    res = call("mgmtListRequests", { page: 1, history: true });
    check("迁移：求购历史", res.ok && res.rows.some((r) => r.id === "RLEGACY0"), res.rows);
    res = call("mgmtGetTaxStats");
    check("迁移：税收累计", res.ok && res.total === 888, res.total);
    res = call("mgmtGetRanking", { page: 1 });
    check("迁移：排行", res.ok && res.rows.some((r) => r.xuid === "9001" && r.sales === 7 && r.earnings === 175), res.rows);
    res = call("mgmtGetForbidden");
    check("迁移：禁售", res.ok && res.items.indexOf("minecraft:bedrock") >= 0, res.items);
    res = call("mgmtGetConfig");
    check("迁移：配置合并", res.ok
        && res.config.command === "sm" && res.config.pageSize === 25
        && res.config.tax.rate === 0.08 && res.config.tax.scope === "player"
        && res.config.shop.createCost === 500 && res.config.shop.maxItemTypes === 20
        && res.config.request.expiryHours === 48 && res.config.request.fee === 5
        && res.config.warehouse.maxSlots === 60
        && res.config.categories.indexOf("旧分类") >= 0
        && res.config.menu.buttons.logs === false, res.config);
    check("迁移：写入标记", File.exists("plugins/LuckyClover-ShoppingMall/migrated.flag"));
    check("迁移：报告生成", File.exists("plugins/LuckyClover-ShoppingMall/migration-report.json"));
    const shopsAfterMigrate = call("mgmtListShops", { page: 1 }).total;
    check("迁移：重复执行幂等", shopsAfterMigrate === 1, shopsAfterMigrate);

    // --- 18. 仓库：存入 / 取出 / 买断 ---
    alice.giveDirect("minecraft:bread", 6);
    const breadBefore = alice.count("minecraft:bread");
    alice.clearForms();
    cmd("smck", alice);
    pickExact(alice, "存入物品");
    pickExact(alice, "面包");
    submit(alice, ["", "3", "应急口粮"]);
    check("仓库：存入扣背包", alice.count("minecraft:bread") === breadBefore - 3, { before: breadBefore, after: alice.count("minecraft:bread") });
    let wh = call("mgmtGetWarehouse", { xuid: alice.xuid });
    check("仓库：条目写入", wh.ok && wh.items.length === 1 && wh.items[0].quantity === 3 && wh.items[0].description === "应急口粮", wh);
    pickExact(alice, "面包");
    pickExact(alice, "取出全部");
    check("仓库：取回到背包", alice.count("minecraft:bread") === breadBefore, alice.count("minecraft:bread"));
    money.set(alice.xuid, 20000);
    pickExact(alice, "买断扩容");
    pickExact(alice, "确认买断");
    check("仓库：买断扣款", money.get(alice.xuid) === 20000 - 8000, money.get(alice.xuid));
    wh = call("mgmtGetWarehouse", { xuid: alice.xuid });
    check("仓库：容量升到 buyoutSlots", wh.ok && wh.purchased === true && wh.slots === 100, wh);

    // 同一表单换一种回调数组写法（label 不占位）也要能取对值 —— 引擎约定兼容性
    alice.clearForms();
    cmd("smck", alice);
    pickExact(alice, "存入物品");
    pickExact(alice, "面包");
    submit(alice, ["2", "索引兼容测试"]); // data.length === 控件数 → offset=0
    wh = call("mgmtGetWarehouse", { xuid: alice.xuid });
    check("仓库：label 占位与否都能取值",
        alice.count("minecraft:bread") === breadBefore - 2 && wh.ok && wh.items.length === 1 && wh.items[0].quantity === 2,
        { inv: alice.count("minecraft:bread"), wh: wh.items });

    // --- 19. 提醒：售出入箱 ---
    const bobBox = (files[NOTIFY_PATH].players || {})["xuid-bob"];
    check("提醒：售出离线补记", Boolean(bobBox) && bobBox.unread >= 1, bobBox);

    // --- 20. 求购：发布 → 托管扣款 → 履约 ---
    const catalogItems = files["plugins/LuckyClover-ShoppingMall/Items.json"].items;
    const target = catalogItems[0];
    money.set(alice.xuid, 1000);
    alice.clearForms();
    cmd("smreq", alice);
    pickExact(alice, "发布求购");
    // 物品选择器：目录 2387 条必须分页（每页 40），而不是只显示 40 条
    const pickerForm = alice._forms[0];
    check("求购：物品选择器分页",
        Boolean(pickerForm) && pickerForm.buttons.some((b) => String(b).indexOf("下一页") >= 0)
        && pickerForm.buttons.some((b) => String(b).indexOf("分类：") >= 0),
        pickerForm && pickerForm.buttons.map((b) => String(b).split("\n")[0]).slice(-5));
    // 点「搜索」→ 应弹出关键词输入表单 → 提交后回到筛选后的选择器
    pickExact(alice, "搜索");
    const searchForm = alice._forms[0];
    check("搜索：弹出关键词输入表单", Boolean(searchForm) && searchForm.kind === "custom", searchForm && searchForm.kind);
    if (searchForm && searchForm.kind === "custom") submit(alice, [target.name]);
    const pickerAfterSearch = alice._forms[0];
    check("搜索：返回筛选后的选择器",
        Boolean(pickerAfterSearch) && String(pickerAfterSearch.content || "").indexOf(target.name) >= 0,
        pickerAfterSearch && pickerAfterSearch.content);
    pickExact(alice, target.name);
    submit(alice, ["", "50", "2", "测试求购"]);
    check("求购：托管扣款(含手续费5)", money.get(alice.xuid) === 1000 - (50 * 2 + 5), money.get(alice.xuid));
    res = call("mgmtListRequests", { page: 1 });
    const newReq = res.rows.find((r) => r.requesterName === "Alice");
    check("求购：订单写入", Boolean(newReq) && newReq.quantity === 2 && newReq.priceEach === 50 && newReq.remark === "测试求购", res.rows);
    money.set(bob.xuid, 0);
    bob.giveDirect(target.fullName, 5);
    bob.clearForms();
    cmd("smreq", bob);
    pickExact(bob, "求购大厅");
    pickExact(bob, target.name);
    pickExact(bob, "履约交货");
    submit(bob, ["", "2"]);
    check("求购：履约入账", money.get(bob.xuid) === 100, money.get(bob.xuid));
    res = call("mgmtListRequests", { page: 1, history: true });
    check("求购：完成进历史", res.ok && res.rows.some((r) => r.requesterName === "Alice" && r.status === "fulfilled"), res.rows);
    check("求购：货物交付", alice.count(target.fullName) >= 2 || (call("mgmtGetWarehouse", { xuid: alice.xuid }).items || []).some((i) => i.type === target.fullName), { inv: alice.count(target.fullName) });

    // --- 20b. 部分履约要能持久化，取消只退剩余部分 ---
    money.set(alice.xuid, 10000);
    alice.clearForms();
    cmd("smreq", alice);
    pickExact(alice, "发布求购");
    pickExact(alice, target.name);
    submit(alice, ["", "10", "5", "部分履约测试"]);
    check("求购：发布5件托管", money.get(alice.xuid) === 10000 - (10 * 5 + 5), money.get(alice.xuid));
    bob.giveDirect(target.fullName, 5);
    bob.clearForms();
    cmd("smreq", bob);
    pickExact(bob, "求购大厅");
    pickExact(bob, target.name);
    pickExact(bob, "履约交货");
    submit(bob, ["", "2"]);
    res = call("mgmtListRequests", { page: 1 });
    const partial = res.rows.find((r) => r.remark === "部分履约测试");
    check("求购：部分履约数量已持久化", Boolean(partial) && partial.quantity === 3 && partial.fulfilled === 2, partial);
    alice.clearForms();
    cmd("smreq", alice);
    pickExact(alice, "我的求购");
    pickExact(alice, target.name);
    pickExact(alice, "取消并退款");
    pickExact(alice, "确认取消");
    // 已交 2 件（10×2=20）不再退，只退剩余 3×10 + 手续费 5 = 35
    check("求购：取消只退剩余部分+手续费", money.get(alice.xuid) === 10000 - 55 + 35, money.get(alice.xuid));
    res = call("mgmtListRequests", { page: 1, history: true });
    const cancelled = res.rows.find((r) => r.remark === "部分履约测试");
    check("求购：部分履约后取消进历史", Boolean(cancelled) && cancelled.status === "cancelled", cancelled);

    // --- 21. 批量（面板） + 折扣到期恢复 ---
    const legacyKey = call("mgmtGetShop", { xuid: "9001" }).items[0].key;
    res = call("mgmtBatchList", { scope: "shop", xuid: "9001", keys: [legacyKey], action: "discount", rate: 5, minutes: 60 });
    check("批量：设置折扣", res.ok && res.count === 1, res);
    let item9001 = call("mgmtGetShop", { xuid: "9001" }).items[0];
    check("折扣：价格按折计算", item9001.price === 12 && item9001.originalPrice === 25 && item9001.discount === 5, item9001);
    res = call("mgmtBatchList", { scope: "official", keys: [diamondKey], action: "percent", value: 100 });
    check("批量：百分比改价", res.ok && res.count === 1, res);
    const diamondRow = call("mgmtListOfficial", { page: 1, keyword: "钻石" }).rows.find((r) => r.key === diamondKey);
    check("批量：改价生效", Boolean(diamondRow) && diamondRow.price === 200, diamondRow);
    res = call("mgmtBatchList", { scope: "official", keys: [diamondKey], action: "remove" });
    check("批量：官方下架", res.ok && res.count === 1, res);
    check("批量：下架后消失", !call("mgmtListOfficial", { page: 1, keyword: "钻石" }).rows.some((r) => r.key === diamondKey));
    files[SHOPS_PATH].shops["9001"].items[legacyKey].discountEndTime = Date.now() - 1000;
    mc._periodic();
    item9001 = call("mgmtGetShop", { xuid: "9001" }).items[0];
    check("折扣：到期恢复原价", item9001.price === 25 && item9001.discount === null && item9001.originalPrice === null, item9001);
    const box9001 = (files[NOTIFY_PATH].players || {})["9001"];
    check("提醒：折扣到期入箱", Boolean(box9001) && box9001.unread >= 1, box9001);

    // --- 22. 主菜单含新入口 ---
    admin._op = true;
    admin.clearForms();
    cmd("shop", admin);
    const menuForm = admin._forms[0];
    check("主菜单：含仓库/求购/提醒入口",
        Boolean(menuForm) && ["个人仓库", "悬赏 · 求购", "提醒箱"].every((word) =>
            menuForm.buttons.some((b) => String(b).indexOf(word) >= 0)),
        menuForm && menuForm.buttons.map((b) => String(b).split("\n")[0]));
    admin.clearForms();

    // --- 23. 表单发送失败（sendForm 返回 null）时自动重试 ---
    alice.clearForms();
    cmd("smck", alice);
    pickExact(alice, "存入物品");
    let sendAttempts = 0;
    const originalSendForm = alice.sendForm;
    alice.sendForm = function (form, cb) {
        sendAttempts++;
        if (sendAttempts === 1) return null; // 模拟客户端没弹窗（引擎返回 Null）
        alice.sendForm = originalSendForm;
        return originalSendForm.call(alice, form, cb);
    };
    pickExact(alice, "面包"); // 触发自定义表单 → 第一次失败
    await sleep(400);        // 等 safeSend 在 120ms 后重试
    const retriedForm = alice._forms[alice._forms.length - 1];
    check("表单发送失败会自动重试并最终弹出",
        sendAttempts >= 2 && Boolean(retriedForm) && retriedForm.kind === "custom",
        { sendAttempts, kind: retriedForm && retriedForm.kind, title: retriedForm && retriedForm.form && retriedForm.form._title });
    alice.sendForm = originalSendForm;
    alice.clearForms();

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch((error) => {
    console.error("SMOKE ERROR:", error && error.stack || error);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
});
