// 辅助脚本：查某个关键词/物品名在官方贴图库里的真实文件名，用来修正手工表。
const fs = require("fs");
const path = require("path");
const S = "D:\\Minecraft示例\\bedrock-samples-1.21.130.3\\resource_pack\\textures";
function list(dir, prefix) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) out.push(...list(path.join(dir, e.name), `${prefix}${e.name}/`));
        else if (e.name.endsWith(".png")) out.push(prefix + e.name.slice(0, -4));
    }
    return out;
}
const items = list(path.join(S, "items"), "");
const blocks = list(path.join(S, "blocks"), "");
const terrain = (() => {
    const raw = fs.readFileSync(path.join(S, "terrain_texture.json"), "utf8").replace(/^\uFEFF/, "");
    let out = "", inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === "/" && raw[i + 1] === "/") { while (i < raw.length && raw[i] !== "\n") i++; out += "\n"; continue; }
        out += c;
    }
    return JSON.parse(out).texture_data;
})();

const queries = process.argv.slice(2);
for (const q of queries) {
    const words = q.split(/[\s,|]+/).filter(Boolean);
    const hit = (n) => words.every((w) => n.indexOf(w) >= 0);
    const bi = blocks.filter(hit).slice(0, 12);
    const ii = items.filter(hit).slice(0, 12);
    const tk = Object.keys(terrain).filter(hit).slice(0, 8);
    console.log(`### ${q}`);
    if (bi.length) console.log("  blocks:", bi.join(", "));
    if (ii.length) console.log("  items :", ii.join(", "));
    if (tk.length) console.log("  terrainKey:", tk.map((k) => `${k}=>${JSON.stringify(terrain[k].textures)}`).join(" ; "));
    if (!bi.length && !ii.length && !tk.length) console.log("  (无)");
}
