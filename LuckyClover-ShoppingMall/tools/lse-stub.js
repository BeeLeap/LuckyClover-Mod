// LSE(quickjs) 运行环境 stub：让插件能在 Node 里跑起来，用于自动化测试。
// 提供：加载插件、捕获表单、捕获命令与 ll.export 接口、可控的玩家/背包/钱包、
//       可控的"写入失败"注入（用来验证各种回滚路径）、以及对原版贴图清单的校验。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
// 原版贴图清单（校验图标路径是否真实存在）。可用环境变量 BEDROCK_SAMPLES_TEXTURES 指向
// 官方 bedrock-samples 的 resource_pack/textures 目录；找不到时跳过贴图校验，其余检查照常执行。
const SAMPLE_CANDIDATES = [
    process.env.BEDROCK_SAMPLES_TEXTURES,
    "D:\\Minecraft示例\\bedrock-samples-1.21.130.3\\resource_pack\\textures",
    "D:\\bedrock-samples\\resource_pack\\textures",
    path.join(ROOT, "bedrock-samples", "resource_pack", "textures"),
];
const SAMPLE = SAMPLE_CANDIDATES.find((p) => p && fs.existsSync(p)) || "";

const EMPTY_TEX = { items: new Set(), blocks: new Set(), ui: new Set() };
let TEX_CACHE = null;
function textures() {
    if (TEX_CACHE) return TEX_CACHE;
    if (!SAMPLE) {
        TEX_CACHE = Object.assign({ unavailable: true }, EMPTY_TEX);
        return TEX_CACHE;
    }
    const list = (dir, prefix) => {
        const out = new Set();
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) for (const s of list(path.join(dir, e.name), `${prefix}${e.name}/`)) out.add(s);
            else if (e.name.toLowerCase().endsWith(".png")) out.add(prefix + e.name.slice(0, -4));
        }
        return out;
    };
    try {
        TEX_CACHE = {
            items: list(path.join(SAMPLE, "items"), ""),
            blocks: list(path.join(SAMPLE, "blocks"), ""),
            ui: list(path.join(SAMPLE, "ui"), ""),
        };
    } catch (error) {
        TEX_CACHE = Object.assign({ unavailable: true, reason: String(error) }, EMPTY_TEX);
    }
    return TEX_CACHE;
}

function texturesUnavailable() {
    return Boolean(textures().unavailable);
}

function textureExists(p) {
    const m = /^textures\/(items|blocks|ui)\/(.+)$/.exec(String(p || ""));
    if (!m) return false;
    const set = textures();
    if (set.unavailable) return true; // 无贴图清单：不判定，避免误报
    return set[m[1]].has(m[2]);
}

function makeItem(type, count, aux, nbt) {
    return {
        type,
        count,
        aux: aux || 0,
        nbt: nbt || "",
        getNbt() { return { toSNBT: () => this.owner.nbt || `{Count:${this.owner.count}b,Name:"${this.owner.type}"}` }; },
        get maxStackSize() { return /sword|helmet|chestplate|leggings|boots|pickaxe|axe|shovel|hoe|trident|shield|bow/.test(type) ? 1 : 64; },
        isNull() { return false; },
        setCount(n) { this.count = n; },
        // 供 getNbt 使用的自引用
        get owner() { return this; },
    };
}

function makeInventory(items) {
    const slots = items.slice();
    while (slots.length < 36) slots.push(null); // 背包总是 36 格，空位必须是 null 而不是 undefined
    const inv = {
        _slots: slots,
        get size() { return inv._slots.length; },
        _removeHook: null,
        getItem(i) { return inv._slots[i] || null; },
        setItem(i, it) { inv._slots[i] = it; },
        removeItem(i, n) {
            if (inv._removeHook && inv._removeHook(i, n) === false) throw new Error("注入的扣除失败");
            const it = inv._slots[i];
            if (!it) return false;
            if (it.count <= n) inv._slots[i] = null;
            else it.count -= n;
            return true;
        },
    };
    return inv;
}

