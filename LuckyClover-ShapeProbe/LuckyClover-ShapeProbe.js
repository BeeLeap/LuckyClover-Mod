// LuckyClover-ShapeProbe.js
// HologramLib 渲染通道探针 v5 —— playerNpc 穿墙判定（最终一轮通道测试）
//   /shapetest        —— 生成下列测试目标
//   /shapetest clear  —— 清除本插件创建的资源
// 测试目标：
//   P1 地面 NPC 名牌        —— 玩家路径名牌是否"不用瞄准就显示"（对照 N0 的悬停显示）
//   P2 埋地 NPC 名牌        —— 【最终判定】站地表能看到 P2 名字 = 隔墙 ESP 通道成立
//   P3 地面 NPC 来回移动     —— 每 500ms 传送一次(全量 respawn)，看闪烁/断线极限
//   N3 骑乘盔甲架 + E 全息   —— 复测（v4 疑似"自己头顶第一人称看不见"，请切第三人称看）
// 返回值全进日志（probe-v5 行）。
"use strict";

const PLUGIN_NAME = "LuckyClover-ShapeProbe";
const PLUGIN_DESC = "HologramLib rendering channel probe (playerNpc nametag through-wall test)";
const PLUGIN_VERSION = [1, 4, 0];

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, { Author: "Mell" });
logger.setTitle(PLUGIN_NAME);

const HL_NS = "HologramLib";
const HL_FNS = [
    // playerNpc 域（本轮主角）
    "playerNpcCaptureSkin", "playerNpcCreate", "playerNpcSetPos", "playerNpcSetNametag",
    "playerNpcSetVisiblePlayer", "playerNpcSetVisiblePlayers", "playerNpcDestroy",
    "playerNpcGetDebugInfo", "playerNpcSetViewDistance",
    // 实体骑乘 + 全息（复测第三人称）
    "entityCreate", "entitySetNametag", "entitySetVisiblePlayer", "entitySetRidePlayer",
    "entityDestroy", "entityGetInfo",
    "holoCreate", "holoAddLine", "holoSetColor", "holoSetDimension",
    "holoSetFollowPlayer", "holoClearFollowPlayer", "holoDrawToPlayer", "holoDestroy", "holoTick",
    "shapeDestroy",
];

const hl = {};
let hlMissing = {};

function tryResolve() {
    let ok = true;
    for (const name of HL_FNS) {
        if (typeof hl[name] === "function") continue;
        try {
            if (typeof ll.hasExported === "function" && !ll.hasExported(HL_NS, name)) {
                hlMissing[name] = "no_export";
                ok = false;
                continue;
            }
            const fn = ll.imports(HL_NS, name);
            if (typeof fn === "function") {
                hl[name] = fn;
                delete hlMissing[name];
            } else {
                hlMissing[name] = "not_a_function";
                ok = false;
            }
        } catch (e) {
            hlMissing[name] = "threw: " + e;
            ok = false;
        }
    }
    return ok;
}

const myShapes = [];
const myHolos = [];
const myEntities = [];
const myNpcs = [];
const report = [];
let p3Timer = null;

function dimOf(player) {
    return (player.dimension && typeof player.dimension.id === "number") ? player.dimension.id : 0;
}
function call(op, fn, args) {
    try {
        const ret = fn.apply(null, args);
        report.push(op + "=" + JSON.stringify(ret));
        return ret;
    } catch (e) {
        report.push(op + "=THREW:" + e);
        return null;
    }
}

setInterval(() => {
    if (!myHolos.length || typeof hl.holoTick !== "function") return;
    try { hl.holoTick(1.0); } catch (e) { /* ignore */ }
}, 50);

