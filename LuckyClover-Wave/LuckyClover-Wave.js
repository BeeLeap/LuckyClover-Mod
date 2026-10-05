// LuckyClover-Wave.js
// 国庆尸潮守点（Wave Defense）活动插件
// 玩法：玩家 /wave join 进场 → op /wave start 开波 → 怪从四周刷新点涌入，
//       守中央核心（怪靠近即扣核心血量）→ 20 波通关，精英波/Boss 波穿插。
// 计分：击杀（含精英/Boss 加成）排行；死亡达到上限淘汰进观众席。
"use strict";

const PLUGIN_NAME = "LuckyClover-Wave";
const PLUGIN_DESC = "National Day wave defense event (colosseum)";
const PLUGIN_VERSION = [1, 0, 0];

const BASE_DIR = "plugins/LuckyClover-Wave/";
const CONFIG_PATH = BASE_DIR + "config.json";

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, { Author: "Mell" });
logger.setTitle(PLUGIN_NAME);

// === 默认配置（坐标类字段必须用游戏内命令设置，见 README） ===
function buildDefaultConfig() {
    return {
        require_op: true,
        min_players: 1,
        // 自动开局：有人 join 即进入倒计时，倒计时结束自动开始（/wave start 仍可手动开）
        auto_start: {
            enabled: true,           // 关闭则回到"必须管理 /wave start"的老流程
            countdown_seconds: 60,   // 首人加入后的倒计时秒数
            max_resets: 5,           // 新玩家加入最多重置几次（防恶意拖延开局）
        },
        // 首次进服自动 deop（该地图会把所有进入者变成 OP；首进执行一次 deop 兜底）
        auto_deop: {
            enabled: true,
            keep_op: [],             // 豁免名单（游戏名或 xuid）——管理记得把自己加进来
        },
        arena: {
            lobby: { x: 0, y: 64, z: 0, dimid: 0 },   // /wave setlobby 集合点
            seat: { x: 0, y: 64, z: 0, dimid: 0 },    // /wave setseat 淘汰观战席
            spawn_return: { x: 0, y: 64, z: 0, dimid: 0 }, // 活动结束回传点（0,0,0=不回传）
        },
        core: {
            pos: { x: 0, y: 64, z: 0, dimid: 0 },     // /wave setcore 防守核心（站定执行=方块放在脚边空气格）
            max_hp: 200,
            radius: 4.0,          // 怪进入此半径开始扣核心血（每只每秒扣 damage_per_hit）
            damage_per_hit: 1,
            block: "diamond_block",   // 核心方块（活动开始放置）
            restore_block: "air",     // 活动结束后恢复成的方块
            stand: true,              // 核心上方立一个带血量名牌的盔甲架
            mining_damage: 5,         // 挖/攻击核心时的扣血量（dmg_on_mine=true 时生效）
            dmg_on_mine: false,       // 玩家挖核心是否扣血（默认只拦截+警告，防捣乱者故意送失败）
        },
        spawns: [],               // /wave addspawn 逐个添加（站哪加哪）
        waves: {
            total: 20,
            intermission_seconds: 30,
            count_base: 5,          // 首波只数 = count_base + 人数 * count_per_player
            count_per_player: 2,
            health_per_player: 0.05, // 人数难度：每多 1 名参与者，普通/精英怪生命 +5%（Boss 不缩放）
            growth: 1.12,           // 每波数量倍率
            max_per_wave: 40,
            timeout_seconds: 300,   // 单波超时（超时强制清场算通关，防卡死）
            pool: ["zombie", "zombie_villager", "husk", "stray", "spider", "cave_spider", "witch"],
            elite_waves: [5, 10, 15],
            elite: { count: 4, name: "国庆精英", health: 80, effect: "damage_resistance" },
            boss_wave: 20,
            boss: { type: "ravager", name: "城门摧毁者", health: 600, effect: "damage_resistance" },
        },
        deaths_limit: 2,           // 死亡达到即淘汰进观众席
        // 活动经济：开局暂存并清空所有参与者金币，击杀得币，结束全额返还
        economy: {
            clear_on_start: true,     // 活动开始清空参与者金币（暂存）
            restore_after: true,      // 结束返还暂存金币（false=不返还，会丢失赛前资产，慎用）
            kill_reward: { normal: 20, elite: 100, boss: 500 },
        },
        // 精英词缀：精英波随机词缀（第 dual_from_wave 波起可能双词缀），击杀奖励每词缀 ×2
        affixes: {
            enabled: true,
            dual_from_wave: 10,
            pool: [
                { id: "swift", name: "迅捷", effects: [{ id: "speed", amp: 1 }] },
                { id: "tank", name: "坦克", health_mult: 3, effects: [{ id: "slowness", amp: 0 }] },
                { id: "blast", name: "爆破", death_blast: { radius: 4, damage: 6 } },
                { id: "split", name: "分裂", death_split: { count: 2, type: "zombie" } },
                { id: "burn", name: "灼身", aura: { kind: "burn", radius: 4, seconds: 3, interval: 2 } },
            ],
        },
        // 波间三选一（roguelike）：每次随机3个，选1个作用于下一波
        buff_pool: [
            { id: "strength", name: "力量祝福", desc: "力量 II（90秒）" },
            { id: "guard", name: "铁壁", desc: "恢复 II + 抗性 I（90秒）" },
            { id: "core_heal", name: "紧急加固", desc: "核心 +40 血" },
            { id: "arrows", name: "箭雨", desc: "×24 箭 + 急迫（60秒）" },
            { id: "bounty", name: "赏金", desc: "本波击杀金币 ×2" },
            { id: "barrier", name: "核心屏障", desc: "本波前10秒核心无敌" },
        ],
        // 花金币修核心（/wave repair）
        repair: { enabled: true, price: 100, hp: 10, cooldown_seconds: 3 },
        // 淘汰者买命（/wave revive，每场一次）
        revive: { enabled: true, price: 500 },
        // 活动背包：开局暂存赛前背包并清空（发活动装备），结束丢弃活动物品 + 还原赛前背包
        inventory: {
            stash_on_start: true,   // 开局/中途加入时暂存清空背包
            restore_after: true,    // 结束还原（false=不还原，赛前物品丢失=真清空，仅建议活动服用）
        },
        // Boss 事件：每 N 秒招小怪；血量低于 enrage_hp_pct 狂暴
        boss_tick: { summon_interval: 15, summon_count: 2, enrage_hp_pct: 0.3 },
        // 波次成长：全体怪按波数获得效果
        growth: { speed_from_wave: 10, speed_amp: 1, strength_from_wave: 15, strength_amp: 1 },
        // 活动期间锁夜：gamerule 冻结昼夜 + 周期 time set night 兜底
        lock_night: true,
        night_restore_cycle: true,    // 结束时恢复昼夜循环
        night_interval_seconds: 30,
        kit_commands: [            // {player} 会被替换；每人进场时执行
            "give {player} iron_sword 1",
            "give {player} cooked_beef 16",
        ],
        supply_commands: [         // 波间补给（intermission 开始时执行）
            "give @a arrow 8",
        ],
        scoring: { kill: 1, elite_kill: 5, boss_kill: 30 },
        rewards: [                 // 结算按名次执行；{player}/{rank}/{waves} 替换；活动服无经济时可留空
            { rank: 1, commands: ["say §e[国庆活动] 冠军 {player}，击杀 {waves} 波之下最强！"] },
            { rank: 2, commands: ["say §6[国庆活动] 亚军 {player}"] },
            { rank: 3, commands: ["say §a[国庆活动] 季军 {player}"] },
        ],
        // 活动期间侧边栏（占位符由 LuckyClover-Sidebar 解析；活动结束自动还原原配置）
        sidebar_lines: [
            "§c§l国庆尸潮",
            "§e波次 §f{wave}§7/§f{waveTotal} §7{eventPhase}",
            "§c核心 §f{coreHp}§7/§f{coreMax}",
            "§7存活 §f{alive} §7| 我的得分 §f{myScore}",
            "§6§l击杀榜",
            "§e1. {topKills1}",
            "§e2. {topKills2}",
            "§e3. {topKills3}",
            "§74. {topKills4}",
            "§75. {topKills5}",
        ],
        // 活动商店：/wave shop 查看，/wave buy <id> 购买（扣 LegacyMoney 金币）
    shop: {
        items: [
            { id: "arrow", name: "箭 ×16", price: 100, icon: "textures/items/arrow", commands: ["give {player} arrow 16"] },
            { id: "beef", name: "牛排 ×8", price: 80, icon: "textures/items/cooked_beef", commands: ["give {player} cooked_beef 8"] },
            { id: "sword", name: "铁剑", price: 300, icon: "textures/items/iron_sword", commands: ["give {player} iron_sword"] },
            { id: "iron_armor", name: "铁甲全套", price: 900, icon: "textures/items/iron_chestplate", commands: ["give {player} iron_helmet", "give {player} iron_chestplate", "give {player} iron_leggings", "give {player} iron_boots"] },
            { id: "bow", name: "弓", price: 250, icon: "textures/items/bow", commands: ["give {player} bow"] },
            { id: "shield", name: "盾牌", price: 300, icon: "textures/items/shield", commands: ["give {player} shield"] },
            { id: "gapple", name: "金苹果 ×2", price: 800, icon: "textures/items/golden_apple", commands: ["give {player} golden_apple 2"] },
            { id: "totem", name: "不死图腾", price: 2000, icon: "textures/items/totem", commands: ["give {player} totem_of_undying"] },
        ],
    },
        messages: { prefix: "§6[尸潮] §r" },
    };
}

const config = new JsonConfigFile(CONFIG_PATH, "{}");

// 整份配置存在单 key "cfg" 下（LSE JsonConfigFile.get 必须带 key）
// 深合并：旧 config.json 缺的新字段用默认值补齐（数组以已有配置为准）
function mergeCfg(base, saved) {
    for (const k of Object.keys(saved)) {
        const v = saved[k];
        if (v && typeof v === "object" && !Array.isArray(v)
            && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
            mergeCfg(base[k], v);
        } else {
            base[k] = v;
        }
    }
    return base;
}

function cfg() {
    let saved = null;
    try { saved = config.get("cfg"); } catch (e) { saved = null; }
    const merged = buildDefaultConfig();
    if (saved && typeof saved === "object") mergeCfg(merged, saved);
    else { try { config.set("cfg", merged); } catch (e) { /* ignore */ } }
    // shop.items：按 id 补新默认商品（老配置保留，新商品自动上架）
    try {
        if (merged.shop && Array.isArray(merged.shop.items) && Array.isArray(buildDefaultConfig().shop.items)) {
            for (const it of buildDefaultConfig().shop.items) {
                if (!merged.shop.items.some((x) => x && String(x.id) === String(it.id))) merged.shop.items.push(it);
            }
        }
    } catch (e) { /* ignore */ }
    return merged;
}
function saveCfg(c) {
    try { config.set("cfg", c); } catch (e) { logger.warn("save config failed: " + e); }
}

// spawnMob 等 API 要求位置是 FloatPos 类实例（普通对象会报 Wrong type of argument）
function makePos(x, y, z, dimid) {
    if (typeof FloatPos === "function") {
        try { return new FloatPos(x, y, z, dimid || 0); } catch (e) { /* fallthrough */ }
    }
    return { x, y, z, dimid: dimid || 0 };
}
function msg(text) { return String(cfg().messages && cfg().messages.prefix || "§6[尸潮] §r") + text; }
function posValid(p) { return p && (p.x !== 0 || p.z !== 0 || (p.dimid || 0) !== 0); }
function dist3(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// === 活动状态 ===
const S = {
    phase: "idle",          // idle | intermission | wave | ended
    wave: 0,                // 当前波（0=未开始）
    total: 0,
    countdown: 0,           // intermission 剩余秒
    waveElapsed: 0,
    coreHp: 0,
    participants: new Map(),// name -> {deaths, out, kills, eliteKills, bossKills}
    mobs: [],               // {e, name, type, elite, boss, alive}
    timer: null,
    nightTick: 0,
    lastActionBar: 0,
    sidebarBackup: null,   // 活动期间被接管的侧边栏原配置
    coreStand: null,       // 核心血量盔甲架实体
    standName: "",         // 上次写入的名牌（避免重复刷）
    standRespawnAt: 0,     // 盔甲架重生冷却
    corePlaced: null,      // 已放置的核心方块坐标（整数方块坐标）
    savedBalances: new Map(), // xuid -> 活动前余额（开局暂存，结束返还）
    waveBuffs: {},         // 本波增益状态（赏金等），每次清波重置
    barrierUntil: 0,       // 核心屏障截止时间戳
    waveChoices: [],       // 本波三选一的选项 [{id,name,desc}]
    pickedBuff: new Map(), // name -> 本波已选 buff id
    lastRepairAt: 0,       // repair 冷却
    startCd: null,         // 自动开局倒计时 {remaining, triggers:Set, resets, waiting, capped}
};

function broadcast(text) {
    const t = msg(text);
    for (const p of mc.getOnlinePlayers()) {
        try { p.tell(t); } catch (e) { /* ignore */ }
    }
    logger.info("[broadcast] " + text.replace(/§./g, ""));
}

function isAdmin(player) {
    if (!cfg().require_op) return true;
    try {
        if (typeof player.isOP === "function") return player.isOP();
    } catch (e) { /* API 缺失时放行（小服） */ }
    return true;
}

function safeSetGameMode(player, mode) {
    try { player.setGameMode(mode); return true; } catch (e) { return false; }
}

function runCmd(template, player, extra) {
    const name = player && (player.realName || player.name) || "";
    let cmd = String(template || "")
        .replace(/\{player\}/g, name)
        .replace(/\{waves\}/g, String(S.wave));
    if (extra) {
        for (const k in extra) cmd = cmd.replace(new RegExp("\\{" + k + "\\}", "g"), String(extra[k]));
    }
    if (!cmd) return;
    try { mc.runcmd(cmd); } catch (e) { logger.warn("runCmd failed: " + cmd + " / " + e); }
}

// === 核心实体化：方块 + 血量名牌盔甲架 ===
function setCoreBlock(blockId) {
    const p = cfg().core.pos;
    if (!posValid(p)) return false;
    const x = Math.floor(Number(p.x)), y = Math.floor(Number(p.y)), z = Math.floor(Number(p.z));
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
        logger.warn("core pos invalid, skip setblock: " + JSON.stringify(p));
        return false;
    }
    const cmd = "setblock " + x + " " + y + " " + z + " " + blockId;
    logger.info("[core] " + cmd);
    try { mc.runcmd(cmd); } catch (e) { logger.warn("[core] runcmd failed: " + e); return false; }
    return true;
}

