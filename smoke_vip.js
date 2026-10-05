// LuckyClover-VIP 冒烟测试：stub LSE 环境后加载插件，验证
// 补差价/禁购低等级、写入去重（键统一）、兑换覆盖、续费叠加。
"use strict";
const path = require("path");

const PLUGIN = path.join(__dirname, "LuckyClover-VIP", "LuckyClover-VIP.js");
const VIPS_PATH = "plugins/LuckyClover-VIP/vips.json";

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
global.File = { mkdir() {}, read() { return ""; }, write() {}, exists() { return false; } };

const files = {};
global.JsonConfigFile = class {
    constructor(p, def) {
        this.p = p;
        if (!files[p]) files[p] = def ? JSON.parse(def) : {};
    }
    get(k) { return files[this.p][k]; }
    set(k, v) { files[this.p][k] = v; }
    delete(k) { delete files[this.p][k]; }
    refresh() {}
    init(k, v) { if (files[this.p][k] === undefined) files[this.p][k] = v; }
};

global.mc = {
    regPlayerCmd() {},
    listen() {},
    getOnlinePlayers() { return []; },
    getPlayer() { return null; },
};
global.money = {
    _bal: {},
    get(x) { return this._bal[x] || 0; },
    add(x, v) { this._bal[x] = (this._bal[x] || 0) + v; return true; },
    reduce(x, v) { if ((this._bal[x] || 0) < v) return false; this._bal[x] -= v; return true; },
    set(x, v) { this._bal[x] = v; return true; },
};

require(PLUGIN);

// ---- helpers ----
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log("PASS " + name); }
    else { fail++; console.log("FAIL " + name + (extra !== undefined ? " | " + JSON.stringify(extra) : "")); }
}
const call = (name, obj) => JSON.parse(exported[name](JSON.stringify(obj)));
const vipPlayers = () => files[VIPS_PATH].players;
const recordsByName = (n) => Object.keys(vipPlayers()).filter((k) =>
    String(vipPlayers()[k].name || "").toLowerCase() === n.toLowerCase());

// 1. 套餐列表：新套餐在售，vip/vip_plus 已下架
const pkgs = call("mgmtListPackages");
const ids = (pkgs.packages || []).map((p) => p.id).sort();
check("packages listed", pkgs.ok && JSON.stringify(ids) === JSON.stringify(["plus", "pro_20x", "pro_5x"]), ids);
check("package prices", pkgs.packages.find((p) => p.id === "plus").price === 10000
    && pkgs.packages.find((p) => p.id === "pro_5x").price === 30000
    && pkgs.packages.find((p) => p.id === "pro_20x").price === 80000, pkgs.packages);

// 2. 管理端设置（无 xuid）→ 旧数据为名字键
const s1 = call("mgmtSetVip", { name: "Alice", level: "plus", days: 30 });
check("admin set ok", s1.ok === true, s1);
check("set creates name-key record", Boolean(vipPlayers()["Alice"]) && vipPlayers()["Alice"].level === "plus", Object.keys(vipPlayers()));

// 3. 网页购买（带 xuid）：旧记录并入规范键 + 高等级补差价
money.set("X1", 200000);
const b1 = call("mgmtBuyVip", { name: "Alice", xuid: "X1", level: "pro_5x" });
check("upgrade ok", b1.ok === true, b1);
check("upgrade pays difference 20000", b1.paid === 20000 && b1.upgradeFrom === "plus", b1);
check("balance after upgrade", money.get("X1") === 180000, money.get("X1"));
check("single record under xuid", recordsByName("Alice").length === 1 && Boolean(vipPlayers()["X1"]), Object.keys(vipPlayers()));
check("level upgraded", vipPlayers()["X1"] && vipPlayers()["X1"].level === "pro_5x", vipPlayers()["X1"]);