function runProbe(player) {
    report.length = 0;
    if (!tryResolve()) {
        const names = Object.keys(hlMissing);
        const hasLib = typeof ll.hasExported === "function" && ll.hasExported(HL_NS, "playerNpcCreate");
        player.tell(hasLib
            ? "§c[probe] 部分函数缺失: " + names.join(", ")
            : "§c[probe] HologramLib 未导出 playerNpc 域 —— 库未加载或版本过旧。");
        logger.warn("probe resolve failed: " + JSON.stringify(hlMissing));
        return;
    }

    const pos = player.pos;
    const x = pos.x, y = pos.y, z = pos.z;
    const pname = String(player.realName || player.name);
    const dim = dimOf(player);
    const created = {};

    // 先采集皮肤（npc 创建必须先注册皮肤，-3 = 皮肤未注册）
    call("skin.capture", hl.playerNpcCaptureSkin, ["esp_probe", pname]);

    function makeNpc(key, wx, wy, wz, name) {
        const id = call(key + ".create", hl.playerNpcCreate, [wx, wy, wz, dim, name, "esp_probe"]);
        created[key] = id;
        if (id == null || id < 0) return id;
        if (typeof hl.playerNpcSetVisiblePlayer === "function") {
            call(key + ".whitelist", hl.playerNpcSetVisiblePlayer, [id, pname]);
        }
        if (typeof hl.playerNpcGetDebugInfo === "function") call(key + ".info", hl.playerNpcGetDebugInfo, [id]);
        myNpcs.push(id);
        return id;
    }

    // P1 地面：名牌是否免瞄准
    makeNpc("P1", x + 6, y, z, "§eP1 地面NPC(免瞄准?)");
    // P2 埋地：隔墙最终判定
    makeNpc("P2", x, y - 20, z, "§6P2 埋地NPC(隔墙判定)");
    // P3 地面：移动闪烁测试（下方启动低频移动）
    const p3 = makeNpc("P3", x - 6, y, z, "§bP3 移动闪烁测试");

    // N3 骑乘（第三人称复测）
    const n3 = call("N3.create", hl.entityCreate, ["armor_stand", x, y + 2.5, z, dim]);
    created.N3 = n3;
    if (n3 != null && n3 >= 0) {
        call("N3.nametag", hl.entitySetNametag, [n3, "§dN3 骑乘(第三人称看)"]);
        call("N3.whitelist", hl.entitySetVisiblePlayer, [n3, pname]);
        call("N3.ride", hl.entitySetRidePlayer, [n3, pname]);
        myEntities.push(n3);
    }

    // E 全息跟随（第三人称复测）
    const e = call("E.create", hl.holoCreate, [x, y + 2.5, z]);
    created.E = e;
    if (e != null && e >= 0) {
        call("E.addLine", hl.holoAddLine, [e, "§dE 跟随(第三人称看)"]);
        call("E.color", hl.holoSetColor, [e, 1, 1, 1, 1]);
        if (typeof hl.holoSetDimension === "function") call("E.dim", hl.holoSetDimension, [e, dim]);
        call("E.follow", hl.holoSetFollowPlayer, [e, pname, 2.5]);
        call("E.draw", hl.holoDrawToPlayer, [e, pname]);
        myHolos.push(e);
    }

    // P3 低频往返移动 8 秒（每 500ms 一次 respawn，观察闪烁/断线）
    if (p3 != null && p3 >= 0) {
        let ticks = 0;
        if (p3Timer) { clearInterval(p3Timer); p3Timer = null; }
        p3Timer = setInterval(() => {
            ticks++;
            if (ticks > 16) {
                clearInterval(p3Timer);
                p3Timer = null;
                logger.info("probe-v5 P3 move test done (16 steps)");
                return;
            }
            const px = x + (ticks % 2 ? -6 : -3);
            try { hl.playerNpcSetPos(p3, px, y, z, -1); } catch (err) { /* ignore */ }
        }, 500);
    }

    logger.info("probe-v5 created=" + JSON.stringify(created) + " calls: " + report.join(" | "));
    const fails = report.filter((r) => r.includes("false") || r.includes("THREW") || /=-\d/.test(r));
    logger.info("probe-v5 suspicious=" + JSON.stringify(fails));

    player.tell("§a[probe] v5 已生成（实体/全息/ npc 类无时限，测完 clear）");
    player.tell("§e[probe] ── 4 个观察点 ──");
    player.tell("§e[probe] 1. 黄字 P1（地面NPC）：名字不用瞄准就常显吗？（N0 盔甲架是要瞄准的）");
    player.tell("§e[probe] 2. 【最终判定】站地表别挖：橙字 P2（埋地20格NPC）名字透出地面了吗？");
    player.tell("§e[probe] 3. 蓝字 P3 在来回移动（8 秒）：看着它，闪烁吗？难受吗？");
    player.tell("§e[probe] 4. 设置里切第三人称：头顶有 N3(紫盔甲架) 和 E(粉全息) 吗？");
    if (fails.length) player.tell("§c[probe] 疑似失败(" + fails.length + "): " + fails.slice(0, 6).join(" ; "));
}

function clearProbe(player) {
    if (p3Timer) { clearInterval(p3Timer); p3Timer = null; }
    let nn = 0;
    for (const id of myNpcs) {
        try { if (typeof hl.playerNpcDestroy === "function") hl.playerNpcDestroy(id); } catch (e) { /* 忽略 */ }
        nn++;
    }
    myNpcs.length = 0;
    let ne = 0;
    for (const id of myEntities) {
        try {
            if (typeof hl.entitySetRidePlayer === "function") hl.entitySetRidePlayer(id, "");
            if (typeof hl.entityDestroy === "function") hl.entityDestroy(id);
        } catch (e) { /* 忽略 */ }
        ne++;
    }
    myEntities.length = 0;
    let n = 0;
    for (const id of myShapes) {
        try { if (typeof hl.shapeDestroy === "function") hl.shapeDestroy(id); } catch (e) { /* 忽略 */ }
        n++;
    }
    myShapes.length = 0;
    let h = 0;
    for (const id of myHolos) {
        try {
            if (typeof hl.holoClearFollowPlayer === "function") hl.holoClearFollowPlayer(id);
            if (typeof hl.holoDestroy === "function") hl.holoDestroy(id);
        } catch (e) { /* 忽略 */ }
        h++;
    }
    myHolos.length = 0;
    player.tell("§a[probe] 已清除 " + nn + " NPC + " + ne + " 实体 + " + n + " 形状 + " + h + " 全息");
}

mc.regPlayerCmd("shapetest", "HologramLib 渲染通道探针", (player, args) => {
    const list = Array.isArray(args) ? args : String(args || "").trim().split(/\s+/);
    const sub = String(list[0] || "").trim().toLowerCase();
    try {
        if (sub === "clear" || sub === "清除") {
            clearProbe(player);
        } else {
            runProbe(player);
        }
    } catch (e) {
        player.tell("§c[probe] 异常: " + e);
        logger.warn("probe error: " + e + " report=" + JSON.stringify(report));
    }
}, 0);

logger.info(PLUGIN_NAME + " loaded v1.4 (playerNpc through-wall probe, /shapetest)");