function coreStandText() {
    const max = Number(cfg().core.max_hp) || 200;
    const color = S.coreHp <= max * 0.33 ? "§c" : S.coreHp <= max * 0.66 ? "§e" : "§a";
    return "§e[国庆核心] " + color + "HP " + S.coreHp + "/" + max;
}

function updateCoreStand() {
    if (!S.coreStand) return;
    const txt = coreStandText();
    if (txt === S.standName) return;
    S.standName = txt;
    try { S.coreStand.name = txt; } catch (e) { /* 只读则跳过 */ }
}

function placeCore() {
    const c = cfg().core;
    if (!posValid(c.pos)) return false;
    // 必须存整数方块坐标：挖块事件的 block.pos 是整数，用带 .5 的坐标比距离会永远对不上（保护失效）
    S.corePlaced = {
        x: Math.floor(Number(c.pos.x)),
        y: Math.floor(Number(c.pos.y)),
        z: Math.floor(Number(c.pos.z)),
        dimid: c.pos.dimid || 0,
    };
    setCoreBlock(c.block || "diamond_block");
    spawnCoreStand();
    logger.info("core placed at " + JSON.stringify(S.corePlaced) + " stand=" + Boolean(S.coreStand));
    return true;
}

function spawnCoreStand() {
    const c = cfg().core;
    if (c.stand === false || !S.corePlaced) return;
    if (typeof mc.spawnMob !== "function") return;
    try {
        const stand = mc.spawnMob("armor_stand", makePos(
            S.corePlaced.x + 0.5, S.corePlaced.y + 1, S.corePlaced.z + 0.5, S.corePlaced.dimid));
        if (stand) {
            S.coreStand = stand;
            S.standName = "";
            updateCoreStand();
        } else {
            logger.warn("armor_stand spawn returned null, core stand disabled this run");
        }
    } catch (e) {
        logger.warn("core stand spawn failed: " + e);
    }
}

function removeCore() {
    if (S.coreStand) {
        try { S.coreStand.remove(); } catch (e) { /* ignore */ }
    }
    S.coreStand = null;
    S.standName = "";
    if (S.corePlaced) {
        setCoreBlock(cfg().core.restore_block || "air");
    }
    S.corePlaced = null;
}

// 核心扣血统一入口；返回 true = 核心摧毁、活动已结束
function damageCore(amount, reason) {
    if (S.phase !== "wave" && S.phase !== "intermission") return false;
    if (Date.now() < (S.barrierUntil || 0)) return false; // 核心屏障期间免疫
    const max = Number(cfg().core.max_hp) || 200;
    const dmg = Math.max(0, Math.floor(Number(amount) || 0));
    if (dmg <= 0) return false;
    S.coreHp = Math.max(0, S.coreHp - dmg);
    updateCoreStand();
    for (const [name] of S.participants) {
        const p = mc.getPlayer(name);
        if (p) { try { p.setActionBar("§4☄ 核心受击 -" + dmg + "（" + reason + "）！剩余 " + S.coreHp + "/" + max); } catch (e) { /* ignore */ } }
    }
    if (S.coreHp <= 0) {
        broadcast("§4§l✖ 核心被摧毁！尸潮攻破了防线！");
        endEvent(false, "核心被摧毁（第 " + S.wave + " 波）");
        return true;
    }
    return false;
}

// === 活动经济：开局暂存清空、结束返还、击杀奖励 ===
function clearEventBalance(player) {
    const ec = cfg().economy || {};
    if (ec.clear_on_start === false) return;
    const xuid = String(player.xuid || "");
    if (!xuid) return;
    if (S.savedBalances.has(xuid)) return; // 只暂存第一次
    if (typeof money === "undefined" || typeof money.get !== "function" || typeof money.set !== "function") return;
    let bal = 0;
    try { bal = Math.floor(Number(money.get(xuid)) || 0); } catch (e) { return; }
    S.savedBalances.set(xuid, bal);
    try { money.set(xuid, 0); } catch (e) { logger.warn("clear balance failed: " + e); return; }
    player.tell(msg("§7活动经济：你的 " + bal + " 金币已暂存，活动结束自动返还。"));
}

function restoreEventBalances() {
    if (!S.savedBalances.size) return;
    const ec = cfg().economy || {};
    if (ec.restore_after === false) {
        logger.warn("economy.restore_after=false — 暂存金币不返还（参与者赛前资产将丢失）");
        S.savedBalances.clear();
        return;
    }
    if (typeof money === "undefined" || typeof money.set !== "function") { S.savedBalances.clear(); return; }
    let ok = 0;
    for (const [xuid, bal] of S.savedBalances) {
        try { money.set(xuid, bal); ok++; } catch (e) { logger.warn("restore balance failed " + xuid + ": " + e); }
    }
    S.savedBalances.clear();
    logger.info("restored " + ok + " player balances after event");
}

// === 活动背包：开局暂存清空、结束还原（与金币同生命周期） ===
const stashStore = new JsonConfigFile(BASE_DIR + "inventory_backup.json", "{}");
const boardStore = new JsonConfigFile(BASE_DIR + "leaderboard.json", "{}"); // 每场最终榜（多场叠加，新场在上）
const joinStore = new JsonConfigFile(BASE_DIR + "known_players.json", "{}"); // 进过服的玩家（首进 deop 判定）

function inventoryApiOk(player) {
    try {
        if (typeof player.getInventory !== "function") return false;
        const inv = player.getInventory();
        return Boolean(inv && typeof inv.getItem === "function" && typeof inv.setItem === "function");
    } catch (e) { return false; }
}

function forEachSlot(container, count, fn) {
    for (let i = 0; i < count; i++) {
        try { fn(container.getItem(i), i); } catch (e) { /* 单格失败跳过 */ }
    }
}

function snapshotInventory(player) {
    const snap = { main: {}, armor: {} };
    const inv = player.getInventory();
    forEachSlot(inv, 36, (it, i) => {
        if (it && it.type && String(it.type) !== "air" && String(it.type) !== "minecraft:air") {
            snap.main[i] = JSON.parse(JSON.stringify(it));
        }
    });
    try {
        const armor = typeof player.getArmorContainer === "function" ? player.getArmorContainer() : null;
        if (armor && typeof armor.getItem === "function") {
            forEachSlot(armor, 4, (it, i) => {
                if (it && it.type && String(it.type) !== "air" && String(it.type) !== "minecraft:air") {
                    snap.armor[i] = JSON.parse(JSON.stringify(it));
                }
            });
        }
    } catch (e) { /* armor 容器不可用则跳过 */ }
    return snap;
}

// 清空单格：引擎只认类实例 → 优先 mc.newItem 的 air 实例，其次 null，最后 removeItem
function airItem() {
    if (typeof mc.newItem !== "function") return null;
    try { return mc.newItem("minecraft:air", 0); } catch (e) { /* next */ }
    try { return mc.newItem("air", 0); } catch (e) { return null; }
}

function clearSlot(container, i) {
    const air = airItem();
    if (air) {
        try { container.setItem(i, air); return true; } catch (e) { /* next strategy */ }
    }
    try { container.setItem(i, null); return true; } catch (e) { /* next strategy */ }
    if (typeof container.removeItem === "function") {
        try { container.removeItem(i); return true; } catch (e) { /* next strategy */ }
    }
    return false;
}

function countOccupied(container, count) {
    let left = 0;
    forEachSlot(container, count, (it) => {
        if (it && it.type && String(it.type) !== "air" && String(it.type) !== "minecraft:air") left++;
    });
    return left;
}

function clearPlayerInventory(player) {
    const name = String(player.realName || player.name);
    // 主背包：直接用原版 /clear 指令（引擎自带路径，比容器 API 可靠得多）
    if (name && typeof mc.runcmd === "function") {
        try { mc.runcmd("clear " + name); } catch (e) { /* 容器策略兜底 */ }
    }
    // 容器策略兜底（护甲槽 / clear 没覆盖到的残余）
    const inv = player.getInventory();
    forEachSlot(inv, 36, (it, i) => {
        if (it && it.type) clearSlot(inv, i);
    });
    try {
        const armor = typeof player.getArmorContainer === "function" ? player.getArmorContainer() : null;
        if (armor && typeof armor.setItem === "function") {
            forEachSlot(armor, 4, (it, i) => {
                if (it && it.type) clearSlot(armor, i);
            });
        }
    } catch (e) { /* ignore */ }
    // 自检：清不掉必须出声，绝不静默
    try {
        const left = countOccupied(inv, 36);
        const leftArmor = (() => {
            try {
                const a = typeof player.getArmorContainer === "function" ? player.getArmorContainer() : null;
                return a && typeof a.getItem === "function" ? countOccupied(a, 4) : 0;
            } catch (e) { return 0; }
        })();
        if (left > 0 || leftArmor > 0) {
            logger.warn("inventory clear INEFFECTIVE: main=" + left + " armor=" + leftArmor + " slots occupied");
            return false;
        }
        return true;
    } catch (e) {
        logger.warn("inventory clear verify failed: " + e);
        return false;
    }
}

// 把 JSON 快照重建为引擎的 ItemStack（setItem 只认类实例，普通对象报 Wrong type of argument）
function reviveItem(snap) {
    if (!snap || !snap.type) return null;
    const type = String(snap.type);
    const count = Math.max(1, Math.floor(Number(snap.count) || 1));
    if (typeof mc.newItem !== "function") return snap; // 引擎无 newItem 则原样尝试
    let it = null;
    try { it = mc.newItem(type, count); } catch (e) { it = null; }
    if (!it) {
        logger.warn("newItem failed for " + type);
        return null;
    }
    try {
        const aux = Number(snap.aux);
        if (isFinite(aux) && aux !== 0) {
            if (typeof it.setAux === "function") it.setAux(aux);
            else it.aux = aux;
        }
    } catch (e) { /* ignore */ }
    try {
        const dn = snap.customName || snap.displayName;
        if (dn && typeof it.setCustomName === "function") it.setCustomName(String(dn));
    } catch (e) { /* ignore */ }
    return it;
}

function applyInventorySnapshot(player, snap) {
    clearPlayerInventory(player);
    const inv = player.getInventory();
    let n = 0;
    let failed = 0;
    for (const k of Object.keys(snap.main || {})) {
        try {
            const it = reviveItem(snap.main[k]);
            if (it) { inv.setItem(Number(k), it); n++; }
        } catch (e) { failed++; logger.warn("restore slot " + k + " failed: " + e); }
    }
    try {
        const armor = typeof player.getArmorContainer === "function" ? player.getArmorContainer() : null;
        if (armor) {
            for (const k of Object.keys(snap.armor || {})) {
                try {
                    const it = reviveItem(snap.armor[k]);
                    if (it) { armor.setItem(Number(k), it); n++; }
                } catch (e) { failed++; logger.warn("restore armor slot " + k + " failed: " + e); }
            }
        }
    } catch (e) { /* ignore */ }
    if (failed > 0) logger.warn("inventory restore partial: ok=" + n + " failed=" + failed);
    return n;
}

