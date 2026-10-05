// 界面冒烟测试：加载插件 → 逐个打开所有页面 → 校验
//   1) 每个表单「按钮数 == 图标数」
//   2) 每个图标路径都在原版贴图清单里真实存在
//   3) 表单正文/按钮里没有残留的灰色 §7
//   4) 对每个页面按下所有按钮（索引分发正确、回调不抛错）
//   5) 分类/搜索在物品上方，且索引对应正确动作
// 用法：node tools/smoke-ui.js [--dump]
const { loadPlugin, textureExists, texturesUnavailable } = require("./lse-stub");

const h = loadPlugin();
h.startServer();
const problems = h.problems;
const forms = h.forms;
const commands = h.commands;
console.log("插件加载成功，注册命令:", Object.keys(commands).join(", "));
// 仓库已不再携带服务端数据（official.json / shops.json 等已删），
// 这里自备最小夹具：上架 1 件官方商品，否则「在售页」是空的，布局断言（第 3 个按钮 = 商品）无从验证。
{
    const addOfficial = h.exports && h.exports.mgmtAddOfficial;
    if (!addOfficial) {
        problems.push("找不到 mgmtAddOfficial 导出，无法种入测试夹具");
    } else {
        const r = JSON.parse(addOfficial(JSON.stringify({ type: "minecraft:diamond", price: 100, quantity: -1, category: "材料" })));
        console.log("测试夹具：", r.ok ? `已上架 ${r.listing.name} x无限` : `上架失败 ${r.error}`);
        if (!r.ok) problems.push(`测试夹具上架失败: ${r.error}`);
    }
}
if (texturesUnavailable()) {
    console.warn("⚠ 未找到原版贴图清单（bedrock-samples），已跳过「图标贴图存在性」校验；");
    console.warn("  按钮/图标数量、§7 颜色、索引分发、布局语义等检查照常执行。");
    console.warn("  如需完整校验：设置环境变量 BEDROCK_SAMPLES_TEXTURES 指向 resource_pack/textures。");
}

function checkForms(tag) {
    const sent = forms.splice(0, forms.length);
    let count = 0;
    for (const f of sent) {
        count++;
        if (!f.simple) {
            const bad = f.form._controls.filter((c) => typeof c.text === "string" && c.text.indexOf("§7") >= 0);
            if (bad.length) problems.push(`[${tag}] 自定义表单仍含灰色 §7: ${bad[0].text}`);
            continue;
        }
        if (f.buttons.length !== f.images.length) {
            problems.push(`[${tag}] ${f.title}: 按钮 ${f.buttons.length} 个但图标 ${f.images.length} 个`);
            continue;
        }
        f.buttons.forEach((btn, i) => {
            const img = f.images[i];
            if (img && !textureExists(img)) problems.push(`[${tag}] ${f.title} 第 ${i + 1} 个按钮图标不存在: ${img} (${btn.split("\n")[0]})`);
            if (String(btn).indexOf("§7") >= 0) problems.push(`[${tag}] ${f.title} 按钮仍是灰色: ${btn}`);
        });
        if (typeof f.content === "string" && f.content.indexOf("§7") >= 0) {
            problems.push(`[${tag}] ${f.title} 正文仍含灰色 §7`);
        }
    }
    return count;
}

const player = h.makePlayer("测试玩家", "xuid-test", true);
h.setCurrentPlayer(player);
const MAIN_CMD = Object.keys(commands)[0];
console.log("主命令:", MAIN_CMD);

