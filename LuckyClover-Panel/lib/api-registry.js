"use strict";

const NAMESPACE_MAP = Object.freeze({
    core: "LuckyCloverCore",
    vip: "LuckyCloverVIP",
    tpa: "LuckyCloverTPA",
    seat: "LuckyCloverSeat",
    sidebar: "LuckyCloverSidebar",
    mall: "LuckyCloverShoppingMall",
    guild: "LuckyCloverGuild",
});

const PUBLIC_MALL_METHODS = new Set([
    "mgmtOverview",
    "mgmtListOfficial",
    "mgmtListRecycle",
    "mgmtListShops",
    "mgmtGetShop",
    "mgmtListCategories",
]);

function createApiRegistry({ ll, safeJson }) {
    const importCache = {};

    function importMgmt(pluginKey, method) {
        const ns = NAMESPACE_MAP[pluginKey];
        if (!ns) return null;
        const cacheKey = `${ns}.${method}`;
        if (Object.prototype.hasOwnProperty.call(importCache, cacheKey)) return importCache[cacheKey];
        let fn = null;
        try {
            if (typeof ll.hasExported !== "function" || ll.hasExported(ns, method)) {
                const imported = ll.imports(ns, method);
                if (typeof imported === "function") fn = imported;
            }
        } catch (error) {
            fn = null;
        }
        if (fn) importCache[cacheKey] = fn;
        return fn;
    }

    function invokeAdmin(pluginKey, method, args) {
        if (!Object.prototype.hasOwnProperty.call(NAMESPACE_MAP, pluginKey)) {
            return { ok: false, error: `unknown plugin: ${pluginKey}` };
        }
        if (!/^mgmt[A-Za-z0-9]+$/.test(String(method || ""))) {
            return { ok: false, error: `method not allowed: ${method}` };
        }
        const fn = importMgmt(pluginKey, method);
        if (!fn) return { ok: false, error: `${NAMESPACE_MAP[pluginKey]} 未导出 ${method}（插件未安装或版本过旧）` };
        try {
            const list = Array.isArray(args) ? args : [];
            const raw = fn(...list);
            if (typeof raw === "string") {
                const parsed = safeJson(raw, null);
                if (parsed !== null && typeof parsed === "object" && parsed.ok === undefined) parsed.ok = true;
                return parsed !== null ? parsed : { ok: true, raw };
            }
            if (raw !== null && typeof raw === "object" && raw.ok === undefined) {
                return Object.assign({}, raw, { ok: true });
            }
            return { ok: true, data: raw };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    }

    function invokePublicMall(method, args) {
        if (!PUBLIC_MALL_METHODS.has(method)) return { ok: false, error: "商城查询接口不允许此操作" };
        return invokeAdmin("mall", method, args);
    }

    return { importMgmt, invokeAdmin, invokePublicMall, namespaceMap: NAMESPACE_MAP };
}

module.exports = { createApiRegistry, NAMESPACE_MAP, PUBLIC_MALL_METHODS };