// 开局前清偿上次遗留的暂存条目（上次恢复失败/中途崩溃残留 → 不清偿会导致本次跳过暂存）
function flushPendingStashes() {
    let all = {};
    try { all = stashStore.get("stash") || {}; } catch (e) { return; }
    const keys = Object.keys(all);
    if (!keys.length) return;
    if (cfg().inventory && cfg().inventory.restore_after === false) {
        try { stashStore.set("stash", {}); } catch (e) { /* ignore */ }
        return;
    }
    logger.warn(keys.length + " pending stash entr(ies) from a previous run, flushing before start");
    let ok = 0;
    for (const xuid of keys) {
        const pl = mc.getOnlinePlayers().find((p) => String(p.xuid) === xuid);
        if (!pl) continue; // 离线的留着，上线自动还
        try {
            applyInventorySnapshot(pl, all[xuid]);
            delete all[xuid];
            ok++;
        } catch (e) {
            logger.warn("flush stash failed " + xuid + ": " + e);
        }
    }
    try { stashStore.set("stash", all); } catch (e) { /* ignore */ }
    logger.info("flushed " + ok + " pending stash entries");
}

// 暂存+清空（开局循环与活动中加入时调用）
function stashEventInventory(player) {
    const ic = cfg().inventory || {};
    if (ic.stash_on_start === false) return;
    const xuid = String(player.xuid || "");
    if (!xuid) return;
    let all = {};
    try { all = stashStore.get("stash") || {}; } catch (e) { all = {}; }
    if (all[xuid]) {
        logger.warn("stash entry already exists for " + xuid + ", skip re-stash (inventory NOT cleared this time)");
        return;
    }
    if (!inventoryApiOk(player)) {
        logger.warn("inventory API unavailable for " + (player.realName || player.name) + ", stash skipped");
        return;
    }
    const snap = snapshotInventory(player);
    all[xuid] = snap;
    try { stashStore.set("stash", all); } catch (e) { logger.warn("stash save failed: " + e); return; }
    const cleared = clearPlayerInventory(player);
    const count = Object.keys(snap.main).length + Object.keys(snap.armor).length;
    logger.info("inventory stashed: " + xuid + " (" + count + " items) cleared=" + cleared);
    if (count > 0) player.tell(msg("§7赛前背包 " + count + " 件已暂存，活动结束自动返还。"));
}

// 结束时：在线者清空活动物品并还原；离线者保留暂存（下次上线自动返还）
function restoreEventInventories() {
    let all = {};
    try { all = stashStore.get("stash") || {}; } catch (e) { return; }
    const keys = Object.keys(all);
    if (!keys.length) return;
    const ic = cfg().inventory || {};
    if (ic.restore_after === false) {
        logger.warn("inventory.restore_after=false — 赛前背包不返还（清空）");
        try { stashStore.set("stash", {}); } catch (e) { /* ignore */ }
        return;
    }
    let restored = 0;
    let offline = 0;
    for (const xuid of keys) {
        const pl = mc.getOnlinePlayers().find((p) => String(p.xuid) === xuid);
        if (!pl) { offline++; continue; }
        try {
            applyInventorySnapshot(pl, all[xuid]);
            delete all[xuid];
            restored++;
            pl.tell(msg("§a赛前背包已返还（活动物品已清除）。"));
        } catch (e) {
            logger.warn("restore inventory failed " + xuid + ": " + e);
        }
    }
    try { stashStore.set("stash", all); } catch (e) { /* ignore */ }
    logger.info("inventory restored=" + restored + " offline_kept=" + offline);
    if (offline > 0) logger.info(offline + " 名玩家离线，背包暂存保留，上线自动返还");
}

// 上线自动返还（活动未进行时）
function tryRestoreOnJoin(player) {
    if (S.phase === "wave" || S.phase === "intermission") return;
    const xuid = String(player.xuid || "");
    if (!xuid) return;
    let all = {};
    try { all = stashStore.get("stash") || {}; } catch (e) { return; }
    if (!all[xuid]) return;
    const ic = cfg().inventory || {};
    if (ic.restore_after === false) return;
    try {
        applyInventorySnapshot(player, all[xuid]);
        delete all[xuid];
        stashStore.set("stash", all);
        player.tell(msg("§a你的赛前背包已自动返还。"));
        logger.info("inventory auto-restored on join: " + xuid);
    } catch (e) {
        logger.warn("join restore failed " + xuid + ": " + e);
    }
}

// === 参与者管理 ===
// === 多场最终排行榜（每场结束快照，新场整段叠在旧场上边） ===
const MAX_MATCHES = 10;
let matchesCache = null;     // matches 内存缓存（Sidebar 轮询频繁，避免反复读盘）
let finalBoardHidden = null; // null=未读；off 开关持久化在 leaderboard.json 的 hidden 键
function loadMatches() {
    if (matchesCache) return matchesCache;
    try { matchesCache = boardStore.get("matches") || []; } catch (e) { matchesCache = []; }
    return matchesCache;
}
function isFinalBoardHidden() {
    if (finalBoardHidden === null) {
        try { finalBoardHidden = boardStore.get("hidden") === true; } catch (e) { finalBoardHidden = false; }
    }
    return finalBoardHidden;
}
function setFinalBoardHidden(v) {
    finalBoardHidden = !!v;
    try { boardStore.set("hidden", !!v); } catch (e) { logger.warn("board hidden save failed: " + e); }
}
// 最终榜单常驻显示 = 空闲 && 有存档 && 未手动关闭 —— 退服重进/重启服务器都在
function isFinalBoardVisible() {
    return S.phase === "idle" && loadMatches().length > 0 && !isFinalBoardHidden();
}
function saveMatchSnapshot(victory, reason, waveReached, rows) {
    try {
        const matches = loadMatches();
        matches.unshift({
            at: Date.now(), victory: !!victory, reason: String(reason || ""),
            waves: waveReached, total: S.total,
            rows: rows.map((r) => ({
                name: r.name, kills: r.rec.kills,
                elite: r.rec.eliteKills, boss: r.rec.bossKills, score: r.score,
            })),
        });
        while (matches.length > MAX_MATCHES) matches.pop();
        matchesCache = matches;
        boardStore.set("matches", matches);
        setFinalBoardHidden(false); // 新对局结束 → 榜单重新上屏
        logger.info("board saved: match #" + matches.length + " rows=" + rows.length);
    } catch (e) {
        logger.warn("board save failed: " + e);
    }
}
function fmtMatchTime(ms) {
    const d = new Date(ms);
    return (d.getMonth() + 1) + "-" + d.getDate() + " "
        + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
// /wave rank [场次]：进行中=实时榜；无参=全部场次叠层（新场在上）+ 多场累计；有参=单场
function renderRank(player, arg) {
    const running = S.phase === "wave" || S.phase === "intermission";
    if (running) {
        const rows = [];
        for (const [name, rec] of S.participants) {
            rows.push({ name, kills: rec.kills, score: scoreOf(rec) });
        }
        rows.sort((a, b) => b.score - a.score || b.kills - a.kills);
        player.tell(msg("§6== 赛事实时榜（第 " + S.wave + "/" + S.total + " 波 · 进行中）=="));
        if (!rows.length) player.tell(msg("§7暂无参与者。"));
        rows.forEach((r, i) => player.tell(msg("§e#" + (i + 1) + " §f" + r.name
            + " §7击杀 " + r.kills + " §6得分 " + r.score)));
        player.tell(msg("§7结束后自动存档，届时 /wave rank 查看。"));
        return;
    }
    const matches = loadMatches();
    if (!matches.length) {
        player.tell(msg("§7暂无榜单记录（活动每结束一场自动存档一场）。"));
        return;
    }
    const single = arg ? Math.max(1, Math.min(matches.length, parseInt(arg, 10) || 1)) : 0;
    const shown = single
        ? [{ m: matches[single - 1], idx: single }]
        : matches.map((m, i) => ({ m, idx: i + 1 }));
    for (const s of shown) {
        player.tell(msg((s.m.victory ? "§a★ 通关" : "§c✖ 失败")
            + " §7· " + fmtMatchTime(s.m.at)
            + " · 到达 " + s.m.waves + "/" + s.m.total + " 波 · " + s.m.reason));
        s.m.rows.forEach((r, i) => player.tell(msg(" §e#" + (i + 1) + " §f" + r.name
            + " §7击杀 " + r.kills + "（精英 " + (r.elite || 0) + "/Boss " + (r.boss || 0) + "） §6得分 " + r.score)));
    }
    if (!single) {
        // 底部附多场累计总榜
        const agg = new Map();
        for (const m of matches) {
            for (const r of m.rows) {
                const a = agg.get(r.name) || { kills: 0, score: 0, matches: 0 };
                a.kills += r.kills; a.score += r.score; a.matches++;
                agg.set(r.name, a);
            }
        }
        const tot = Array.from(agg.entries()).sort((a, b) => b[1].score - a[1].score).slice(0, 10);
        if (tot.length) {
            player.tell(msg("§6== 多场累计 TOP " + tot.length + " =="));
            tot.forEach(([name, a], i) => player.tell(msg("§e#" + (i + 1) + " §f" + name
                + " §7" + a.matches + " 场 · 击杀 " + a.kills + " §6总得分 " + a.score)));
        }
        player.tell(msg("§7共 " + matches.length + " 场记录（新场在上）· 只看单场: /wave rank 1.." + matches.length));
    } else {
        player.tell(msg("§7共 " + matches.length + " 场记录 · /wave rank 查看全部叠层。"));
    }
}

function scoreOf(rec) {
    const s = cfg().scoring || {};
    return rec.kills * (Number(s.kill) || 1)
        + rec.eliteKills * (Number(s.elite_kill) || 5)
        + rec.bossKills * (Number(s.boss_kill) || 30);
}

// === 对外状态（供 Sidebar 占位符解析） ===
function exportApi(name, fn) { ll.export(fn, "LuckyCloverWave", name); }

exportApi("getStatus", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const me = String(parsed.player || "");
        const rows = [];
        for (const [name, rec] of S.participants) {
            rows.push({ name, kills: rec.kills, score: scoreOf(rec) });
        }
        rows.sort((a, b) => b.score - a.score || b.kills - a.kills);
        const c = cfg();
        // 榜单常驻：空闲时显示存档的最终榜（退服重进/重启均在），直到下一场开始或 rank off
        const finalActive = isFinalBoardVisible();
        let last = null;
        let outRows = rows;
        if (finalActive) {
            last = loadMatches()[0];
            if (last) outRows = last.rows.map((r) => ({ name: r.name, kills: r.kills, score: r.score }));
        }
        const mine = me ? outRows.find((r) => r.name === me) : null;
        return JSON.stringify({
            ok: true,
            phase: S.phase,
            wave: last ? last.waves : S.wave,
            total: last ? last.total : S.total,
            coreHp: S.coreHp,
            coreMax: Number(c.core.max_hp) || 0,
            alive: aliveParticipants().length,
            joined: S.participants.size,
            cdRemaining: (S.phase === "countdown" && S.startCd)
                ? (S.startCd.waiting ? -1 : S.startCd.remaining) : null,
            finalBoard: finalActive && !!last,
            myKills: mine ? mine.kills : 0,
            myScore: mine ? mine.score : 0,
            topKills: outRows.slice(0, 10).map((r) => r.name + " §f" + r.score),
        });
    } catch (error) {
        return JSON.stringify({ ok: false, error: String(error) });
    }
});

// === 侧边栏联动（活动期间接管，结束还原） ===
const SIDEBAR_NS = "LuckyCloverSidebar";
// 原版 sidebar 未配置 lines 时的默认六行（用于还原本就是默认配置的场景）
const DEFAULT_SIDEBAR_LINES = [
    "§b服务器§f: {serverName}",
    "§b在线玩家§f: {onlinePlayers}",
    "§b玩家§f: {playerName}",
    "§b头衔§f: {sidebarTitle}",
    "§b金币§f: {money}",
    "§b时间§f: {time}",
];

function sidebarImport(name) {
    try {
        if (typeof ll.hasExported === "function" && !ll.hasExported(SIDEBAR_NS, name)) return null;
        const fn = ll.imports(SIDEBAR_NS, name);
        return typeof fn === "function" ? fn : null;
    } catch (e) { return null; }
}

function applySidebarEventMode() {
    if (S.sidebarBackup) return true;
    const get = sidebarImport("mgmtGetConfig");
    const set = sidebarImport("mgmtSetConfig");
    if (!get || !set) {
        logger.warn("sidebar API unavailable, skip sidebar takeover");
        return false;
    }
    try {
        const all = JSON.parse(String(get() || "{}"));
        const sb = all && all.sidebar && typeof all.sidebar === "object" ? all.sidebar : {};
        const current = {
            lines: Array.isArray(sb.lines) ? sb.lines : DEFAULT_SIDEBAR_LINES.slice(),
            cycleEnabled: sb.cycleEnabled === true,
            title: sb.title,
        };
        // 原侧边栏持久化到 leaderboard.json：重启后内存备份丢失时用磁盘上的原始备份，
        // 保证 /wave rank off 在重启后仍能还原到"真正的原侧边栏"
        let original = null;
        try { original = boardStore.get("sidebarOriginal"); } catch (e) { original = null; }
        if (!original) {
            original = current;
            try { boardStore.set("sidebarOriginal", original); } catch (e) { /* ignore */ }
        }
        S.sidebarBackup = original;
        const resp = set(JSON.stringify({
            sidebar: {
                lines: cfg().sidebar_lines,
                cycleEnabled: false, // 活动期间不轮播在线时长榜
                title: "§c§l国庆尸潮守点",
            },
        }));
        logger.info("sidebar taken over for event: " + String(resp || "").slice(0, 80));
        return true;
    } catch (e) {
        logger.warn("sidebar takeover failed: " + e);
        S.sidebarBackup = null;
        return false;
    }
}