function loadPlugin(options) {
    const opts = options || {};
    const problems = [];
    const forms = [];
    const commands = {};
    const exports = {};
    const listeners = {};
    const wallet = Object.assign({ "xuid-test": 100000, "xuid-seller": 100000 }, opts.wallet || {});
    const storeData = {};
    let currentPlayer = null;
    let giveItemHook = null;

    function makePlayer(name, xuid, op, itemSpecs) {
        const specs = itemSpecs || [
            { type: "minecraft:diamond", count: 64 },
            { type: "minecraft:apple", count: 16 },
            { type: "minecraft:stone", count: 32 },
        ];
        const inv = makeInventory(specs.map((s) => makeItem(s.type, s.count, s.aux, s.nbt)));
        return {
            name,
            realName: name,
            xuid,
            isOP() { return Boolean(op); },
            tell() {},
            sendToast() {},
            sendForm(form, cb) { forms.push({ form, cb, player: this }); return forms.length; },
            sendSimpleForm(title, content, buttons, images, cb) {
                forms.push({ simple: true, title, content, buttons, images, cb, player: this });
                return forms.length;
            },
            closeForm() { return true; },
            getInventory() { return inv; },
            giveItem(item) {
                if (giveItemHook) {
                    const verdict = giveItemHook(item, this);
                    if (verdict === false) return false;
                }
                // 找一个空位放进去（简化实现，够测试用）
                for (let i = 0; i < inv._slots.length; i++) {
                    const slot = inv._slots[i];
                    if (!slot) { inv._slots[i] = item; return true; }
                    if (slot.type === item.type && slot.count + item.count <= 64) { slot.count += item.count; return true; }
                }
                return false;
            },
            refreshItems() {},
        };
    }

    function JsonConfigFile(file, defaultJson) {
        const name = path.basename(file);
        if (!storeData[name]) {
            const filePath = path.join(ROOT, name);
            let data = null;
            if (fs.existsSync(filePath)) {
                try { data = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (e) { data = null; }
            }
            if (!data && defaultJson) {
                try { data = JSON.parse(defaultJson); } catch (e) { data = {}; }
            }
            storeData[name] = data && typeof data === "object" ? data : {};
        }
        const data = storeData[name];
        return {
            get(key, def) { const v = data[key]; return v === undefined ? def : JSON.parse(JSON.stringify(v)); },
            set(key, value) { data[key] = JSON.parse(JSON.stringify(value)); },
            remove(key) { delete data[key]; },
        };
    }

    const sandbox = {
        console,
        JSON, Math, Date, Number, String, Boolean, Array, Object, isNaN, parseInt, parseFloat, RegExp, Error,
        setTimeout: () => 0,
        setInterval: () => 0,
        logger: {
            info() {},
            warn(m) { problems.push(`logger.warn: ${m}`); },
            error(m) { problems.push(`logger.error: ${m}`); },
            setTitle() {},
        },
        File: { mkdir() {}, exists() { return false; }, readFrom() { return ""; }, writeTo() { return true; } },
        JsonConfigFile,
        money: {
            get(xuid) { const v = wallet[String(xuid)]; return v === undefined ? 0 : v; },
            add(xuid, amount) { wallet[String(xuid)] = (wallet[String(xuid)] || 0) + Math.max(0, Math.floor(Number(amount) || 0)); return true; },
            reduce(xuid, amount) {
                const v = Math.max(0, Math.floor(Number(amount) || 0));
                if ((wallet[String(xuid)] || 0) < v) return false;
                wallet[String(xuid)] = (wallet[String(xuid)] || 0) - v;
                return true;
            },
        },
        NBT: {
            parseSNBT(snbt) {
                return {
                    _snbt: String(snbt || ""),
                    setByte() {},
                    toSNBT() { return String(this._snbt || "{}"); },
                };
            },
        },
        ll: {
            registerPlugin() {},
            export(fn, ns, name) { exports[name] = fn; },
        },
        mc: {
            listen(evt, cb) { (listeners[evt] = listeners[evt] || []).push(cb); },
            regPlayerCmd(name, desc, cb) { commands[name] = cb; },
            getPlayer(xuid) { return currentPlayer && String(currentPlayer.xuid) === String(xuid) ? currentPlayer : null; },
            getOnlinePlayers() { return currentPlayer ? [currentPlayer] : []; },
            newItem() { return null; },
            newCustomForm() {
                const controls = [];
                const form = {
                    _controls: controls,
                    setTitle(t) { form._title = t; return form; },
                    addLabel(t) { controls.push({ type: "label", text: t }); return form; },
                    addInput(a, b, c) { controls.push({ type: "input", label: a, ph: b, value: c }); return form; },
                    addDropdown(a, b, c) { controls.push({ type: "dropdown", label: a, options: b, def: c }); return form; },
                    addSwitch(a, b) { controls.push({ type: "switch", label: a, def: b }); return form; },
                    addDivider() { controls.push({ type: "divider" }); return form; },
                    addHeader(t) { controls.push({ type: "header", text: t }); return form; },
                    setSubmitButton() { return form; },
                };
                return form;
            },
            newSimpleForm() {
                return { setTitle() { return this; }, setContent() { return this; }, addButton() { return this; } };
            },
            setInterval() { return 0; },
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "LuckyClover-ShoppingMall.js"), "utf8"), sandbox,
        { filename: "LuckyClover-ShoppingMall.js" });

    return {
        sandbox,
        vm,
        problems,
        forms,
        commands,
        exports,
        listeners,
        wallet,
        storeData,
        makePlayer,
        makeItem,
        makeInventory,
        textureExists,
        store: (name) => {
            if (!storeData[name]) {
                JsonConfigFile(path.join(ROOT, name), "{}");
            }
            return storeData[name];
        },
        setCurrentPlayer(p) { currentPlayer = p; },
        getCurrentPlayer() { return currentPlayer; },
        setGiveItemHook(fn) { giveItemHook = fn; },
        run(name) { return vm.runInContext(name, sandbox); },
        startServer() {
            for (const cb of listeners.onServerStarted || []) cb();
        },
    };
}

module.exports = { loadPlugin, textureExists, textures, texturesUnavailable };
