// 构建 LuckyClover-Wave-AI 行为包：给池内怪种注入"攻击核心盔甲架"目标
// 用法:
//   node build_wave_bp.js inspect   # 只拉 zombie.json 看目标选择器结构
//   node build_wave_bp.js build     # 下载全部池内实体、注入目标、生成行为包
"use strict";
const fs = require("fs");
const path = require("path");

const REPO_API = "https://api.github.com/repos/ZtechNetwork/MCBVanillaBehaviorPack/contents/entities";
const POOL = ["zombie", "zombie_villager", "husk", "stray", "spider", "cave_spider", "witch", "drowned"];
const OUT_DIR = path.join(__dirname, "LuckyClover-Wave-AI");
const CACHE = path.join(__dirname, "..", ".hologramlib-dl", "vanilla_entities");

// JSONC → JSON（保留字符串内 // 不动）
function stripJsonComments(s) {
    let out = "";
    let inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            out += c;
            if (esc) esc = false;
            else if (c === "\\") esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === "/" && s[i + 1] === "/") {
            while (i < s.length && s[i] !== "\n") i++;
            out += "\n";
            continue;
        }
        out += c;
    }
    return out;
}

async function fetchEntity(name) {
    fs.mkdirSync(CACHE, { recursive: true });
    const cacheFile = path.join(CACHE, name + ".json");
    if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
    const res = await fetch(`${REPO_API}/${name}.json?ref=master`, {
        headers: { "User-Agent": "wave-bp-builder", Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const meta = await res.json();
    const content = Buffer.from(meta.content, "base64").toString("utf8");
    fs.writeFileSync(cacheFile, content);
    return content;
}

function behaviorComponents(entity) {
    const e = entity["minecraft:entity"];
    if (!e || !e.components || !e.components["minecraft:behavior"]) return null;
    return e.components["minecraft:behavior"].components;
}

// 注入方式（1.26 平面格式：每种 behavior 组件类型只能存在一个实例）：
//  A. 有 nearest_attackable_target / nearest_prioritized_attackable_target → 追加盔甲架条目
//     （就近原则：玩家更近先打玩家，玩家不在范围/不可见 → 扑核心；原生AI=朝向/走路动画/交战停止全自动）
//  B. 主动目标组件完全缺失（蜘蛛/洞穴蜘蛛：原版只会反击）→ 新增完整目标组件（玩家+盔甲架都可攻）
const STAND_FILTER = { test: "is_family", subject: "other", value: "armor_stand" };
function standEntry(prioritized) {
    const e = { filters: JSON.parse(JSON.stringify(STAND_FILTER)), max_dist: 40 };
    if (prioritized) e.priority = 2; // 低于原版玩家条目(1)
    return e;
}
function injectGoal(entity, name) {
    const e = entity["minecraft:entity"];
    if (!e || !e.components) return "no components";
    const comps = e.components;

    // 活动怪绝不允许静默消失：原版 minecraft:despawn（距离/随机消散）直接移除
    if (comps["minecraft:despawn"]) {
        delete comps["minecraft:despawn"];
    }
    if (comps["minecraft:despawn_from_chance"]) {
        delete comps["minecraft:despawn_from_chance"];
    }

    for (const key of [
        "minecraft:behavior.nearest_attackable_target",
        "minecraft:behavior.nearest_prioritized_attackable_target",
    ]) {
        const t = comps[key];
        if (t && Array.isArray(t.entity_types)) {
            if (JSON.stringify(t.entity_types).includes("armor_stand")) return "already";
            t.entity_types.push(standEntry(key.includes("prioritized")));
            if (typeof t.within_radius === "number" && t.within_radius < 40) t.within_radius = 40;
            return "ok";
        }
    }

    // 主动目标缺失 → 新增（仅限池内已知的被动怪）
    if (name === "spider" || name === "cave_spider") {
        comps["minecraft:behavior.nearest_attackable_target"] = {
            reselect_targets: true,
            must_see: false,
            within_radius: 40,
            entity_types: [
                { filters: { test: "is_family", subject: "other", value: "player" }, max_dist: 35 },
                standEntry(false),
            ],
        };
        return "ok(new goal)";
    }
    return "no target component";
}

async function inspect() {
    const raw = await fetchEntity("zombie");
    const j = JSON.parse(stripJsonComments(raw));
    console.log("top keys:", Object.keys(j).join(", "), "| format_version:", j.format_version);
    const e = j["minecraft:entity"];
    console.log("entity keys:", Object.keys(e).join(", "));
    console.log("description:", JSON.stringify(e.description).slice(0, 200));
    console.log("components:", Object.keys(e.components || {}).join(", "));
    if (e.component_groups) console.log("component_groups:", Object.keys(e.component_groups).join(", "));
    // 深搜 minecraft:behavior 与 target 相关键
    const hits = [];
    (function walk(obj, trail) {
        if (!obj || typeof obj !== "object" || hits.length > 40) return;
        for (const k of Object.keys(obj)) {
            if (k === "minecraft:behavior" || /nearest_attackable_target|melee_attack/i.test(k)) {
                hits.push(trail + "." + k);
            }
            walk(obj[k], trail + "." + k);
        }
    })(j, "root");
    console.log("hits:\n" + hits.join("\n"));
    // 打印目标/近战的实际定义
    (function pick(obj, trail) {
        if (!obj || typeof obj !== "object") return;
        for (const k of Object.keys(obj)) {
            if (/nearest_attackable_target|zombie.*target|melee_attack/i.test(k)) {
                console.log("DEF", trail + "." + k, "=", JSON.stringify(obj[k]).slice(0, 400));
            }
            pick(obj[k], trail + "." + k);
        }
    })(j, "root");
}

async function build() {
    fs.mkdirSync(path.join(OUT_DIR, "entities"), { recursive: true });
    let ok = 0;
    for (const name of POOL) {
        try {
            const raw = await fetchEntity(name);
            const j = JSON.parse(stripJsonComments(raw));
            const r = injectGoal(j, name);
            if (r === "already") { console.log("ALREADY: " + name); ok++; continue; }
            if (!r.startsWith("ok")) { console.log(`SKIP ${name}: ${r}`); continue; }
            const out = path.join(OUT_DIR, "entities", name + ".json");
            fs.writeFileSync(out, JSON.stringify(j, null, 2));
            const hasDespawn = Boolean(j["minecraft:entity"].components["minecraft:despawn"]);
            console.log(`OK ${name} (format_version ${j.format_version}${hasDespawn ? " !!despawn还在" : ", despawn已移除"})`);
            ok++;
        } catch (e) {
            console.log(`FAIL ${name}: ${e.message}`);
        }
    }
    // manifest（新 UUID）
    const manifest = {
        format_version: 2,
        header: {
            name: "LuckyClover Wave AI",
            description: "尸潮活动：池内怪种在无玩家可攻时扑向核心盔甲架（原生AI寻路）",
            uuid: "b6f3f0e2-7a41-4c8d-9e52-3a9d1c0f7b21",
            version: [1, 0, 0],
            min_engine_version: [1, 21, 0],
        },
        modules: [
            {
                type: "data",
                uuid: "d1e8a4b7-2c93-4f16-8a55-6e0b7c9d4f13",
                version: [1, 0, 0],
            },
        ],
    };
    fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`\ndone: ${ok}/${POOL.length} entities -> ${OUT_DIR}`);
}

const mode = process.argv[2] || "inspect";
(mode === "build" ? build() : inspect()).catch((e) => {
    console.error("FATAL:", e.message);
    process.exit(1);
});