function restoreSidebar() {
    let bk = S.sidebarBackup;
    S.sidebarBackup = null;
    if (!bk) {
        // 重启后内存备份丢失 → 用接管时持久化的原始备份
        try { bk = boardStore.get("sidebarOriginal"); } catch (e) { bk = null; }
    }
    if (!bk) return;
    const set = sidebarImport("mgmtSetConfig");
    if (!set) return;
    try {
        set(JSON.stringify({
            sidebar: { lines: bk.lines, cycleEnabled: bk.cycleEnabled, title: bk.title },
        }));
        try { boardStore.set("sidebarOriginal", null); } catch (e) { /* ignore */ }
        logger.info("sidebar restored after event");
    } catch (e) {
        logger.warn("sidebar restore failed: " + e);
    }
}


function getParticipant(name) {
    return S.participants.get(String(name));
}

function addParticipant(player, silent, noCountdown) {
    const name = String(player.realName || player.name);
    if (!S.participants.has(name)) {
        S.participants.set(name, { deaths: 0, out: false, kills: 0, eliteKills: 0, bossKills: 0 });
    }
    const rec = getParticipant(name);
    if (rec.out) {
        // 淘汰后重新 join 不复活战绩，但允许回到场上（重新计出局状态）
        rec.out = false;
    }
    const lobby = cfg().arena.lobby;
    if (posValid(lobby)) {
        try { player.teleport(lobby.x, lobby.y, lobby.z, lobby.dimid || 0); } catch (e) { player.tell(msg("§c传送失败: " + e)); }
    }
    // 活动进行中加入 → 先暂存清空（金币+背包），再发活动 kit —— 顺序不能反，否则 kit 被当赛前物品收走
    if (S.phase === "wave" || S.phase === "intermission") {
        clearEventBalance(player);
        stashEventInventory(player);
        for (const c of cfg().kit_commands || []) runCmd(c, player);
    }
    // 赛前 join 不在这里发 kit：开局暂存清空之后统一发（否则 kit 会被当赛前物品暂存，玩家开局两手空空）
    // 自动开局：空闲时有人加入 → 启动倒计时；倒计时中加入 → 按规则重置（同人重进不重置）
    if (!noCountdown) {
        if (S.phase === "idle") beginCountdown(name);
        else if (S.phase === "countdown") touchCountdown(name);
    }
    if (!silent) player.tell(msg("§a已加入守点队伍！当前人数 " + S.participants.size));
    return rec;
}

// === 死亡/淘汰落点应用（传送 + 模式） ===
// 实测坑：onRespawn 触发时引擎可能还没真正完成重生——此时同步 teleport 会被
// 随后的重生落点覆盖（症状：死了没被送到观战席），在死亡界面传送还可能打断重生。
// 策略：只有确认已重生（health>0）才动手；应用后每 500ms 自检一次，位置被引擎
// 冲掉就补传（API 失败还有 /tp、/gamemode 指令兜底），最多 60 秒，每步都有日志。
function readPos(p) {
    try {
        const v = p.pos;
        return v ? { x: Number(v.x), y: Number(v.y), z: Number(v.z), dimid: Number(v.dimid) || 0 } : null;
    } catch (e) { return null; }
}
function nearPos(now, target) {
    if (!now || !target) return false;
    return Math.abs(now.x - Number(target.x)) <= 1.5
        && Math.abs(now.y - Number(target.y)) <= 1.5
        && Math.abs(now.z - Number(target.z)) <= 1.5;
}
function fmtPos(p) { return p ? "(" + p.x + "," + p.y + "," + p.z + ")" : "(未知)"; }
function applyMode(p, mode) {
    if (safeSetGameMode(p, mode)) return true;
    const name = String(p.realName || p.name);
    if (typeof mc.runcmd === "function") {
        try { mc.runcmd("gamemode " + mode + " " + name); return true; } catch (e) { /* 下一步 */ }
    }
    if (mode === "spectator" && safeSetGameMode(p, 2)) return true; // 最后退路：冒险模式
    logger.warn("setGameMode failed: " + mode + " for " + name);
    return false;
}
// opts: { pos: 目标点|null, mode: 期望模式|null, wanted: 每轮先问"还该落点吗"（复活/结束即停） }
function schedulePlacement(player, opts, tag) {
    const name = String(player.realName || player.name);
    const target = opts.pos || null;
    const mode = opts.mode || null;
    const wanted = opts.wanted || (() => true);
    let tries = 0, streak = 0, sawAlive = false, sawDead = false;
    const MAX_TRIES = 120; // 120 × 500ms = 60 秒上限
    function attempt() {
        tries++;
        try {
            let pl = null;
            try { pl = mc.getPlayer(name); } catch (e) { pl = null; }
            if (!pl) { logger.warn(tag + ": " + name + " 已离线，落点放弃"); return; }
            if (!wanted()) return; // 状态已变（被复活/活动结束），不再干预
            // 还没真正重生（死亡界面）→ 不碰他，等下一轮
            let hp = NaN;
            try { hp = Number(pl.health); } catch (e) { hp = NaN; }
            if (hp === hp && hp <= 0) { // health 读不到(NaN) → 视为可落点
                if (!sawDead) {
                    sawDead = true;
                    logger.warn(tag + ": " + name + " 还在死亡界面(health=0)，等真正重生后再落点");
                }
                if (tries >= MAX_TRIES) { logger.warn(tag + ": 等待重生超时，放弃 " + name); return; }
                setTimeout(attempt, 500);
                return;
            }
            if (!sawAlive) {
                sawAlive = true;
                if (mode) applyMode(pl, mode); // 首次确认已重生：先上模式
            }
            const now = readPos(pl);
            if (target && !nearPos(now, target)) {
                let moved = false;
                try { pl.teleport(target.x, target.y, target.z, target.dimid || 0); moved = true; }
                catch (e) { logger.warn(tag + " teleport failed: " + e); }
                if (!moved && typeof mc.runcmd === "function") {
                    try { mc.runcmd("tp " + name + " " + target.x + " " + target.y + " " + target.z); moved = true; }
                    catch (e) { logger.warn(tag + " runcmd tp failed: " + e); }
                }
                const after = readPos(pl);
                const ok = nearPos(after, target);
                logger.warn(tag + " 落点" + (streak === 0 && sawPosFail ? "补传#" + tries : "应用")
                    + ": " + name + " " + fmtPos(now) + " → " + (ok ? "到位 " + fmtPos(after) : "仍未到位 " + fmtPos(after)));
                sawPosFail = true;
                if (mode) applyMode(pl, mode); // 位置被重生冲掉 → 模式八成也没了，一起补
                streak = 0;
            } else {
                streak++;
                if (streak === 1 && target) logger.info(tag + " 落点就位: " + name + " → " + fmtPos(target));
                if (streak >= 2 || !target) return; // 连续两次自检通过（或无需位置）→ 收工
            }
            if (tries >= MAX_TRIES) { logger.warn(tag + ": 落点自检超时，放弃 " + name + " pos=" + fmtPos(readPos(pl))); return; }
            setTimeout(attempt, 500);
        } catch (e) {
            logger.warn(tag + " placement error: " + e);
        }
    }
    let sawPosFail = false;
    attempt();
}

function eliminatePlayer(player, reason) {
    const name = String(player.realName || player.name);
    const rec = getParticipant(name);
    if (!rec || rec.out) return;
    rec.out = true;
    player.tell(msg("§c你已淘汰（" + reason + "），请到观众席观战。"));
    const seat = cfg().arena.seat;
    // 观战席落点走延迟自检（同步传送会被重生流程覆盖，就是"死了没到观战席"的根因）
    schedulePlacement(player, {
        pos: posValid(seat) ? seat : null,
        mode: "spectator",
        wanted: () => { const r = getParticipant(name); return !!(r && r.out); },
    }, "eliminate");
}

function aliveParticipants() {
    const out = [];
    for (const [name, rec] of S.participants) {
        if (!rec.out) out.push(name);
    }
    return out;
}

// 购物资格：空闲时随便买（备货），活动进行中仅限场上未淘汰参与者
function canShop(player) {
    const running = S.phase === "wave" || S.phase === "intermission";
    if (!running) return true;
    const rec = getParticipant(String(player.realName || player.name));
    return !!rec && !rec.out;
}

// 统一扣费（商店/修理/复活共用），返回是否扣款成功
function chargeXuid(player, price, what) {
    const xuid = String(player.xuid || "");
    if (!xuid) { player.tell(msg("§c无法确定账户（缺少 xuid）。")); return false; }
    if (typeof money === "undefined" || typeof money.get !== "function") {
        player.tell(msg("§c经济系统未加载。"));
        return false;
    }
    const p = Math.max(0, Math.floor(Number(price) || 0));
    const balance = Math.floor(Number(money.get(xuid)) || 0);
    if (balance < p) {
        player.tell(msg("§c金币不足（" + what + "需要 " + p + "，当前 " + balance + "）。"));
        return false;
    }
    if (typeof money.reduce === "function") {
        if (!money.reduce(xuid, p)) { player.tell(msg("§c扣除金币失败。")); return false; }
    } else if (typeof money.set === "function") {
        money.set(xuid, balance - p);
    }
    return true;
}

function shopBalance(player) {
    try {
        return player.xuid && typeof money !== "undefined" && typeof money.get === "function"
            ? Math.floor(Number(money.get(player.xuid)) || 0) : null;
    } catch (e) { return null; }
}

// 购买核心（表单与文本命令共用），返回是否成功
function doBuy(player, it) {
    if (!canShop(player)) { player.tell(msg("§c活动中只有场上存活参与者可以购物。")); return false; }
    const xuid = String(player.xuid || "");
    const price = Math.max(0, Math.floor(Number(it.price) || 0));
    if (!chargeXuid(player, price, it.name)) return false;
    for (const cmd of it.commands || []) runCmd(cmd, player);
    player.tell(msg("§a购买成功：" + it.name + " -" + price + "，剩余 "
        + Math.floor(Number(money.get(xuid)) || 0) + " 金币"));
    return true;
}

function shopItems() {
    return (cfg().shop && Array.isArray(cfg().shop.items)) ? cfg().shop.items : [];
}

// 纯文本商店（表单 API 缺失/异常时的兜底）
function showShopText(player) {
    const items = shopItems();
    if (!items.length) { player.tell(msg("§7商店暂无商品。")); return; }
    const balance = shopBalance(player);
    player.tell(msg("§6=== 活动商店 === §7余额: " + (balance === null ? "未知" : balance + " 金币")));
    for (const it of items) {
        player.tell(msg("§e" + it.id + " §f" + it.name + " §7- " + it.price + " 金币"));
    }
    player.tell(msg("§7购买: /wave buy <ID>"));
}

// 表单商店：点商品即购买，买完自动重开（余额实时刷新）；失败返回 false 走文本兜底
function openShopForm(player) {
    try {
        if (typeof mc.newSimpleForm !== "function" || typeof player.sendForm !== "function") return false;
        const items = shopItems();
        if (!items.length) { player.tell(msg("§7商店暂无商品。")); return true; }
        const balance = shopBalance(player);
        const form = mc.newSimpleForm();
        const title = "§6国庆活动商店";
        const content = "余额: " + (balance === null ? "未知" : balance + " 金币")
            + "\n点击商品购买，点 X 关闭。";
        if (typeof form.setTitle === "function") form.setTitle(title); else form.title = title;
        if (typeof form.setContent === "function") form.setContent(content); else form.content = content;
        for (const it of items) {
            const label = "§f" + it.name + " §7- " + it.price + " 金币";
            if (typeof form.addButton === "function") {
                if (it.icon) form.addButton(label, it.icon);
                else form.addButton(label);
            }
        }
        player.sendForm(form, (pl, id) => {
            try {
                if (id === null || id === undefined) return; // 关闭
                const idx = Number(id);
                if (!isFinite(idx) || idx < 0 || idx >= items.length) return;
                doBuy(player, items[idx]);
                openShopForm(player); // 重开，显示最新余额
            } catch (e) {
                logger.warn("shop form callback error: " + e);
            }
        });
        return true;
    } catch (e) {
        logger.warn("shop form failed, fallback to text: " + e);
        return false;
    }
}

