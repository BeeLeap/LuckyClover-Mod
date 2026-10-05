// LuckyClover Panel 前端 — 概览 / 管理 两个页面（hash 路由）
"use strict";

// ---------- state ----------
function ensureBrowserId() {
    let id = null;
    try {
        id = localStorage.getItem("lcpanel_browser");
    } catch (error) { /* ignore */ }
    if (!id || !/^[a-zA-Z0-9_-]{16,64}$/.test(id)) {
        id = "b" + Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, "0")).join("");
        try {
            localStorage.setItem("lcpanel_browser", id);
        } catch (error) { /* ignore */ }
    }
    return id;
}

const browserId = ensureBrowserId();

const state = {
    demo: false,
    auth: { authed: false, name: "", role: "guest" },
    route: "overview",
    overview: null,
    challenge: null,
    sbCfg: null,
    site: null,
    shop: null,
    mallBatch: null, // 商城批量操作当前作用的清单（official / recycle / shop）
    // 插件管理页当前页签（跨会话记住上次看的那个）
    pluginTab: (function () {
        try {
            return localStorage.getItem("lcpanel_admin_tab") || "core";
        } catch (error) {
            return "core";
        }
    })(),

    timers: { overview: null, authPoll: null, challenge: null, shop: null },
};

// ---------- toast ----------
let toastTimer = null;
function toast(message, kind) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.className = "toast" + (kind ? " " + kind : "");
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- api ----------
let apiNetFails = 0; // 连续网络失败计数：1-2次提示重试，3次才进演示模式
let mallForbiddenCache = null; // 商城禁售物品列表缓存

async function api(pathname, options) {
    const opts = options || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (state.auth.authed) {
        headers["X-Panel-Session"] = browserId;
    }
    try {
        const res = await fetch(pathname, Object.assign({}, opts, { headers }));
        const data = await res.json();
        apiNetFails = 0;
        if (data && data.ok === false && String(data.error || "").indexOf("需要管理员权限") >= 0 && state.auth.authed) {
            state.auth = { authed: false, name: "", role: "guest" };
            renderUserbox();
            toast("登录已过期，请重新登录", "err");
            renderRoute();
        }
        return data;
    } catch (error) {
        apiNetFails++;
        if (!state.demo) {
            if (apiNetFails >= 3) {
                state.demo = true;
                state.auth = { authed: true, name: "演示管理员", role: "admin" };
                renderUserbox();
                toast("面板服务未连接，进入演示模式", "err");
            } else {
                toast("网络请求失败，请重试", "err");
            }
        }
        throw error;
    }
}

async function invoke(plugin, method, args) {
    if (state.demo) {
        return mockInvoke(plugin, method, args);
    }
    try {
        return await api("/api/admin/invoke", {
            method: "POST",
            body: JSON.stringify({ plugin, method, args: args || [] }),
        });
    } catch (error) {
        return mockInvoke(plugin, method, args);
    }
}

// ---------- demo mocks ----------
const MOCK_SIDEBAR_CFG = {
    enabled: true,
    title: "§aLuckyClover",
    serverName: "LC生存服",
    refreshIntervalMs: 1000,
    cycleEnabled: false,
    cycleIntervalMs: 15000,
    rankingTitle: "§6=== 在线时长排行 ===",
    rankingLines: ["{topOnline1}", "{topOnline2}", "{topOnline3}"],
    lines: [
        "§b服务器§f: {serverName}",
        "§b在线玩家§f: {onlinePlayers}",
        "§b玩家§f: {playerName}",
        "§b头衔§f: {sidebarTitle}",
        "§b金币§f: {money}",
        "§b时间§f: {time}",
    ],
};

const MOCK_OVERVIEW = {
    ok: true,
    serverName: "LC生存服",
    version: "1.1.0",
    demo: true,
    server: {
        tps: 19.74, mspt: 23.87, online: 2, maxPlayers: 15,
        entities: 46, itemDrops: 2, uptimeSeconds: 19320,
        worldName: "Bedrock level", gamemode: "生存", seed: "1568717275",
        day: 4720, timeLabel: "20:24",
    },
    system: {
        cpu: { model: "AMD Ryzen 9 9950X 16-Core Processor", percent: 2.7 },
        mem: { total: 25769803776, used: 5690722713, percent: 22.1 },
        disk: { total: 42949672960, used: 29317737984, percent: 68.2 },
    },
    players: [
        { name: "Steve", health: 20, dimension: "主世界", gameMode: "生存", ping: 32, onlineTime: "3小时12分" },
        { name: "Alex", health: 17.5, dimension: "下界", gameMode: "冒险", ping: 58, onlineTime: "46分" },
    ],
};

function mockInvoke(plugin, method, args) {
    const cfg = { sidebar: MOCK_SIDEBAR_CFG };
    const table = {
        mgmtStatus: { ok: true, version: "1.0.0", demo: true, note: "演示数据" },
        mgmtGetConfig: () => ({ ok: true, [Object.keys(cfg)[0]]: undefined }),
        mgmtGetMetrics: { ok: true, tps: 19.74, mspt: 23.87, onlinePlayers: 2, page: "main" },
        mgmtRenderPreview: {
            ok: true, name: "Steve", title: "§aLuckyClover", page: "main",
            lines: MOCK_SIDEBAR_CFG.lines.map((l) => l.replace("{serverName}", "LC生存服")),
        },
        mgmtListVips: { ok: true, players: [{ key: "xuid:1001", name: "Steve", level: "vip", display: "VIP", expireAt: 0 }] },
        mgmtListWarps: { ok: true, warps: [{ name: "spawn", ownerName: "Steve", pos: { x: 0, y: 64, z: 0, dimid: 0 } }] },
        mgmtListHomes: { ok: true, key: "demo", name: "Steve", homes: [{ name: "base", pos: { x: 10, y: 70, z: -3, dimid: 0 } }] },
        mgmtMuteList: { ok: true, mutes: [] },
        mgmtGetPendingRequests: { ok: true, requests: [] },
        mgmtOverview: {
            ok: true,
            stats: {
                officialSells: 6, officialRecycles: 4, shops: 3, openShops: 2,
                itemTypes: 12, itemCount: 48, listings: 18, taxTotal: 1240, logs: 26,
            },
            tax: { enabled: true, rate: 0.05, scope: "player" },
            recent: [
                { ts: Date.now() - 60000, kind: "buy", buyer: "Steve", seller: "Alex", item: "钻石", qty: 3, price: 100, total: 300, tax: 15, official: false },
                { ts: Date.now() - 300000, kind: "recycle", buyer: "官方商店", seller: "Alex", item: "圆石", qty: 64, price: 1, total: 64, tax: 0, official: true },
            ],
            top: [{ rank: 1, name: "Alex", sales: 42, orders: 9, earnings: 5600 }],
        },
        mgmtListShops: {
            ok: true, total: 3, page: 1, pages: 1,
            rows: [
                { xuid: "demo-xuid-001", name: "Alex的店铺", ownerName: "Alex", isOpen: true, notice: "欢迎光临", itemTypes: 6, itemCount: 32, earnings: 5600, pendingEarnings: 0, pendingItems: 0, createdAt: 1790000000000 },
                { xuid: "demo-xuid-002", name: "Steve的店铺", ownerName: "Steve", isOpen: false, notice: "", itemTypes: 6, itemCount: 16, earnings: 1200, pendingEarnings: 300, pendingItems: 1, createdAt: 1790000100000 },
            ],
        },
        mgmtGetShop: {
            ok: true, xuid: "demo-xuid-001", name: "Alex的店铺", ownerName: "Alex", isOpen: true,
            itemTypes: 1, itemCount: 4, earnings: 5600, pendingEarnings: 0, pendingItems: 0, notice: "欢迎光临",
            items: [
                { key: "minecraft:diamond#demo", type: "minecraft:diamond", aux: 0, name: "钻石", price: 100, quantity: 4, category: "材料", sales: 12, createdAt: 1790000000000 },
            ],
        },
        mgmtListOfficial: {
            ok: true, total: 2, page: 1, pages: 1,
            rows: [
                { key: "k1", type: "minecraft:diamond", aux: 0, name: "钻石", price: 100, quantity: -1, category: "材料", sales: 12, createdAt: 1790000000000 },
                { key: "k2", type: "minecraft:bread", aux: 0, name: "面包", price: 10, quantity: 64, category: "食物", sales: 30, createdAt: 1790000000000 },
            ],
        },
        mgmtListRecycle: {
            ok: true, total: 1, page: 1, pages: 1,
            rows: [{ key: "r1", type: "minecraft:cobblestone", aux: 0, name: "圆石", price: 1, quantity: 0, category: "方块", sales: 0, createdAt: 1790000000000 }],
        },
        mgmtListLogs: {
            ok: true, total: 1, page: 1, pages: 1,
            rows: [{ ts: Date.now() - 60000, kind: "buy", buyer: "Steve", seller: "Alex", item: "钻石", qty: 3, price: 100, total: 300, tax: 15, official: false }],
        },
        mgmtGetRanking: {
            ok: true, total: 1, page: 1, pages: 1,
            rows: [{ rank: 1, xuid: "demo-xuid-001", name: "Alex", sales: 42, orders: 9, earnings: 5600, lastSale: Date.now() }],
        },
        mgmtGetTaxStats: {
            ok: true, total: 1240, count: 26,
            config: { enabled: true, rate: 0.05, scope: "player" },
            recent: [{ ts: Date.now() - 60000, payer: "Steve", payerXuid: "demo-xuid-002", amount: 15, item: "钻石", official: false }],
        },
        mgmtListCategories: { ok: true, categories: ["全部", "武器", "工具", "装备", "方块", "食物", "药水", "附魔书", "材料", "装饰", "其他"] },
        mgmtListRequests: {
            ok: true, total: 1, page: 1, pages: 1,
            rows: [{ id: "RDEMO1", itemName: "钻石", itemType: "minecraft:diamond", requesterName: "Steve",
                requesterXuid: "demo-xuid-003", priceEach: 100, quantity: 3, totalAmount: 300, fulfilled: 1,
                remark: "", status: "active", createdTime: Date.now() - 60000, expiresAt: Date.now() + 3600000 }],
        },
        mgmtListWarehouse: {
            ok: true, total: 1, page: 1, pages: 1,
            rows: [{ xuid: "demo-xuid-001", name: "Alex", purchased: true, used: 2, slots: 100, pieces: 47, updatedAt: Date.now() }],
        },
        mgmtGetWarehouse: {
            ok: true, xuid: "demo-xuid-001", name: "Alex", purchased: true, used: 1, slots: 100,
            items: [{ id: "w1", name: "钻石", type: "minecraft:diamond", quantity: 32, description: "存货", at: Date.now() - 86400000 }],
        },
        mgmtBatchList: { ok: true, scope: "official", action: "percent", count: 2 },
        mgmtGetForbidden: { ok: true, items: ["minecraft:bedrock", "minecraft:command_block"] },
        mgmtGetConfig: { ok: true, config: { command: "shop", pageSize: 20, allowSelfPurchase: false, statistics: true,
            tax: { enabled: true, rate: 0.05, scope: "player" },
            categories: ["全部", "其他"],
            shop: { allowCreate: true, createCost: 0, maxItemTypes: 15, maxQuantityPerListing: 960, minPrice: 1, maxPrice: 1000000000 },
            official: { sortMode: "随机" }, recycle: { enabled: true }, menu: { buttons: {} } } },
        mgmtAddOfficial: { ok: true, key: "demo-key", listing: { key: "demo-key", name: "钻石", price: 100, quantity: -1, category: "材料" } },
        mgmtAddRecycle: { ok: true, key: "demo-key", listing: { key: "demo-key", name: "圆石", price: 1, quantity: 0, category: "方块" } },
        mgmtListDailyTasks: {
            ok: true, day: "2026-09-25",
            tasks: [
                { id: "kill_zombie", name: "击杀僵尸", required: 10, reward: 80, progress: 6, claimed: false },
                { id: "break_stone", name: "挖掘圆石或石头", required: 32, reward: 60, progress: 32, claimed: true },
            ],
        },
        mgmtGetOnlineTop: { ok: true, ranking: [{ name: "Steve", seconds: 43200, op: false }, { name: "Alex", seconds: 9800, op: true }] },
        mgmtHubRegions: { ok: true, regions: [{ id: "main", name: "主城", enabled: true, allow: [] }] },
        mgmtGetFlight: { ok: true, key: "demo", vip: { active: true, canFly: true, remainingToday: 2400, flyEnabled: false }, purchased: { enabled: false, remainingSeconds: 0 } },
        mgmtGenerateCdk: { ok: true, codes: ["DEMO1-DEMO2-DEMO3", "DEMO4-DEMO5-DEMO6"], type: "vip", desc: "VIP Plus × 30 天", batch: "演示批次" },
        mgmtListCdk: { ok: true, total: 2, items: [
            { code: "DEMO1-DEMO2-DEMO3", type: "vip", desc: "VIP Plus × 30 天", batch: "演示批次", createdAt: 1790000000000, expiresAt: 0, usedBy: "", usedAt: 0 },
            { code: "DEMO4-DEMO5-DEMO6", type: "coins", desc: "5000 金币", batch: "", createdAt: 1789000000000, expiresAt: 0, usedBy: "Steve", usedAt: 1789500000000 },
        ] },
    };

    if (method === "mgmtGetConfig") {
        if (plugin === "sidebar") return { ok: true, sidebar: MOCK_SIDEBAR_CFG };
        if (plugin === "vip") return { ok: true, vip: { enabled: true, command: "vip", defaultLevel: "plus", levels: {
            vip: { display: "VIP", price: 0 }, vip_plus: { display: "VIP+", price: 0 },
            plus: { display: "VIP Plus", price: 10000, durationDays: 30 },
            pro_5x: { display: "Pro 5x", price: 30000, durationDays: 30 },
            pro_20x: { display: "Pro 20x", price: 80000, durationDays: 30 },
        } }, fly: { enabled: true, hourPrice: 3000, purchaseSeconds: 3600 } };
        if (plugin === "core") return { ok: true, chatFormatMode: "override", chatBridge: { enabled: true }, dailyTasks: { enabled: true, command: "daily" }, mute: { enabled: true } };
        if (plugin === "tpa") return { ok: true, teleport: { enabled: true, maxHomes: 3, requestTimeoutSeconds: 60 } };
        if (plugin === "seat") return { ok: true, seatFeature: { command: "seat", defaultEnabled: true } };
        if (plugin === "mall") return table.mgmtGetConfig;
        return { ok: true };
    }
    if (method === "mgmtSetConfig" || method === "mgmtSetPage" || method === "mgmtSetDefaultEnabled"
        || method === "mgmtSetVip" || method === "mgmtRemoveVip" || method === "mgmtSetTitle"
        || method === "mgmtClearTitle" || method === "mgmtSetDisplayName" || method === "mgmtClearDisplayName"
        || method === "mgmtDeleteWarp" || method === "mgmtClearHomes" || method === "mgmtUnmute"
        || method === "mgmtCleanupAll" || method === "mgmtReload") {
        return { ok: true, demo: true };
    }
    const entry = table[method];
    if (entry === undefined) return { ok: true, demo: true, note: "演示数据" };
    return typeof entry === "function" ? entry() : entry;
}

// ---------- format helpers ----------
function fmtBytes(bytes) {
    if (bytes === null || bytes === undefined) return "—";
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return gb.toFixed(1) + " GB";
    return (bytes / (1024 ** 2)).toFixed(0) + " MB";
}

function fmtUptime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
}

function fmtDate(ms) {
    if (!ms) return "永久";
    const d = new Date(ms);
    if (d.getTime() <= Date.now()) return "已过期";
    return d.toLocaleString();
}

function fmtDuration(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + "小时" + m + "分";
    if (m > 0) return m + "分" + s + "秒";
    return s + "秒";
}

