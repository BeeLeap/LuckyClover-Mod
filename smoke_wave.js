// LuckyClover-Wave 冒烟测试：stub LSE 环境，手动步进定时器，跑完整场活动
"use strict";
const path = require("path");

const PLUGIN = path.join(__dirname, "LuckyClover-Wave", "LuckyClover-Wave.js");

// ---- 定时器接管（必须在 require 前） ----
const timers = [];
global.setInterval = (fn) => { timers.push({ fn, dead: false }); return timers.length; };
global.clearInterval = (id) => { if (timers[id - 1]) timers[id - 1].dead = true; };
// setTimeout 也接管：死亡落点的"延迟自检/补传"用它排队，测试里 flushDeferred 手动放行
const deferred = [];
global.setTimeout = (fn) => { deferred.push(fn); return deferred.length; };
function flushDeferred(limit) {
    let n = 0;
    const max = limit == null ? 500 : limit;
    while (deferred.length && n < max) { const fn = deferred.shift(); fn(); n++; }
}
function step(n) {
    for (let i = 0; i < (n || 1); i++) {
        for (const t of timers) if (!t.dead) t.fn();
    }
}
function liveTimers() { return timers.filter((t) => !t.dead).length; }

// ---- LSE stubs ----
// 引擎的位置类（spawnMob 等 API 要求 FloatPos 实例，普通对象会报 Wrong type of argument）
global.FloatPos = class {
    constructor(x, y, z, dimid) { this.x = x; this.y = y; this.z = z; this.dimid = dimid || 0; }
};
const exported = {};
const cmds = {};       // regPlayerCmd name -> cb
const listens = {};    // event -> [fn]
const runcmdLog = [];
const sidebarSetCalls = [];
const sidebarState = { sidebar: { lines: ["§b旧服务器§f: {serverName}", "§b时间§f: {time}"], cycleEnabled: true, title: "§aLuckyClover" } };
global.ll = {
    registerPlugin() {},
    export(fn, ns, name) { exported[name] = fn; },
    hasExported(ns, name) {
        return ns === "LuckyCloverSidebar" && (name === "mgmtGetConfig" || name === "mgmtSetConfig");
    },
    imports(ns, name) {
        if (ns !== "LuckyCloverSidebar") return null;
        if (name === "mgmtGetConfig") return () => JSON.stringify(sidebarState);
        if (name === "mgmtSetConfig") return (json) => { sidebarSetCalls.push(JSON.parse(json)); return JSON.stringify({ ok: true }); };
        return null;
    },
};
global.logger = { setTitle() {}, info() {}, warn() {}, error() {} };
global.File = { mkdir() {}, read() { return ""; }, write() {}, exists() { return false; } };

const files = {};
global.JsonConfigFile = class {
    constructor(p, def) { this.p = p; if (!files[p]) files[p] = def ? JSON.parse(def) : {}; }
    get(k) { return files[this.p][k]; }
    set(k, v) { files[this.p][k] = v; }
    delete(k) { delete files[this.p][k]; }
    refresh() {}
    init(k, v) { if (files[this.p][k] === undefined) files[this.p][k] = v; }
};

const spawnedMobs = [];
let mobFactorySeq = 0;
function makeMob(type, point) {
    mobFactorySeq++;
    return {
        type,
        name: "",
        health: 20,
        pos: new FloatPos(point.x + 0.5, point.y, point.z + 0.5, point.dimid || 0),
        effects: [],
        addEffect(id) { this.effects.push(id); },
        removed: false,
        remove() { this.removed = true; this.health = 0; },
    };
}

const online = [];
function makePlayer(name, x, y, z, xuid) {
    const p = {
        realName: name, name, xuid: xuid || "",
        pos: { x, y, z, dimid: 0 },
        health: 20, // 引擎的 health：死亡界面=0，落点逻辑据此推迟传送
        tells: [], actionbars: [], gm: null,
        lastForm: null, formCb: null, formsSent: 0,
        inv: [], armor: [],
        teleport(px, py, pz, dim) { this.pos = { x: px, y: py, z: pz, dimid: dim || 0 }; },
        setGameMode(m) { this.gm = m; },
        setActionBar(t) { this.actionbars.push(t); },
        removeBossbar() {},
        isOP() { return true; },
        tell(t) { this.tells.push(t); },
        hurt(n) { this.hurtCalls = (this.hurtCalls || 0) + 1; this.lastHurt = n; },
        // 背包容器桩（36 主背包 + 4 护甲）
        getInventory() {
            const a = this.inv;
            const empty = (v) => v == null || (v && v.type && (v.type === "air" || v.type === "minecraft:air"));
            return { getItem: (i) => a[i] || null, setItem: (i, v) => { if (empty(v)) delete a[i]; else a[i] = v; } };
        },
        getArmorContainer() {
            const a = this.armor;
            const empty = (v) => v == null || (v && v.type && (v.type === "air" || v.type === "minecraft:air"));
            return { getItem: (i) => a[i] || null, setItem: (i, v) => { if (empty(v)) delete a[i]; else a[i] = v; } };
        },
        sendForm(form, cb) { this.lastForm = form; this.formCb = cb; this.formsSent++; },
    };
    return p;
}
const P1 = makePlayer("Mell", 1, 64, 1, "XM1");
const P2 = makePlayer("Steve", 2, 64, 2, "XS2");
online.push(P1, P2);