// === 波次 ===
// === 波间三选一（roguelike 增益） ===
function pickWaveChoices() {
    const pool = (cfg().buff_pool && cfg().buff_pool.length) ? cfg().buff_pool.slice() : [];
    const out = [];
    while (pool.length && out.length < 3) {
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    S.waveChoices = out;
    return out;
}

function addTryEffect(player, effectId, seconds, amp) {
    try { player.addEffect(effectId, seconds, amp, false); }
    catch (e) { try { player.addEffect(effectId, seconds, amp); } catch (e2) { /* ignore */ } }
}

function applyBuff(player, choice) {
    if (!choice) return;
    const pname = String(player.realName || player.name);
    if (S.pickedBuff.has(pname)) {
        const prev = S.waveChoices.find((c) => c.id === S.pickedBuff.get(pname));
        player.tell(msg("§e本波你已选择【" + (prev ? prev.name : "?") + "】，下波再来。"));
        return;
    }
    const c = cfg();
    switch (String(choice.id)) {
        case "strength":
            addTryEffect(player, 5, 90, 1);
            break;
        case "guard":
            addTryEffect(player, 10, 90, 1);
            addTryEffect(player, 11, 90, 1);
            break;
        case "core_heal": {
            const max = Number(c.core.max_hp) || 200;
            S.coreHp = Math.min(max, S.coreHp + 40);
            updateCoreStand();
            broadcast("§a" + pname + " 加固了核心！核心 " + S.coreHp + "/" + max);
            break;
        }
        case "arrows":
            runCmd("give {player} arrow 24", player);
            addTryEffect(player, 3, 60, 1);
            break;
        case "bounty":
            S.waveBuffs.goldMult = 2;
            broadcast("§6" + pname + " 悬赏本波！击杀金币 ×2");
            break;
        case "barrier":
            S.barrierUntil = Date.now() + 10000;
            broadcast("§b" + pname + " 张开了核心屏障！10 秒内核心无敌");
            break;
        default:
            S.pickedBuff.delete(pname);
            player.tell(msg("§c未知增益: " + choice.id));
            return;
    }
    S.pickedBuff.set(pname, String(choice.id));
    player.tell(msg("§a已选择【" + choice.name + "】，本波生效！"));
}

// 文本版三选一（表单缺失/异常时的兜底，也用于 /wave buff 无参调用）
function showBuffText(player) {
    const pname = String(player.realName || player.name);
    if (!S.waveChoices.length) pickWaveChoices();
    const picked = S.pickedBuff.get(pname);
    player.tell(msg(picked ? "§e本波已选择增益。" : "§6本波三选一（/wave buff <ID> 选择）："));
    if (!picked) {
        for (const ch of S.waveChoices) {
            player.tell(msg("§e" + ch.id + " §f" + ch.name + " §7- " + (ch.desc || "")));
        }
    }
}

// 表单三选一；无表单 API 返回 false（调用方走文本兜底）
function openBuffForm(player) {
    try {
        if (typeof mc.newSimpleForm !== "function" || typeof player.sendForm !== "function") return false;
        if (!S.waveChoices.length) pickWaveChoices();
        const pname = String(player.realName || player.name);
        const picked = S.pickedBuff.get(pname);
        const form = mc.newSimpleForm();
        const title = "§6波间强化 · 第 " + (S.wave + 1) + " 波";
        const content = (picked ? "§7本波已选择。下一波再来强化。\n" : "§7选择一个增益，作用于下一波：\n")
            + S.waveChoices.map((ch, i) => (i + 1) + ". §e" + ch.name + " §7" + (ch.desc || "")).join("\n");
        if (typeof form.setTitle === "function") form.setTitle(title); else form.title = title;
        if (typeof form.setContent === "function") form.setContent(content); else form.content = content;
        for (const ch of S.waveChoices) {
            if (typeof form.addButton === "function") form.addButton("§e" + ch.name + "\n§7" + (ch.desc || ""));
        }
        player.sendForm(form, (pl, id) => {
            try {
                if (id === null || id === undefined) return;
                const idx = Number(id);
                if (!isFinite(idx) || idx < 0 || idx >= S.waveChoices.length) return;
                applyBuff(player, S.waveChoices[idx]);
            } catch (e) {
                logger.warn("buff form callback error: " + e);
            }
        });
        return true;
    } catch (e) {
        logger.warn("buff form failed: " + e);
        return false;
    }
}

function waveSize(wave) {
    const w = cfg().waves;
    const players = Math.max(1, S.participants.size);
    const raw = (w.count_base + players * w.count_per_player) * Math.pow(w.growth, wave - 1);
    return Math.max(1, Math.min(w.max_per_wave || 40, Math.floor(raw)));
}

// 人数难度：每多 1 名参与者，怪生命 ×(1 + health_per_player)；Boss 不参与缩放
function playerHealthFactor(opts) {
    if (opts && opts.boss) return 1;
    const pct = Number((cfg().waves || {}).health_per_player);
    if (!(pct > 0)) return 1;
    return 1 + (Math.max(1, S.participants.size) - 1) * pct;
}

function isEliteWave(wave) {
    return (cfg().waves.elite_waves || []).indexOf(wave) >= 0;
}
function isBossWave(wave) {
    return wave === Number(cfg().waves.boss_wave);
}

let mobSeq = 0;

// LSE addEffect 参数顺序为 (effect, durationSeconds, amplifier, particles)，效果用数字 id
const EFFECT_IDS = {
    speed: 1, slowness: 2, haste: 3, strength: 5,
    regeneration: 10, damage_resistance: 11, resistance: 11, fire_resistance: 12,
};
function effectIdOf(name) {
    if (typeof name === "number") return name;
    const k = String(name || "").toLowerCase();
    return EFFECT_IDS[k] !== undefined ? EFFECT_IDS[k] : 11;
}

// 波次成长：第 N 波起全体怪附加的效果（speed_from_wave / strength_from_wave）
function waveGrowthEffects(wave) {
    const g = cfg().growth || {};
    const out = [];
    if (wave >= Number(g.speed_from_wave || 9999)) out.push({ id: "speed", amp: Number(g.speed_amp) || 1 });
    if (wave >= Number(g.strength_from_wave || 9999)) out.push({ id: "strength", amp: Number(g.strength_amp) || 1 });
    return out;
}

// 精英词缀：随机 roll 1 个（第 dual_from_wave 波起可能 2 个不重复）
function rollAffixes(wave) {
    const a = cfg().affixes || {};
    if (a.enabled === false || !Array.isArray(a.pool) || !a.pool.length) return [];
    const count = wave >= Number(a.dual_from_wave || 9999) ? 2 : 1;
    const pool = a.pool.slice();
    const picked = [];
    for (let i = 0; i < count && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return picked;
}

function spawnGroup(type, point, count, opts) {
    opts = opts || {};
    const pf = playerHealthFactor(opts); // 人数生命系数（普通/精英生效，Boss=1）
    if (typeof mc.spawnMob !== "function") {
        logger.warn("mc.spawnMob API missing in this engine");
        return 0;
    }
    const spawned = [];
    for (let i = 0; i < count; i++) {
        try {
            const e = mc.spawnMob(type, makePos(point.x, point.y, point.z, point.dimid));
            if (e) spawned.push(e);
        } catch (err) {
            logger.warn("spawnMob failed: " + type + " / " + err);
            break;
        }
    }
    const affixes = opts.affixes || [];
    const prefix = affixes.length
        ? "§e[" + affixes.map((x) => x.name).join("·") + "]§r "
        : "";
    for (const e of spawned) {
        mobSeq++;
        const marker = "#" + S.wave + "." + mobSeq;
        const displayName = prefix + String(opts.name || type);
        const fullName = marker + " §c" + displayName;
        try { e.name = fullName; } catch (err) { /* 只读则跳过 */ }
        let hp = Number(opts.health) || 0;
        if (hp > 0) hp = Math.round(hp * pf);              // 配置血量（精英等）按人数缩放
        else if (pf > 1) {                                  // 普通怪：按自然血量缩放
            const nat = Number(e.health) || 0;
            if (nat > 0) hp = Math.round(nat * pf);
        }
        for (const af of affixes) {
            if (af.health_mult) hp = Math.round(hp * af.health_mult);
        }
        if (hp > 0) {
            try { e.health = hp; } catch (err) { /* ignore */ }
        }
        const effList = [];
        if (opts.effect) effList.push({ id: opts.effect, amp: 2 });
        if (Array.isArray(opts.effects)) effList.push(...opts.effects);
        for (const af of affixes) {
            if (Array.isArray(af.effects)) effList.push(...af.effects);
        }
        for (const ef of effList) {
            const eid = effectIdOf(ef.id);
            try { e.addEffect(eid, 600, ef.amp || 1, false); } catch (err) { try { e.addEffect(eid, 600, ef.amp || 1); } catch (e2) { /* ignore */ } }
        }
        S.mobs.push({
            e, name: fullName, type,
            elite: !!opts.elite, boss: !!opts.boss,
            affixes,
            maxHealth: hp > 0 ? hp : 0,
            enraged: false,
            lastPos: null,
            alive: true, spawnAt: Date.now(),
        });
    }
    return spawned.length;
}

function spawnWave(wave) {
    const w = cfg().waves;
    const points = cfg().spawns || [];
    if (!points.length) {
        broadcast("§c未配置刷怪点，活动终止！");
        endEvent(false, "缺少刷怪点");
        return;
    }
    S.phase = "wave";
    S.wave = wave;
    S.waveElapsed = 0;
    S.mobs = [];

    const boss = isBossWave(wave);
    const elite = isEliteWave(wave);
    const growth = waveGrowthEffects(wave);

    if (boss) {
        const bp = points[mobSeq % points.length];
        const b = w.boss || {};
        spawnGroup(b.type || "ravager", bp, 1, { name: b.name || "Boss", health: b.health || 600, effect: b.effect, boss: true, effects: growth });
        // Boss 波附赠小怪
        const adds = Math.max(4, Math.floor(waveSize(wave) / 2));
        for (let i = 0; i < adds; i++) {
            const p = points[i % points.length];
            const t = (w.pool || ["zombie"])[i % (w.pool || ["zombie"]).length];
            spawnGroup(t, p, 1, { effects: growth });
        }
        broadcast("§4§l⚠ 第 " + wave + " 波：Boss「" + (b.name || "Boss") + "」来袭！守住核心！");
    } else {
        let total = waveSize(wave);
        if (elite) {
            const el = w.elite || {};
            const ep = points[0];
            const affixes = rollAffixes(wave);
            spawnGroup("ravager", ep, Math.max(1, el.count || 3), {
                name: el.name || "精英", health: el.health || 80, effect: el.effect,
                elite: true, affixes, effects: growth,
            });
            broadcast(affixes.length
                ? "§c§l⚠ 第 " + wave + " 波：精英突袭！词缀【" + affixes.map((x) => x.name).join("、") + "】"
                : "§c§l⚠ 第 " + wave + " 波：精英突袭！");
        }
        const pool = (w.pool && w.pool.length) ? w.pool : ["zombie"];
        for (let i = 0; i < total; i++) {
            const p = points[i % points.length];
            const t = pool[i % pool.length];
            spawnGroup(t, p, 1, { effects: growth });
        }
        if (!elite) broadcast("§e第 " + wave + "/" + S.total + " 波来袭！共 " + total + " 只。");
        else broadcast("§e第 " + wave + "/" + S.total + " 波（精英）增援 " + total + " 只普通怪。");
    }

    // 开波提示
    for (const [name] of S.participants) {
        const p = mc.getPlayer(name);
        if (p) { try { p.setActionBar("§c⚔ 第 " + wave + "/" + S.total + " 波  §f核心 " + S.coreHp + "/" + cfg().core.max_hp); } catch (e) { /* ignore */ } }
    }
}

function clearWave(reason) {
    // 清掉场上剩余的活动怪
    for (const m of S.mobs) {
        if (m.alive) {
            try { m.e.remove(); } catch (e) { /* ignore */ }
            m.alive = false;
        }
    }
    S.mobs = [];
    logger.info("wave cleared: " + S.wave + " (" + reason + ")");
}

function onWaveCleared() {
    const w = cfg().waves;
    broadcast("§a✔ 第 " + S.wave + " 波清空！存活玩家：" + aliveParticipants().join("、"));
    // 重置上一波的增益状态，发放新一轮三选一
    S.waveBuffs = {};
    S.barrierUntil = 0;
    S.pickedBuff.clear();
    pickWaveChoices();
    if (S.wave >= S.total) {
        endEvent(true, "全部波次通关");
        return;
    }
    // 波间补给
    for (const c of w.supply_commands || cfg().supply_commands || []) runCmd(c, null);
    S.phase = "intermission";
    S.countdown = Math.max(3, w.intermission_seconds || 30);
    // 弹三选一表单：面向所有参与者（含已淘汰者——核心/赏金类增益死了也能为队伍选）；
    // 表单打开失败时逐人文本兜底，保证每波结束必有选择入口
    for (const name of Array.from(S.participants.keys())) {
        const p = mc.getPlayer(name);
        if (!p) continue;
        if (!openBuffForm(p)) showBuffText(p);
    }
}

// === 自动开局倒计时（auto_start） ===
// 规则：首人加入启动；新玩家加入重置（同人退出重进不重置 = 防恶意反复进出）；
// 重置次数达 max_resets 后锁定不再延长；倒计时结束自动开始。
function autoStartCfg() {
    const a = cfg().auto_start || {};
    const mr = Number(a.max_resets);
    const cd = Number(a.countdown_seconds);
    return {
        enabled: a.enabled !== false,
        seconds: Math.max(5, Math.floor(cd) || 60),
        maxResets: Math.max(0, Number.isFinite(mr) ? Math.floor(mr) : 5),
    };
}

function beginCountdown(name) {
    const a = autoStartCfg();
    if (!a.enabled || S.phase !== "idle") return;
    S.startCd = {
        remaining: a.seconds,
        triggers: new Set(name ? [name] : []),
        resets: 0, waiting: false, capped: false,
    };
    S.phase = "countdown";
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(tickSecond, 1000);
    applySidebarEventMode(); // 倒计时阶段即接管侧边栏，显示对局状态（阶段/人数）
    broadcast("§6" + name + " 加入了活动！§e" + a.seconds + " 秒后自动开始§7（/wave join 参战 · /wave leave 退出）");
    logger.info("start countdown begun by " + name + " (" + a.seconds + "s)");
}

function touchCountdown(name) {
    const st = S.startCd;
    if (!st || S.phase !== "countdown") return;
    const a = autoStartCfg();
    if (st.waiting) {
        // 人数达标恢复流程（倒计时已到 0，下一秒即开始）
        st.waiting = false;
        if (st.triggers.has(name)) return;
        st.triggers.add(name);
        broadcast("§6" + name + " 加入！§e人数达标，马上开始！");
        return;
    }
    if (st.triggers.has(name)) return; // 退出重进不算新触发（防恶意反复进出拖时间）
    st.triggers.add(name);
    if (st.resets >= a.maxResets) {
        if (!st.capped) {
            st.capped = true;
            broadcast("§e倒计时已锁定（重置已达上限 " + a.maxResets + " 次），不再因加入而延长。");
        }
        return;
    }
    st.resets++;
    st.remaining = a.seconds;
    broadcast("§6" + name + " 加入！§e倒计时重置为 " + a.seconds + " 秒（"
        + st.resets + "/" + a.maxResets + "）");
}

function cancelCountdown(reason) {
    if (S.phase !== "countdown") return;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    S.startCd = null;
    S.phase = "idle";
    S.wave = 0;
    // 最终榜单在显示中 → 取消倒计时只退回榜单（不还原原侧边栏）；首赛前取消才还原
    if (!isFinalBoardVisible()) restoreSidebar();
    if (reason) broadcast("§7开局倒计时取消：" + reason);
    logger.info("start countdown cancelled: " + reason);
}

function tickCountdown() {
    const st = S.startCd;
    if (!st) { cancelCountdown("状态丢失"); return; }
    if (st.waiting) return; // 人数不足挂起，等人加入
    st.remaining--;
    if (st.remaining > 0) {
        if (st.remaining % 10 === 0 || st.remaining <= 5) {
            broadcast("§e" + st.remaining + " 秒后自动开始活动…");
        }
        return;
    }
    // 到点：场地/人数校验后自动开始
    const c = cfg();
    if (!posValid(c.core.pos) || !posValid(c.arena.lobby) || !(c.spawns || []).length) {
        cancelCountdown("场地未配置（需 setcore / setlobby / addspawn）");
        return;
    }
    if (S.participants.size < Math.max(1, c.min_players || 1)) {
        st.waiting = true;
        broadcast("§e人数不足（至少 " + Math.max(1, c.min_players) + " 人），等待玩家加入后开始…");
        return;
    }
    const err = startEvent(null, null);
    if (err) cancelCountdown(err); // 会广播具体原因
}

// === 核心 & 主循环（1s tick） ===
function tickSecond() {
    if (S.phase === "countdown") { tickCountdown(); return; }
    if (S.phase !== "wave" && S.phase !== "intermission") return;
    const c = cfg();
    const core = c.core;

    // 夜晚锁定
    if (c.lock_night) {
        S.nightTick++;
        if (S.nightTick >= Math.max(5, c.night_interval_seconds || 30)) {
            S.nightTick = 0;
            try { mc.runcmd("time set night"); } catch (e) { /* ignore */ }
        }
    }

    // 核心名牌盔甲架挂了就补（被打死/被系统清除），3 秒冷却防刷
    if (cfg().core.stand !== false && S.corePlaced) {
        let dead = !S.coreStand;
        if (S.coreStand) {
            try { const h = Number(S.coreStand.health); dead = !isFinite(h) || h <= 0; } catch (e) { dead = true; }
        }
        if (dead && Date.now() >= (S.standRespawnAt || 0)) {
            S.standRespawnAt = Date.now() + 1500; // 怪会攻击名牌（仇恨生效），缩短空窗
            logger.info("core stand dead/missing, respawning");
            spawnCoreStand();
        }
    }

    if (S.phase === "intermission") {
        S.countdown--;
        if (S.countdown % 10 === 0 || S.countdown <= 5) {
            broadcast("§e下一波 " + S.countdown + " 秒后来袭，抓紧补给！");
        }
        if (S.countdown <= 0) {
            spawnWave(S.wave + 1);
        }
        return;
    }

    // ---- wave 阶段 ----
    S.waveElapsed++;

    // 存活检测 + 核心 proximity 伤害
    let aliveCount = 0;
    let coreHitThisTick = 0;
    for (const m of S.mobs) {
        if (!m.alive) continue;
        let hp = 0;
        try { hp = Number(m.e.health); } catch (e) { hp = 0; }
        if (!isFinite(hp) || hp <= 0) {
            m.alive = false;
            continue;
        }
        aliveCount++;
        try {
            const ep = m.e.pos;
            if (ep) {
                m.lastPos = { x: ep.x, y: ep.y, z: ep.z, dimid: ep.dimid || 0 };
                if (dist3(ep, core.pos) <= (core.radius || 4)) {
                    coreHitThisTick++;
                }
            }
        } catch (e) { /* 实体已消失 */ }
    }

    if (coreHitThisTick > 0) {
        const dmg = coreHitThisTick * Math.max(1, core.damage_per_hit || 1);
        if (damageCore(dmg, "怪物围攻")) return;
    } else if (S.waveElapsed % 3 === 0) {
        for (const [name] of S.participants) {
            const p = mc.getPlayer(name);
            if (p) { try { p.setActionBar("§c⚔ 第 " + S.wave + "/" + S.total + " 波  §f核心 " + S.coreHp + "/" + core.max_hp); } catch (e) { /* ignore */ } }
        }
    }

    // 清波判定
    if (aliveCount === 0) {
        onWaveCleared();
        return;
    }
    // 超时强制清场
    if (S.waveElapsed >= (cfg().waves.timeout_seconds || 300)) {
        broadcast("§e本波超时，剩余怪物已清除（按通关计）。");
        clearWave("timeout");
        onWaveCleared();
        return;
    }

    // 词缀·灼身光环：周期点燃身边玩家（死亡系之外的持续压力）
    for (const m of S.mobs) {
        if (!m.alive || !m.affixes || !m.lastPos) continue;
        const burn = m.affixes.find((a) => a.aura && a.aura.kind === "burn");
        if (!burn) continue;
        const iv = Math.max(1, Number(burn.aura.interval) || 2);
        if (S.waveElapsed % iv !== 0) continue;
        for (const p of mc.getOnlinePlayers()) {
            try {
                if (dist3(p.pos, m.lastPos) <= (Number(burn.aura.radius) || 4)) {
                    if (typeof p.setFire === "function") p.setFire(Number(burn.aura.seconds) || 3);
                    else if (typeof p.setOnFire === "function") p.setOnFire(Number(burn.aura.seconds) || 3);
                }
            } catch (e) { /* ignore */ }
        }
    }

    // Boss 事件：周期招援军 + 血量阈值狂暴
    const bt = cfg().boss_tick || {};
    const bossRec = S.mobs.find((m) => m.boss && m.alive);
    if (bossRec) {
        const iv = Math.max(1, Number(bt.summon_interval) || 15);
        if (S.waveElapsed > 0 && S.waveElapsed % iv === 0) {
            const pts = cfg().spawns || [];
            const pool = (cfg().waves.pool && cfg().waves.pool.length) ? cfg().waves.pool : ["zombie"];
            const n = Math.max(1, Number(bt.summon_count) || 2);
            for (let i = 0; i < n && pts.length; i++) {
                const p = pts[Math.floor(Math.random() * pts.length)];
                spawnGroup(pool[Math.floor(Math.random() * pool.length)], p, 1, { effects: waveGrowthEffects(S.wave) });
            }
            broadcast("§4§lBoss 招来了援军！");
        }
        if (!bossRec.enraged && bossRec.maxHealth > 0) {
            let bhp = 0;
            try { bhp = Number(bossRec.e.health); } catch (e) { bhp = 0; }
            if (bhp > 0 && bhp <= bossRec.maxHealth * (Number(bt.enrage_hp_pct) || 0.3)) {
                bossRec.enraged = true;
                try { bossRec.e.addEffect(1, 600, 1, false); } catch (e) { /* ignore */ }
                broadcast("§4§l🔥 Boss 狂暴了！移速大幅提升！");
            }
        }
    }

    // 全灭判定
    if (aliveParticipants().length === 0) {
        broadcast("§4§l✖ 全员淘汰，活动失败！");
        endEvent(false, "全员淘汰（第 " + S.wave + " 波）");
    }
}

// === 结算 ===
function endEvent(victory, reason) {
    clearWave("end");
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    S.phase = "ended";
    // 最终榜单常驻：不还原侧边栏，事件模板 + 存档榜一直显示到下一场开始或 /wave rank off
    // （可见性由 isFinalBoardVisible() 按"空闲+有存档+未关闭"推导，重启后依然成立）
    removeCore();     // 撤掉核心方块与名牌盔甲架
    restoreEventBalances(); // 返还暂存金币
    restoreEventInventories(); // 清空活动物品 + 返还赛前背包（离线者上线自动返还）
    // 恢复昼夜循环
    if (cfg().lock_night && cfg().night_restore_cycle !== false) {
        try { mc.runcmd("gamerule dodaylightcycle true"); } catch (e) { /* ignore */ }
    }
    // 重置波次增益状态
    S.waveBuffs = {};
    S.barrierUntil = 0;
    S.waveChoices = [];
    S.pickedBuff.clear();

    const waveReached = S.wave;
    const c = cfg();

    // 计分排序：击杀分（含精英/Boss 加成）
    const rows = [];
    for (const [name, rec] of S.participants) {
        rows.push({ name, rec, score: scoreOf(rec) });
    }
    rows.sort((a, b) => b.score - a.score || b.rec.kills - a.rec.kills);

    // 存档本场最终榜（叠在历史榜最上方，供 /wave rank 查看）
    saveMatchSnapshot(victory, reason, waveReached, rows);

    broadcast(victory ? "§a§l★ 通关！共守住 " + waveReached + " 波 —— " + reason : "§c§l活动结束 —— " + reason);
    rows.forEach((r, i) => {
        broadcast("§e第 " + (i + 1) + " 名 §f" + r.name + " §7击杀 " + r.rec.kills
            + "（精英 " + r.rec.eliteKills + "/Boss " + r.rec.bossKills + "）§6得分 " + r.score);
    });
    broadcast("§7📋 完整榜单（多场叠加，新场在上）: /wave rank");

    // 奖励命令
    rows.forEach((r, i) => {
        for (const rw of c.rewards || []) {
            if (Number(rw.rank) === i + 1) {
                for (const cmd of rw.commands || []) runCmd(cmd, { realName: r.name }, { rank: i + 1, score: r.score });
            }
        }
    });

    // 清场：回传 + 模式恢复（淘汰者身上还挂着旁观 → 恢复生存并传回集合点，别把人卡在旁观模式）
    const ret = c.arena.spawn_return;
    const back = posValid(ret) ? ret : (posValid(c.arena.lobby) ? c.arena.lobby : null);
    for (const [name, rec] of S.participants) {
        const p = mc.getPlayer(name);
        if (!p) continue;
        if (rec.out) {
            applyMode(p, "survival");
            if (back) {
                try { p.teleport(back.x, back.y, back.z, back.dimid || 0); } catch (e) { /* ignore */ }
            }
        } else if (posValid(ret)) {
            try { p.teleport(ret.x, ret.y, ret.z, ret.dimid || 0); } catch (e) { /* ignore */ }
        }
        try { if (p.removeBossbar) p.removeBossbar(); } catch (e) { /* ignore */ }
    }

    logger.info("event ended: victory=" + victory + " reason=" + reason + " waves=" + waveReached);
    S.phase = "idle";
    S.wave = 0;
    S.participants.clear();
    S.mobs = [];
}

// 开始活动（/wave start 与自动开局共用）；返回 null=成功，否则返回错误文案
function startEvent(player, totalArg) {
    const c = cfg();
    if (S.phase === "wave" || S.phase === "intermission") return "活动进行中，先 /wave stop。";
    if (!posValid(c.core.pos)) return "先 /wave setcore 设置核心。";
    if (!posValid(c.arena.lobby)) return "先 /wave setlobby 设置集合点。";
    if (!c.spawns || !c.spawns.length) return "先 /wave addspawn 添加刷怪点。";
    if (S.participants.size < Math.max(1, c.min_players || 1)) {
        return "参与人数不足（至少 " + Math.max(1, c.min_players) + " 人 /wave join）。";
    }
    // 手动开局把 op 自己也算进参与者（方便单人调试；noCountdown=true 防止触发自动倒计时）
    if (player && !S.participants.has(String(player.realName || player.name))) addParticipant(player, true, true);

    S.total = Math.max(1, Number(totalArg) || c.waves.total || 20);
    S.coreHp = Number(c.core.max_hp) || 200;
    S.wave = 0;
    S.nightTick = 0;
    S.phase = "intermission";
    S.countdown = 10;
    S.startCd = null;   // 自动开局状态随开局清空（timer 在下面一并重置）
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(tickSecond, 1000);
    applySidebarEventMode(); // 接管侧边栏（波次/核心/击杀榜），结束时还原
    placeCore();             // 核心方块 + 血量名牌盔甲架
    // 锁夜：冻结昼夜循环 + 立即入夜（tick 里还有周期性 time set night 兜底）
    if (c.lock_night) {
        try { mc.runcmd("gamerule dodaylightcycle false"); mc.runcmd("time set night"); } catch (e) { /* ignore */ }
    }
    // 活动经济：暂存并清空所有参与者的金币与背包
    flushPendingStashes(); // 先清偿上次遗留的暂存（否则本次会跳过清空）
    for (const name of Array.from(S.participants.keys())) {
        const pl = mc.getPlayer(name);
        if (pl) {
            clearEventBalance(pl);
            stashEventInventory(pl);
            // kit 必须在暂存清空之后发，绝不进暂存（否则玩家开局拿到的是空背包）
            for (const kc of cfg().kit_commands || []) runCmd(kc, pl);
        }
    }
    broadcast("§6§l国庆尸潮防守开始！共 " + S.total + " 波，10 秒后第一波来袭。守住核心！");
    // 人数难度公示
    const n = S.participants.size;
    const w = c.waves;
    const hpPct = Number(w.health_per_player);
    if (n > 1) {
        broadcast("§b👥 人数难度：" + n + " 人 → 首波约 " + waveSize(1) + " 只"
            + (hpPct > 0 ? "，怪生命 +" + Math.round((n - 1) * hpPct * 100) + "%" : "")
            + "（每多 1 人 +" + (Number(w.count_per_player) || 0) + " 只"
            + (hpPct > 0 ? " / 生命 +" + Math.round(hpPct * 100) + "%" : "") + "）");
    }
    for (const name of S.participants.keys()) {
        const pl = mc.getPlayer(name);
        if (pl && posValid(c.arena.lobby)) {
            try { pl.teleport(c.arena.lobby.x, c.arena.lobby.y, c.arena.lobby.z, c.arena.lobby.dimid || 0); } catch (e) { /* ignore */ }
        }
    }
    return null;
}

// === 命令 ===
function handleWaveCommand(player, args) {
    const sub = String((args && args[0]) || "help").toLowerCase();
    const c = cfg();

    if (sub === "help" || sub === "帮助") {
        player.tell(msg("§e/wave join|leave §7加入/退出（首人加入自动倒计时开局）"));
        player.tell(msg("§e/wave shop §7活动商店（表单）；/wave buy <ID> 文本购买"));
        player.tell(msg("§e/wave buff [ID] §7波间三选一增益（表单/文本）"));
        player.tell(msg("§e/wave repair §7花金币修理核心    §e/wave revive §7复活币（每场1次）"));
        player.tell(msg("§e/wave status §7查看状态"));
        player.tell(msg("§e/wave rank [场次|off|on] §7最终排行榜（常驻侧边栏；off/on 开关）"));
        if (isAdmin(player)) {
            player.tell(msg("§e/wave start [波数] §7开始活动"));
            player.tell(msg("§e/wave stop §7强制停止"));
            player.tell(msg("§e/wave setlobby / setcore / setseat §7设置集合点/核心/观战席（站定后执行）"));
            player.tell(msg("§e/wave addspawn / clearspawns §7添加/清空刷怪点"));
            player.tell(msg("§e/wave spawns §7查看刷怪点数量"));
        }
        return;
    }

    if (sub === "join" || sub === "加入") {
        addParticipant(player);
        return;
    }

    if (sub === "leave" || sub === "退出") {
        const name = String(player.realName || player.name);
        if (S.participants.delete(name)) {
            player.tell(msg("§e已退出活动。"));
            if (S.phase === "countdown" && S.participants.size === 0) cancelCountdown("无人参与");
        } else {
            player.tell(msg("§7你不在活动名单里。"));
        }
        return;
    }

    if (sub === "shop" || sub === "商店") {
        if (!canShop(player)) { player.tell(msg("§c活动中只有场上存活参与者可以购物。")); return; }
        if (!openShopForm(player)) showShopText(player); // 表单优先，失败走文本
        return;
    }

    if (sub === "buy" || sub === "购买") {
        const id = String(args[1] || "").trim().toLowerCase();
        if (!id) { player.tell(msg("§c用法: /wave buy <ID>（或直接 /wave shop 打开商店）")); return; }
        const it = shopItems().find((x) => String(x.id).toLowerCase() === id);
        if (!it) { player.tell(msg("§c没有这个商品: " + id)); return; }
        doBuy(player, it);
        return;
    }

    if (sub === "repair" || sub === "修理") {
        const rc = cfg().repair || {};
        if (rc.enabled === false) { player.tell(msg("§c核心修理已关闭。")); return; }
        const running = S.phase === "wave" || S.phase === "intermission";
        if (!running) { player.tell(msg("§c活动中才能修理核心。")); return; }
        const name = String(player.realName || player.name);
        const rec = getParticipant(name);
        if (!rec || rec.out) { player.tell(msg("§c只有场上存活参与者能修理。")); return; }
        const max = Number(cfg().core.max_hp) || 200;
        if (S.coreHp >= max) { player.tell(msg("§a核心血量已满（" + max + "/" + max + "）。")); return; }
        const cd = Math.max(0, Number(rc.cooldown_seconds) || 3) * 1000;
        if (Date.now() - (S.lastRepairAt || 0) < cd) {
            player.tell(msg("§c修理冷却中，稍等几秒。"));
            return;
        }
        const price = Math.max(0, Math.floor(Number(rc.price) || 100));
        if (!chargeXuid(player, price, "修理")) return false;
        S.lastRepairAt = Date.now();
        const healed = Math.min(Number(rc.hp) || 10, max - S.coreHp);
        S.coreHp += healed;
        updateCoreStand();
        player.tell(msg("§a修理完成：核心 +" + healed + " → " + S.coreHp + "/" + max + "（-" + price + " 金币）"));
        return;
    }

    if (sub === "revive" || sub === "复活") {
        const rc = cfg().revive || {};
        if (rc.enabled === false) { player.tell(msg("§c复活功能已关闭。")); return; }
        const running = S.phase === "wave" || S.phase === "intermission";
        if (!running) { player.tell(msg("§c活动中才能使用复活币。")); return; }
        const name = String(player.realName || player.name);
        const rec = getParticipant(name);
        if (!rec) { player.tell(msg("§c你不在活动名单里。")); return; }
        if (!rec.out) { player.tell(msg("§a你还活着，不需要复活。")); return; }
        if (rec.usedRevive) { player.tell(msg("§c每场只能复活一次。")); return; }
        const price = Math.max(0, Math.floor(Number(rc.price) || 500));
        if (!chargeXuid(player, price, "复活")) return false;
        rec.usedRevive = true;
        rec.out = false;
        rec.deaths = 0;
        if (!safeSetGameMode(player, "survival")) safeSetGameMode(player, 0);
        const lobby = cfg().arena.lobby;
        if (posValid(lobby)) {
            try { player.teleport(lobby.x, lobby.y, lobby.z, lobby.dimid || 0); } catch (e) { /* ignore */ }
        }
        for (const c of cfg().kit_commands || []) runCmd(c, player);
        player.tell(msg("§a复活币生效！重返战场（本场最后一次）。"));
        broadcast("§6" + name + " 花金币复活，重返战场！");
        return;
    }

    if (sub === "buff" || sub === "增益") {
        const running = S.phase === "wave" || S.phase === "intermission";
        if (!running) { player.tell(msg("§c活动中（波间）才能选择增益。")); return; }
        const name = String(player.realName || player.name);
        const rec = getParticipant(name);
        if (!rec) { player.tell(msg("§c你不在活动名单里。")); return; } // 已淘汰者也能选（团队增益）
        const pickId = String(args[1] || "").trim().toLowerCase();
        if (pickId) {
            if (!S.waveChoices.length) pickWaveChoices();
            const choice = S.waveChoices.find((ch) => String(ch.id).toLowerCase() === pickId);
            if (!choice) {
                player.tell(msg("§c未知增益，可用："
                    + S.waveChoices.map((ch) => ch.id + "(" + ch.name + ")").join("、")));
                return;
            }
            applyBuff(player, choice);
            return;
        }
        if (!openBuffForm(player)) showBuffText(player); // 表单失败 → 文本列表
        return;
    }

    if (sub === "status" || sub === "状态") {
        player.tell(msg("§7阶段: §f" + S.phase + " §7波次: §f" + S.wave + "/" + S.total
            + " §7核心: §f" + S.coreHp + "/" + c.core.max_hp
            + " §7参与: §f" + S.participants.size + " §7存活: §f" + aliveParticipants().length));
        player.tell(msg("§7刷怪点 " + (c.spawns || []).length + " 个 | 核心 "
            + (posValid(c.core.pos) ? "已设置" : "§c未设置") + " | 集合点 "
            + (posValid(c.arena.lobby) ? "已设置" : "§c未设置")));
        if (S.phase === "countdown" && S.startCd) {
            const a2 = autoStartCfg();
            player.tell(msg(S.startCd.waiting
                ? "§e开局倒计时: 等待人数达标 §7(至少 " + Math.max(1, c.min_players) + " 人)"
                : "§e开局倒计时: " + S.startCd.remaining + " 秒后自动开始 §7(新玩家加入重置，上限 " + a2.maxResets + " 次)"));
        }
        return;
    }

    if (sub === "rank" || sub === "排行" || sub === "榜单") {
        const a1 = String(args[1] || "").toLowerCase();
        if (a1 === "off" || a1 === "关") {
            if (!isAdmin(player)) { player.tell(msg("§c需要 OP 权限。")); return; }
            setFinalBoardHidden(true);
            restoreSidebar();
            player.tell(msg("§a已关闭最终榜单侧边栏（数据保留，/wave rank on 恢复；下一场结束后自动重新上屏）"));
            return;
        }
        if (a1 === "on" || a1 === "开") {
            if (!isAdmin(player)) { player.tell(msg("§c需要 OP 权限。")); return; }
            setFinalBoardHidden(false);
            applySidebarEventMode();
            player.tell(msg("§a最终榜单已重新上屏。"));
            return;
        }
        renderRank(player, String(args[1] || ""));
        return;
    }

    // ---- 以下为管理命令 ----
    if (!isAdmin(player)) {
        player.tell(msg("§c需要 OP 权限。"));
        return;
    }
    const p = player.pos;

    if (sub === "start" || sub === "开始") {
        const err = startEvent(player, Number(args[1]));
        if (err) player.tell(msg("§c" + err));
        else player.tell(msg("§a已启动。"));
        return;
    }

    if (sub === "stop" || sub === "停止") {
        if (S.phase === "idle") { player.tell(msg("§7当前没有活动。")); return; }
        if (S.phase === "countdown") {
            cancelCountdown("管理员取消");
            player.tell(msg("§a开局倒计时已取消。"));
            return;
        }
        endEvent(false, "管理员终止");
        player.tell(msg("§a已停止并清场。"));
        return;
    }

    if (sub === "setlobby" || sub === "集合点") {
        c.arena.lobby = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), dimid: p.dimid || 0 };
        config.set("cfg", c);
        player.tell(msg("§a集合点已设置 " + JSON.stringify(c.arena.lobby)));
        return;
    }

    if (sub === "setseat" || sub === "观战席") {
        c.arena.seat = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), dimid: p.dimid || 0 };
        config.set("cfg", c);
        player.tell(msg("§a观战席已设置。"));
        return;
    }

    if (sub === "setreturn" || sub === "回传点") {
        c.arena.spawn_return = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), dimid: p.dimid || 0 };
        config.set("cfg", c);
        player.tell(msg("§a结束回传点已设置。"));
        return;
    }

    if (sub === "setcore" || sub === "核心") {
        c.core.pos = { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y), z: Math.floor(p.z) + 0.5, dimid: p.dimid || 0 };
        config.set("cfg", c);
        player.tell(msg("§a核心已设置（半径 " + c.core.radius + "，血量 " + c.core.max_hp + "）: " + JSON.stringify(c.core.pos)));
        return;
    }

    if (sub === "addspawn" || sub === "刷怪点") {
        c.spawns = c.spawns || [];
        c.spawns.push({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y), z: Math.floor(p.z) + 0.5, dimid: p.dimid || 0 });
        config.set("cfg", c);
        player.tell(msg("§a已添加第 " + c.spawns.length + " 个刷怪点。"));
        return;
    }

    if (sub === "clearspawns" || sub === "清空刷怪点") {
        c.spawns = [];
        config.set("cfg", c);
        player.tell(msg("§a刷怪点已清空。"));
        return;
    }

    if (sub === "spawns") {
        player.tell(msg("§7刷怪点共 " + ((c.spawns || []).length) + " 个"));
        return;
    }

    player.tell(msg("§c未知子命令，/wave help 查看。"));
}

