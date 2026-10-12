"use strict";

/**
 * In-memory panel sessions.
 *
 * The manager owns session storage and dynamic role resolution so request
 * handlers cannot accidentally rely on a stale role snapshot.
 */
function createSessionManager({ resolveXuid, isCurrentOp }) {
    const sessions = new Map();

    function getStatus(browserId) {
        const session = sessions.get(browserId);
        if (!session) {
            return { authed: false, name: "", role: "guest" };
        }
        const xuid = resolveXuid(session.name) || session.xuid || "";
        if (session.xuid && xuid && session.xuid !== xuid) {
            sessions.delete(browserId);
            return { authed: false, name: "", role: "guest" };
        }
        return {
            authed: true,
            name: session.name,
            xuid,
            role: isCurrentOp(session.name, xuid) ? "admin" : "player",
        };
    }

    function set(browserId, account) {
        sessions.set(browserId, {
            name: String(account.name || ""),
            xuid: String(account.xuid || ""),
            authedAt: Date.now(),
        });
    }

    function destroy(browserId) {
        sessions.delete(browserId);
    }

    return { getStatus, set, destroy };
}

module.exports = { createSessionManager };
