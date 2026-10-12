"use strict";

function createHttpSecurity(config) {
    function publicOverview(overview) {
        const server = overview && overview.server ? overview.server : {};
        return {
            ok: true,
            serverName: overview && overview.serverName,
            version: overview && overview.version,
            server: {
                online: Number(server.online) || 0,
                maxPlayers: server.maxPlayers,
            },
            players: [],
        };
    }

    function getCorsOrigin(req) {
        const origin = String(req && req.headers && req.headers.origin || "").trim();
        if (!origin) return "";
        const allowed = Array.isArray(config.corsOrigins)
            ? config.corsOrigins.map((item) => String(item || "").replace(/\/$/, "")) : [];
        if (config.publicUrl) {
            try { allowed.push(new URL(String(config.publicUrl)).origin); } catch (error) { /* invalid publicUrl */ }
        }
        return allowed.includes(origin) ? origin : "";
    }

    function sendJson(res, status, body) {
        const headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Headers": "Content-Type, X-Panel-Session",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        };
        const origin = getCorsOrigin(res._panelRequest);
        if (origin) {
            headers["Access-Control-Allow-Origin"] = origin;
            headers.Vary = "Origin";
        }
        res.writeHead(status, headers);
        res.end(JSON.stringify(body));
    }

    return { publicOverview, getCorsOrigin, sendJson };
}

module.exports = { createHttpSecurity };