// === 事件 ===
mc.regPlayerCmd("wave", "国庆尸潮守点活动", (player, args) => {
    const list = Array.isArray(args) ? args : String(args || "").trim().split(/\s+/);
    try {
        handleWaveCommand(player, list);
    } catch (e) {
        player.tell(msg("§c命令执行异常: " + e));
        logger.warn("command error: " + e);
    }
}, 0);

// 击杀记分：onMobDie(mob, source)
mc.listen("onMobDie", (mob, source) => {
    if (S.phase !== "wave") return;
    let rec = null;
    try {
        const n = String(mob && mob.name || "");
        const m = n.match(/^#(\d+)\.(\d+)/);
        if (m) {
            for (const it of S.mobs) {
                if (it.alive && it.name === n) { rec = it; break; }
            }
        }
    } catch (e) { /* ignore */ }
    if (!rec) {
        // 兜底：按位置匹配最近的活动怪
        let best = null, bestD = 1.5;
        try {
            const mp = mob.pos;
            for (const it of S.mobs) {
                if (!it.alive) continue;
                const d = dist3(mp, it.e.pos);
                if (d < bestD) { bestD = d; best = it; }
            }
        } catch (e) { /* ignore */ }
        rec = best;
    }
    if (!rec) return;
    rec.alive = false;

    // 词缀·死亡触发：爆破（AOE 伤害玩家/核心）+ 分裂（原地再生小怪）
function safeEntityPos(e) {
    try {
        const p = e && e.pos;
        return p ? { x: p.x, y: p.y, z: p.z, dimid: p.dimid || 0 } : null;
    } catch (err) { return null; }
}

function triggerAffixDeath(rec) {
    if (!rec || !rec.affixes || !rec.affixes.length) return;
    const pos = rec.lastPos || safeEntityPos(rec.e);
    if (!pos) return;
    for (const af of rec.affixes) {
        if (af.death_blast) {
            const r = Number(af.death_blast.radius) || 4;
            const dmg = Number(af.death_blast.damage) || 6;
            broadcast("§c§l💥 砰！一只精英炸开了！");
            for (const p of mc.getOnlinePlayers()) {
                try {
                    if (dist3(p.pos, pos) <= r) {
                        if (typeof p.hurt === "function") p.hurt(dmg);
                        p.tell(msg("§c被爆炸波及 -" + dmg + " 生命"));
                    }
                } catch (e) { /* ignore */ }
            }
            if (S.corePlaced) {
                try {
                    if (dist3({ x: S.corePlaced.x + 0.5, y: S.corePlaced.y, z: S.corePlaced.z + 0.5 }, pos) <= r) {
                        damageCore(dmg, "爆破词缀");
                    }
                } catch (e) { /* ignore */ }
            }
        }
        if (af.death_split) {
            const cnt = Number(af.death_split.count) || 2;
            spawnGroup(af.death_split.type || "zombie",
                { x: pos.x, y: pos.y, z: pos.z, dimid: pos.dimid },
                cnt, { effects: waveGrowthEffects(S.wave) });
            broadcast("§a分裂！" + cnt + " 只小怪加入了战场。");
        }
    }
}

// 击杀者记分（引擎的 source 可能是实体，也可能是带 isPlayer/toPlayer 的包装对象）
    let killer = null;
    try {
        if (source) {
            if (typeof source.isPlayer === "function") {
                if (source.isPlayer()) {
                    killer = typeof source.toPlayer === "function" ? source.toPlayer() : source;
                }
            } else if ((source.realName || source.name) && typeof source.teleport === "function") {
                killer = source;
            }
        }
    } catch (e) { /* ignore */ }
    if (killer) {
        const kName = String(killer.realName || killer.name || "");
        const kRec = kName ? getParticipant(kName) : null;
        if (kRec && !kRec.out) {
            kRec.kills++;
            if (rec.boss) { kRec.bossKills++; broadcast("§4§l" + kName + " 击杀了 Boss！"); }
            else if (rec.elite) { kRec.eliteKills++; }
            // 击杀金币奖励（词缀怪每词缀 ×2：爆破/分裂等高危怪值钱）
            const kr = (cfg().economy && cfg().economy.kill_reward) || {};
            let reward = rec.boss ? (Number(kr.boss) || 0)
                : rec.elite ? (Number(kr.elite) || 0)
                : (Number(kr.normal) || 0);
            const affixCount = (rec.affixes || []).length;
            if (affixCount > 0) reward = reward * Math.pow(2, affixCount);
            reward = reward * (Number(S.waveBuffs.goldMult) || 1); // 赏金增益
            if (reward > 0 && killer.xuid && typeof money !== "undefined" && typeof money.add === "function") {
                try {
                    money.add(String(killer.xuid), reward);
                    const label = rec.boss ? "Boss击杀" : rec.elite ? "精英击杀" : "击杀";
                    killer.tell(msg("§a+" + reward + " 金币（" + label + (affixCount ? "·词缀×" + (1 << affixCount) : "") + "）"));
                } catch (e) { logger.warn("kill reward failed: " + e); }
            }
        }
    }

    // 词缀·死亡触发（爆破 AOE / 分裂）
    triggerAffixDeath(rec);
});

// 核心保护：攻击核心盔甲架 → 取消伤害（可选扣血）
mc.listen("onAttackEntity", (player, entity) => {
    if (S.phase !== "wave" && S.phase !== "intermission") return;
    if (!S.coreStand || !entity || !S.corePlaced) return;
    let isCore = false;
    try {
        // 盔甲架位于方块中心上方一格
        isCore = entity === S.coreStand
            || (entity.pos && dist3(entity.pos, {
                x: S.corePlaced.x + 0.5, y: S.corePlaced.y + 1, z: S.corePlaced.z + 0.5,
            }) < 1.2);
    } catch (e) { /* ignore */ }
    if (!isCore) return;
    try { player.tell(msg("§c核心不可攻击！守住它，别拆它。")); } catch (e) { /* ignore */ }
    if (cfg().core.dmg_on_mine) {
        damageCore(Number(cfg().core.mining_damage) || 5, "攻击核心");
    }
    return false; // 取消本次伤害
});

// 核心保护：挖核心方块 → 取消破坏并复原（可选扣血）
mc.listen("onDestroyBlock", (player, block) => {
    if (S.phase !== "wave" && S.phase !== "intermission") return;
    if (!S.corePlaced || !block || !block.pos) return;
    let hit = false;
    try {
        const dimOk = block.pos.dimid === undefined || block.pos.dimid === S.corePlaced.dimid;
        hit = dimOk && dist3(block.pos, S.corePlaced) < 0.6;
    } catch (e) { /* ignore */ }
    if (!hit) return;
    try { player.tell(msg("§c核心方块不可破坏！")); } catch (e) { /* ignore */ }
    setCoreBlock(cfg().core.block || "diamond_block"); // 防御性复原（万一取消未生效）
    if (cfg().core.dmg_on_mine) {
        damageCore(Number(cfg().core.mining_damage) || 5, "挖掘核心");
    }
    return false; // 取消破坏
});

// 死亡淘汰计数
mc.listen("onRespawn", (player) => {
    if (S.phase !== "wave" && S.phase !== "intermission") return;
    const name = String(player.realName || player.name);
    const rec = getParticipant(name);
    if (!rec || rec.out) return;
    rec.deaths++;
    const limit = Math.max(1, cfg().deaths_limit || 2);
    if (rec.deaths >= limit) {
        eliminatePlayer(player, "死亡 " + rec.deaths + "/" + limit + " 次");
    } else {
        player.tell(msg("§e阵亡 " + rec.deaths + "/" + limit + " 次，再死一次就淘汰。"));
        // 复活回集合点：同样走延迟自检落点（同步传送会被引擎的重生落点覆盖）
        const lobby = cfg().arena.lobby;
        schedulePlacement(player, {
            pos: posValid(lobby) ? lobby : null,
            mode: null,
            wanted: () => {
                const r = getParticipant(name);
                return !!(r && !r.out) && (S.phase === "wave" || S.phase === "intermission");
            },
        }, "respawn-lobby");
    }
});

mc.listen("onLeft", (player) => {
    const name = String(player.realName || player.name);
    if (S.phase === "countdown") {
        // 倒计时中掉线 = 退出（防挂着倒计时的幽灵参与者占名额）
        S.participants.delete(name);
        if (S.participants.size === 0) cancelCountdown("无人参与");
        return;
    }
    const rec = getParticipant(name);
    if (rec) rec.out = true; // 离线视为退出战斗
});

// 带空格的名字加引号防命令截断（顺带去掉引号字符本身防拼接异常）
function deopCmdArg(name) {
    const clean = String(name).replace(/"/g, "").trim();
    return /\s/.test(clean) ? '"' + clean + '"' : clean;
}

// 首次进服自动 deop：该地图会把所有进入者变成 OP，首进执行一次 deop 兜底。
// 名单持久化在 known_players.json（按 xuid 记，换名不重复触发）；豁免见 config.auto_deop.keep_op。
function deopFirstJoin(player) {
    const a = cfg().auto_deop || {};
    const name = String(player.realName || player.name);
    const key = String(player.xuid || "") || ("name:" + name);
    let known = {};
    try { known = joinStore.get("known") || {}; } catch (e) { known = {}; }
    if (known[key]) return; // 已经进过服（含豁免玩家）→ 不再干预
    if (a.enabled === false) {
        known[key] = { name: name, at: Date.now() };
        try { joinStore.set("known", known); } catch (e) { /* ignore */ }
        return;
    }
    const keep = a.keep_op || [];
    if (keep.some((k) => String(k) === name || String(k) === String(player.xuid || ""))) {
        logger.info("first join, keep op (auto_deop.keep_op): " + name);
    } else {
        try { mc.runcmd("deop " + deopCmdArg(name)); } catch (e) { logger.warn("deop failed: " + name + " / " + e); }
        logger.info("first join deop: " + name + " (xuid=" + (player.xuid || "?") + ")");
    }
    known[key] = { name: name, at: Date.now() };
    try { joinStore.set("known", known); } catch (e) { logger.warn("known players save failed: " + e); }
}

// 上线自动 deop（首进）+ 返还暂存的赛前背包（活动结束后离线玩家兜底）
mc.listen("onJoin", (player) => {
    try { deopFirstJoin(player); } catch (e) { logger.warn("first join deop error: " + e); }
    try { tryRestoreOnJoin(player); } catch (e) { logger.warn("join stash restore error: " + e); }
});

mc.listen("onServerStarted", () => {
    // 启动即把"合并后完整配置"写回 config.json：新默认键（auto_deop / auto_start /
    // health_per_player …）自动补进文件，改配置所见即所得。
    // 已保存的调优值优先（读时合并保证），不会被默认值覆盖。
    try { config.set("cfg", cfg()); } catch (e) { logger.warn("config materialize failed: " + e); }
    S.phase = "idle";
    S.wave = 0;
    S.mobs = [];
    S.participants.clear();
    S.timer = null;
    S.startCd = null;
    S.sidebarBackup = null;
    S.coreStand = null;
    S.standName = "";
    S.standRespawnAt = 0;
    S.corePlaced = null;
    S.savedBalances.clear();
    // 升级/重启衔接：已有存档榜单且未关闭 → 启动即接管侧边栏，最终榜单立刻可见
    if (isFinalBoardVisible()) applySidebarEventMode();
    logger.info(PLUGIN_NAME + " loaded (国庆尸潮守点, /wave)");
});

logger.info(PLUGIN_NAME + " loaded");
