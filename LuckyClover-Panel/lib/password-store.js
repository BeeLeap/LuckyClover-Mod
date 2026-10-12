"use strict";

/**
 * Password persistence and verification for the panel's in-game password
 * flow. File access and crypto are injected to keep this module testable.
 */
function createPasswordStore({ filePath, fs, crypto, logger }) {
    function load() {
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                return data && typeof data === "object" ? data : {};
            }
        } catch (error) {
            logger.warn(`读取 passwords.json 失败: ${error}`);
        }
        return {};
    }

    function save(db) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(db, null, 4), "utf8");
            return true;
        } catch (error) {
            logger.warn(`写入 passwords.json 失败: ${error}`);
            return false;
        }
    }

    function hash(password, salt) {
        return crypto.pbkdf2Sync(String(password), String(salt), 120000, 32, "sha256").toString("hex");
    }

    function setForPlayer(player, password) {
        const realName = String(player.realName || player.name || "");
        const key = realName.toLowerCase();
        if (!key) return false;
        const db = load();
        const salt = crypto.randomBytes(16).toString("hex");
        db[key] = {
            name: realName,
            salt,
            hash: hash(password, salt),
            xuid: String(player.xuid || ""),
            // Kept for backwards compatibility; authorization resolves live.
            role: (typeof player.isOP === "function" && player.isOP()) ? "admin" : "player",
            updatedAt: Date.now(),
        };
        return save(db);
    }

    function clearForPlayer(player) {
        const key = String(player.realName || player.name || "").toLowerCase();
        const db = load();
        if (!db[key]) return false;
        delete db[key];
        return save(db);
    }

    function verify(username, password) {
        const key = String(username || "").trim().toLowerCase();
        if (!key) return null;
        const rec = load()[key];
        if (!rec || !rec.salt || !rec.hash) return null;
        try {
            const calc = Buffer.from(hash(password, rec.salt), "hex");
            const expect = Buffer.from(String(rec.hash), "hex");
            if (calc.length !== expect.length || !crypto.timingSafeEqual(calc, expect)) {
                return null;
            }
            return { name: String(rec.name || key), xuid: String(rec.xuid || "") };
        } catch (error) {
            return null;
        }
    }

    return { load, setForPlayer, clearForPlayer, verify };
}

module.exports = { createPasswordStore };