global.mc = {
    regPlayerCmd(name, desc, cb) { cmds[name] = cb; },
    listen(ev, fn) { (listens[ev] = listens[ev] || []).push(fn); },
    getOnlinePlayers() { return online.slice(); },
    getPlayer(name) { return online.find((p) => p.realName === name || p.name === name) || null; },
    spawnMob(type, pos) {
        const m = makeMob(type, pos);
        spawnedMobs.push(m);
        return m;
    },
    runcmd(c) { runcmdLog.push(String(c)); },
    newItem(type, count) {
        return {
            type, count,
            setAux(a) { this.aux = a; },
            setCustomName(n) { this.customName = n; },
        };
    },
    newSimpleForm() {
        return {
            _t: "", _c: "", _btns: [],
            setTitle(t) { this._t = t; },
            setContent(c) { this._c = c; },
            addButton(text, icon) { this._btns.push({ text, icon: icon || null }); },
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

require(PLUGIN);
(listens.onServerStarted || []).forEach((fn) => fn());

// ---- 测试辅助 ----
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log("PASS " + name); }
    else { fail++; console.log("FAIL " + name + (extra !== undefined ? " | " + JSON.stringify(extra) : "")); }
}
function wave(p, args) { cmds.wave(p, args); }
function lastTell(p) { return p.tells[p.tells.length - 1] || ""; }
function liveMobs() { return spawnedMobs.filter((m) => !m.removed && m.health > 0 && m.type !== "armor_stand"); }
function coreStand() {
    const all = spawnedMobs.filter((m) => m.type === "armor_stand");
    return all[all.length - 1]; // 最近一次生成的（重生后是活的）
}
function coreHpNow() {
    const s = coreStand();
    const m = s && String(s.name).match(/HP (\d+)\/(\d+)/);
    return m ? Number(m[1]) : null;
}
function fireMobDie(mob, source) { (listens.onMobDie || []).forEach((fn) => fn(mob, source)); }
function fireRespawn(p) { (listens.onRespawn || []).forEach((fn) => fn(p)); }
function fireJoin(p) { (listens.onJoin || []).forEach((fn) => fn(p)); }

// 初始化插件内部配置对象（首次 cfg() 调用会落盘 "cfg" key）
wave(P1, ["status"]);

// 调小配置节奏
const CONFIG_PATH = "plugins/LuckyClover-Wave/config.json";
// 模拟"旧版 config.json 缺新字段"：删掉 sidebar_lines，验证 cfg() 深合并补默认
delete files[CONFIG_PATH].cfg.sidebar_lines;
// 模拟"旧版配置只有 2 件商品"：验证 cfg() 按 id 补齐新默认商品（铁甲全套等）
files[CONFIG_PATH].cfg.shop.items = files[CONFIG_PATH].cfg.shop.items.slice(0, 2);
files[CONFIG_PATH].cfg.waves.intermission_seconds = 2;
files[CONFIG_PATH].cfg.waves.boss_wave = 3;
files[CONFIG_PATH].cfg.waves.pool = ["zombie"];
files[CONFIG_PATH].cfg.waves.elite_waves = [2];
files[CONFIG_PATH].cfg.waves.count_base = 3;
files[CONFIG_PATH].cfg.waves.count_per_player = 1;
files[CONFIG_PATH].cfg.waves.growth = 1;
files[CONFIG_PATH].cfg.waves.health_per_player = 0.05; // 2 人 → 生命 ×1.05
files[CONFIG_PATH].cfg.auto_start = { enabled: true, countdown_seconds: 10, max_resets: 5 };
// 启动时 onServerStarted 已把合并后的完整配置写回文件（新键所见即所得）
check("startup materializes all new config keys",
    Boolean(files[CONFIG_PATH].cfg.auto_deop && files[CONFIG_PATH].cfg.auto_start
        && files[CONFIG_PATH].cfg.waves && files[CONFIG_PATH].cfg.waves.health_per_player !== undefined),
    Object.keys(files[CONFIG_PATH].cfg).filter((k) => /^auto/.test(k)));
files[CONFIG_PATH].cfg.lock_night = true;
// 特殊机制测试参数：确定性词缀/增益/Boss事件/成长
files[CONFIG_PATH].cfg.affixes.pool = [{ id: "blast", name: "爆破", death_blast: { radius: 4, damage: 6 } }];
files[CONFIG_PATH].cfg.buff_pool = [{ id: "core_heal", name: "紧急加固", desc: "核心 +40 血" }];
files[CONFIG_PATH].cfg.boss_tick = { summon_interval: 1, summon_count: 2, enrage_hp_pct: 0.3 };
files[CONFIG_PATH].cfg.growth = { speed_from_wave: 2, speed_amp: 1, strength_from_wave: 99, strength_amp: 1 };
files[CONFIG_PATH].cfg.rewards = [
    { rank: 1, commands: ["say WIN1 {player} rank={rank} waves={waves}"] },
    { rank: 2, commands: ["say WIN2 {player}"] },
];

// ---- 1. 布场 ----
wave(P1, ["setcore"]);      // 站位 (1,64,1) -> core 在此
// 把核心挪到场地中央、刷怪点放远处（模拟布场后的配置）
files[CONFIG_PATH].cfg.core.pos = { x: 10, y: 64, z: 10, dimid: 0 };
wave(P1, ["setlobby"]);
wave(P1, ["setseat"]);
wave(P1, ["setreturn"]);
wave(P1, ["addspawn"]);
// 把观战席挪到独立坐标：setseat 和 setlobby 都在 (1,64,1) 执行，坐标相同会让
// "淘汰→观战席"的断言无法区分是落在座位还是集合点
files[CONFIG_PATH].cfg.arena.seat = { x: 5, y: 70, z: 5, dimid: 0 };
files[CONFIG_PATH].cfg.spawns = [
    { x: 5, y: 64, z: 5, dimid: 0 },
    { x: 15, y: 64, z: 15, dimid: 0 },
];
check("lobby set", files[CONFIG_PATH].cfg.arena.lobby.x === 1, files[CONFIG_PATH].cfg.arena.lobby);
check("spawns ready", files[CONFIG_PATH].cfg.spawns.length === 2);

// ---- 1.5 商店：表单优先（空闲期可备货） ----
money.set("XM1", 1000);
wave(P1, ["shop"]);
check("shop form sent with 8 items (2 saved + 6 appended)", P1.lastForm && P1.lastForm._btns.length === 8, P1.lastForm && P1.lastForm._btns.length);
check("appended armor item present", P1.lastForm && P1.lastForm._btns.some((b) => b.text.includes("铁甲全套")), P1.lastForm && P1.lastForm._btns.map((b) => b.text));
check("form content shows balance", P1.lastForm && P1.lastForm._c.includes("1000 金币"), P1.lastForm && P1.lastForm._c);
check("form item icon", P1.lastForm && P1.lastForm._btns[0].icon === "textures/items/arrow", P1.lastForm && P1.lastForm._btns[0]);
// 点击第一个商品（箭）→ 购买 + 表单重开
P1.formCb(P1, 0);
check("form buy arrow ok", lastTell(P1).includes("购买成功") && lastTell(P1).includes("箭 ×16"), lastTell(P1));
check("money reduced 1000->900", money.get("XM1") === 900, money.get("XM1"));
check("give command issued", runcmdLog.some((c) => c === "give Mell arrow 16"), runcmdLog.slice(-3));
check("form reopened with new balance", P1.lastForm && P1.lastForm._c.includes("900 金币"), P1.lastForm && P1.lastForm._c);
// 关闭表单不重开
const formsBeforeClose = P1.formsSent;
P1.formCb(P1, null);
check("close form no reopen", P1.formsSent === formsBeforeClose, P1.formsSent);
// 文本兜底：表单 API 缺失时
const savedForm = mc.newSimpleForm;
delete mc.newSimpleForm;
wave(P1, ["shop"]);
check("text fallback list", P1.tells.some((t) => t.includes("活动商店")) && P1.tells.some((t) => t.includes("金苹果")), P1.tells.slice(-6));
mc.newSimpleForm = savedForm;
wave(P1, ["buy", "nope"]);
check("unknown item rejected", lastTell(P1).includes("没有这个商品"), lastTell(P1));
wave(P2, ["buy", "beef"]);
check("insufficient balance rejected", lastTell(P2).includes("金币不足"), lastTell(P2));

// ---- 2. 加入 & 启动 ----
// 赛前家当（验证开局暂存清空、结束返还）
P1.inv[0] = { type: "diamond", count: 5 };
P1.inv[8] = { type: "golden_apple", count: 2 };
P1.armor[0] = { type: "iron_helmet", count: 1 };
wave(P2, ["join"]);
check("steve joined + teleported", lastTell(P2).includes("已加入") && P2.pos.x === files[CONFIG_PATH].cfg.arena.lobby.x, P2.pos);
check("no kit at idle join (kit deferred to start)", !runcmdLog.some((c) => c.includes("give Steve")), runcmdLog.filter((c) => c.includes("give")));
const lastSb = () => sidebarSetCalls[sidebarSetCalls.length - 1];
// 首赛前：退出 → 取消倒计时 → 还原原侧边栏（此时尚无榜单）；再进 → 重新接管
wave(P2, ["leave"]);
check("pre-first cancel restores original sidebar", lastSb().sidebar.lines.some((l) => l.includes("{serverName}")), lastSb().sidebar.lines);
wave(P2, ["join"]);
check("re-join retakes sidebar", lastSb().sidebar.lines.some((l) => l.includes("{wave}")), lastSb().sidebar.lines);
wave(P1, ["status"]);
check("status shows 1 participant", P1.tells.some((t) => t.includes("参与: §f1")), P1.tells.slice(-2));
wave(P1, ["start", "3"]);
check("start ok", lastTell(P1).includes("已启动"), lastTell(P1));
check("timer running", liveTimers() === 1, liveTimers());
check("sidebar taken over", sidebarSetCalls.length >= 1
    && JSON.stringify(sidebarSetCalls[0].sidebar.lines).includes("{wave}")
    && sidebarSetCalls[0].sidebar.cycleEnabled === false, sidebarSetCalls[0]);
check("cfg merge restores missing sidebar_lines (10 lines)", sidebarSetCalls.length >= 1
    && Array.isArray(sidebarSetCalls[0].sidebar.lines) && sidebarSetCalls[0].sidebar.lines.length === 10,
    sidebarSetCalls[0].sidebar.lines && sidebarSetCalls[0].sidebar.lines.length);
check("spawn pos is FloatPos", coreStand() instanceof FloatPos || spawnedMobs.some((m) => m.pos instanceof FloatPos), "no FloatPos in spawn pos");
// 活动经济：开局清空
check("balance cleared at start", money.get("XM1") === 0, money.get("XM1"));
// 背包：赛前物品暂存清空（清空走 /clear 指令 + 容器兜底）
check("inventory stashed & cleared at start", P1.inv[0] === undefined && P1.inv[8] === undefined && P1.armor[0] === undefined,
    { inv0: P1.inv[0], armor0: P1.armor[0] });
check("clear uses vanilla /clear command", runcmdLog.some((c) => c === "clear Mell"), runcmdLog.filter((c) => c.startsWith("clear")));
// kit 顺序回归：必须在暂存清空之后发（否则 kit 被当赛前物品收走，玩家开局空手）
const kitAt = (n) => runcmdLog.lastIndexOf("give " + n + " iron_sword 1");
const clearAt = (n) => runcmdLog.lastIndexOf("clear " + n);
check("kit issued at start, AFTER stash clear (both players)",
    ["Mell", "Steve"].every((n) => clearAt(n) >= 0 && kitAt(n) > clearAt(n)),
    { mell: [clearAt("Mell"), kitAt("Mell")], steve: [clearAt("Steve"), kitAt("Steve")] });
// 活动期间获得的物品（商店/装备）
P1.inv[1] = { type: "iron_sword", count: 1 };
P1.armor[1] = { type: "iron_chestplate", count: 1 };
// 锁夜：gamerule 冻结 + 立即入夜
check("night freeze gamerule", runcmdLog.some((c) => c === "gamerule dodaylightcycle false"), runcmdLog.slice(-6));
check("set night at start", runcmdLog.some((c) => c === "time set night"), runcmdLog.slice(-6));
// 核心实体化：方块 + 血量名牌盔甲架
check("core block placed", runcmdLog.some((c) => c === "setblock 10 64 10 diamond_block"), runcmdLog.slice(0, 3));
check("core stand spawned", Boolean(coreStand()), spawnedMobs.map((m) => m.type));
check("stand name shows full hp", coreStand() && coreStand().name.includes("HP 200/200"), coreStand() && coreStand().name);

// ---- 3. 第一波（10 秒倒计时） ----
step(10);
const wave1Mobs = liveMobs().slice();
check("wave1 spawned", wave1Mobs.length >= 3, wave1Mobs.length);
// 人数难度：count_base 3 + count_per_player 1 × 2 人 = 5 只；自然血 20 × 1.05 = 21
check("wave1 count scales with players (3+1×2=5)", wave1Mobs.length === 5, wave1Mobs.length);
check("normal mob health scales with players (20→21)", wave1Mobs.every((m) => m.health === 21),
    wave1Mobs.map((m) => m.health));
check("mob marker name", wave1Mobs.length > 0 && /^#\d+\.\d+/.test(wave1Mobs[0].name), wave1Mobs[0] && wave1Mobs[0].name);
const st1 = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("getStatus payload", st1.ok === true && st1.wave === 1 && st1.total === 3 && Array.isArray(st1.topKills) && st1.coreMax === 200, st1);

// 核心受击：把一只怪挪进核心半径
wave1Mobs[0].pos = { x: 10.2, y: 64, z: 10.4, dimid: 0 };
step(1);
check("core damaged", P1.actionbars.some((a) => a.includes("核心受击")), P1.actionbars.slice(-2));
check("stand hp updated to 199", coreStand().name.includes("HP 199/200"), coreStand().name);

// ---- 核心保护：挖方块 / 攻击盔甲架 ----
const fireDestroy = () => (listens.onDestroyBlock || []).map((fn) => fn(P1, { pos: { x: 10, y: 64, z: 10, dimid: 0 }, type: "diamond_block" }));
const destroyRet = fireDestroy();
check("mining core cancelled", destroyRet.some((r) => r === false), destroyRet);
check("no hp loss by default (anti-grief)", coreStand().name.includes("199/200"), coreStand().name);
check("core re-placed after mine attempt", runcmdLog.filter((c) => c === "setblock 10 64 10 diamond_block").length >= 2, runcmdLog.filter((c) => c.includes("setblock 10 64 10")).length);
files[CONFIG_PATH].cfg.core.dmg_on_mine = true;
fireDestroy();
check("dmg_on_mine flag works (199-5=194)", coreStand().name.includes("194/200"), coreStand().name);
const atkRet = (listens.onAttackEntity || []).map((fn) => fn(P1, coreStand()));
check("attacking core stand cancelled", atkRet.some((r) => r === false), atkRet);
check("attack dmg with flag (194-5=189)", coreStand().name.includes("189/200"), coreStand().name);
files[CONFIG_PATH].cfg.core.dmg_on_mine = false;
// 盔甲架被打死 → tick 自动重生
const standCountBefore = spawnedMobs.filter((m) => m.type === "armor_stand").length;
coreStand().remove(); // remove() 会把 health 置 0 → 视为死亡
step(1);
check("core stand respawned after death", spawnedMobs.filter((m) => m.type === "armor_stand").length > standCountBefore,
    spawnedMobs.filter((m) => m.type === "armor_stand").length);

// 清波：击杀记分（onMobDie 记 Mell）+ 血量归零（tick 判活）
// 清波：击杀记分（覆盖包装对象 source 与直接实体两种引擎形态）+ 血量归零（tick 判活）
const wrapSource = { isPlayer: () => true, toPlayer: () => P1 };
wave1Mobs.forEach((m, i) => {
    fireMobDie(m, i === 0 ? wrapSource : P1);
    m.health = 0;
});
const stAfterKills = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("getStatus myScore after kills (wrapper+direct)", stAfterKills.myScore >= 5 && stAfterKills.topKills.length > 0, stAfterKills.topKills);
check("kill rewards +20x5 = 100", money.get("XM1") === 100, money.get("XM1"));
step(1);
check("wave1 cleared -> intermission", P1.tells.some((t) => t.includes("第 1 波清空")) && P1.tells.some((t) => t.includes("下一波")), P1.tells.slice(-4));

// ---- 4. 波间：修理核心 + 三选一增益 ----
check("money after wave1 kills = 100", money.get("XM1") === 100, money.get("XM1"));
const hpBeforeRepair = coreHpNow();
wave(P1, ["repair"]);
const hpAfterRepair = coreHpNow();
check("repair heals +10 and charges 100", hpAfterRepair === Math.min(200, hpBeforeRepair + 10) && money.get("XM1") === 0,
    { hpBeforeRepair, hpAfterRepair, bal: money.get("XM1") });
wave(P1, ["repair"]);
check("repair cooldown", lastTell(P1).includes("冷却"), lastTell(P1));
check("buff form auto-opened", P1.lastForm && P1.lastForm._t.includes("波间强化"), P1.lastForm && P1.lastForm._t);
// 表单 API 缺失时的文本兜底
const savedSimpleForm = mc.newSimpleForm;
delete mc.newSimpleForm;
wave(P1, ["buff"]);
check("buff text fallback list", P1.tells.some((t) => t.includes("本波三选一")), P1.tells.slice(-5));
mc.newSimpleForm = savedSimpleForm;
P1.formCb(P1, 0); // 紧急加固
check("buff core_heal applied (→200)", coreHpNow() === 200, coreHpNow());
check("buff picked confirm", lastTell(P1).includes("已选择【紧急加固】"), lastTell(P1));
P1.formCb(P1, 0); // 再选一次
check("double pick rejected", lastTell(P1).includes("本波你已选择"), lastTell(P1));

// ---- 5. 第二波（精英波 + 词缀 + 成长） ----
step(3); // intermission 2s + 触发
const wave2 = liveMobs();
check("wave2 elite spawned", wave2.some((m) => m.name.includes("国庆精英")), wave2.map((m) => m.name));
const eliteMob = wave2.find((m) => m.name.includes("国庆精英"));
check("elite health applied", eliteMob.health === 84, eliteMob.health); // 80 × 1.05（2 人）
check("elite effect id 11 (resistance)", eliteMob.effects.includes(11), eliteMob.effects);
check("elite affix prefix in name", wave2.some((m) => m.name.includes("[爆破]")), wave2.map((m) => m.name));
const w2normal = wave2.find((m) => !m.name.includes("国庆精英") && !m.name.includes("[爆破]"));
check("wave2 growth speed effect", Boolean(w2normal) && w2normal.effects.includes(1), w2normal && w2normal.effects);
// 爆破词缀死亡触发：把精英挪到玩家身边再杀 → 玩家被炸
eliteMob.pos = { x: P1.pos.x + 1, y: P1.pos.y, z: P1.pos.z, dimid: 0 };
fireMobDie(eliteMob, P1);
check("blast affix hurts nearby player", (P1.hurtCalls || 0) > 0, P1.hurtCalls);
check("blast broadcast", P1.tells.some((t) => t.includes("炸开了")), P1.tells.slice(-3));
for (const m of wave2) { fireMobDie(m, P1); m.health = 0; }
step(1);

// ---- 5. Steve 死亡淘汰 ----
step(4); // intermission 倒计时被 max(3,…) 夹为3 → 需4拍：3拍到出怪、第4拍才是波内tick（Boss事件在这拍）
check("wave3 boss spawned", liveMobs().some((m) => m.name.includes("城门摧毁者")), liveMobs().map((m) => m.name).slice(0, 5));
check("boss summon adds (interval=1)", P1.tells.some((t) => t.includes("招来了援军")), P1.tells.slice(-3));
// Boss 狂暴：压血到30%以下 → tick 触发
const bossRec = liveMobs().find((m) => m.type === "ravager" && m.name.includes("城门摧毁者"));
check("boss record found", Boolean(bossRec), Boolean(bossRec));
bossRec.health = 100; // maxHealth=600 → 100 <= 180
step(1);
check("boss enrage broadcast", P1.tells.some((t) => t.includes("狂暴")), P1.tells.slice(-3));
check("boss enrage speed effect", bossRec.effects.filter((x) => x === 1).length >= 2, bossRec.effects);
fireRespawn(P2);
check("death 1/2", lastTell(P2).includes("1/2"), lastTell(P2));
// 死亡界面（health=0）时绝不能传送——同步传送会打断/被重生覆盖（"死了没到观战席"根因）
P2.health = 0;
fireRespawn(P2);
check("eliminated but placement deferred while dead",
    !(P2.gm === "spectator" && P2.pos.x === files[CONFIG_PATH].cfg.arena.seat.x), { gm: P2.gm, pos: P2.pos });
// 真正重生后：自检补上落点（限量放行，留一轮自检给下面的"引擎冲掉"场景）
P2.health = 20;
flushDeferred(2);
check("eliminated -> spectator + seat (after respawn)", P2.gm === "spectator" && P2.pos.x === files[CONFIG_PATH].cfg.arena.seat.x, { gm: P2.gm, pos: P2.pos });
// 模拟引擎在自检间隙把人冲回出生点 → 下一轮自检必须自己补传回来
P2.pos = new FloatPos(0.5, 64, 0.5, 0);
flushDeferred();
check("placement self-heals after engine override", P2.pos.x === files[CONFIG_PATH].cfg.arena.seat.x, P2.pos);

// ---- 复活币：余额不足拒绝 → 充值后复活成功 ----
wave(P2, ["revive"]);
check("revive rejected (no money)", lastTell(P2).includes("金币不足"), lastTell(P2));
money.set("XS2", 600);
wave(P2, ["revive"]);
check("revive success", P2.tells.some((t) => t.includes("复活币生效")) && money.get("XS2") === 100, { bal: money.get("XS2") });
check("revive back to lobby + alive", P2.pos.x === files[CONFIG_PATH].cfg.arena.lobby.x && P2.gm !== "spectator", { gm: P2.gm, pos: P2.pos });
wave(P2, ["revive"]);
check("revive once per event", lastTell(P2).includes("还活着") || lastTell(P2).includes("一次"), lastTell(P2));

// ---- 6. 通关结算 ----
for (const m of liveMobs()) { fireMobDie(m, P1); m.health = 0; }
step(1);
const victory = P1.tells.find((t) => t.includes("通关！共守住 3 波"));
check("victory broadcast", Boolean(victory), P1.tells.slice(-5));
check("ranking broadcast", P1.tells.some((t) => t.includes("第 1 名 §fMell")), P1.tells.slice(-8));
check("reward cmd rank1 with player", runcmdLog.some((c) => c.includes("WIN1 Mell rank=1 waves=3")), runcmdLog.filter((c) => c.startsWith("say WIN")));
check("reward cmd rank2", runcmdLog.some((c) => c.includes("WIN2 Steve")), runcmdLog.filter((c) => c.startsWith("say WIN")));
check("timer stopped", liveTimers() === 0, liveTimers());
check("mobs cleaned", liveMobs().length === 0, liveMobs().length);
check("core stand all removed at end", spawnedMobs.filter((m) => m.type === "armor_stand").every((m) => m.removed),
    spawnedMobs.filter((m) => m.type === "armor_stand").map((m) => m.removed));
check("core block restored to air", runcmdLog.some((c) => c === "setblock 10 64 10 air"), runcmdLog.filter((c) => c.includes("setblock 10 64 10")));
check("balance restored after event", money.get("XM1") === 900, money.get("XM1"));
// 背包返还：赛前家当回来、活动物品被清
check("inventory restored after event", P1.inv[0] && P1.inv[0].type === "diamond" && P1.inv[8] && P1.inv[8].type === "golden_apple"
    && P1.armor[0] && P1.armor[0].type === "iron_helmet", { inv0: P1.inv[0], armor0: P1.armor[0] });
check("event items wiped at end", P1.inv[1] === undefined && P1.armor[1] === undefined,
    { inv1: P1.inv[1], armor1: P1.armor[1] });
check("daylight cycle restored", runcmdLog.some((c) => c === "gamerule dodaylightcycle true"), runcmdLog.filter((c) => c.includes("gamerule")));
const finAfterWin = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("final board persistent after first end (sidebar kept)",
    finAfterWin.finalBoard === true && lastSb().sidebar.lines.some((l) => l.includes("{wave}")), finAfterWin);

// ---- 7. 结束后状态复位（status 显示 idle） ----
wave(P1, ["status"]);
check("status idle after end", P1.tells.some((t) => /阶段: §?fidle/.test(t)), P1.tells.slice(-2));

// ---- 8. 每场最终榜存档（/wave rank 多场叠加） ----
wave(P1, ["rank"]);
check("rank: match1 archived with victory", P1.tells.some((t) => t.includes("全部波次通关"))
    && P1.tells.some((t) => t.includes("多场累计")), P1.tells.slice(-8));

// ---- 9. 自动开局倒计时（首人触发 / 新人重置 / 同人重进不重置 / 到点自动开始） ----
const resets = () => P1.tells.filter((t) => t.includes("倒计时重置")).length;
wave(P2, ["join"]);
check("countdown starts on first join", P1.tells.some((t) => t.includes("秒后自动开始")), P1.tells.slice(-3));
check("countdown takes over sidebar (match state)", lastSb().sidebar.lines.some((l) => l.includes("{wave}")), lastSb().sidebar.lines);
// 防恶意反复进出：全员退出 → 倒计时取消；榜单在显示中 → 侧边栏不还原（保持榜单）
wave(P2, ["leave"]);
check("countdown auto-cancels when empty", P1.tells.some((t) => t.includes("倒计时取消")), P1.tells.slice(-3));
const finCancel = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("cancel keeps final board sidebar", finCancel.finalBoard === true
    && lastSb().sidebar.lines.some((l) => l.includes("{wave}")), finCancel);
wave(P2, ["join"]); // 重新触发倒计时
wave(P1, ["join"]);
check("new player resets countdown", resets() === 1, resets());
wave(P2, ["leave"]);
wave(P2, ["join"]);
check("rejoin does NOT reset countdown (anti-abuse)", resets() === 1, resets());
const P3 = makePlayer("Alex", 3, 64, 3, "XA3");
online.push(P3);
wave(P3, ["join"]);
check("another new player resets countdown", resets() === 2, resets());
wave(P1, ["status"]);
check("status shows countdown", lastTell(P1).includes("开局倒计时"), lastTell(P1));
step(11); // auto_start.countdown_seconds = 10
check("auto start fired at countdown end",
    P1.tells.filter((t) => t.includes("国庆尸潮防守开始")).length === 2,
    P1.tells.filter((t) => t.includes("防守开始")).length);
check("difficulty broadcast on auto start", P1.tells.some((t) => t.includes("人数难度")), P1.tells.slice(-6));
check("single timer after auto start", liveTimers() === 1, liveTimers());
check("P3 received kit at auto start", runcmdLog.some((c) => c === "give Alex iron_sword 1"),
    runcmdLog.filter((c) => c.includes("Alex")).slice(-4));
// 最终榜单常驻（用户诉求：退服重进也要在）
wave(P1, ["stop"]);
check("stop works after auto start", lastTell(P1).includes("已停止"), lastTell(P1));
wave(P1, ["rank"]);
check("rank: match2 stacked above match1", P1.tells.some((t) => t.includes("管理员终止"))
    && P1.tells.some((t) => t.includes("共 2 场记录")), P1.tells.slice(-10));
wave(P1, ["status"]);
check("phase idle after second event", P1.tells.some((t) => /阶段: §?fidle/.test(t)), P1.tells.slice(-2));
const fin = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("final board active after end", fin.finalBoard === true && Array.isArray(fin.topKills) && fin.topKills.length === 3, fin);
check("sidebar keeps event template after stop", lastSb().sidebar.lines.some((l) => l.includes("{wave}")), lastSb().sidebar.lines);
// 退服再进：榜单仍在（服务端状态，不随重连消失）
fireJoin(P2);
const finRelog = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("final board survives relog", finRelog.finalBoard === true && finRelog.topKills.length === 3, finRelog);
// 手动开关：off 还原原侧边栏并隐藏榜单 / on 重新上屏
wave(P1, ["rank", "off"]);
check("rank off restores original sidebar", lastSb().sidebar.lines.some((l) => l.includes("{serverName}")), lastSb().sidebar.lines);
const finOff = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("rank off hides final board", finOff.finalBoard === false, finOff.finalBoard);
wave(P1, ["rank", "on"]);
check("rank on retakes sidebar with board", lastSb().sidebar.lines.some((l) => l.includes("{wave}")), lastSb().sidebar.lines);
const finOn = JSON.parse(exported.getStatus(JSON.stringify({ player: "Mell" })));
check("rank on shows final board again", finOn.finalBoard === true, finOn.finalBoard);
check("all timers stopped at end", liveTimers() === 0, liveTimers());

// ---- 10. 首次进服自动 deop（该地图全员 OP 兜底） ----
const deopCount = (n) => runcmdLog.filter((c) => c === "deop " + n).length;
fireJoin(P3); // P3 首次 onJoin（之前只走过 /wave join，没触发过 onJoin）
check("first join runs deop", deopCount("Alex") === 1, runcmdLog.filter((c) => c.startsWith("deop")));
fireJoin(P3);
check("second join does NOT deop again", deopCount("Alex") === 1, deopCount("Alex"));
const P4 = makePlayer("Foo Bar", 5, 64, 5, "XB4");
online.push(P4);
fireJoin(P4);
check("space name quoted in deop", runcmdLog.some((c) => c === 'deop "Foo Bar"'),
    runcmdLog.filter((c) => c.startsWith("deop")));
files[CONFIG_PATH].cfg.auto_deop = { enabled: true, keep_op: ["Mell"] };
fireJoin(P1);
check("keep_op whitelist skips deop", deopCount("Mell") === 0, runcmdLog.filter((c) => c.startsWith("deop")));
files[CONFIG_PATH].cfg.auto_deop = { enabled: false, keep_op: [] };
const P5 = makePlayer("Carol", 6, 64, 6, "XC5");
online.push(P5);
fireJoin(P5);
check("auto_deop.enabled=false skips deop", deopCount("Carol") === 0, runcmdLog.filter((c) => c.startsWith("deop")));

console.log("\n== result: " + pass + " pass, " + fail + " fail ==");
process.exit(fail ? 1 : 0);