// 4. 低等级不可购买
const b2 = call("mgmtBuyVip", { name: "Alice", xuid: "X1", level: "plus" });
check("lower level blocked", b2.ok === false && /不可购买/.test(b2.error), b2);
check("balance unchanged after block", money.get("X1") === 180000, money.get("X1"));

// 5. 同级续费：原价 + 时长叠加
const beforeExpire = vipPlayers()["X1"].expireAt;
const b3 = call("mgmtBuyVip", { name: "Alice", xuid: "X1", level: "pro_5x" });
const afterExpire = vipPlayers()["X1"].expireAt;
check("renew full price", b3.ok === true && b3.paid === 30000, b3);
check("renew balance", money.get("X1") === 150000, money.get("X1"));
check("renew extends", afterExpire >= beforeExpire + 29 * 86400000, { beforeExpire, afterExpire });

// 6. 兑换覆盖（任意等级直接覆盖当前套餐）
const g1 = call("mgmtGenerateCdk", { type: "vip", level: "plus", days: 30, count: 1 });
const r1 = call("mgmtRedeemCdk", { code: g1.codes[0], name: "Alice", xuid: "X1" });
check("redeem overwrite ok", r1.ok === true, r1);
check("redeem overwrote level", vipPlayers()["X1"] && vipPlayers()["X1"].level === "plus", vipPlayers()["X1"]);
check("still single record", recordsByName("Alice").length === 1, recordsByName("Alice"));

// 7. 多条脏数据（名字键 + uuid 键）→ 购买后收敛为一条
vipPlayers()["Dave"] = { level: "vip", name: "Dave", expireAt: Date.now() + 86400000, grantedAt: 1 };
vipPlayers()["uuid-dave"] = { level: "vip_plus", name: "Dave", expireAt: Date.now() + 86400000, grantedAt: 1 };
money.set("X4", 50000);
const b4 = call("mgmtBuyVip", { name: "Dave", xuid: "X4", level: "plus" });
check("stray records collapse", b4.ok === true && recordsByName("Dave").length === 1, Object.keys(vipPlayers()));
check("canonical xuid key", Boolean(vipPlayers()["X4"]) && vipPlayers()["X4"].level === "plus", vipPlayers()["X4"]);
check("legacy rank pays full 10000", b4.paid === 10000, b4);
check("dave balance", money.get("X4") === 40000, money.get("X4"));

// 8. 读取自愈：名字键旧记录 → getVipStatus 迁移到 xuid 键
vipPlayers()["Carol"] = { level: "pro_5x", name: "Carol", expireAt: Date.now() + 86400000, grantedAt: 1 };
const st = exported.getVipStatus({ xuid: "X3", realName: "Carol", name: "Carol" });
check("read heal finds vip", st.isVip === true && st.level === "pro_5x", st);
check("read heal migrates key", Boolean(vipPlayers()["X3"]) && !vipPlayers()["Carol"], Object.keys(vipPlayers()));

// 9. 管理端读取仍按名字找到记录
const my = call("mgmtGetMyVip", { name: "Dave" });
check("mgmtGetMyVip by name", my.ok === true && my.active === true && my.level === "plus", my);

// 10. CDK 基础回归：格式错误 / 金币兑换
const rBad = call("mgmtRedeemCdk", { code: "xyz", name: "Steve", xuid: "X9" });
check("bad code format", rBad.ok === false && /格式/.test(rBad.error), rBad);
const g2 = call("mgmtGenerateCdk", { type: "coins", amount: 5000, count: 1 });
const r2 = call("mgmtRedeemCdk", { code: g2.codes[0], name: "Steve", xuid: "X9" });
check("coins redeem", r2.ok === true && money.get("X9") === 5000, r2);

// 11. 管理端移除：找得到也删得掉（名字键解析）
const rm = call("mgmtRemoveVip", { name: "Carol" });
check("remove by name", rm.ok === true && !vipPlayers()["X3"], rm);

console.log("\n== result: " + pass + " pass, " + fail + " fail ==");
process.exit(fail ? 1 : 0);