const pages = [];
const addPage = (name, fn) => pages.push({ name, fn });
addPage("主菜单", () => commands[MAIN_CMD](player));
addPage("购物中心", () => h.run("showShoppingCenter")(player, 1, ""));
addPage("官方商店菜单", () => h.run("showOfficialMenu")(player));
addPage("官方出售页", () => commands.smgm(player));
addPage("回收页", () => commands.smhs(player));
addPage("仓库页", () => commands.smck(player));
addPage("求购大厅", () => commands.smreq(player));
addPage("管理菜单", () => h.run("showAdminMenu")(player));
addPage("市场配置", () => h.run("showMarketConfig")(player));
addPage("官方商店管理", () => h.run("showOfficialAdmin")(player));
addPage("在售管理", () => h.run("showOfficialSellAdmin")(player, 1, ""));
addPage("回收管理", () => h.run("showOfficialRecycleAdmin")(player, 1, ""));
addPage("分类管理", () => h.run("showCategoryAdmin")(player));
addPage("禁售管理", () => h.run("showForbiddenAdmin")(player));
addPage("玩家店铺管理", () => h.run("showPlayerShopAdmin")(player, 1, ""));
addPage("税收统计", () => h.run("showTaxStats")(player));
addPage("交易动态", () => h.run("showTradeLogs")(player, 1, ""));
addPage("排行榜", () => h.run("showRanking")(player, 1, ""));
addPage("全局搜索", () => h.run("showGlobalSearch")(player, "钻石", 1));
addPage("我的店铺", () => h.run("showMyShop")(player));
addPage("我的货架", () => h.run("showMyShelf")(player, 1));
addPage("上架物品", () => h.run("showListForSale")(player));
addPage("物品选择器", () => h.run("showCatalogPicker")(player, "选物品", "", () => {}, () => {}, 1, "全部"));
addPage("提醒箱", () => h.run("showNotifyInbox")(player, 1));
addPage("求购历史", () => h.run("showRequestHistory")(player, 1));
addPage("批量操作(官方)", () => h.run("showBatchList")(player, "official", 1));
addPage("求购详情", () => h.run("showRequestDetail")(player, { id: "t1", itemType: "minecraft:diamond", itemName: "钻石", quantity: 3, priceEach: 10, requesterXuid: "xuid-seller", requesterName: "卖家", createdTime: Date.now(), status: "active" }, 1, false));
addPage("店铺商品(卖家)", () => h.run("showShopView")(player, "xuid-seller", 1, "", "全部"));
addPage("仓库物品菜单", () => h.run("showWarehouseItemMenu")(player, { id: "w1", type: "minecraft:diamond", aux: 0, nbt: "", name: "钻石", quantity: 5, description: "", at: Date.now() }, 1));

let totalForms = 0;
for (const page of pages) {
    const before = forms.length;
    try {
        page.fn();
    } catch (error) {
        problems.push(`[${page.name}] 打开抛错: ${error && error.stack ? error.stack.split("\n")[0] : error}`);
        forms.splice(0, forms.length);
        continue;
    }
    if (forms.length === before) {
        problems.push(`[${page.name}] 未发送任何表单（函数不存在？）`);
        continue;
    }
    totalForms += checkForms(page.name);
}

// ---- 点击测试：逐个按下所有按钮，确保索引分发正确且不抛错 ----
let clicks = 0;
for (const page of pages) {
    try { page.fn(); } catch (error) { continue; }
    const sent = forms.splice(0, forms.length);
    for (const f of sent) {
        if (!f.simple) continue;
        for (let i = 0; i < f.buttons.length; i++) {
            clicks++;
            try {
                f.cb(f.player, i);
            } catch (error) {
                problems.push(`[${page.name}] 点击第 ${i + 1} 个按钮「${String(f.buttons[i]).split("\n")[0]}」抛错: ${error && error.message ? error.message : error}`);
            }
            while (forms.length) {
                const nf = forms.pop();
                if (nf.simple && nf.buttons.length !== nf.images.length) {
                    problems.push(`[${page.name}] 点击后弹出的 ${nf.title} 按钮/图标数量不匹配`);
                }
            }
        }
    }
}
console.log(`点击测试：共按下 ${clicks} 个按钮`);

// ---- 布局语义：分类 / 搜索在物品上方，索引对应正确动作 ----
function openPage(name) {
    const page = pages.find((p) => p.name === name);
    forms.splice(0, forms.length);
    page.fn();
    return forms.splice(0, forms.length);
}
function clickAndCollect(f, index) {
    forms.splice(0, forms.length);
    f.cb(f.player, index);
    return forms.splice(0, forms.length);
}
function firstCustom(sent) {
    for (const f of sent) if (!f.simple) return f.form;
    return null;
}
function hasInput(form, labelText) {
    return Boolean(form) && form._controls.some((c) => c.type === "input" && String(c.label).indexOf(labelText) >= 0);
}