function esc(text) {
    return String(text === null || text === undefined ? "" : text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function tableHtml(rows, cols) {
    if (!rows || !rows.length) {
        return `<div class="empty">暂无数据</div>`;
    }
    const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join("");
    const body = rows.map((row) => {
        const tds = cols.map((c) => {
            const raw = row[c.key];
            // action 列约定存放本页生成的按钮 HTML，不做转义
            const text = c.fmt
                ? c.fmt(raw, row)
                : (c.key === "action"
                    ? String(raw === null || raw === undefined ? "" : raw)
                    : esc(raw === null || raw === undefined ? "—" : raw));
            const cls = c.cls ? ` class="${c.cls}"` : "";
            return `<td${cls}>${text}</td>`;
        }).join("");
        return `<tr>${tds}</tr>`;
    }).join("");
    return `<table class="list"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---------- user box ----------
function renderUserbox() {
    const box = document.getElementById("userbox");
    const auth = state.auth;
    if (auth.authed) {
        box.innerHTML = `
            <span class="player-name"><span class="crown">👑</span>${esc(auth.name)}</span>
            ${auth.role === "admin" ? '<span class="badge-admin">管理员</span>' : ""}
            <button class="btn btn-danger btn-sm" id="btnLogout">退出</button>`;
        const btn = document.getElementById("btnLogout");
        if (btn) btn.addEventListener("click", logout);
    } else {
        box.innerHTML = `
            <span class="muted">未登录</span>
            <a class="btn btn-sm" href="#/admin">去绑定</a>`;
    }
}

async function logout() {
    if (!state.demo) {
        try {
            await api("/api/auth/logout", { method: "POST", body: JSON.stringify({ browserId }) });
        } catch (error) { /* ignore */ }
    }
    state.auth = { authed: false, name: "", role: "guest" };
    state.challenge = null;
    renderUserbox();
    toast("已退出登录");
    renderRoute();
}

// ---------- router ----------
function currentRoute() {
    const hash = location.hash || "";
    if (hash.indexOf("admin/site") >= 0) return "adminSite";
    if (hash.indexOf("admin") >= 0) return "admin";
    if (hash.indexOf("shop") >= 0) return "shop";
    if (!hash && state.site && state.site.defaultPage === "admin") return "admin";
    return "overview";
}

function setActiveTab() {
    document.querySelectorAll(".tab[data-route]").forEach((el) => {
        const route = el.getAttribute("data-route");
        const active = route === "admin" ? state.route.indexOf("admin") === 0 : route === state.route;
        el.classList.toggle("active", active);
    });
}

function clearTimers() {
    if (state.timers.overview) { clearInterval(state.timers.overview); state.timers.overview = null; }
    if (state.timers.authPoll) { clearInterval(state.timers.authPoll); state.timers.authPoll = null; }
    if (state.timers.challenge) { clearInterval(state.timers.challenge); state.timers.challenge = null; }
    if (state.timers.shop) { clearInterval(state.timers.shop); state.timers.shop = null; }
}

function renderRoute() {
    state.route = currentRoute();
    setActiveTab();
    clearTimers();
    const view = document.getElementById("view");
    if (state.route === "admin" || state.route === "adminSite") {
        renderAdmin(view);
    } else if (state.route === "shop") {
        renderShop(view);
    } else {
        renderOverview(view);
    }
}

window.addEventListener("hashchange", renderRoute);

// ---------- site settings ----------
function defaultSite() {
    return {
        name: "LC生存服",
        description: "",
        defaultPage: "overview",
        siteBg: "",
        cardBg: "",
        inkColor: "",
        logo: "",
        bgImage: "",
        bgBlur: 0,
        bgMask: 0,
    };
}

function ensureSiteStyle() {
    if (document.getElementById("siteBgStyle")) return;
    const style = document.createElement("style");
    style.id = "siteBgStyle";
    style.textContent = `
body.site-bg::before {
    content: "";
    position: fixed; inset: -30px;
    background: var(--site-img, none) center / cover no-repeat;
    filter: blur(var(--site-blur, 0px));
    z-index: -1;
    pointer-events: none;
}
body.site-bg::after {
    content: "";
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, var(--site-mask, 0));
    z-index: -1;
    pointer-events: none;
}`;
    document.head.appendChild(style);
}

function assetUrl(value) {
    if (!value) return "";
    if (String(value).indexOf("data:") === 0) return value;
    return "/assets/" + value;
}

function applySite(site) {
    if (!site) return;
    state.site = Object.assign(defaultSite(), site);
    const s = state.site;
    const root = document.documentElement;
    if (s.siteBg) {
        root.style.setProperty("--bg-top", s.siteBg);
        root.style.setProperty("--bg-bottom", s.siteBg);
    }
    if (s.cardBg) root.style.setProperty("--card", s.cardBg);
    if (s.inkColor) root.style.setProperty("--ink", s.inkColor);

    const nameEl = document.getElementById("serverName");
    if (nameEl && s.name) nameEl.textContent = s.name;
    if (s.name) document.title = s.name + " · 管理面板";

    const logo = document.getElementById("brandLogo");
    const logoSvg = document.getElementById("brandLogoSvg");
    if (logo && logoSvg) {
        if (s.logo) {
            logo.src = assetUrl(s.logo);
            logo.hidden = false;
            logoSvg.style.display = "none";
        } else {
            logo.hidden = true;
            logoSvg.style.display = "";
        }
    }

    ensureSiteStyle();
    const body = document.body;
    if (s.bgImage) {
        body.classList.add("site-bg");
        root.style.setProperty("--site-img", 'url("' + assetUrl(s.bgImage) + '")');
        root.style.setProperty("--site-blur", (Number(s.bgBlur) || 0) + "px");
        root.style.setProperty("--site-mask", String(Math.max(0, Math.min(1, Number(s.bgMask) || 0))));
    } else {
        body.classList.remove("site-bg");
        root.style.removeProperty("--site-img");
        root.style.removeProperty("--site-blur");
        root.style.removeProperty("--site-mask");
    }

    const intro = document.getElementById("ovIntro");
    if (intro) {
        const textEl = intro.querySelector(".intro-text");
        if (s.description) {
            intro.hidden = false;
            if (textEl) textEl.textContent = s.description;
        } else {
            intro.hidden = true;
        }
    }
}

function adminShellHtml(active) {
    return `
    <div class="subnav">
      <a class="subtab ${active === "plugins" ? "active" : ""}" href="#/admin">插件管理</a>
      <a class="subtab ${active === "site" ? "active" : ""}" href="#/admin/site">站点设置</a>
    </div>`;
}

// 插件管理页按插件分页签：每页只展示一个插件的分区，避免全部堆在一起
const PLUGIN_TABS = [
    { key: "core", label: "服务器核心", elementId: "coreStatus" },
    { key: "vip", label: "头衔 · VIP", elementId: "vipStatus" },
    { key: "tpa", label: "传送", elementId: "tpaStatus" },
    { key: "seat", label: "椅子", elementId: "seatStatus" },
    { key: "sidebar", label: "侧边栏", elementId: "sbxStatus" },
    { key: "mall", label: "商城", elementId: "mallStatus" },
];

function pluginTabsHtml() {
    const items = PLUGIN_TABS.map((tab) =>
        `<button class="chip plugintab${state.pluginTab === tab.key ? " active" : ""}"
            data-act="plugin.tab" data-tab="${tab.key}" data-plugintab="${tab.key}">${esc(tab.label)}</button>`).join("");
    return `<div class="plugin-tabs">${items}</div>`;
}

function switchPluginTab(tabKey) {
    const tab = PLUGIN_TABS.find((item) => item.key === tabKey) || PLUGIN_TABS[0];
    state.pluginTab = tab.key;
    try {
        localStorage.setItem("lcpanel_admin_tab", tab.key);
    } catch (error) {
        // 忽略存储失败
    }
    const view = document.getElementById("view");
    if (!view) return;
    view.querySelectorAll("[data-plugintab]").forEach((node) => {
        node.classList.toggle("active", node.getAttribute("data-plugintab") === tab.key);
    });
    view.querySelectorAll("[data-plugin]").forEach((node) => {
        node.hidden = node.getAttribute("data-plugin") !== tab.key;
    });
    refreshStatus(tab.key, tab.key, tab.elementId);
    if (tab.key === "vip") loadVipLevelOptions();
    if (tab.key === "sidebar") loadSidebarAdmin();
    if (tab.key === "mall") loadMallCategoryOptions();
}

function sitePageHtml() {
    return `
    <div class="card accent-green">
      <div class="card-title">站点设置</div>
      <div class="form-grid">
        <label class="field full">站点名称（左上角显示）
          <input type="text" id="stName" maxlength="50">
        </label>
        <label class="field full">服务器介绍（概览页显示）
          <textarea id="stDesc" rows="3" maxlength="2000" placeholder="例如：生存服 · 欢迎加入"></textarea>
        </label>
        <label class="field">默认进入页面
          <select id="stPage">
            <option value="overview">概览</option>
            <option value="admin">管理</option>
          </select>
        </label>
      </div>
      <div class="site-colors">
        <label class="field-inline">站点背景色 <input type="color" id="stBg"> <button class="btn btn-sm" data-act="site.resetColor" data-key="siteBg">重置</button></label>
        <label class="field-inline">卡片背景色 <input type="color" id="stCard"> <button class="btn btn-sm" data-act="site.resetColor" data-key="cardBg">重置</button></label>
        <label class="field-inline">全局字体颜色 <input type="color" id="stInk"> <button class="btn btn-sm" data-act="site.resetColor" data-key="inkColor">重置</button></label>
      </div>
      <div class="form-grid mt10">
        <label class="field">背景模糊 (px)<input type="number" id="stBlur" min="0" max="50" step="1"></label>
        <label class="field">遮罩透明度 (0-1)<input type="number" id="stMask" min="0" max="1" step="0.05"></label>
      </div>
      <div class="form-grid mt10">
        <label class="field">站点 Logo
          <div class="form-actions">
            <input type="file" id="stLogoFile" accept="image/png,image/jpeg,image/webp,image/gif" style="flex:1">
            <button class="btn btn-sm" data-act="site.uploadLogo">上传Logo</button>
            <button class="btn btn-sm btn-danger" data-act="site.clearLogo">恢复默认</button>
          </div>
          <span class="muted" id="stLogoState">未设置</span>
        </label>
        <label class="field">背景图片
          <div class="form-actions">
            <input type="file" id="stBgFile" accept="image/png,image/jpeg,image/webp,image/gif" style="flex:1">
            <button class="btn btn-sm" data-act="site.uploadBg">选择文件</button>
            <button class="btn btn-sm btn-danger" data-act="site.clearBg">清除背景</button>
          </div>
          <span class="muted" id="stBgState">-- 内置动态背景 --</span>
        </label>
      </div>
      <div class="form-actions mt14">
        <button class="btn btn-primary full-btn" data-act="site.save">保存站点设置</button>
      </div>
    </div>`;
}

function fillSiteForm() {
    const s = state.site || defaultSite();
    const set = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v === undefined || v === null ? "" : v;
    };
    set("stName", s.name);
    set("stDesc", s.description);
    set("stPage", s.defaultPage === "admin" ? "admin" : "overview");
    set("stBg", s.siteBg || "#8ADB67");
    set("stCard", s.cardBg || "#EDFBE3");
    set("stInk", s.inkColor || "#18261C");
    set("stBlur", s.bgBlur || 0);
    set("stMask", s.bgMask || 0);
    const logoState = document.getElementById("stLogoState");
    if (logoState) logoState.textContent = s.logo ? "已设置" : "未设置";
    const bgState = document.getElementById("stBgState");
    if (bgState) bgState.textContent = s.bgImage ? "已设置：" + s.bgImage : "-- 内置动态背景 --";
}

document.addEventListener("input", (event) => {
    const id = event.target && event.target.id;
    if (id === "sbTitleText" || id === "sbRankingTitle") {
        if (typeof updateTitlePreviews === "function") updateTitlePreviews();
        return;
    }
    if (id === "sbTpl") {
        if (window._sbTplTimer) clearTimeout(window._sbTplTimer);
        window._sbTplTimer = setTimeout(() => {
            if (state.route === "admin" && typeof sbxAutoPreview === "function") sbxAutoPreview();
        }, 500);
    }
});

// ---------- 商店页 ----------
function pkgCardHtml(pkg, data) {
    const owned = data.myVip && data.myVip.ok && data.myVip.active && data.myVip.level === pkg.id;
    const f5m = Math.round((pkg.flight5hSeconds || 0) / 60);
    const weekH = Math.round((pkg.flightWeekSeconds || 0) / 360) / 10;
    const buyable = pkg.buyable !== false;
    const buyPrice = Number(pkg.buyPrice !== undefined && pkg.buyPrice !== null ? pkg.buyPrice : pkg.price);
    const reason = String(pkg.reason || "");
    let priceHtml;
    if (!buyable) {
        priceHtml = `<div class="pkg-price">${Number(pkg.price).toLocaleString()}<small> 金币 · ${esc(reason || "不可购买低等级")}</small></div>`;
    } else if (reason === "升级补差价") {
        priceHtml = `<div class="pkg-price">${buyPrice.toLocaleString()}<small> 金币 · 升级补差价（原价 ${Number(pkg.price).toLocaleString()}）</small></div>`;
    } else {
        priceHtml = `<div class="pkg-price">${Number(pkg.price).toLocaleString()}<small> 金币${reason ? " · " + esc(reason) : ""}</small></div>`;
    }
    let buyBtn;
    if (!buyable) {
        buyBtn = `<button class="btn full-btn" disabled>${esc(reason || "不可购买低等级")}</button>`;
    } else if (data.authed) {
        buyBtn = `<button class="btn btn-primary full-btn" data-act="shop.buyVip" data-level="${esc(pkg.id)}">购买</button>`;
    } else {
        buyBtn = `<button class="btn full-btn" data-act="shop.login">登录后购买</button>`;
    }
    return `
    <div class="card pkg-card${owned ? " owned" : ""}">
      ${owned ? '<span class="owned-badge">当前套餐</span>' : ""}
      <div class="pkg-name">${esc(pkg.display)}</div>
      ${priceHtml}
      <div class="pkg-meta">
        有效期 ${pkg.durationDays} 天<br>
        5h池 ${f5m} 分钟 · 周池 ${weekH} 小时<br>
        Home ${pkg.maxHomes > 50 ? "不限" : pkg.maxHomes} · 奖励 x${pkg.dailyRewardMultiplier}
      </div>
      ${buyBtn}
    </div>`;
}

function renderShopView(data) {
    const view = document.getElementById("view");
    if (!view) return;
    const authed = Boolean(data.authed);
    const balance = authed && data.balance !== null && data.balance !== undefined ? Number(data.balance).toLocaleString() : "—";
    let meLine = "登录后查看余额与购买";
    if (authed) {
        meLine = esc(data.name);
        if (data.myVip && data.myVip.ok && data.myVip.active) {
            meLine += " · 当前：" + esc(data.myVip.display || data.myVip.level)
                + (data.myVip.expireAt ? "（至 " + fmtDate(data.myVip.expireAt) + "）" : "（永久）");
        } else {
            meLine += " · 未持有会员";
        }
    }
    const fly = data.fly || {};
    const flyPrice = fly.hourPrice !== undefined && fly.hourPrice !== null
        ? Number(fly.hourPrice).toLocaleString() + " 金币 / " + fmtDuration((Number(fly.purchaseSeconds) || 3600) * 1000)
        : "—";
    const purchased = data.flight && data.flight.ok && data.flight.purchased
        ? fmtDuration((Number(data.flight.purchased.remainingSeconds) || 0) * 1000)
        : "—";
    let vipQuota = "无 VIP";
    if (data.flight && data.flight.ok && data.flight.vip && data.flight.vip.active) {
        const q5 = data.flight.vip.remaining5h;
        const qw = data.flight.vip.remainingWeek;
        vipQuota = (q5 === null || q5 === undefined || qw === null || qw === undefined)
            ? "—（数据未同步）"
            : fmtDuration(Number(q5) * 1000) + " / " + fmtDuration(Number(qw) * 1000);
    }
    const packages = Array.isArray(data.packages) ? data.packages : [];

    // 3 秒轮询会整段重写 innerHTML：重写前抓取用户正在输入的值与焦点，重写后恢复
    const prevCdk = document.getElementById("cdkInput");
    const prevHours = document.getElementById("shopHours");
    const cdkFocused = prevCdk && document.activeElement === prevCdk;
    const hoursFocused = prevHours && document.activeElement === prevHours;
    const cdkValue = prevCdk ? prevCdk.value : "";
    const hoursValue = prevHours ? prevHours.value : "";

    view.innerHTML = `
    <div class="card accent-green shop-balance">
      <div class="card-title">我的钱包</div>
      <div class="stat-value">${balance}<span class="unit">金币</span></div>
      <div class="stat-sub">${meLine}</div>
    </div>

    <div class="card accent-amber">
      <div class="card-title">会员套餐 <span class="plugin-tag">LuckyClover-VIP</span></div>
      <div class="card-desc">金币购买、到期失效；<b>同级续费自动叠加时长</b>。飞行受 5 小时池与自然周池双重限制，任一耗尽自动关飞。</div>
      <div class="grid grid-3 mt10" id="shopPkgs">
        ${packages.length ? packages.map((p) => pkgCardHtml(p, data)).join("") : '<div class="empty">暂无可购买套餐</div>'}
      </div>
      ${data.packagesError ? `<div class="status-off mt10">${esc(data.packagesError)}</div>` : ""}
    </div>

    <div class="card accent-blue">
      <div class="card-title">飞行时长 <span class="plugin-tag">/fly 直购</span></div>
      <div class="card-desc">直购飞行时长，与 VIP 额度<b>独立结算</b>（开飞时两边同时扣）。</div>
      <div class="grid grid-3 mt10">
        <div class="shop-stat"><span class="stat-label">单价</span><div class="big">${flyPrice}</div></div>
        <div class="shop-stat"><span class="stat-label">已购剩余</span><div class="big">${purchased}</div></div>
        <div class="shop-stat"><span class="stat-label">VIP 额度（5h / 周）</span><div class="big">${vipQuota}</div></div>
      </div>
      <div class="preview-row mt10">
        <label class="field" style="flex:1">购买小时数<input type="number" id="shopHours" min="1" max="168" value="1"></label>
        ${authed
            ? '<button class="btn btn-primary" data-act="shop.buyFlight" style="align-self:flex-end">购买飞行时长</button>'
            : '<button class="btn" data-act="shop.login" style="align-self:flex-end">登录后购买</button>'}
      </div>
    </div>

    <div class="card accent-green">
      <div class="card-title">兑换码 <span class="plugin-tag">/vip code</span></div>
      <div class="card-desc">输入兑换码兑换会员套餐或金币；游戏内可用 <b>/vip code &lt;兑换码&gt;</b>。兑换码为 12 位，如 <b>ABCD-EFGH-IJKL</b>（不区分大小写、可省略连字符）。</div>
      <div class="preview-row mt10">
        <label class="field" style="flex:1">兑换码<input type="text" id="cdkInput" placeholder="ABCD-EFGH-IJKL" autocomplete="off" spellcheck="false" style="text-transform:uppercase"></label>
        ${authed
            ? '<button class="btn btn-primary" data-act="cdk.redeem" style="align-self:flex-end">兑换</button>'
            : '<button class="btn" data-act="shop.login" style="align-self:flex-end">登录后兑换</button>'}
      </div>
    </div>`;

    // 恢复输入值与焦点（光标移到末尾）
    const cdkInput = document.getElementById("cdkInput");
    if (cdkInput) {
        if (cdkValue) cdkInput.value = cdkValue;
        if (cdkFocused) {
            cdkInput.focus();
            cdkInput.setSelectionRange(cdkInput.value.length, cdkInput.value.length);
        }
    }
    const hoursInput = document.getElementById("shopHours");
    if (hoursInput) {
        if (hoursValue !== "" && hoursValue !== "1") hoursInput.value = hoursValue;
        if (hoursFocused) {
            hoursInput.focus();
            hoursInput.setSelectionRange(hoursInput.value.length, hoursInput.value.length);
        }
    }
}

async function loadShop() {
    if (state.route !== "shop") return;
    try {
        const data = await api("/api/shop?browserId=" + encodeURIComponent(browserId));
        if (state.route !== "shop") return;
        if (data && data.ok) {
            state.shopFails = 0;
            state.shop = data;
            renderShopView(data);
            return;
        }
        // 后端返回了业务错误（404/500 等）：连续 3 次后展示可见错误，继续轮询重试
        state.shopFails = (state.shopFails || 0) + 1;
        if (state.shopFails >= 3) {
            const view = document.getElementById("view");
            const err = (data && (data.error || data.message)) || "接口异常";
            if (view && state.route === "shop") {
                view.innerHTML = '<div class="card"><div class="empty shop-load-skel" style="color:var(--red)">商店加载失败：'
                    + esc(String(err).slice(0, 120))
                    + '（每 3 秒自动重试；若提示 api not found 请重启服务器）</div></div>';
            }
        }
    } catch (error) {
        console.error("[shop] 商店加载异常:", error);
        // 网络层失败：api() 内部计数提示；进入演示模式后用假数据兜底
        if (state.demo && state.route === "shop") {
            state.shopFails = 0;
            renderShopView({
                ok: true,
                authed: state.auth.authed,
                name: state.auth.name,
                packages: [
                    { id: "plus", display: "VIP Plus", price: 10000, durationDays: 30, flight5hSeconds: 2700, flightWeekSeconds: 28800, maxHomes: 15, dailyRewardMultiplier: 1.8 },
                    { id: "pro_5x", display: "Pro 5x", price: 30000, durationDays: 30, flight5hSeconds: 5400, flightWeekSeconds: 144000, maxHomes: 20, dailyRewardMultiplier: 2 },
                    { id: "pro_20x", display: "Pro 20x", price: 80000, durationDays: 30, flight5hSeconds: 10800, flightWeekSeconds: 604800, maxHomes: 99, dailyRewardMultiplier: 2.5 },
                ],
                fly: { enabled: true, hourPrice: 3000, purchaseSeconds: 3600 },
                balance: 88888,
                myVip: { ok: true, active: false },
                flight: { ok: true, purchased: { remainingSeconds: 7200 }, vip: null },
            });
        }
    }
}

function renderShop(view) {
    view.innerHTML = '<div class="card"><div class="empty shop-load-skel">加载中…</div></div>';
    wireAdminActions(view);
    state.shopFails = 0;
    loadShop();
    if (state.timers.shop) clearInterval(state.timers.shop);
    state.timers.shop = setInterval(() => {
        if (state.route === "shop") loadShop();
    }, 3000);
}



// ---------- boot ----------

// 商城批量：记录当前表格对应的清单，供批量按钮取 scope/xuid
function setMallBatchScope(scope, xuid) {
    state.mallBatch = { scope, xuid: xuid || "" };
    const label = document.getElementById("mallBatchTarget");
    if (label) {
        label.textContent = scope === "official" ? "官方在售"
            : scope === "recycle" ? "回收清单" : "玩家店铺货架";
    }
}

async function loadMallCategoryOptions() {
    const res = await invoke("mall", "mgmtListCategories", []);
    const cats = res && res.ok && Array.isArray(res.categories) && res.categories.length
        ? res.categories.filter((c) => c !== "全部")
        : ["其他"];
    const optionHtml = cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    const add = document.getElementById("mallAddCat");
    if (add) add.innerHTML = optionHtml;
    const list = document.getElementById("mallCatList");
    if (list) list.innerHTML = optionHtml;
}

async function boot() {
    renderUserbox();
    try {
        const status = await api(`/api/auth/status?browserId=${encodeURIComponent(browserId)}`);
        if (status && status.authed) {
            state.auth = { authed: true, name: status.name, role: status.role };
        }
    } catch (error) { /* demo 已开启 */ }
    try {
        const res = await fetch("/api/site");
        const data = await res.json();
        if (data && data.ok && data.site) applySite(data.site);
    } catch (error) {
        try {
            const cached = localStorage.getItem("lcpanel_site");
            if (cached) applySite(JSON.parse(cached));
        } catch (e) { /* ignore */ }
    }
    renderUserbox();
    renderRoute();
}

boot();

// ============================================================
// 概览页
// ============================================================
const ICONS = {
    pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="#2FA346" stroke-width="2"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><circle cx="9" cy="9" r="3.5"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 8a3 3 0 0 1 0 6M18 20c0-2-.7-3.5-2-4.5"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="#2FA346" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
};

function ringHtml(id, color) {
    const r = 40;
    const c = 2 * Math.PI * r;
    return `
    <div class="ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle class="ring-bg" cx="48" cy="48" r="${r}" fill="none" stroke-width="9"/>
        <circle id="${id}" class="ring-fg" cx="48" cy="48" r="${r}" fill="none" stroke="${color}"
                stroke-width="9" stroke-linecap="round"
                stroke-dasharray="0 ${c.toFixed(1)}"/>
      </svg>
      <div class="ring-text" id="${id}Text">—</div>
    </div>`;
}

function setRing(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    const r = 40;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    el.setAttribute("stroke-dasharray", `${((p / 100) * c).toFixed(1)} ${c.toFixed(1)}`);
    const text = document.getElementById(id + "Text");
    if (text) text.textContent = p.toFixed(1) + "%";
}

function overviewHtml() {
    return `
    <div id="demoBanner"></div>

    <div class="card intro-card" id="ovIntro" hidden>
      <div class="card-title">服务器介绍</div>
      <div class="intro-text muted">…</div>
    </div>

    <div class="card checkin-card">
      <div class="card-title">
        <span>📅 每日签到</span>
        <span class="ck-streak" id="ckStreak">连续 0 天</span>
      </div>
      <div id="ckCalendar" class="ck-wrap"><div class="empty">加载中…</div></div>
      <div class="ck-legend"><span class="ck-dot"></span> 已签</div>
      <div class="ck-reward">每日奖励: <b id="ckReward">500</b> 金币</div>
      <button class="ck-btn" id="ckBtn" disabled>加载中…</button>
    </div>

    <div class="grid grid-3">
      <div class="card accent-purple">
        <div class="stat-label">TPS</div>
        <div class="stat-value" id="ovTps">—</div>
        <div class="stat-sub">target 20.00</div>
        <div class="stat-icon">${ICONS.pulse}</div>
      </div>
      <div class="card accent-amber">
        <div class="stat-label">MSPT</div>
        <div class="stat-value" id="ovMspt">—</div>
        <div class="stat-sub">ms / tick</div>
        <div class="stat-icon">${ICONS.clock}</div>
      </div>
      <div class="card accent-blue">
        <div class="stat-label">在线玩家</div>
        <div class="stat-value"><span id="ovOnline">—</span><span class="unit" id="ovMax">/ —</span></div>
        <div class="stat-sub">players</div>
        <div class="stat-icon">${ICONS.users}</div>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="card accent-green">
        <div class="stat-label">实体</div>
        <div class="stat-value" id="ovEntities">—</div>
        <div class="stat-sub">掉落物 <span id="ovDrops">—</span></div>
        <div class="stat-icon">${ICONS.box}</div>
      </div>
      <div class="card accent-green">
        <div class="stat-label">运行时间</div>
        <div class="stat-value" id="ovUptime" style="font-size:24px">—</div>
        <div class="stat-sub"><span class="dot"></span>运行中</div>
        <div class="stat-icon">${ICONS.monitor}</div>
      </div>
      <div class="card accent-amber">
        <div class="stat-label">世界名称</div>
        <div class="stat-value" id="ovWorld" style="font-size:24px">—</div>
        <div class="stat-sub">模式 <span id="ovGm">—</span></div>
        <div class="stat-icon">${ICONS.globe}</div>
      </div>
      <div class="card accent-blue">
        <div class="stat-label">游戏时间</div>
        <div class="stat-value" id="ovDay" style="font-size:24px">—</div>
        <div class="stat-sub">种子 <span id="ovSeed">—</span></div>
        <div class="stat-icon">${ICONS.calendar}</div>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="card ring-card">
        ${ringHtml("ringCpu", "#2FA346")}
        <div class="ring-meta">
          <div class="stat-label">CPU</div>
          <div class="big" id="ovCpuModel">—</div>
        </div>
      </div>
      <div class="card ring-card">
        ${ringHtml("ringMem", "#F59E0B")}
        <div class="ring-meta">
          <div class="stat-label">内存</div>
          <div class="big" id="ovMem">—</div>
        </div>
      </div>
      <div class="card ring-card">
        ${ringHtml("ringDisk", "#8B5CF6")}
        <div class="ring-meta">
          <div class="stat-label">磁盘</div>
          <div class="big" id="ovDisk">—</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-head">
        <span class="card-title">在线玩家</span>
        <span class="count-pill" id="ovPlayerCount">0</span>
      </div>
      <div id="ovPlayers"></div>
    </div>`;
}

function fillOverview(data) {
    const s = data.server || {};
    const sys = data.system || {};

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value === null || value === undefined ? "—" : value;
    };

    setText("ovTps", s.tps === null || s.tps === undefined ? "—" : Number(s.tps).toFixed(2));
    setText("ovMspt", s.mspt === null || s.mspt === undefined ? "—" : Number(s.mspt).toFixed(2));
    setText("ovOnline", s.online === null || s.online === undefined ? "—" : s.online);
    setText("ovMax", "/ " + (s.maxPlayers === null || s.maxPlayers === undefined ? "—" : s.maxPlayers));
    setText("ovEntities", s.entities);
    setText("ovDrops", s.itemDrops);
    setText("ovUptime", fmtUptime(s.uptimeSeconds));
    setText("ovWorld", s.worldName);
    setText("ovGm", s.gamemode);
    setText("ovDay", s.day ? `第${s.day}天 ${s.timeLabel || ""}` : "—");
    setText("ovSeed", s.seed === null || s.seed === undefined ? "—" : s.seed);
    setText("ovCpuModel", (sys.cpu && sys.cpu.model) || "—");
    setText("ovMem", sys.mem ? `${fmtBytes(sys.mem.used)} / ${fmtBytes(sys.mem.total)}` : "—");
    setText("ovDisk", sys.disk ? `${fmtBytes(sys.disk.used)} / ${fmtBytes(sys.disk.total)}` : "—");

    setRing("ringCpu", sys.cpu ? sys.cpu.percent : 0);
    setRing("ringMem", sys.mem ? sys.mem.percent : 0);
    setRing("ringDisk", sys.disk ? sys.disk.percent : 0);

    const players = data.players || [];
    setText("ovPlayerCount", players.length);
    const holder = document.getElementById("ovPlayers");
    if (holder) {
        if (!players.length) {
            holder.innerHTML = '<div class="empty">暂无在线玩家</div>';
        } else {
            holder.innerHTML = tableHtml(players, [
                { key: "name", label: "玩家" },
                { key: "health", label: "生命值", fmt: (v) => (v === null || v === undefined ? "—" : `<span class="hp">${esc(v)}</span>`) },
                { key: "dimension", label: "维度" },
                { key: "gameMode", label: "模式" },
                { key: "ping", label: "延迟", fmt: (v) => esc(v) + " ms" },
                { key: "onlineTime", label: "在线时长" },
            ]);
        }
    }

    const banner = document.getElementById("demoBanner");
    if (banner) {
        banner.innerHTML = state.demo
            ? '<div class="demo-banner">演示模式：以下为示例数据，连接面板服务后自动恢复实时数据。</div>'
            : "";
    }
}

async function loadOverview() {
    try {
        const data = await api("/api/overview");
        if (data && data.ok) {
            state.overview = data;
            if (data.serverName) {
                document.getElementById("serverName").textContent = data.serverName;
                document.getElementById("serverVer").textContent = "v" + (data.version || "1.1.0");
            }
            fillOverview(data);
        }
    } catch (error) {
        fillOverview(MOCK_OVERVIEW);
    }
}

// ---------- 每日签到 ----------
function checkinTodayKey() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

function buildCheckinCalendar(checkedDays) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const today = now.getDate();
    const first = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const heads = ["日", "一", "二", "三", "四", "五", "六"];
    let cells = "";
    for (let i = 0; i < first; i++) {
        cells += '<span class="ck-cell empty"></span>';
    }
    for (let d = 1; d <= total; d++) {
        const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        const isToday = d === today;
        const checked = Boolean(checkedDays && checkedDays[key]);
        cells += '<span class="ck-cell' + (isToday ? " today" : "") + (checked ? " checked" : "") + '">' + d + "</span>";
    }
    return (
        '<div class="ck-head">' + heads.map((h) => "<span>" + h + "</span>").join("") + "</div>" +
        '<div class="ck-grid">' + cells + "</div>"
    );
}

function renderCheckin(data) {
    const streakEl = document.getElementById("ckStreak");
    const cal = document.getElementById("ckCalendar");
    const rewardEl = document.getElementById("ckReward");
    const btn = document.getElementById("ckBtn");
    if (!cal) return;
    if (streakEl) streakEl.textContent = "连续 " + (data.streak || 0) + " 天";
    if (rewardEl) rewardEl.textContent = data.reward || 500;
    cal.innerHTML = buildCheckinCalendar(data.days || {});
    if (!btn) return;
    if (!data.authed) {
        btn.textContent = "登录后签到";
        btn.disabled = false;
        btn.dataset.mode = "login";
    } else if (data.today || data.already) {
        btn.textContent = "今日已签到";
        btn.disabled = true;
        btn.dataset.mode = "";
    } else {
        btn.textContent = "签到";
        btn.disabled = false;
        btn.dataset.mode = "sign";
    }
}

async function loadCheckin() {
    if (!document.getElementById("ckBtn")) return;
    if (state.demo) {
        let local = { days: {}, streak: 0, last: "" };
        try {
            const raw = localStorage.getItem("lcpanel_checkin");
            if (raw) local = Object.assign(local, JSON.parse(raw));
        } catch (e) { /* ignore */ }
        renderCheckin({
            ok: true,
            authed: true,
            name: "演示",
            today: local.last === checkinTodayKey(),
            streak: local.streak || 0,
            days: local.days || {},
            reward: 500,
        });
        return;
    }
    try {
        const res = await api("/api/checkin?browserId=" + encodeURIComponent(browserId));
        if (res && res.ok) renderCheckin(res);
    } catch (error) { /* 已有网络提示 */ }
}

async function doCheckin() {
    const btn = document.getElementById("ckBtn");
    if (!btn) return;
    if (state.demo) {
        let local = { days: {}, streak: 0, last: "" };
        try {
            const raw = localStorage.getItem("lcpanel_checkin");
            if (raw) local = Object.assign(local, JSON.parse(raw));
        } catch (e) { /* ignore */ }
        const today = checkinTodayKey();
        if (local.last !== today) {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yKey = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
            local.streak = local.last === yKey ? (local.streak || 0) + 1 : 1;
            local.last = today;
            local.days[today] = true;
            try { localStorage.setItem("lcpanel_checkin", JSON.stringify(local)); } catch (e) { /* ignore */ }
        }
        toast("演示模式：已签到（本地记录）", "ok");
        loadCheckin();
        return;
    }
    btn.disabled = true;
    btn.textContent = "签到中…";
    try {
        const res = await api("/api/checkin", {
            method: "POST",
            body: JSON.stringify({ browserId }),
        });
        if (res && res.ok) {
            if (res.granted) {
                toast("签到成功，+" + res.reward + " 金币", "ok");
            } else if (res.already) {
                toast("今天已经签到过了", "ok");
            } else {
                toast("签到成功" + (res.note ? "（" + res.note + "）" : ""), "ok");
            }
            renderCheckin(res);
        } else {
            toast((res && res.error) || "签到失败", "err");
            renderCheckin(Object.assign({}, res, { authed: state.auth.authed }));
            loadCheckin();
        }
    } catch (error) {
        loadCheckin();
    }
}

function renderOverview(view) {
    view.innerHTML = overviewHtml();
    if (state.site) applySite(state.site);
    const ckBtn = document.getElementById("ckBtn");
    if (ckBtn) {
        ckBtn.addEventListener("click", () => {
            if (ckBtn.dataset.mode === "login") {
                location.hash = "#/admin";
                toast("请先在管理页登录", "ok");
                return;
            }
            if (ckBtn.dataset.mode === "sign") doCheckin();
        });
    }
    loadCheckin();
    loadOverview();
    state.timers.overview = setInterval(() => {
        if (state.route === "overview") loadOverview();
    }, 3000);
}

// ============================================================
// 管理页
// ============================================================
function loginCardHtml() {
    return `
    <div class="card auth-card">
      <div class="card-title" style="justify-content:center">🔐 面板登录</div>
      <p class="hint">
        账号为 <b>游戏玩家名</b>。任何玩家都可注册：进游戏执行<br>
        <kbd>/panel passwd 你的密码</kbd>（至少 6 位）<br>
        <b>OP</b> 注册 → 管理员（可管理面板）；普通玩家 → 观察者（概览 + 签到）。
      </p>
      <div class="form-grid" style="max-width:420px;margin:16px auto 0">
        <label class="field">账号（玩家名）
          <input type="text" id="loginUser" autocomplete="username" placeholder="Steve">
        </label>
        <label class="field">密码
          <input type="password" id="loginPass" autocomplete="current-password" placeholder="至少 6 位">
        </label>
      </div>
      <div class="form-actions" style="justify-content:center;margin-top:16px">
        <button class="btn btn-primary" data-act="auth.login">登 录</button>
      </div>
      <div class="auth-state" id="loginState"></div>
    </div>`;
}

function adminSectionsHtml() {
    return `
    <div class="section-grid">

      <!-- 服务器核心 -->
      <div class="card span-2 accent-green" data-plugin="core">
        <div class="plugin-head"><span class="card-title">服务器核心</span><span class="plugin-tag">LuckyCloverCore</span>
          <span class="chips"><button class="chip" data-act="core.status">状态</button></span></div>
        <div class="status-line" id="coreStatus">加载中…</div>
        <div class="form-grid">
          <label class="field full">配置（JSON）
            <textarea id="coreCfg" class="code" rows="7" spellcheck="false"></textarea>
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn-sm" data-act="core.cfgLoad">读取配置</button>
          <button class="btn btn-primary btn-sm" data-act="core.cfgSave">保存配置</button>
        </div>

        <div class="form-grid mt14">
          <label class="field">每日任务 · 玩家名（可空）
            <input type="text" id="coreTasksName" placeholder="留空只看任务定义">
          </label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="core.tasks">查询任务</button>
          </div>
        </div>
        <div id="coreTasksOut"></div>

        <div class="form-actions mt14">
          <button class="btn btn-sm" data-act="core.mutes">禁言列表</button>
          <button class="btn btn-sm" data-act="core.regions">主城区域</button>
        </div>
        <div id="coreMutesOut"></div>
        <div id="coreRegionsOut"></div>

        <div class="form-grid mt14">
          <label class="field">在线时长排行 · 数量
            <input type="number" id="coreTopCount" value="10" min="1" max="50">
          </label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="core.top">查询排行</button>
          </div>
        </div>
        <div id="coreTopOut"></div>
      </div>

      <!-- VIP -->
      <div class="card accent-amber" data-plugin="vip">
        <div class="plugin-head"><span class="card-title">头衔 · VIP · 飞行</span><span class="plugin-tag">LuckyCloverVIP</span>
          <span class="chips"><button class="chip" data-act="vip.status">状态</button>
          <button class="chip" data-act="vip.list">VIP 列表</button></span></div>
        <div class="status-line" id="vipStatus">加载中…</div>
        <div id="vipListOut"></div>

        <div class="form-grid mt14">
          <label class="field">玩家名<input type="text" id="vipSetName"></label>
          <label class="field">套餐等级
            <select id="vipSetLevel"><option value="" disabled selected>加载套餐中…</option></select>
          </label>
          <label class="field">天数（0=永久）<input type="number" id="vipSetDays" value="0" min="0"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-primary btn-sm" data-act="vip.set">设置 VIP</button>
            <button class="btn btn-danger btn-sm" data-act="vip.remove">移除</button>
          </div>
        </div>

        <div class="form-grid mt14">
          <label class="field">玩家名<input type="text" id="vipTitleName"></label>
          <label class="field">头衔<input type="text" id="vipTitleText" placeholder="勇者"></label>
          <div class="form-actions full">
            <button class="btn btn-sm" data-act="vip.title">设置头衔</button>
            <button class="btn btn-danger btn-sm" data-act="vip.titleClear">清除头衔</button>
          </div>
        </div>

        <div class="form-grid mt14">
          <label class="field">玩家名<input type="text" id="vipNameName"></label>
          <label class="field">显示名字<input type="text" id="vipNameText" placeholder="&a名字"></label>
          <div class="form-actions full">
            <button class="btn btn-sm" data-act="vip.dname">设置显示名</button>
            <button class="btn btn-danger btn-sm" data-act="vip.dnameClear">清除显示名</button>
          </div>
        </div>

        <div class="form-grid mt14">
          <label class="field">飞行查询 · 玩家名<input type="text" id="vipFlightName"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="vip.flight">查询</button>
          </div>
        </div>
        <div id="vipFlightOut"></div>

        <div class="card-title mt14" style="font-size:14px">兑换码管理</div>
        <div class="card-desc">生成的兑换码供玩家在商店页或游戏内 <b>/vip code</b> 兑换；奖励由 LuckyClover-VIP 发放。</div>
        <div class="form-grid mt10">
          <label class="field">奖励类型
            <select id="cdkType">
              <option value="vip">会员套餐</option>
              <option value="coins">金币</option>
            </select>
          </label>
          <label class="field cdk-vip-only">套餐
            <select id="cdkLevel"><option value="" disabled selected>加载套餐中…</option></select>
          </label>
          <label class="field cdk-vip-only">天数（0=永久）<input type="number" id="cdkDays" value="30" min="0"></label>
          <label class="field cdk-coins-only" hidden>金币数量<input type="number" id="cdkAmount" value="5000" min="1"></label>
          <label class="field">生成数量<input type="number" id="cdkCount" value="1" min="1" max="100"></label>
          <label class="field">有效期（小时，0=不过期）<input type="number" id="cdkExpires" value="0" min="0"></label>
          <label class="field">批次备注（可选）<input type="text" id="cdkBatch" placeholder="如：开服活动"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-primary btn-sm" data-act="cdk.generate">生成兑换码</button>
          </div>
        </div>
        <div id="cdkGenOut"></div>

        <div class="form-actions mt10">
          <button class="btn btn-sm" data-act="cdk.list" data-filter="all">全部</button>
          <button class="btn btn-sm" data-act="cdk.list" data-filter="unused">未使用</button>
          <button class="btn btn-sm" data-act="cdk.list" data-filter="used">已使用</button>
        </div>
        <div id="cdkListOut"></div>
      </div>

      <!-- TPA -->
      <div class="card accent-blue" data-plugin="tpa">
        <div class="plugin-head"><span class="card-title">传送系统</span><span class="plugin-tag">LuckyCloverTPA</span>
          <span class="chips"><button class="chip" data-act="tpa.status">状态</button>
          <button class="chip" data-act="tpa.warps">Warp</button>
          <button class="chip" data-act="tpa.pending">请求</button></span></div>
        <div class="status-line" id="tpaStatus">加载中…</div>
        <div id="tpaWarpsOut" class="mt10"></div>
        <div id="tpaPendingOut"></div>

        <div class="form-grid mt14">
          <label class="field">玩家名 / 键<input type="text" id="tpaHomesName"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="tpa.homes">查 Home</button>
            <button class="btn btn-danger btn-sm" data-act="tpa.homesClear">清空</button>
          </div>
        </div>
        <div id="tpaHomesOut"></div>
      </div>

      <!-- Seat -->
      <div class="card accent-purple" data-plugin="seat">
        <div class="plugin-head"><span class="card-title">椅子功能</span><span class="plugin-tag">LuckyCloverSeat</span>
          <span class="chips"><button class="chip" data-act="seat.status">状态</button></span></div>
        <div class="status-line" id="seatStatus">加载中…</div>
        <div class="toggle-row">
          <span>默认允许坐下</span>
          <label class="switch"><input type="checkbox" id="seatDefChk" data-act="seat.setdef"><span class="slider"></span></label>
        </div>
        <div class="form-actions mt14">
          <button class="btn btn-danger btn-sm" data-act="seat.cleanup">清理全部座位实体</button>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="span-2" data-plugin="sidebar">
        <div class="plugin-head"><span class="card-title">侧边栏管理</span><span class="plugin-tag">LuckyCloverSidebar</span>
          <span class="chips">
            <button class="chip" data-act="sbx.status">状态</button>
            <button class="chip" data-act="sbx.metrics">指标</button>
            <button class="chip" data-act="sbx.page" data-page="main">切到主页</button>
            <button class="chip" data-act="sbx.page" data-page="ranking">切到排行页</button>
          </span></div>
        <div class="status-line" id="sbxStatus">加载中…</div>

        <div class="grid grid-2 mt10">
          <div class="card accent-green">
            <div class="card-title">基本设置</div>
            <label class="chk-inline mt10"><input type="checkbox" id="sbEnabled"> 侧边栏已启用</label>
            <div class="form-grid">
              <label class="field">刷新间隔 (ms)<input type="number" id="sbRefreshMs" min="250" step="100"></label>
              <label class="field">轮播间隔 (ms)<input type="number" id="sbCycleMs" min="5000" step="1000"></label>
              <div class="form-actions full"><label class="chk-inline"><input type="checkbox" id="sbCycle"> 主页⇄排行页轮播</label></div>
            </div>
            <div class="toggle-row">
              <span>默认显示侧边栏<br><small class="muted">新玩家进入时默认显示；已用 /sidebar on|off 的玩家保持各自偏好</small></span>
              <label class="switch"><input type="checkbox" id="sbDefaultShow"><span class="slider"></span></label>
            </div>
            <div class="form-actions" style="margin-top:12px">
              <button class="btn btn-primary full-btn" data-act="sbx.basicSave">保存设置</button>
            </div>
          </div>

          <div class="card accent-blue">
            <div class="card-title">实时预览</div>
            <label class="field">模板文本（可空）
              <input type="text" id="sbTpl" placeholder="输入模板文本，如 §btps:{tps}，留空预览完整配置">
            </label>
            <div class="preview-row mt10">
              <label class="field" style="flex:1">玩家名（可空）<input type="text" id="sbPrevPlayer" placeholder="留空取首个在线玩家"></label>
              <button class="btn btn-primary" data-act="sbx.preview" style="align-self:flex-end">预览</button>
            </div>
            <div class="sb-preview mt10" id="sbPrevBox"><div class="sb-prev-hint">加载配置后自动预览</div></div>
            <div class="legend mt10">
              <span class="legend-t">占位符：</span>
              <kbd>{tps}</kbd><kbd>{mspt}</kbd><kbd>{serverName}</kbd><kbd>{onlinePlayers}</kbd><kbd>{playerName}</kbd><kbd>{sidebarTitle}</kbd><kbd>{money}</kbd><kbd>{time}</kbd><kbd>{ping}</kbd><kbd>{dailyTaskProgress}</kbd><kbd>{onlineTime}</kbd><kbd>{topOnline1}</kbd>
            </div>
          </div>

          <div class="card accent-amber">
            <div class="card-title">标题组成</div>
            <div class="card-desc">侧边栏顶部标题与排行页标题，支持 <kbd>§</kbd> 颜色代码，输入即时预览。</div>
            <label class="field mt10">主页标题<input type="text" id="sbTitleText" placeholder="§aLuckyClover"></label>
            <div class="sb-preview slim" id="sbTitlePrev"></div>
            <label class="field mt10">排行页标题<input type="text" id="sbRankingTitle" placeholder="§6=== 在线时长排行 ==="></label>
            <div class="sb-preview slim" id="sbRankPrev"></div>
            <div class="form-actions" style="margin-top:12px">
              <button class="btn btn-primary full-btn" data-act="sbx.titleSave">保存标题</button>
            </div>
          </div>

          <div class="card accent-purple">
            <div class="card-title">内容行模板（支持轮播）
              <span class="chips">
                <button class="chip" data-act="sbx.rowAdd">＋静态</button>
                <button class="chip" data-act="sbx.rowAddRotate">＋轮播</button>
              </span>
            </div>
            <div class="card-desc">每行可用 <kbd>{占位符}</kbd> 插入动态数据；轮播行多帧按间隔循环，↑↓ 调顺序，改完点保存。排行榜内容固定，由「基本设置」的轮播开关控制。</div>
            <div class="rows-list mt10" id="sbxRowsList"><div class="empty">加载中…</div></div>
            <div class="form-actions" style="margin-top:12px">
              <button class="btn btn-primary full-btn" data-act="sbx.rowsSave">保存行模板</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ShoppingMall -->
      <div class="card span-2 accent-amber" data-plugin="mall">
        <div class="plugin-head"><span class="card-title">商城</span><span class="plugin-tag">LuckyCloverShoppingMall</span>
          <span class="chips">
            <button class="chip" data-act="mall.status">状态</button>
            <button class="chip" data-act="mall.overview">概览</button>
            <button class="chip" data-act="mall.shops">玩家店铺</button>
            <button class="chip" data-act="mall.official">官方在售</button>
            <button class="chip" data-act="mall.recycle">回收清单</button>
            <button class="chip" data-act="mall.logs">交易日志</button>
            <button class="chip" data-act="mall.ranking">排行榜</button>
            <button class="chip" data-act="mall.tax">税收</button>
            <button class="chip" data-act="mall.requests">求购</button>
            <button class="chip" data-act="mall.warehouse">仓库</button>
          </span></div>
        <div class="status-line" id="mallStatus">加载中…</div>
        <div id="mallOverviewOut"></div>
        <div id="mallShopsOut"></div>
        <div id="mallOfficialOut"></div>
        <div id="mallRecycleOut"></div>
        <div id="mallLogsOut"></div>
        <div id="mallRankingOut"></div>
        <div id="mallTaxOut"></div>
        <div id="mallShopOut"></div>
        <div id="mallForbidOut"></div>
        <div id="mallRequestsOut"></div>
        <div id="mallWarehouseOut"></div>
        <div id="mallWarehouseDetailOut"></div>

        <div class="card-title mt14" style="font-size:14px">官方商店 · 上架</div>
        <div class="card-desc">物品类型必须是完整 ID（如 <code>minecraft:diamond</code>）；上架后可在「官方在售」里改价、改库存、下架。</div>
        <div class="form-grid mt10">
          <label class="field">物品类型<input id="mallAddType" placeholder="minecraft:diamond"></label>
          <label class="field">单价<input type="number" id="mallAddPrice" value="100" min="1"></label>
          <label class="field">库存（-1=无限）<input type="number" id="mallAddQty" value="-1"></label>
          <label class="field">分类<select id="mallAddCat"><option>其他</option></select></label>
          <label class="field">改价用新单价<input type="number" id="mallNewPrice" min="1" placeholder="点行内“改价”时读取"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-primary btn-sm" data-act="mall.addOfficial">上架出售</button>
            <button class="btn btn-sm" data-act="mall.addRecycle">加入回收</button>
          </div>
        </div>

        <div class="card-title mt14" style="font-size:14px">批量操作</div>
        <div class="card-desc">先在「官方在售 / 回收清单 / 玩家店铺货架」表格里勾选条目（勾选状态会记住当前清单），再点下面的按钮；作用目标：
          <b id="mallBatchTarget">官方在售</b></div>
        <div class="form-grid mt10">
          <label class="field">改价方式<select id="mallBatchMode"><option value="percent">按百分比 ±%</option><option value="price">统一固定价</option></select></label>
          <label class="field">数值<input type="number" id="mallBatchValue" placeholder="如 10 或 500"></label>
          <label class="field">折扣（折）<input type="number" id="mallBatchRate" step="0.5" min="1" max="9.9" value="7"></label>
          <label class="field">时长（分钟）<input type="number" id="mallBatchMinutes" value="60" min="1"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-primary btn-sm" data-act="mall.batchPrice">批量改价</button>
            <button class="btn btn-sm" data-act="mall.batchDiscount">批量打折</button>
            <button class="btn btn-danger btn-sm" data-act="mall.batchRemove">批量下架</button>
          </div>
        </div>

        <div class="card-title mt14" style="font-size:14px">分类管理</div>
        <div class="form-grid">
          <label class="field">分类名<input id="mallCatName" placeholder="如：建材"></label>
          <label class="field">当前分类<select id="mallCatList"><option>加载中…</option></select></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="mall.cats">刷新</button>
            <button class="btn btn-primary btn-sm" data-act="mall.addCat">新增</button>
            <button class="btn btn-danger btn-sm" data-act="mall.delCat">删除所选</button>
          </div>
        </div>

        <div class="card-title mt14" style="font-size:14px">禁售物品（不可上架）</div>
        <div class="form-grid">
          <label class="field">物品类型<input id="mallForbidType" placeholder="minecraft:bedrock"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="mall.forbiddenGet">查看</button>
            <button class="btn btn-primary btn-sm" data-act="mall.forbiddenAdd">添加</button>
            <button class="btn btn-danger btn-sm" data-act="mall.forbiddenDel">移除</button>
          </div>
        </div>

        <div class="card-title mt14" style="font-size:14px">玩家店铺操作</div>
        <div class="form-grid">
          <label class="field">店铺 XUID<input id="mallShopXuid" placeholder="从“玩家店铺”表格点查看自动填入"></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-sm" data-act="mall.shopGet">查看货架</button>
            <button class="btn btn-sm" data-act="mall.shopSet" data-open="1">强制开业</button>
            <button class="btn btn-sm" data-act="mall.shopSet" data-open="0">强制打烊</button>
            <button class="btn btn-danger btn-sm" data-act="mall.shopDelete">删除店铺</button>
          </div>
        </div>

        <div class="card-title mt14" style="font-size:14px">税收设置</div>
        <div class="form-grid">
          <label class="chk-inline"><input type="checkbox" id="mallTaxEnabled"> 启用交易税</label>
          <label class="field">税率（0~0.5）<input type="number" id="mallTaxRate" step="0.01" min="0" max="0.5"></label>
          <label class="field">范围<select id="mallTaxScope"><option value="player">玩家店铺</option><option value="official">官方商店</option><option value="all">全部交易</option></select></label>
          <div class="form-actions" style="align-self:end">
            <button class="btn btn-primary btn-sm" data-act="mall.taxSave">保存税收</button>
          </div>
        </div>

        <div class="card-title mt14" style="font-size:14px">商城配置（JSON）</div>
        <label class="field full">配置
          <textarea id="mallCfg" class="code" rows="7" spellcheck="false"></textarea>
        </label>
        <div class="form-actions">
          <button class="btn btn-sm" data-act="mall.cfgLoad">读取配置</button>
          <button class="btn btn-primary btn-sm" data-act="mall.cfgSave">保存配置</button>
        </div>
      </div>
    </div>`;
}

function showOut(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function showJsonOut(id, result) {
    const el = document.getElementById(id);
    if (!el) return;
    if (result && result.ok) {
        el.innerHTML = `<pre class="code">${esc(JSON.stringify(result, null, 2))}</pre>`;
    } else {
        el.innerHTML = `<pre class="code" style="color:var(--red)">${esc((result && result.error) || "操作失败")}</pre>`;
    }
}

const STATUS_LABELS = {
    version: "版本", chatFormatMode: "聊天模式", dailyTaskLoop: "任务循环",
    onlineTimeLoop: "时长循环", muteCount: "禁言数", onlinePlayers: "在线",
    vipApi: "VIP API", tpaApi: "TPA API", coreConnected: "Core API",
    vipConnected: "VIP API", enabled: "启用", flyEnabled: "飞行",
    flightLoop: "飞行循环", loop: "循环", sessions: "在坐人数",
    entityId: "座位实体", defaultEnabled: "默认坐下", page: "当前页",
    cycleEnabled: "轮播", tps: "TPS", mspt: "MSPT",
    pendingRequests: "挂起请求", homeOwners: "Home 主", warpCount: "Warp 数",
    requestTimeoutSeconds: "TPA 超时", maxHomes: "Home 上限", demo: "演示",
};

function statusChips(obj) {
    const chips = ['<span class="chip-ok"><span class="dot"></span>在线</span>'];
    for (const key of Object.keys(obj)) {
        if (key === "ok") continue;
        const value = obj[key];
        if (value === null || value === undefined || typeof value === "object") continue;
        const label = STATUS_LABELS[key] || key;
        let text;
        if (typeof value === "boolean") {
            text = value ? "✓" : "✗";
        } else {
            text = String(value);
        }
        chips.push(`<span class="kv"><b>${esc(label)}</b>${esc(text)}</span>`);
    }
    return `<div class="chip-row">${chips.join("")}</div>`;
}

async function refreshStatus(tag, plugin, elementId) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = "加载中…";
    const res = await invoke(plugin, "mgmtStatus", []);
    if (el) {
        el.innerHTML = res && res.ok
            ? statusChips(res)
            : `<span class="status-off">不可用：${esc((res && res.error) || "未知错误")}</span>`;
    }
}

// ---------- 管理动作 ----------
async function handleAdminAction(act, el) {
    const val = (id) => {
        const node = document.getElementById(id);
        return node ? node.value.trim() : "";
    };
    if (act === "shop.login") {
        location.hash = "#/admin";
        toast("请先在管理页登录", "ok");
        return;
    }

    if (act === "shop.buyVip") {
        if (!state.auth.authed) { location.hash = "#/admin"; toast("请先登录", "err"); return; }
        const level = el.getAttribute("data-level");
        const pkgs = (state.shop && state.shop.packages) || [];
        const pkg = pkgs.find((x) => x.id === level);
        if (!pkg) { toast("套餐不存在", "err"); return; }
        if (pkg.buyable === false) { toast(pkg.reason || "不可购买低等级", "err"); return; }
        const pay = Number(pkg.buyPrice !== undefined && pkg.buyPrice !== null ? pkg.buyPrice : pkg.price);
        const reasonTag = pkg.reason ? "（" + pkg.reason + "）" : "";
        if (!confirm("确认花费 " + pay + " 金币购买 " + pkg.display + "（" + pkg.durationDays + " 天）" + reasonTag + "？")) return;
        api("/api/shop/buy-vip", { method: "POST", body: JSON.stringify({ browserId, level }) }).then((res) => {
            if (res && res.ok) {
                const up = res.upgradeFrom ? "（" + res.upgradeFrom + " 升级补差价）" : "";
                toast("购买成功：" + res.display + up + "，消耗 " + res.paid + " 金币", "ok");
            } else {
                toast((res && res.error) || "购买失败", "err");
            }
            loadShop();
        }).catch(() => {});
        return;
    }

    if (act === "shop.buyFlight") {
        if (!state.auth.authed) { location.hash = "#/admin"; toast("请先登录", "err"); return; }
        const hoursInput = document.getElementById("shopHours");
        const hours = Math.max(1, Math.min(168, Number(hoursInput ? hoursInput.value : 1) || 1));
        if (!confirm("确认购买 " + hours + " 小时飞行时长？")) return;
        api("/api/shop/buy-flight", { method: "POST", body: JSON.stringify({ browserId, hours }) }).then((res) => {
            if (res && res.ok) {
                toast("购买成功：+" + fmtDuration(res.seconds * 1000) + " 飞行时长，消耗 " + res.paid + " 金币", "ok");
            } else {
                toast((res && res.error) || "购买失败", "err");
            }
            loadShop();
        }).catch(() => {});
        return;
    }

    if (act === "cdk.redeem") {
        if (!state.auth.authed) { location.hash = "#/admin"; toast("请先登录", "err"); return; }
        const input = document.getElementById("cdkInput");
        const code = input ? input.value.trim() : "";
        if (!code) { toast("请输入兑换码", "err"); return; }
        api("/api/cdk/redeem", { method: "POST", body: JSON.stringify({ browserId, code }) }).then((res) => {
            if (res && res.ok) {
                toast("兑换成功：" + (res.desc || "已到账"), "ok");
                if (input) input.value = "";
            } else {
                toast((res && res.error) || "兑换失败", "err");
            }
            loadShop();
        }).catch(() => {});
        return;
    }

    if (act === "cdk.generate") {
        const type = val("cdkType") === "coins" ? "coins" : "vip";
        const payload = {
            type,
            count: Math.max(1, Math.min(100, Number(val("cdkCount")) || 1)),
            batch: val("cdkBatch"),
            expiresHours: Math.max(0, Number(val("cdkExpires")) || 0),
        };
        if (type === "vip") {
            payload.level = val("cdkLevel") || val("vipSetLevel");
            payload.days = Math.max(0, Number(val("cdkDays")) || 0);
            if (!payload.level) { toast("请选择套餐", "err"); return; }
        } else {
            payload.amount = Math.max(1, Number(val("cdkAmount")) || 0);
            if (payload.amount < 1) { toast("请输入金币数量", "err"); return; }
        }
        const res = await invoke("vip", "mgmtGenerateCdk", [JSON.stringify(payload)]);
        if (res && res.ok && Array.isArray(res.codes)) {
            showOut("cdkGenOut", `
              <div class="card-desc mt10">已生成 ${res.codes.length} 个兑换码（${esc(res.desc || "")}）${res.batch ? "，批次：" + esc(res.batch) : ""}。点击"复制"可整体复制：</div>
              <textarea id="cdkGenList" readonly style="width:100%;min-height:${Math.min(240, 30 + res.codes.length * 22)}px;margin-top:8px;font-family:monospace">${esc(res.codes.join("\n"))}</textarea>
              <div class="form-actions mt10"><button class="btn btn-sm" data-act="cdk.copyGen">复制全部</button></div>`);
            toast("已生成 " + res.codes.length + " 个兑换码", "ok");
        } else {
            showJsonOut("cdkGenOut", res);
            toast((res && res.error) || "生成失败", "err");
        }
        return;
    }

    if (act === "cdk.copyGen") {
        const box = document.getElementById("cdkGenList");
        if (!box) return;
        box.select();
        try {
            document.execCommand("copy");
            toast("已复制到剪贴板", "ok");
        } catch (error) {
            toast("复制失败，请手动选择复制", "err");
        }
        return;
    }

    if (act === "cdk.list") {
        const filter = (el && el.getAttribute("data-filter")) || "all";
        const res = await invoke("vip", "mgmtListCdk", [JSON.stringify({ filter })]);
        if (res && res.ok && Array.isArray(res.items)) {
            if (!res.items.length) {
                showOut("cdkListOut", '<div class="empty mt10">暂无兑换码</div>');
            } else {
                showOut("cdkListOut", tableHtml(res.items, [
                    { key: "code", label: "兑换码" },
                    { key: "desc", label: "奖励" },
                    { key: "batch", label: "批次" },
                    { key: "createdAt", label: "生成时间", fmt: (v) => esc(v ? fmtDate(v) : "—") },
                    { key: "expiresAt", label: "有效期至", fmt: (v) => esc(v ? fmtDate(v) : "不过期") },
                    {
                        key: "usedBy",
                        label: "状态",
                        fmt: (v, row) => v
                            ? `已用（${esc(v)}${row.usedAt ? " · " + esc(fmtDate(row.usedAt)) : ""}）`
                            : '<span style="color:var(--green)">未使用</span>',
                    },
                ]));
            }
        } else {
            showJsonOut("cdkListOut", res);
        }
        return;
    }

    if (act === "site.save") {
        const payload = {
            site: {
                name: val("stName") || "LC生存服",
                description: (document.getElementById("stDesc") || {}).value || "",
                defaultPage: val("stPage") === "admin" ? "admin" : "overview",
                siteBg: val("stBg"),
                cardBg: val("stCard"),
                inkColor: val("stInk"),
                bgBlur: Number(val("stBlur")) || 0,
                bgMask: Number(val("stMask")) || 0,
            },
        };
        if (state.demo) {
            applySite(payload.site);
            try { localStorage.setItem("lcpanel_site", JSON.stringify(payload.site)); } catch (e) { /* ignore */ }
            toast("演示模式：站点设置已保存到本地", "ok");
            return;
        }
        api("/api/site", { method: "POST", body: JSON.stringify(payload) }).then((res) => {
            if (res && res.ok) {
                applySite(res.site);
                toast("站点设置已保存", "ok");
                fillSiteForm();
            } else {
                toast((res && res.error) || "保存失败", "err");
            }
        }).catch(() => {});
        return;
    }

    if (act === "site.uploadLogo" || act === "site.uploadBg") {
        const isLogo = act === "site.uploadLogo";
        const input = document.getElementById(isLogo ? "stLogoFile" : "stBgFile");
        const file = input && input.files && input.files[0];
        if (!file) { toast("请先选择图片文件", "err"); return; }
        if (file.size > 3 * 1024 * 1024) { toast("图片不能超过 3MB", "err"); return; }
        const reader = new FileReader();
        reader.onload = () => {
            if (state.demo) {
                const site = Object.assign(defaultSite(), state.site || {});
                if (isLogo) site.logo = reader.result; else site.bgImage = reader.result;
                applySite(site);
                toast("演示模式：仅本地预览", "ok");
                return;
            }
            api("/api/site/asset", {
                method: "POST",
                body: JSON.stringify({ kind: isLogo ? "logo" : "background", dataUrl: reader.result }),
            }).then((res) => {
                if (res && res.ok) {
                    applySite(res.site);
                    fillSiteForm();
                    toast(isLogo ? "Logo 已更新" : "背景已更新", "ok");
                } else {
                    toast((res && res.error) || "上传失败", "err");
                }
            }).catch(() => {});
        };
        reader.readAsDataURL(file);
        return;
    }

    if (act === "site.clearLogo" || act === "site.clearBg") {
        const kind = act === "site.clearLogo" ? "logo" : "background";
        if (state.demo) {
            const site = Object.assign(defaultSite(), state.site || {});
            if (kind === "logo") site.logo = ""; else site.bgImage = "";
            applySite(site);
            toast("演示模式：已清除", "ok");
            return;
        }
        api("/api/site/asset", { method: "POST", body: JSON.stringify({ kind, action: "clear" }) }).then((res) => {
            if (res && res.ok) {
                applySite(res.site);
                fillSiteForm();
                toast("已清除", "ok");
            } else {
                toast((res && res.error) || "清除失败", "err");
            }
        }).catch(() => {});
        return;
    }

    if (act === "site.resetColor") {
        const key = el.getAttribute("data-key");
        const map = { siteBg: "stBg", cardBg: "stCard", inkColor: "stInk" };
        const defaults = { siteBg: "#8ADB67", cardBg: "#EDFBE3", inkColor: "#18261C" };
        const input = document.getElementById(map[key]);
        if (input) {
            input.value = defaults[key];
            toast("已重置为默认色，记得点保存", "ok");
        }
        return;
    }


    if (act === "auth.login") {
        const username = val("loginUser");
        const password = val("loginPass");
        if (!username || !password) {
            toast("请输入账号和密码", "err");
            return;
        }
        const stateEl = document.getElementById("loginState");
        const setState = (text, cls, color) => {
            if (stateEl) {
                stateEl.textContent = text;
                stateEl.className = cls || "auth-state";
                stateEl.style.color = color || "";
            }
        };
        setState("登录中…", "auth-state wait");
        if (state.demo) {
            state.auth = { authed: true, name: username, role: "admin" };
            renderUserbox();
            toast("演示模式：已登录", "ok");
            renderAdmin(document.getElementById("view"));
            return;
        }
        api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password, browserId }),
        }).then((res) => {
            if (res && res.ok) {
                state.auth = { authed: true, name: res.name, role: res.role || "admin" };
                renderUserbox();
                toast(`欢迎回来，${res.name}`, "ok");
                renderAdmin(document.getElementById("view"));
            } else {
                const msg = (res && res.error) || "登录失败";
                setState(msg, "auth-state", "var(--red)");
                toast(msg, "err");
            }
        }).catch(() => {
            // api 失败已自动切演示模式：本地完成登录
            state.auth = { authed: true, name: username, role: "admin" };
            renderUserbox();
            toast("面板服务未连接，演示模式登录", "ok");
            renderAdmin(document.getElementById("view"));
        });
        return;
    }


    if (act === "core.status") { refreshStatus("core", "core", "coreStatus"); return; }
    if (act === "core.cfgLoad") {
        const res = await invoke("core", "mgmtGetConfig", []);
        const ta = document.getElementById("coreCfg");
        if (ta && res && res.ok) {
            const copy = Object.assign({}, res);
            delete copy.ok;
            ta.value = JSON.stringify(copy, null, 4);
            toast("已读取核心配置", "ok");
        } else {
            toast((res && res.error) || "读取失败", "err");
        }
        return;
    }
    if (act === "core.cfgSave") {
        const ta = document.getElementById("coreCfg");
        try {
            JSON.parse(ta.value);
        } catch (error) {
            toast("JSON 解析失败: " + error.message, "err");
            return;
        }
        const res = await invoke("core", "mgmtSetConfig", [ta.value]);
        toast(res && res.ok ? "核心配置已保存" : ((res && res.error) || "保存失败"), res && res.ok ? "ok" : "err");
        return;
    }
    if (act === "core.tasks") {
        const res = await invoke("core", "mgmtListDailyTasks", [JSON.stringify({ name: val("coreTasksName") })]);
        if (res && res.ok && Array.isArray(res.tasks)) {
            showOut("coreTasksOut", tableHtml(res.tasks.map((t) => Object.assign({}, t, {
                progressText: `${t.progress === undefined ? "—" : t.progress}/${t.required}`,
                claimedText: t.claimed ? "已领取" : "可领",
            })), [
                { key: "id", label: "ID" },
                { key: "name", label: "任务" },
                { key: "progressText", label: "进度" },
                { key: "reward", label: "奖励" },
                { key: "claimedText", label: "状态" },
            ]));
        } else {
            showJsonOut("coreTasksOut", res);
        }
        return;
    }
    if (act === "core.mutes") {
        const res = await invoke("core", "mgmtMuteList", []);
        if (res && res.ok && Array.isArray(res.mutes)) {
            showOut("coreMutesOut", tableHtml(res.mutes.map((m) => Object.assign({}, m, {
                until: m.expireAt ? fmtDate(m.expireAt) : "永久",
                action: `<button class="btn btn-sm btn-danger" data-act="core.unmute" data-name="${esc(m.name)}">解除</button>`,
            })), [
                { key: "name", label: "玩家" },
                { key: "reason", label: "原因" },
                { key: "until", label: "到期" },
                { key: "action", label: "操作" },
            ]));
        } else {
            showJsonOut("coreMutesOut", res);
        }
        return;
    }
    if (act === "core.unmute") {
        const name = el.getAttribute("data-name");
        const res = await invoke("core", "mgmtUnmute", [JSON.stringify({ name })]);
        toast(res && res.ok ? `已解除 ${name} 的禁言` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("core.mutes", el);
        return;
    }
    if (act === "core.regions") {
        const res = await invoke("core", "mgmtHubRegions", []);
        if (res && res.ok && Array.isArray(res.regions)) {
            showOut("coreRegionsOut", tableHtml(res.regions.map((r) => ({
                id: r.id, name: r.name,
                enabled: r.enabled ? "启用" : "关闭",
                allow: (r.allow || []).join(", ") || "—",
            })), [
                { key: "id", label: "ID" },
                { key: "name", label: "名称" },
                { key: "enabled", label: "状态" },
                { key: "allow", label: "白名单" },
            ]));
        } else {
            showJsonOut("coreRegionsOut", res);
        }
        return;
    }
    if (act === "core.top") {
        const count = Number(val("coreTopCount")) || 10;
        const res = await invoke("core", "mgmtGetOnlineTop", [JSON.stringify({ count })]);
        if (res && res.ok && Array.isArray(res.ranking)) {
            showOut("coreTopOut", tableHtml(res.ranking.map((r, i) => ({
                rank: i + 1, name: r.name, time: fmtUptime(r.seconds), op: r.op ? "OP" : "",
            })), [
                { key: "rank", label: "#" },
                { key: "name", label: "玩家" },
                { key: "time", label: "在线时长" },
                { key: "op", label: "" },
            ]));
        } else {
            showJsonOut("coreTopOut", res);
        }
        return;
    }

    if (act === "vip.status") { refreshStatus("vip", "vip", "vipStatus"); return; }
    if (act === "vip.list") {
        const res = await invoke("vip", "mgmtListVips", []);
        if (res && res.ok && Array.isArray(res.players)) {
            showOut("vipListOut", tableHtml(res.players.map((p) => Object.assign({}, p, {
                expire: fmtDate(p.expireAt),
                action: `<button class="btn btn-sm btn-danger" data-act="vip.removeKey" data-key="${esc(p.key)}">移除</button>`,
            })), [
                { key: "name", label: "玩家" },
                { key: "display", label: "等级" },
                { key: "expire", label: "到期" },
                { key: "action", label: "操作" },
            ]));
        } else {
            showJsonOut("vipListOut", res);
        }
        return;
    }
    if (act === "vip.set" || act === "vip.remove" || act === "vip.removeKey") {
        let payload;
        if (act === "vip.set") {
            payload = {
                name: val("vipSetName"),
                level: val("vipSetLevel") || "vip",
                days: Number(val("vipSetDays")) || 0,
            };
            if (!payload.name) { toast("请填写玩家名", "err"); return; }
        } else if (act === "vip.remove") {
            const name = val("vipSetName");
            if (!name) { toast("请填写要移除的玩家名", "err"); return; }
            payload = { name };
        } else {
            payload = { key: el.getAttribute("data-key"), name: el.getAttribute("data-key") };
        }
        const res = await invoke("vip", act === "vip.set" ? "mgmtSetVip" : "mgmtRemoveVip", [JSON.stringify(payload)]);
        toast(res && res.ok ? "操作成功" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok && act !== "vip.set") handleAdminAction("vip.list", el);
        return;
    }
    if (act === "vip.title" || act === "vip.titleClear") {
        const payload = { name: val("vipTitleName") };
        if (!payload.name) { toast("请填写玩家名", "err"); return; }
        if (act === "vip.title") {
            payload.title = val("vipTitleText");
            if (!payload.title) { toast("请填写头衔", "err"); return; }
        }
        const res = await invoke("vip", act === "vip.title" ? "mgmtSetTitle" : "mgmtClearTitle", [JSON.stringify(payload)]);
        toast(res && res.ok ? "头衔已更新" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        return;
    }
    if (act === "vip.dname" || act === "vip.dnameClear") {
        const payload = { name: val("vipNameName") };
        if (!payload.name) { toast("请填写玩家名", "err"); return; }
        if (act === "vip.dname") {
            payload.displayName = val("vipNameText");
            if (!payload.displayName) { toast("请填写显示名字", "err"); return; }
        }
        const res = await invoke("vip", act === "vip.dname" ? "mgmtSetDisplayName" : "mgmtClearDisplayName", [JSON.stringify(payload)]);
        toast(res && res.ok ? "显示名已更新" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        return;
    }
    if (act === "vip.flight") {
        const name = val("vipFlightName");
        if (!name) { toast("请填写玩家名", "err"); return; }
        const res = await invoke("vip", "mgmtGetFlight", [JSON.stringify({ name })]);
        showJsonOut("vipFlightOut", res);
        return;
    }

    if (act === "tpa.status") { refreshStatus("tpa", "tpa", "tpaStatus"); return; }
    if (act === "tpa.warps") {
        const res = await invoke("tpa", "mgmtListWarps", []);
        if (res && res.ok && Array.isArray(res.warps)) {
            showOut("tpaWarpsOut", tableHtml(res.warps.map((w) => Object.assign({}, w, {
                action: `<button class="btn btn-sm btn-danger" data-act="tpa.warpDel" data-name="${esc(w.name)}">删除</button>`,
            })), [
                { key: "name", label: "Warp" },
                { key: "ownerName", label: "创建者" },
                { key: "action", label: "操作" },
            ]));
        } else {
            showJsonOut("tpaWarpsOut", res);
        }
        return;
    }
    if (act === "tpa.warpDel") {
        const name = el.getAttribute("data-name");
        if (!confirm(`确认删除 Warp「${name}」？`)) return;
        const res = await invoke("tpa", "mgmtDeleteWarp", [JSON.stringify({ name })]);
        toast(res && res.ok ? "已删除" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("tpa.warps", el);
        return;
    }
    if (act === "tpa.homes") {
        const name = val("tpaHomesName");
        if (!name) { toast("请填写玩家名或键", "err"); return; }
        const res = await invoke("tpa", "mgmtListHomes", [JSON.stringify({ name })]);
        if (res && res.ok && Array.isArray(res.homes)) {
            showOut("tpaHomesOut", tableHtml(res.homes.map((h) => ({
                name: h.name,
                pos: h.pos ? `X${Math.floor(h.pos.x)} Y${Math.floor(h.pos.y)} Z${Math.floor(h.pos.z)}` : "—",
            })), [
                { key: "name", label: "Home" },
                { key: "pos", label: "坐标" },
            ]));
        } else {
            showJsonOut("tpaHomesOut", res);
        }
        return;
    }
    if (act === "tpa.homesClear") {
        const name = val("tpaHomesName");
        if (!name) { toast("请填写玩家名或键", "err"); return; }
        if (!confirm(`确认清空 ${name} 的全部 Home？`)) return;
        const res = await invoke("tpa", "mgmtClearHomes", [JSON.stringify({ name })]);
        toast(res && res.ok ? "已清空" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) showOut("tpaHomesOut", "");
        return;
    }
    if (act === "tpa.pending") {
        const res = await invoke("tpa", "mgmtGetPendingRequests", []);
        if (res && res.ok && Array.isArray(res.requests)) {
            showOut("tpaPendingOut", tableHtml(res.requests.map((r) => ({
                from: r.fromName, to: r.toName, type: r.type === "toTarget" ? "传向对方" : "邀请对方",
                left: fmtDate(r.expiresAt),
            })), [
                { key: "from", label: "发起" },
                { key: "to", label: "目标" },
                { key: "type", label: "类型" },
                { key: "left", label: "过期" },
            ]));
        } else {
            showJsonOut("tpaPendingOut", res);
        }
        return;
    }

    if (act === "seat.status") {
        const res = await invoke("seat", "mgmtStatus", []);
        const el2 = document.getElementById("seatStatus");
        if (el2) {
            el2.innerHTML = res && res.ok
                ? statusChips(res)
                : `<span class="status-off">不可用：${esc((res && res.error) || "")}</span>`;
        }
        const chk = document.getElementById("seatDefChk");
        if (chk && res && res.ok) chk.checked = res.defaultEnabled !== false;
        return;
    }
    if (act === "seat.setdef") return; // change 事件处理
    if (act === "seat.cleanup") {
        if (!confirm("确认起身并清理全部座位实体？")) return;
        const res = await invoke("seat", "mgmtCleanupAll", []);
        toast(res && res.ok ? `已清理 ${res.removed || 0} 个实体` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        return;
    }

    // ---------- 插件分页签 ----------
    if (act === "plugin.tab") {
        switchPluginTab(el.getAttribute("data-tab"));
        return;
    }

    // ---------- 商城 LuckyClover-ShoppingMall ----------
    if (act === "mall.status") { refreshStatus("mall", "mall", "mallStatus"); return; }
    if (act === "mall.overview") {
        const res = await invoke("mall", "mgmtOverview", []);
        if (!(res && res.ok)) { showJsonOut("mallOverviewOut", res); return; }
        const s = res.stats || {};
        const head = `<div class="chip-row">
          <span class="kv"><b>官方在售</b>${esc(s.officialSells)}</span>
          <span class="kv"><b>官方回收</b>${esc(s.officialRecycles)}</span>
          <span class="kv"><b>店铺</b>${esc(s.shops)}（营业 ${esc(s.openShops)}）</span>
          <span class="kv"><b>在售商品</b>${esc(s.itemTypes)} 种 / ${esc(s.itemCount)} 件</span>
          <span class="kv"><b>累计税收</b>${esc(s.taxTotal)}</span>
          <span class="kv"><b>交易记录</b>${esc(s.logs)}</span>
          <span class="kv"><b>求购中</b>${esc(s.requests)}</span>
          <span class="kv"><b>仓库用户</b>${esc(s.warehouseUsers)}</span>
        </div>`;
        const recent = tableHtml((res.recent || []).map((r) => ({
            time: fmtDate(r.ts), buyer: r.buyer, seller: r.seller,
            item: `${r.item} x${r.qty}`, total: r.total, tax: r.tax || 0,
        })), [
            { key: "time", label: "时间" }, { key: "buyer", label: "买家" },
            { key: "seller", label: "卖家" }, { key: "item", label: "商品" },
            { key: "total", label: "金额" }, { key: "tax", label: "税" },
        ]);
        showOut("mallOverviewOut", head + recent);
        return;
    }
    if (act === "mall.shops") {
        const res = await invoke("mall", "mgmtListShops", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallShopsOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            name: r.name, owner: r.ownerName, state: r.isOpen ? "营业" : "打烊",
            items: `${r.itemTypes} 种 / ${r.itemCount} 件`,
            earnings: r.earnings, pending: r.pendingEarnings,
            action: `<button class="btn btn-sm" data-act="mall.shopSet" data-xuid="${esc(r.xuid)}" data-open="${r.isOpen ? 0 : 1}">${r.isOpen ? "打烊" : "开业"}</button> <button class="btn btn-sm" data-act="mall.shopView" data-xuid="${esc(r.xuid)}">查看</button>`,
        }));
        showOut("mallShopsOut", `<div class="card-desc">共 ${res.total} 家店铺（第 ${res.page}/${res.pages} 页，面板仅展示第一页）</div>`
            + tableHtml(rows, [
                { key: "name", label: "店铺" }, { key: "owner", label: "店主" },
                { key: "state", label: "状态" }, { key: "items", label: "货架" },
                { key: "earnings", label: "收益" }, { key: "pending", label: "待结算" },
                { key: "action", label: "操作" },
            ]));
        return;
    }
    if (act === "mall.shopSet" || act === "mall.shopView" || act === "mall.shopGet" || act === "mall.shopDelete") {
        const xuid = el.getAttribute("data-xuid") || val("mallShopXuid");
        if (!xuid) { toast("请先填写店铺 XUID", "err"); return; }
        const box = document.getElementById("mallShopXuid");
        if (box) box.value = xuid;
        if (act === "mall.shopSet") {
            const open = el.getAttribute("data-open") === "1";
            const res = await invoke("mall", "mgmtSetShopOpen", [JSON.stringify({ xuid, open })]);
            toast(res && res.ok ? (open ? "店铺已强制开业" : "店铺已强制打烊") : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
            return;
        }
        if (act === "mall.shopDelete") {
            const res = await invoke("mall", "mgmtDeleteShop", [JSON.stringify({ xuid })]);
            toast(res && res.ok ? "店铺已删除" : ((res && res.error) || "失败（货架未清空？）"), res && res.ok ? "ok" : "err");
            return;
        }
        const res = await invoke("mall", "mgmtGetShop", [JSON.stringify({ xuid })]);
        if (!(res && res.ok)) { showJsonOut("mallShopOut", res); return; }
        setMallBatchScope("shop", xuid);
        const rows = (res.items || []).map((item) => ({
            sel: `<input type="checkbox" class="mallSel" data-key="${esc(item.key)}">`,
            name: item.name, price: item.price, qty: item.quantity, category: item.category, sales: item.sales,
            discount: item.discount ? `${item.discount}折` : "—",
            action: `<button class="btn btn-sm btn-danger" data-act="mall.shopItemRemove" data-xuid="${esc(xuid)}" data-key="${esc(item.key)}">下架并转入待领取</button>`,
        }));
        showOut("mallShopOut", `<div class="card-desc">${esc(res.name)}（${esc(res.ownerName)}）· ${esc(res.isOpen ? "营业" : "打烊")} · 货架 ${(res.items || []).length} 种 · 待领取 ${esc(res.pendingItems)} 件</div>`
            + tableHtml(rows, [
                { key: "sel", label: "选" },
                { key: "name", label: "商品" }, { key: "price", label: "单价" },
                { key: "qty", label: "库存" }, { key: "category", label: "分类" },
                { key: "discount", label: "折扣" }, { key: "sales", label: "已售" },
                { key: "action", label: "操作" },
            ]));
        return;
    }
    if (act === "mall.shopItemRemove") {
        const xuid = el.getAttribute("data-xuid");
        const key = el.getAttribute("data-key");
        const res = await invoke("mall", "mgmtRemoveShopItem", [JSON.stringify({ xuid, key })]);
        toast(res && res.ok ? `已下架 ${res.name || ""}（转入店主待领取）` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.shopView", document.querySelector(`[data-act="mall.shopView"][data-xuid="${xuid}"]`) || el);
        return;
    }
    if (act === "mall.official") {
        setMallBatchScope("official", "");
        const res = await invoke("mall", "mgmtListOfficial", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallOfficialOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            sel: `<input type="checkbox" class="mallSel" data-key="${esc(r.key)}">`,
            name: r.name, price: r.price, qty: r.quantity === -1 ? "无限" : r.quantity,
            category: r.category, sales: r.sales,
            discount: r.discount ? `${r.discount}折` : "—",
            action: `<button class="btn btn-sm" data-act="mall.officialPrice" data-key="${esc(r.key)}">改价</button> <button class="btn btn-sm" data-act="mall.officialStock" data-key="${esc(r.key)}">改库存</button> <button class="btn btn-sm btn-danger" data-act="mall.officialRemove" data-key="${esc(r.key)}">下架</button>`,
        }));
        showOut("mallOfficialOut", `<div class="card-desc">共 ${res.total} 种（第 ${res.page}/${res.pages} 页）</div>`
            + tableHtml(rows, [
                { key: "sel", label: "选" },
                { key: "name", label: "商品" }, { key: "price", label: "单价" },
                { key: "qty", label: "库存" }, { key: "category", label: "分类" },
                { key: "discount", label: "折扣" }, { key: "sales", label: "已售" },
                { key: "action", label: "操作" },
            ]));
        return;
    }
    if (act === "mall.officialPrice") {
        const price = Number(val("mallNewPrice"));
        if (!price || price < 1) { toast("请先在“改价用新单价”里填正整数", "err"); return; }
        const res = await invoke("mall", "mgmtSetOfficialPrice", [JSON.stringify({ key: el.getAttribute("data-key"), price })]);
        toast(res && res.ok ? "单价已修改" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.official", el);
        return;
    }
    if (act === "mall.officialStock") {
        const qty = Number(val("mallNewPrice"));
        if (isNaN(qty)) { toast("请先在“改价用新单价”里填库存（-1=无限，0=下架）", "err"); return; }
        const res = await invoke("mall", "mgmtSetOfficialStock", [JSON.stringify({ key: el.getAttribute("data-key"), quantity: qty })]);
        toast(res && res.ok ? "库存已修改" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.official", el);
        return;
    }
    if (act === "mall.officialRemove") {
        const res = await invoke("mall", "mgmtRemoveOfficial", [JSON.stringify({ key: el.getAttribute("data-key") })]);
        toast(res && res.ok ? "已下架" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.official", el);
        return;
    }
    if (act === "mall.addOfficial" || act === "mall.addRecycle") {
        const type = val("mallAddType").trim();
        const price = Number(val("mallAddPrice"));
        const category = val("mallAddCat") || "其他";
        if (!type || type.indexOf(":") < 0) { toast("物品类型必须是完整 ID", "err"); return; }
        if (!price || price < 1) { toast("单价必须是正整数", "err"); return; }
        const payload = act === "mall.addOfficial"
            ? { type, price, quantity: Number(val("mallAddQty")), category }
            : { type, price, category };
        const res = await invoke("mall", act === "mall.addOfficial" ? "mgmtAddOfficial" : "mgmtAddRecycle", [JSON.stringify(payload)]);
        toast(res && res.ok ? (act === "mall.addOfficial" ? "已上架出售" : "已加入回收清单") : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction(act === "mall.addOfficial" ? "mall.official" : "mall.recycle", el);
        return;
    }
    if (act === "mall.recycle") {
        setMallBatchScope("recycle", "");
        const res = await invoke("mall", "mgmtListRecycle", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallRecycleOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            sel: `<input type="checkbox" class="mallSel" data-key="${esc(r.key)}">`,
            name: r.name, price: r.perCount > 1 ? `${r.price} / ${r.perCount}个` : r.price,
            category: r.category,
            action: `<button class="btn btn-sm" data-act="mall.recyclePrice" data-key="${esc(r.key)}">改价</button> <button class="btn btn-sm btn-danger" data-act="mall.recycleRemove" data-key="${esc(r.key)}">移除</button>`,
        }));
        showOut("mallRecycleOut", `<div class="card-desc">共 ${res.total} 种（第 ${res.page}/${res.pages} 页）</div>`
            + tableHtml(rows, [
                { key: "sel", label: "选" },
                { key: "name", label: "物品" }, { key: "price", label: "回收价" },
                { key: "category", label: "分类" }, { key: "action", label: "操作" },
            ]));
        return;
    }
    if (act === "mall.recyclePrice") {
        const price = Number(val("mallNewPrice"));
        if (!price || price < 1) { toast("请先在“改价用新单价”里填正整数", "err"); return; }
        const res = await invoke("mall", "mgmtSetRecyclePrice", [JSON.stringify({ key: el.getAttribute("data-key"), price })]);
        toast(res && res.ok ? "回收价已修改" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.recycle", el);
        return;
    }
    if (act === "mall.recycleRemove") {
        const res = await invoke("mall", "mgmtRemoveRecycle", [JSON.stringify({ key: el.getAttribute("data-key") })]);
        toast(res && res.ok ? "已移出回收清单" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.recycle", el);
        return;
    }
    if (act === "mall.logs") {
        const res = await invoke("mall", "mgmtListLogs", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallLogsOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            time: fmtDate(r.ts), buyer: r.buyer, seller: r.seller,
            item: `${r.item} x${r.qty}`, total: r.total, tax: r.tax || 0,
        }));
        showOut("mallLogsOut", `<div class="card-desc">共 ${res.total} 条（第 ${res.page}/${res.pages} 页）</div>`
            + tableHtml(rows, [
                { key: "time", label: "时间" }, { key: "buyer", label: "买家" },
                { key: "seller", label: "卖家" }, { key: "item", label: "商品" },
                { key: "total", label: "金额" }, { key: "tax", label: "税" },
            ]));
        return;
    }
    if (act === "mall.ranking") {
        const res = await invoke("mall", "mgmtGetRanking", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallRankingOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            rank: r.rank, name: r.name, sales: r.sales, orders: r.orders, earnings: r.earnings,
        }));
        showOut("mallRankingOut", `<div class="card-desc">共 ${res.total} 位卖家（第 ${res.page}/${res.pages} 页）</div>`
            + tableHtml(rows, [
                { key: "rank", label: "#" }, { key: "name", label: "玩家" },
                { key: "sales", label: "销量" }, { key: "orders", label: "订单" },
                { key: "earnings", label: "收益" },
            ]));
        return;
    }
    if (act === "mall.tax") {
        const res = await invoke("mall", "mgmtGetTaxStats", []);
        if (!(res && res.ok)) { showJsonOut("mallTaxOut", res); return; }
        const cfg = res.config || {};
        const chk = document.getElementById("mallTaxEnabled");
        if (chk) chk.checked = Boolean(cfg.enabled);
        const rate = document.getElementById("mallTaxRate");
        if (rate) rate.value = cfg.rate;
        const scope = document.getElementById("mallTaxScope");
        if (scope) scope.value = cfg.scope || "player";
        const rows = (res.recent || []).map((r) => ({
            time: fmtDate(r.ts), payer: r.payer, amount: r.amount, item: r.item,
        }));
        showOut("mallTaxOut", `<div class="card-desc">累计税收 ${esc(res.total)}（共 ${esc(res.count)} 笔记录）</div>`
            + tableHtml(rows, [
                { key: "time", label: "时间" }, { key: "payer", label: "缴税人" },
                { key: "amount", label: "税额" }, { key: "item", label: "商品" },
            ]));
        return;
    }
    if (act === "mall.taxSave") {
        const payload = {
            enabled: Boolean(document.getElementById("mallTaxEnabled") && document.getElementById("mallTaxEnabled").checked),
            rate: Number(val("mallTaxRate")),
            scope: val("mallTaxScope"),
        };
        const res = await invoke("mall", "mgmtSetTax", [JSON.stringify(payload)]);
        toast(res && res.ok ? "税收配置已保存" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.tax", el);
        return;
    }
    if (act === "mall.cats") { await loadMallCategoryOptions(); toast("分类列表已刷新", "ok"); return; }
    if (act === "mall.addCat") {
        const name = val("mallCatName").trim();
        if (!name) { toast("请输入分类名", "err"); return; }
        const res = await invoke("mall", "mgmtAddCategory", [JSON.stringify({ name })]);
        toast(res && res.ok ? "分类已新增" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) await loadMallCategoryOptions();
        return;
    }
    if (act === "mall.delCat") {
        const sel = document.getElementById("mallCatList");
        const name = sel ? sel.value : "";
        if (!name) { toast("请先选择要删除的分类", "err"); return; }
        const res = await invoke("mall", "mgmtRemoveCategory", [JSON.stringify({ name })]);
        toast(res && res.ok ? `已删除分类 ${name}` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) await loadMallCategoryOptions();
        return;
    }
    if (act === "mall.forbiddenGet") {
        const res = await invoke("mall", "mgmtGetForbidden", []);
        if (!(res && res.ok)) { showJsonOut("mallForbidOut", res); return; }
        mallForbiddenCache = Array.isArray(res.items) ? res.items : [];
        showOut("mallForbidOut", `<div class="card-desc">当前 ${mallForbiddenCache.length} 种禁售物品（禁售后不可上架，仍可购买与回收）</div>`
            + tableHtml(mallForbiddenCache.map((t) => ({ type: t })), [{ key: "type", label: "物品类型" }]));
        return;
    }
    if (act === "mall.forbiddenAdd" || act === "mall.forbiddenDel") {
        const type = val("mallForbidType").trim();
        if (!type || type.indexOf(":") < 0) { toast("物品类型必须是完整 ID", "err"); return; }
        if (!mallForbiddenCache) {
            const res = await invoke("mall", "mgmtGetForbidden", []);
            mallForbiddenCache = res && res.ok && Array.isArray(res.items) ? res.items : [];
        }
        const next = mallForbiddenCache.slice();
        const at = next.indexOf(type);
        if (act === "mall.forbiddenAdd" && at < 0) next.push(type);
        if (act === "mall.forbiddenDel" && at >= 0) next.splice(at, 1);
        const res = await invoke("mall", "mgmtSetForbidden", [JSON.stringify({ items: next })]);
        if (res && res.ok) {
            mallForbiddenCache = res.items || next;
            showOut("mallForbidOut", `<div class="card-desc">当前 ${mallForbiddenCache.length} 种禁售物品</div>`
                + tableHtml(mallForbiddenCache.map((t) => ({ type: t })), [{ key: "type", label: "物品类型" }]));
            toast(act === "mall.forbiddenAdd" ? "已添加禁售" : "已移除禁售", "ok");
        } else {
            toast((res && res.error) || "失败", "err");
        }
        return;
    }
    if (act === "mall.requests") {
        const res = await invoke("mall", "mgmtListRequests", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallRequestsOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            id: r.id, item: `${r.itemName} x${r.quantity}`, by: r.requesterName,
            each: r.priceEach, total: r.totalAmount,
            status: { active: "进行中", fulfilled: "已完成", cancelled: "已取消", expired: "已到期" }[r.status] || r.status,
            left: r.status === "active" ? fmtDuration(Math.max(0, r.expiresAt - Date.now())) : "—",
            action: r.status === "active"
                ? `<button class="btn btn-sm btn-danger" data-act="mall.requestCancel" data-id="${esc(r.id)}">取消并退款</button>`
                : "",
        }));
        showOut("mallRequestsOut", `<div class="card-desc">进行中 ${res.total} 单（第 ${res.page}/${res.pages} 页）</div>`
            + tableHtml(rows, [
                { key: "id", label: "单号" }, { key: "item", label: "求购" },
                { key: "by", label: "求购人" }, { key: "each", label: "单价" },
                { key: "total", label: "托管" }, { key: "status", label: "状态" },
                { key: "left", label: "剩余" }, { key: "action", label: "操作" },
            ]));
        return;
    }
    if (act === "mall.requestCancel") {
        const id = el.getAttribute("data-id");
        const res = await invoke("mall", "mgmtCancelRequest", [JSON.stringify({ id })]);
        toast(res && res.ok ? `已取消并退款 ${res.refund}` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) handleAdminAction("mall.requests", el);
        return;
    }
    if (act === "mall.warehouse") {
        const res = await invoke("mall", "mgmtListWarehouse", [JSON.stringify({ page: 1, keyword: "" })]);
        if (!(res && res.ok)) { showJsonOut("mallWarehouseOut", res); return; }
        const rows = (res.rows || []).map((r) => ({
            name: r.name, slots: `${r.used}/${r.slots}`, pieces: r.pieces,
            purchased: r.purchased ? "已买断" : "免费",
            updated: fmtDate(r.updatedAt),
            action: `<button class="btn btn-sm" data-act="mall.warehouseView" data-xuid="${esc(r.xuid)}">查看</button>`,
        }));
        showOut("mallWarehouseOut", `<div class="card-desc">${res.total} 个玩家有仓库数据（第 ${res.page}/${res.pages} 页）</div>`
            + tableHtml(rows, [
                { key: "name", label: "玩家" }, { key: "slots", label: "格数" },
                { key: "pieces", label: "件数" }, { key: "purchased", label: "扩容" },
                { key: "updated", label: "更新时间" }, { key: "action", label: "操作" },
            ]));
        return;
    }
    if (act === "mall.warehouseView") {
        const xuid = el.getAttribute("data-xuid");
        const res = await invoke("mall", "mgmtGetWarehouse", [JSON.stringify({ xuid })]);
        if (!(res && res.ok)) { showJsonOut("mallWarehouseDetailOut", res); return; }
        const rows = (res.items || []).map((item) => ({
            name: item.name, type: item.type, qty: item.quantity,
            desc: item.description || "—", at: fmtDate(item.at),
        }));
        showOut("mallWarehouseDetailOut", `<div class="card-desc">${esc(res.name)} 的仓库 · ${esc(res.used)}/${esc(res.slots)} 格${res.purchased ? " · 已买断" : ""}</div>`
            + tableHtml(rows, [
                { key: "name", label: "物品" }, { key: "type", label: "类型" },
                { key: "qty", label: "数量" }, { key: "desc", label: "备注" },
                { key: "at", label: "存入时间" },
            ]));
        return;
    }
    if (act === "mall.batchPrice" || act === "mall.batchDiscount" || act === "mall.batchRemove") {
        const scope = (state.mallBatch && state.mallBatch.scope) || "official";
        const xuid = (state.mallBatch && state.mallBatch.xuid) || "";
        const keys = Array.from(document.querySelectorAll("#view .mallSel:checked"))
            .map((node) => node.getAttribute("data-key"));
        if (!keys.length) { toast("请先在表格里勾选条目", "err"); return; }
        if (scope === "shop" && !xuid) { toast("店铺批次缺少 XUID", "err"); return; }
        let payload = { scope, keys, xuid };
        if (act === "mall.batchPrice") {
            const value = Number(val("mallBatchValue"));
            if (isNaN(value)) { toast("请填改价数值", "err"); return; }
            payload = Object.assign(payload, {
                action: val("mallBatchMode") === "price" ? "price" : "percent",
                value,
            });
        } else if (act === "mall.batchDiscount") {
            payload = Object.assign(payload, {
                action: "discount",
                rate: Number(val("mallBatchRate")),
                minutes: Number(val("mallBatchMinutes")),
            });
        } else {
            payload = Object.assign(payload, { action: "remove" });
        }
        const res = await invoke("mall", "mgmtBatchList", [JSON.stringify(payload)]);
        toast(res && res.ok ? `已处理 ${res.count} 项（${payload.action}）` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        if (res && res.ok) {
            const refresh = scope === "official" ? "mall.official" : scope === "recycle" ? "mall.recycle" : "mall.shopView";
            await handleAdminAction(refresh, el);
        }
        return;
    }
    if (act === "mall.cfgLoad") {
        const res = await invoke("mall", "mgmtGetConfig", []);
        const ta = document.getElementById("mallCfg");
        if (ta && res && res.ok) {
            const copy = Object.assign({}, res);
            delete copy.ok;
            ta.value = JSON.stringify(copy.config || copy, null, 4);
            toast("已读取商城配置", "ok");
        } else {
            toast((res && res.error) || "读取失败", "err");
        }
        return;
    }
    if (act === "mall.cfgSave") {
        const ta = document.getElementById("mallCfg");
        let parsed;
        try {
            parsed = JSON.parse(ta.value);
        } catch (error) {
            toast("JSON 解析失败: " + error.message, "err");
            return;
        }
        const payload = parsed.config || parsed;
        const res = await invoke("mall", "mgmtSetConfig", [JSON.stringify(payload)]);
        toast(res && res.ok ? "商城配置已保存" : ((res && res.error) || "保存失败"), res && res.ok ? "ok" : "err");
        return;
    }

    if (act === "sbx.status") { refreshStatus("sidebar", "sidebar", "sbxStatus"); return; }
    if (act === "sbx.metrics") {
        const res = await invoke("sidebar", "mgmtGetMetrics", []);
        const el2 = document.getElementById("sbxStatus");
        if (el2) {
            el2.innerHTML = res && res.ok
                ? statusChips(res)
                : `<span class="status-off">不可用：${esc((res && res.error) || "")}</span>`;
        }
        return;
    }
    if (act === "sbx.basicSave") {
        await saveSidebarCfg(collectBasicForm(), "基本设置已保存");
        sbxAutoPreview();
        return;
    }
    if (act === "sbx.titleSave") {
        const titleEl = document.getElementById("sbTitleText");
        const rankEl = document.getElementById("sbRankingTitle");
        await saveSidebarCfg({
            title: titleEl ? titleEl.value.trim() : "",
            rankingTitle: rankEl ? rankEl.value.trim() : "",
        }, "标题已保存");
        updateTitlePreviews();
        sbxAutoPreview();
        return;
    }
    if (act === "sbx.rowAdd") {
        collectRowsFromDom();
        const s = sbSidebar();
        s.lines = Array.isArray(s.lines) ? s.lines : [];
        s.lines.push("§b新行 {tps}");
        renderRowsList();
        await saveSidebarCfg({}, "已新增并保存");
        return;
    }
    if (act === "sbx.rowAddRotate") {
        collectRowsFromDom();
        const s = sbSidebar();
        s.lines = Array.isArray(s.lines) ? s.lines : [];
        s.lines.push({ type: "rotate", intervalMs: 2000, frames: ["§a轮播帧 1 {tps}", "§b轮播帧 2 {onlinePlayers}"] });
        renderRowsList();
        await saveSidebarCfg({}, "已新增轮播行");
        return;
    }
    if (act === "sbx.toRotate") {
        collectRowsFromDom();
        const idx = Number(el.getAttribute("data-i"));
        const arr = currentRows();
        if (arr[idx] !== undefined && rowType(arr[idx]) === "static") {
            arr[idx] = { type: "rotate", intervalMs: 2000, frames: [String(arr[idx] || ""), ""] };
            renderRowsList();
            await saveSidebarCfg({}, "已转为轮播");
        }
        return;
    }
    if (act === "sbx.toStatic") {
        collectRowsFromDom();
        const idx = Number(el.getAttribute("data-i"));
        const arr = currentRows();
        if (arr[idx] !== undefined && rowType(arr[idx]) === "rotate") {
            arr[idx] = String(arr[idx].frames[0] || "");
            renderRowsList();
            await saveSidebarCfg({}, "已转为静态");
        }
        return;
    }
    if (act === "sbx.frameAdd") {
        collectRowsFromDom();
        const idx = Number(el.getAttribute("data-i"));
        const arr = currentRows();
        if (arr[idx] !== undefined && rowType(arr[idx]) === "rotate") {
            arr[idx].frames.push("");
            renderRowsList();
            await saveSidebarCfg({}, "已加帧");
        }
        return;
    }
    if (act === "sbx.rowUp" || act === "sbx.rowDown" || act === "sbx.rowDel") {
        collectRowsFromDom();
        const idx = Number(el.getAttribute("data-i"));
        const arr = currentRows();
        if (idx >= 0 && idx < arr.length) {
            if (act === "sbx.rowDel") {
                arr.splice(idx, 1);
            } else if (act === "sbx.rowUp" && idx > 0) {
                const tmp = arr[idx - 1];
                arr[idx - 1] = arr[idx];
                arr[idx] = tmp;
            } else if (act === "sbx.rowDown" && idx < arr.length - 1) {
                const tmp = arr[idx + 1];
                arr[idx + 1] = arr[idx];
                arr[idx] = tmp;
            }
            renderRowsList();
            await saveSidebarCfg({}, "行模板已保存");
        }
        return;
    }
    if (act === "sbx.rowsSave") {
        collectRowsFromDom();
        await saveSidebarCfg({}, "行模板已保存");
        sbxAutoPreview();
        return;
    }
    if (act === "sbx.preview") {
        collectRowsFromDom();
        await saveSidebarCfg({}, null, true);
        sbxAutoPreview();
        return;
    }
    if (act === "sbx.page") {
        const page = el.getAttribute("data-page");
        const res = await invoke("sidebar", "mgmtSetPage", [JSON.stringify({ page })]);
        toast(res && res.ok ? `已切换到${page === "main" ? "主页" : "排行页"}` : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        return;
    }

}

function wireAdminActions(view) {
    if (view._wiredAdmin) return;
    view._wiredAdmin = true;
    view.addEventListener("click", (event) => {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled) return;
        event.preventDefault();
        handleAdminAction(target.getAttribute("data-act"), target);
    });
    view.addEventListener("change", async (event) => {
        const target = event.target;
        if (!target || !target.dataset) return;
        if (target.id === "seatDefChk") {
            const res = await invoke("seat", "mgmtSetDefaultEnabled", [JSON.stringify({ enabled: target.checked })]);
            toast(res && res.ok ? "已更新默认开关" : ((res && res.error) || "失败"), res && res.ok ? "ok" : "err");
        }
        if (target.id === "cdkType") {
            const isCoins = target.value === "coins";
            for (const node of view.querySelectorAll(".cdk-vip-only")) node.hidden = isCoins;
            for (const node of view.querySelectorAll(".cdk-coins-only")) node.hidden = !isCoins;
        }
    });
}

// ---------- 侧边栏管理（结构化编辑） ----------
function sbSidebar() {
    if (!state.sbCfg) {
        state.sbCfg = { sidebar: {} };
    }
    return state.sbCfg.sidebar;
}

const DEFAULT_SIDEBAR = {
    enabled: true,
    defaultShow: true,
    title: "§aLuckyClover",
    serverName: "LC生存服",
    refreshIntervalMs: 1000,
    cycleEnabled: false,
    cycleIntervalMs: 15000,
    rankingTitle: "§6=== 在线时长排行 ===",
    rankingLines: [
        "{topOnline1}", "{topOnline2}", "{topOnline3}", "{topOnline4}", "{topOnline5}",
        "{topOnline6}", "{topOnline7}", "{topOnline8}", "{topOnline9}", "{topOnline10}",
    ],
    lines: [
        "§b服务器§f: {serverName}",
        "§b在线玩家§f: {onlinePlayers}",
        "§b玩家§f: {playerName}",
        "§b头衔§f: {sidebarTitle}",
        "§b金币§f: {money}",
        "§b时间§f: {time}",
    ],
};

async function loadSidebarAdmin() {
    if (!(state.auth.authed && state.auth.role === "admin")) return;
    const res = await invoke("sidebar", "mgmtGetConfig", []);
    if (res && res.ok && res.sidebar) {
        // 与默认值合并：文件缺键（历史整体替换丢失）时自动回填
        state.sbCfg = { sidebar: Object.assign({}, DEFAULT_SIDEBAR, res.sidebar) };
    } else {
        if (!state.sbCfg) {
            state.sbCfg = { sidebar: Object.assign({}, DEFAULT_SIDEBAR) };
        }
        toast((res && res.error) || "读取侧边栏配置失败，当前为本地编辑", "err");
    }
    fillSidebarForms();
    updateTitlePreviews();
    renderRowsList();
    sbxAutoPreview();
}

function fillSidebarForms() {
    const s = sbSidebar();
    const set = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v === undefined || v === null ? "" : v;
    };
    const chk = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(v);
    };
    chk("sbEnabled", s.enabled !== false);
    chk("sbDefaultShow", s.defaultShow !== false);
    set("sbServerName", s.serverName);
    set("sbRefreshMs", s.refreshIntervalMs);
    set("sbCycleMs", s.cycleIntervalMs);
    chk("sbCycle", s.cycleEnabled === true);
    set("sbTitleText", s.title);
    set("sbRankingTitle", s.rankingTitle);
}

function collectBasicForm() {
    const num = (id, fallback) => {
        const el = document.getElementById(id);
        const v = Number(el ? el.value : NaN);
        return isNaN(v) ? fallback : v;
    };
    const enabledEl = document.getElementById("sbEnabled");
    const cycleEl = document.getElementById("sbCycle");
    const serverEl = document.getElementById("sbServerName");
    return {
        enabled: enabledEl ? enabledEl.checked : true,
        serverName: (serverEl ? serverEl.value : "").trim() || "LuckyClover",
        refreshIntervalMs: Math.max(250, num("sbRefreshMs", 1000)),
        cycleIntervalMs: Math.max(5000, num("sbCycleMs", 15000)),
        cycleEnabled: cycleEl ? cycleEl.checked : false,
        defaultShow: document.getElementById("sbDefaultShow") ? document.getElementById("sbDefaultShow").checked : true,
    };
}

async function saveSidebarCfg(patch, successMsg, silent) {
    state.sbCfg = state.sbCfg || { sidebar: {} };
    state.sbCfg.sidebar = Object.assign({}, DEFAULT_SIDEBAR, state.sbCfg.sidebar, patch || {});
    const res = await invoke("sidebar", "mgmtSetConfig", [JSON.stringify({ sidebar: state.sbCfg.sidebar })]);
    if (res && res.ok) {
        if (!silent) toast(successMsg || "已保存", "ok");
    } else {
        toast((res && res.error) || "保存失败", "err");
    }
}

function currentRows() {
    const s = sbSidebar();
    return Array.isArray(s.lines) ? s.lines : [];
}

function rowType(value) {
    return value && typeof value === "object" && Array.isArray(value.frames) && value.frames.length
        ? "rotate"
        : "static";
}

function collectRowsFromDom() {
    const holder = document.getElementById("sbxRowsList");
    if (!holder) return;
    const items = holder.querySelectorAll(".row-item2");
    if (!items.length) return;
    const arr = [];
    items.forEach((item) => {
        if (item.dataset.type === "rotate") {
            const frames = Array.from(item.querySelectorAll(".frame-text")).map((el) => el.value);
            const iv = item.querySelector(".frame-interval");
            arr.push({
                type: "rotate",
                intervalMs: Math.max(500, Number(iv ? iv.value : 2000) || 2000),
                frames,
            });
        } else {
            const el = item.querySelector(".row-text2");
            arr.push(el ? el.value : "");
        }
    });
    sbSidebar().lines = arr;
}

function renderRowsList() {
    const holder = document.getElementById("sbxRowsList");
    if (!holder) return;
    const rows = currentRows();
    if (!rows.length) {
        holder.innerHTML = '<div class="empty">暂无行，点「＋ 静态」或「＋ 轮播」添加</div>';
        return;
    }
    holder.innerHTML = rows.map((value, i) => {
        const type = rowType(value);
        const badge = type === "rotate"
            ? `<span class="row-badge rot">轮播 ${value.frames.length}帧 ${Number(value.intervalMs) || 2000}ms</span>`
            : `<span class="row-badge">静态</span>`;
        const tools = `
            <div class="row-tools">
              <button class="btn btn-sm" data-act="sbx.rowUp" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="btn btn-sm" data-act="sbx.rowDown" data-i="${i}" ${i === rows.length - 1 ? "disabled" : ""}>↓</button>
              ${type === "rotate"
                  ? `<button class="btn btn-sm" data-act="sbx.toStatic" data-i="${i}">转静态</button>`
                  : `<button class="btn btn-sm" data-act="sbx.toRotate" data-i="${i}">转轮播</button>`}
              <button class="btn btn-sm btn-danger" data-act="sbx.rowDel" data-i="${i}">✕</button>
            </div>`;
        if (type === "rotate") {
            const frames = value.frames.map((f, fi) => `
              <input type="text" class="row-text2 frame-text" data-i="${i}" data-f="${fi}" value="${esc(f)}" placeholder="帧${fi + 1}（支持 {占位符}）">`).join("");
            return `
        <div class="row-item2" data-type="rotate" data-i="${i}">
          <div class="row-meta">${badge}${tools}</div>
          <div class="frames-list">${frames}</div>
          <div class="frame-ops">
            <label class="field-inline">间隔(ms)<input type="number" class="frame-interval" data-i="${i}" value="${Number(value.intervalMs) || 2000}" min="500" step="100"></label>
            <button class="btn btn-sm" data-act="sbx.frameAdd" data-i="${i}">＋帧</button>
          </div>
        </div>`;
        }
        return `
        <div class="row-item2" data-type="static" data-i="${i}">
          <div class="row-meta">${badge}${tools}</div>
          <input type="text" class="row-text2" data-i="${i}" value="${esc(value)}" placeholder="支持 {占位符}">
        </div>`;
    }).join("");
}

function updateTitlePreviews() {
    const t = document.getElementById("sbTitlePrev");
    const r = document.getElementById("sbRankPrev");
    const tv = (document.getElementById("sbTitleText") || {}).value;
    const rv = (document.getElementById("sbRankingTitle") || {}).value;
    if (t) t.innerHTML = mcText(tv || "§aLuckyClover");
    if (r) r.innerHTML = mcText(rv || "§6=== 在线时长排行 ===");
}

function mcText(raw) {
    const colors = {
        0: "#000000", 1: "#0000AA", 2: "#00AA00", 3: "#00AAAA",
        4: "#AA0000", 5: "#AA00AA", 6: "#FFAA00", 7: "#AAAAAA",
        8: "#555555", 9: "#5555FF", a: "#55FF55", b: "#55FFFF",
        c: "#FF5555", d: "#FF55FF", e: "#FFFF55", f: "#FFFFFF",
    };
    let color = "#FFFFFF";
    const parts = String(raw === null || raw === undefined ? "" : raw).split(/(§[0-9a-fA-Fr])/);
    let html = "";
    for (const part of parts) {
        if (!part) continue;
        if (/^§[0-9a-fA-Fr]$/.test(part)) {
            const code = part[1].toLowerCase();
            color = code === "r" ? "#FFFFFF" : (colors[code] || color);
            continue;
        }
        html += `<span style="color:${color}">${esc(part)}</span>`;
    }
    return html || " ";
}

function renderPreviewBox(title, lines) {
    const box = document.getElementById("sbPrevBox");
    if (!box) return;
    const n = lines.length;
    box.innerHTML = `
      <div class="sb-prev-title">${mcText(title)}</div>
      <div class="sb-prev-body">
        ${lines.map((line, i) => `
          <div class="sb-prev-row">
            <span class="sb-prev-text">${mcText(line)}</span>
            <span class="sb-prev-score">${n - i}</span>
          </div>`).join("")}
      </div>`;
}

async function sbxAutoPreview() {
    const box = document.getElementById("sbPrevBox");
    if (!box) return;
    const tplEl = document.getElementById("sbTpl");
    const nameEl = document.getElementById("sbPrevPlayer");
    const name = nameEl ? nameEl.value.trim() : "";
    const tpl = tplEl ? tplEl.value.trim() : "";

    if (tpl) {
        const res = await invoke("sidebar", "mgmtRenderTemplate", [JSON.stringify({ template: tpl, name })]);
        if (res && res.ok) {
            box.innerHTML = `<div class="sb-prev-title">${mcText(res.title || "")}</div><div class="sb-prev-row"><span class="sb-prev-text">${mcText(res.line)}</span></div>`;
        } else {
            box.innerHTML = `<div class="sb-prev-hint">预览失败：${esc((res && res.error) || "未知错误")}</div>`;
        }
        return;
    }

    const res = await invoke("sidebar", "mgmtRenderPreview", [JSON.stringify({ name })]);
    if (res && res.ok && Array.isArray(res.lines)) {
        renderPreviewBox(res.title !== undefined && res.title !== null ? res.title : (sbSidebar().title || ""), res.lines);
    } else {
        box.innerHTML = `<div class="sb-prev-hint">预览失败：${esc((res && res.error) || "未知错误")}</div>`;
    }
}


function observerCardHtml() {
    return `
    <div class="card auth-card">
      <div class="card-title" style="justify-content:center">👋 已登录（观察者）</div>
      <p class="hint">
        当前账号 <b>${esc(state.auth.name)}</b> 为<b>观察者</b>权限：<br>
        可以查看概览、参与每日签到；<b>管理配置仅限 OP 绑定的管理员账号</b>。<br>
        如需管理权限，请用游戏内 <b>OP</b> 账号执行 <kbd>/panel passwd 密码</kbd> 重新绑定后登录。
      </p>
      <div class="form-actions" style="justify-content:center">
        <button class="btn btn-danger" id="observerLogout">退出登录</button>
      </div>
    </div>`;
}

async function loadVipLevelOptions() {
    const sels = [document.getElementById("vipSetLevel"), document.getElementById("cdkLevel")].filter(Boolean);
    if (!sels.length) return;
    const res = await invoke("vip", "mgmtGetConfig", []);
    const levels = res && res.ok && res.vip && res.vip.levels ? res.vip.levels : null;
    if (!levels) {
        for (const sel of sels) {
            sel.innerHTML = '<option value="" disabled selected>读取套餐失败，请重进页面</option>';
        }
        return;
    }
    const opts = [];
    for (const id of Object.keys(levels)) {
        const lv = levels[id];
        if (!lv || typeof lv !== "object") continue;
        if ((Number(lv.price) || 0) <= 0) continue; // price=0 已下架，不列出
        opts.push(`<option value="${esc(id)}">${esc(lv.display || id)}</option>`);
    }
    const html = opts.length
        ? opts.join("")
        : '<option value="" disabled selected>没有可设置的套餐</option>';
    for (const sel of sels) {
        sel.innerHTML = html;
    }
}
function renderAdmin(view) {
    const isAdmin = state.auth.authed && state.auth.role === "admin";
    const isAuthed = state.auth.authed;
    const noAccessHtml = isAdmin ? null : (isAuthed ? observerCardHtml() : loginCardHtml());
    if (state.route === "adminSite") {
        view.innerHTML = adminShellHtml("site") + (isAdmin ? sitePageHtml() : noAccessHtml);
        wireAdminActions(view);
        if (isAdmin) fillSiteForm();
        return;
    }
    if (isAdmin) {
        view.innerHTML = adminShellHtml("plugins") + pluginTabsHtml() + adminSectionsHtml();
        wireAdminActions(view);
        switchPluginTab(state.pluginTab);
    } else {
        view.innerHTML = adminShellHtml("plugins") + noAccessHtml;
        wireAdminActions(view);
        const ob = view.querySelector("#observerLogout");
        if (ob) ob.addEventListener("click", logout);
    }
}