const ICONC = h.run("ICON") || {};
{
    const sent = openPage("官方出售页");
    const list = sent.find((f) => f.simple);
    if (!list) problems.push("[布局] 官方出售页没有发出列表表单");
    else {
        if (!/分类/.test(String(list.buttons[0]))) problems.push(`[布局] 第 1 个按钮应是分类选择，实际是「${list.buttons[0]}」`);
        if (!/搜索/.test(String(list.buttons[1]))) problems.push(`[布局] 第 2 个按钮应是搜索，实际是「${list.buttons[1]}」`);
        if (list.images[0] !== ICONC.filter) problems.push("[布局] 分类按钮没有用筛选图标");
        if (list.images[1] !== ICONC.search) problems.push("[布局] 搜索按钮没有用放大镜图标");
        const itemButtons = list.images.slice(2, list.buttons.length - 1);
        const exact = itemButtons.filter((p) => /^textures\/(items|blocks)\//.test(String(p || ""))).length;
        const fallback = itemButtons.filter((p) => Object.keys(ICONC).some((k) => ICONC[k] === p)).length;
        const empty = itemButtons.filter((p) => !p).length;
        if (empty) problems.push(`[布局] 有 ${empty} 个物品按钮没有图标`);
        if (itemButtons.length && exact / itemButtons.length < 0.7) {
            problems.push(`[布局] 物品精确图标比例过低: ${exact}/${itemButtons.length}`);
        }
        console.log(`物品图标：精确 ${exact}/${itemButtons.length}，分类回退 ${fallback}，空白 ${empty}`);
        const cat = firstCustom(clickAndCollect(list, 0));
        if (!cat || !cat._controls.some((c) => c.type === "dropdown" && String(c.label).indexOf("分类") >= 0)) {
            problems.push("[布局] 点击第 1 个按钮没有打开分类下拉框");
        }
        const search = firstCustom(clickAndCollect(list, 1));
        if (!hasInput(search, "关键词")) problems.push("[布局] 点击第 2 个按钮没有打开搜索输入框");
        const buy = firstCustom(clickAndCollect(list, 2));
        if (!hasInput(buy, "购买数量")) problems.push("[布局] 点击第 3 个按钮没有打开购买确认（索引错位？）");
        const back = clickAndCollect(list, list.buttons.length - 1);
        const backForm = back.find((f) => f.simple);
        if (!backForm || String(backForm.title).indexOf("官方商店") < 0) problems.push("[布局] 最后一个按钮不是返回官方商店菜单");
        console.log(`布局语义：分类=${String(list.buttons[0])} / 搜索=${String(list.buttons[1])}`);
    }
}

// ---- 图标常量与 Icons.json 校验 ----
let iconCount = 0;
for (const key of Object.keys(ICONC)) {
    iconCount++;
    if (!textureExists(ICONC[key])) problems.push(`ICON.${key} 贴图不存在: ${ICONC[key]}`);
}
let iconEntries = 0;
{
    const data = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "Icons.json"), "utf8"));
    for (const key of Object.keys(data.icons || {})) {
        iconEntries++;
        if (!textureExists(data.icons[key])) problems.push(`Icons.json ${key} 贴图不存在: ${data.icons[key]}`);
    }
}

console.log(`\n检查了 ${pages.length} 个页面 / ${totalForms} 个表单 / ${iconCount} 个按钮图标常量 / ${iconEntries} 条物品图标`);
if (texturesUnavailable()) console.log("（贴图存在性校验本次跳过 —— 未找到 bedrock-samples）");

// 可选：打印关键页面实际渲染结果，便于人眼确认
if (process.argv.indexOf("--dump") >= 0) {
    const dumpNames = ["主菜单", "官方出售页", "物品选择器", "仓库页", "回收页"];
    for (const page of pages) {
        if (dumpNames.indexOf(page.name) < 0) continue;
        forms.splice(0, forms.length);
        try { page.fn(); } catch (error) { console.log(`(${page.name} 打开失败: ${error})`); continue; }
        for (const f of forms.splice(0, forms.length)) {
            if (!f.simple) continue;
            console.log(`\n===== ${page.name} | 标题: ${f.title} =====`);
            console.log(f.content);
            console.log("--- 按钮（图标 / 文本）---");
            f.buttons.slice(0, 25).forEach((b, i) => {
                console.log(`  ${i + 1}. ${String(f.images[i] || "(无)")} | ${String(b).replace(/\n/g, " ⏎ ")}`);
            });
            if (f.buttons.length > 25) console.log(`  ... 共 ${f.buttons.length} 个按钮`);
        }
    }
}

if (problems.length) {
    console.log(`\n发现 ${problems.length} 个问题：`);
    for (const p of problems.slice(0, 40)) console.log(" - " + p);
    process.exit(1);
}
console.log("全部通过 ✅");
