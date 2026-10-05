/// <reference path="../../SparkBridgeDevelopTool/index.d.ts"/>

// ==========================================
// 签到系统插件 - Sign Pro (SB3.0)
// 作者：I IKUN2004
// ==========================================

const msgbuilder = require("../../handles/msgbuilder");
const packbuilder = require("../../handles/packbuilder");
const JSON5 = require("json5");

let gmoney;
try {
    gmoney = require('./gmoney');
} catch (e) {
    console.warn('[Sign Pro] 未找到 gmoney 模块，签到发钱功能将不可用！');
}

const _config = spark.getFileHelper("SignPro");
const logger = spark.getLogger();
const GAME_PREFIX = "§d[IK签到]§r ";  

function getGroup() {
    let g = spark.env.get("main_group");
    return g ? Number(g) : 0;
}

function getAdmins() {
    let a = spark.env.get("admin_qq");
    return Array.isArray(a) ? a : (a ? [a] : []);
}

function safeGetXbox(qq) {
    let wl_api = spark.env.get('mc');
    if (wl_api && typeof wl_api.getXbox === 'function') {
        let info = wl_api.getXbox(qq);
        return info ? info.xbox : null;
    }
    return null;
}

let config = {
    plugin: {
        economy: { type: "llmoney", name: "金币" },
        signReward: {
            base: 1000,
            continuous: [
                { days: 3, reward: 1500 },
                { days: 6, reward: 2500 },
                { days: 9, reward: 3000 }
            ],
            weekReward: 2800,
            monthReward: 2000,
            fullMonthMin: 18888,
            fullMonthMax: 38888
        },
        luckyBonus: {
            enabled: true,
            chance: 0.15,
            min: 500,
            max: 1500,
            distribution: { "50-100": 0.6, "101-300": 0.3, "301-500": 0.1 }
        },
        punishment: { banTime: 60, allowPunish: true },
        features: { autoInit: true, streakProtect: true, debug: false, joinTip: true },
        reply: { simpleMode: true, showAvatar: true }
    }
};

const defaultUserData = {
    nickname: "", balance: 0, continuousDays: 0, totalDays: 0,
    lastSignDate: null, streakRecord: 0, luckyCount: 0, luckyTotal: 0,
    hasStreakProtect: true, lastProtectDate: null, xuid: null, playerName: null
};

function mergeDefaults(target, defaults) {
    if (!target || typeof target !== "object") return JSON.parse(JSON.stringify(defaults));
    for (const key of Object.keys(defaults)) {
        const defaultValue = defaults[key];
        if (target[key] === undefined) {
            target[key] = JSON.parse(JSON.stringify(defaultValue));
        } else if (
            defaultValue
            && typeof defaultValue === "object"
            && !Array.isArray(defaultValue)
            && target[key]
            && typeof target[key] === "object"
            && !Array.isArray(target[key])
        ) {
            mergeDefaults(target[key], defaultValue);
        }
    }
    return target;
}

function setConfigValue(path, value) {
    const legacyPathMap = {
        economyType: "plugin.economy.type",
        economyName: "plugin.economy.name",
        baseReward: "plugin.signReward.base",
        fullMonthMin: "plugin.signReward.fullMonthMin",
        fullMonthMax: "plugin.signReward.fullMonthMax",
        luckyBonusEnabled: "plugin.luckyBonus.enabled",
        luckyChance: "plugin.luckyBonus.chance",
        simpleMode: "plugin.reply.simpleMode",
        showAvatar: "plugin.reply.showAvatar",
        joinTip: "plugin.features.joinTip",
    };
    path = legacyPathMap[path] || path;
    const keys = String(path || "").split(".");
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
        obj = obj[keys[i]];
    }

    const last = keys[keys.length - 1];
    if (path === "plugin.luckyBonus.chance") {
        obj[last] = Number(value) / 100;
    } else if (
        path === "plugin.signReward.base"
        || path === "plugin.signReward.fullMonthMin"
        || path === "plugin.signReward.fullMonthMax"
    ) {
        obj[last] = Number(value);
    } else {
        obj[last] = value;
    }
}

_config.initFile("config.json", config, false);
_config.initFile("data.json", {});
config = JSON5.parse(_config.getFile("config.json"));
config = mergeDefaults(config, {
    plugin: {
        economy: { type: "llmoney", name: "金币" },
        signReward: {
            base: 1000,
            continuous: [
                { days: 3, reward: 1500 },
                { days: 6, reward: 2500 },
                { days: 9, reward: 3000 }
            ],
            weekReward: 2800,
            monthReward: 2000,
            fullMonthMin: 18888,
            fullMonthMax: 38888
        },
        luckyBonus: {
            enabled: true,
            chance: 0.15,
            min: 500,
            max: 1500,
            distribution: { "50-100": 0.6, "101-300": 0.3, "301-500": 0.1 }
        },
        punishment: { banTime: 60, allowPunish: true },
        features: { autoInit: true, streakProtect: true, debug: false, joinTip: true },
        reply: { simpleMode: true, showAvatar: true }
    }
});
_config.updateFile("config.json", config);

spark.web.createConfig("SignPro")
    .select("plugin.economy.type", config.plugin.economy.type, ["llmoney", "score"], "经济系统类型")
    .text("plugin.economy.name", config.plugin.economy.name, "货币名称/计分板名称")
    .number("plugin.signReward.base", config.plugin.signReward.base, "基础签到奖励")
    .number("plugin.signReward.fullMonthMin", config.plugin.signReward.fullMonthMin, "全勤最小奖励")
    .number("plugin.signReward.fullMonthMax", config.plugin.signReward.fullMonthMax, "全勤最大奖励")
    .switch("plugin.luckyBonus.enabled", config.plugin.luckyBonus.enabled, "启用幸运奖励")
    .number("plugin.luckyBonus.chance", config.plugin.luckyBonus.chance * 100, "幸运奖励触发概率(%)")
    .switch("plugin.reply.simpleMode", config.plugin.reply.simpleMode, "简单回复模式")
    .switch("plugin.reply.showAvatar", config.plugin.reply.showAvatar, "显示头像")
    .switch("plugin.features.joinTip", config.plugin.features.joinTip, "进服提示开关")
    .register();

spark.on("config.update.SignPro", (key, value) => {
    try {
        setConfigValue(key, value);
        _config.updateFile("config.json", config);
        logger.info(`[SignPro] 配置已更新: ${key}=${value}`);
    } catch (error) {
        logger.error(`[SignPro] 配置更新失败: ${key} ${error.stack || error}`);
    }
});

function getUserData(userId) {
    let data = JSON5.parse(_config.getFile("data.json"));
    if (!data[userId]) {
        if (config.plugin.features.autoInit) {
            data[userId] = JSON.parse(JSON.stringify(defaultUserData));
            _config.updateFile("data.json", data);
        } else {
            return null;
        }
    }
    return data[userId];
}

function saveUserData(userId, userData) {
    let data = JSON5.parse(_config.getFile("data.json"));
    data[userId] = userData;
    _config.updateFile("data.json", data);
}

function getCurrentDate() {
    const d = new Date();
    const localTime = d.getTime();
    const localOffset = d.getTimezoneOffset() * 60000;
    const bd = new Date(localTime + localOffset + (3600000 * 8));
    return `${bd.getFullYear()}-${String(bd.getMonth()+1).padStart(2,'0')}-${String(bd.getDate()).padStart(2,'0')}`;
}

function getMonthStatus() {
    const d = new Date();
    const localTime = d.getTime();
    const localOffset = d.getTimezoneOffset() * 60000;
    const bd = new Date(localTime + localOffset + (3600000 * 8));
    const year = bd.getFullYear(), month = bd.getMonth() + 1, day = bd.getDate();
    const daysInMonth = new Date(year, month, 0).getDate();
    return { isLastDay: (day === daysInMonth), daysInMonth: daysInMonth };
}

function isYesterday(date1, date2) {
    try {
        const d1 = new Date(date1).setHours(0,0,0,0);
        const d2 = new Date(date2).setHours(0,0,0,0);
        return Math.round((d1 - d2) / (24 * 60 * 60 * 1000)) === 1;
    } catch (error) { return false; }
}

function daysBetween(dateStr1, dateStr2) {
    const d1 = new Date(dateStr1).setHours(0,0,0,0);
    const d2 = new Date(dateStr2).setHours(0,0,0,0);
    return Math.round((d1 - d2) / (24 * 60 * 60 * 1000));
}

function getDisplayNameStr(xuid, realName) {
    let nick = null;
    try {
        if (ll.hasExported("nickname", "getName")) nick = ll.import("nickname", "getName")(xuid);
    } catch (e) {}
    if (nick && nick !== "未命名") return `§e${nick} §r§f(${realName})§r`;
    return `§e${realName}§r`;
}

function getPlayerInfo(userId, player = null) {
    try {
        const currentPlayerName = safeGetXbox(userId);
        if (!currentPlayerName && (!player || !player.isGuest)) return { success: false, message: "未绑定游戏ID！请先在群里使用“绑定 游戏ID”" };

        let userData = getUserData(userId);
        if (userData && currentPlayerName && userData.playerName !== currentPlayerName) {
            userData.playerName = currentPlayerName;
            saveUserData(userId, userData);
        }

        let xuid = null;
        if (player && player.xuid) {
            xuid = player.xuid;
        } else if (typeof data !== 'undefined' && data.name2xuid && currentPlayerName) {
            xuid = data.name2xuid(currentPlayerName);
        }

        if (!xuid) {
            if (userData && userData.xuid) xuid = userData.xuid;
            else return { success: false, message: "无法获取XUID，请进入服务器刷新" };
        }

        if (userData && userData.xuid !== xuid) {
            userData.xuid = xuid;
            saveUserData(userId, userData);
        }
        return { success: true, playerName: currentPlayerName || (player ? player.realName : ""), xuid, userId, isGuest: !currentPlayerName && player };
    } catch (error) { return { success: false, message: error.message }; }
}

function getRealTimeBalance(playerInfo) {
    try {
        if (!playerInfo || !playerInfo.success || !gmoney) return 0;
        const economy = new gmoney(config.plugin.economy.type, config.plugin.economy.name);
        return economy.get(playerInfo.xuid);
    } catch (error) { return 0; }
}

function getLuckyBonus() {
    const luckyConfig = config.plugin.luckyBonus;
    if (!luckyConfig.enabled) return { amount: 0, type: "none" };
    if (Math.random() > luckyConfig.chance) return { amount: 0, type: "none" };
    
    const levelRandom = Math.random();
    let cumulativeProb = 0;
    let amount = 0;
    let type = "small";
    let index = 0;
    const types = ["small", "medium", "large"]; 
    

    for (const [rangeStr, prob] of Object.entries(luckyConfig.distribution)) {
        cumulativeProb += prob;
        if (levelRandom <= cumulativeProb) {

            const parts = rangeStr.split("-");
            const min = parseInt(parts[0], 10);
            const max = parseInt(parts[1], 10);
            

            amount = Math.floor(Math.random() * (max - min + 1)) + min;
            type = types[index] || "large";
            break;
        }
        index++;
    }

    if (amount === 0) {
        amount = Math.floor(Math.random() * (luckyConfig.max - luckyConfig.min + 1)) + luckyConfig.min;
        type = "small";
    }
    
    return { amount, type };
}

function getContinuousReward(continuousDays) {
    let reward = config.plugin.signReward.base;
    for (const bonus of config.plugin.signReward.continuous) {
        if (continuousDays % bonus.days === 0) { reward = bonus.reward; break; }
    }
    if (continuousDays % 7 === 0) reward += config.plugin.signReward.weekReward;
    if (continuousDays % 30 === 0) reward += config.plugin.signReward.monthReward;
    return reward;
}

function addMoneyAndGetBalance(userId, amount, playerInfo) {
    try {
        if (!playerInfo || !playerInfo.success) return { success: false, message: "玩家信息缺失" };
        if (!gmoney) return { success: false, message: "经济系统未加载" };

        const economy = new gmoney(config.plugin.economy.type, config.plugin.economy.name);
        const oldBalance = economy.get(playerInfo.xuid);
        if (economy.add(playerInfo.xuid, amount)) {
            const newBalance = economy.get(playerInfo.xuid);
            const userData = getUserData(userId);
            if (userData) { userData.balance = newBalance; saveUserData(userId, userData); }
            return { success: true, oldBalance, newBalance, added: amount };
        } else {
            return { success: false, message: "经济操作失败" };
        }
    } catch (error) { return { success: false, message: error.message }; }
}

function processSign(userId, nickname, playerInfo) {
    const userData = getUserData(userId);
    if (!userData) return { code: 'ERROR', message: '用户数据未初始化' };
    if (userData.nickname !== nickname) userData.nickname = nickname;
    
    const today = getCurrentDate();
    if (userData.lastSignDate === today) return { code: 'ALREADY_SIGNED' };
    if (!playerInfo.isGuest && !playerInfo.success) return { code: 'NO_BIND', message: playerInfo.message };

    let crossMonthReset = false;
    if (userData.lastSignDate) {
        if (userData.lastSignDate.substring(0, 7) !== today.substring(0, 7)) {
            userData.continuousDays = 0; crossMonthReset = true;
        }
    }

    let continuousDays = 1, isStreakBroken = false, protectUsed = false;
    if (playerInfo.isGuest) continuousDays = 0;
    else {
        if (!crossMonthReset && userData.lastSignDate) {
            if (isYesterday(today, userData.lastSignDate)) continuousDays = userData.continuousDays + 1;
            else {
                if (userData.hasStreakProtect && (!userData.lastProtectDate || !isYesterday(today, userData.lastProtectDate)) && config.plugin.features.streakProtect) {
                    continuousDays = userData.continuousDays + 1;
                    userData.hasStreakProtect = false; userData.lastProtectDate = today; protectUsed = true;
                } else isStreakBroken = true;
            }
        }
    }

    const monthInfo = getMonthStatus();
    let isFullMonth = false, finalRewardAmount = 0, luckyBonus = { amount: 0, type: "none" };

    if (playerInfo.isGuest) finalRewardAmount = 888;
    else {
        if (monthInfo.isLastDay && continuousDays >= monthInfo.daysInMonth) {
            isFullMonth = true;
            finalRewardAmount = Math.floor(Math.random() * (config.plugin.signReward.fullMonthMax - config.plugin.signReward.fullMonthMin + 1)) + config.plugin.signReward.fullMonthMin;
            userData.continuousDays = 0; 
        } else {
            userData.continuousDays = continuousDays;
            luckyBonus = getLuckyBonus();
            finalRewardAmount = getContinuousReward(continuousDays) + luckyBonus.amount;
        }
    }

    userData.totalDays++;
    userData.lastSignDate = today;
    userData.playerName = playerInfo.playerName;
    userData.xuid = playerInfo.xuid;

    if (!playerInfo.isGuest) {
        if (continuousDays > userData.streakRecord && !isFullMonth) userData.streakRecord = continuousDays;
        else if (isFullMonth && monthInfo.daysInMonth > userData.streakRecord) userData.streakRecord = monthInfo.daysInMonth;
        if (luckyBonus.amount > 0) { userData.luckyCount++; userData.luckyTotal += luckyBonus.amount; }
    }

    const addResult = addMoneyAndGetBalance(userId, finalRewardAmount, playerInfo);
    if (addResult.success) {
        userData.balance = addResult.newBalance;
        saveUserData(userId, userData);
        return { code: 'SUCCESS', data: { nickname, isFullMonth, monthInfo, finalRewardAmount, continuousDays, totalDays: userData.totalDays, luckyBonus, newBalance: addResult.newBalance, protectUsed, isStreakBroken, isGuest: playerInfo.isGuest || false } };
    } else return { code: 'ERROR', message: addResult.message };
}

function signCountRanking(type = "continuous", sendReply) {
    try {
        const data = JSON5.parse(_config.getFile("data.json"));
        const today = getCurrentDate();
        const activeUsers = Object.entries(data).filter(([_, u]) => u.totalDays > 0 && u.lastSignDate && daysBetween(today, u.lastSignDate) <= 3)
            .map(([userId, u]) => ({ userId, nickname: u.nickname || `用户${userId}`, value: type === "continuous" ? u.continuousDays : u.totalDays, luckyCount: u.luckyCount || 0 }))
            .sort((a, b) => b.value - a.value);

        if (activeUsers.length === 0) { sendReply("📭 暂无活跃签到数据"); return; }

        let message = `${type === "continuous" ? "🏆 连续签到榜" : "📊 累计签到榜"} (近3天活跃)\n══════════════\n`;
        const emojis = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        activeUsers.slice(0, 10).forEach((user, index) => {
            message += `${emojis[index] || `${index + 1}.`} ${user.nickname} - ${user.value}天${user.luckyCount > 0 ? ` 🍀${user.luckyCount}` : ""}\n`;
        });
        message += `\n📅 更新日期：${today}`;
        sendReply(message);
    } catch (error) { sendReply("❌ 排行榜生成失败"); }
}

function handleSignForGame(player, userId, nickname) {
    let playerInfo = !userId ? { success: true, isGuest: true, xuid: player.xuid, playerName: player.realName, userId: player.xuid } : getPlayerInfo(userId, player);
    const result = processSign(!userId ? playerInfo.userId : userId, nickname, playerInfo);
    
    switch (result.code) {
        case 'SUCCESS': {
            const data = result.data;
            let reply = ['§e══════════ 签到成功 ══════════', `§b玩家: §f${data.nickname}`];
            if (data.isGuest) reply.push(`§e游客签到: §a+888 金币`);
            else if (data.isFullMonth) {
                reply.push(`§e恭喜达成月度全勤！`, `§6本月全勤 ${data.monthInfo.daysInMonth} 天`, `§a全勤大奖: §g+${data.finalRewardAmount} §a金币`);
            } else {
                reply.push(`§e连续签到: §f${data.continuousDays} 天  §7(累计 ${data.totalDays} 天)`);
                if (data.luckyBonus.amount > 0) reply.push(`${data.luckyBonus.type === 'small' ? '§a' : (data.luckyBonus.type === 'medium' ? '§e' : '§d')}幸运暴击: §g+${data.luckyBonus.amount} §f金币`);
                reply.push(`§a获得奖励: §g+${data.finalRewardAmount} §a金币`);
            }
            reply.push(`§b当前余额: §g${data.newBalance} §b金币`);
            if (data.protectUsed) reply.push('§7已使用断签保护');
            if (data.isStreakBroken) reply.push('§c连续签到已中断');
            reply.push('§e═════════════════════════');
            player.tell(reply.join('\n'));
            mc.runcmdEx(`playsound random.levelup "${player.realName}"`);
            break;
        }
        case 'ALREADY_SIGNED': player.tell(GAME_PREFIX + '§e今天已经签到过了，明天再来吧！'); break;
        case 'NO_BIND': player.tell(GAME_PREFIX + '§c' + result.message); break;
        case 'ERROR': player.tell(GAME_PREFIX + '§c签到失败: ' + result.message); break;
        default: player.tell(GAME_PREFIX + '§c未知错误');
    }
}

function querySignInfoForGame(player, userId, nickname) {
    const userData = getUserData(userId);
    if (!userData) { player.tell(GAME_PREFIX + '§c暂无数据'); return; }
    const playerInfo = getPlayerInfo(userId, player);
    let realTimeBalance = playerInfo.success ? getRealTimeBalance(playerInfo) : userData.balance;
    if (playerInfo.success && userData.balance !== realTimeBalance) { userData.balance = realTimeBalance; saveUserData(userId, userData); }
    
    player.tell(GAME_PREFIX + "\n" + [
        `§b玩家: §f${nickname}`, `§b游戏ID: §f${playerInfo.success ? playerInfo.playerName : "未绑定"}`,
        `§a余额: §g${realTimeBalance}§a金币 (实时)`, `§a连续: §e${userData.continuousDays}天  §7(累计 ${userData.totalDays}天)`,
        `§a最高: §e${userData.streakRecord}天`, `§a幸运: §e${userData.luckyCount}次 / §g${userData.luckyTotal}§a金币`,
        `§a上次: §e${userData.lastSignDate || "从未签到"}`, userData.hasStreakProtect ? "§a断签保护: 可用" : "§c断签保护: 已用"
    ].join("\n"));
}

function findUserIdByXuid(xuid) {
    let data = JSON5.parse(_config.getFile("data.json"));
    for (let userId in data) if (data[userId].xuid === xuid) return userId;
    return null;
}

function findUserIdByPlayerName(playerName) {
    let data = JSON5.parse(_config.getFile("data.json"));
    for (let userId in data) if (data[userId].playerName === playerName) return userId;
    return null;
}

function getRankDataString(type) {
    try {
        const data = JSON5.parse(_config.getFile("data.json")), today = getCurrentDate();
        let rankContent = `§7┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n\n`;

        if (type === "continuous") {
            const activeUsers = Object.entries(data).filter(([_, u]) => u.totalDays > 0 && u.lastSignDate && daysBetween(today, u.lastSignDate) <= 3)
                .map(([_, u]) => ({ name: u.playerName || u.nickname || "神秘玩家", days: u.continuousDays })).sort((a, b) => b.days - a.days);
            if (activeUsers.length === 0) rankContent += `  §8> 暂无数据\n`;
            else activeUsers.slice(0, 10).forEach((u, i) => {
                let color = i === 0 ? "§e" : (i === 1 ? "§6" : (i === 2 ? "§c" : "§8"));
                rankContent += `  ${color}[${i + 1}] §f${u.name} §8- §g${u.days} §f天\n`;
            });
        } else if (type === "lucky") {
            const luckyUsers = Object.entries(data).filter(([_, u]) => u.luckyCount > 0)
                .map(([_, u]) => ({ name: u.playerName || u.nickname || "神秘玩家", count: u.luckyCount, total: u.luckyTotal })).sort((a, b) => b.total - a.total); 
            if (luckyUsers.length === 0) rankContent += `  §8> 暂无数据\n`;
            else luckyUsers.slice(0, 10).forEach((u, i) => {
                let color = i === 0 ? "§e" : (i === 1 ? "§6" : (i === 2 ? "§c" : "§8"));
                rankContent += `  ${color}[${i + 1}] §f${u.name} §8- §a${u.count}§f次 §8(共§g${u.total}§8金)\n`;
            });
        }
        return rankContent + `\n§7┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n  §8▶ 数据实时同步自服务器数据库`;
    } catch (err) { return "§c数据读取失败..."; }
}

function openRankForm(player, type) {
    const fm = mc.newSimpleForm();
    fm.setTitle(type === "continuous" ? "§l§0 连签风云榜 " : "§l§0 幸运欧皇榜 ");
    fm.setContent(getRankDataString(type));
    fm.addButton('§l§2  返 回 主 页  \n§r§8[ 点击回到签到中心 ]', 'textures/ui/refresh_light');
    fm.addButton('§l§c  关 闭 面 板  \n§r§8[ 退出 ]', 'textures/ui/cancel');

    player.sendForm(fm, (p, id) => {
        if (id === 0) { mc.runcmdEx(`playsound random.click "${p.realName}"`); openSignMainForm(p); }
        else if (id === 1) mc.runcmdEx(`playsound random.click "${p.realName}"`);
    });
}

function openSignMainForm(player) {
    const xuid = player.xuid, xboxName = player.realName, displayChineseName = getDisplayNameStr(xuid, xboxName); 
    let userId = findUserIdByXuid(xuid) || findUserIdByPlayerName(xboxName);
    let userData = userId ? getUserData(userId) : null;
    let alreadySigned = userData ? (userData.lastSignDate === getCurrentDate()) : false;
    let currentStreak = userData ? (userData.continuousDays || 0) : 0; 

    const fm = mc.newSimpleForm();
    fm.setTitle("§l§0 星辰签到中心 "); 

    if (alreadySigned) {
        fm.setContent(`§7┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n  §8[§7 玩 家 档 案 §8] §f${displayChineseName}\n  §8[§7 签 到 状 态 §8] §a今日已打卡\n§7┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n\n  §a ✚ §f您今天已经成功领取了补给！\n\n${userId ? `  §e ✦ §f当前连续打卡：§g${currentStreak} §f天\n` : `  §c ✖ §f当前状态：游客 (请前往群聊绑定)\n`}  §8 ▪ §f明天也要记得按时来领福利哦~\n\n§7┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n  §8▶ 请点击下方按钮查看排行或关闭。`);
        fm.addButton('§l§2  确 认 关 闭  \n§r§8[ 退出签到中心 ]', 'textures/ui/confirm');
        fm.addButton('§l§e  连 签 风 云 榜  \n§r§8[ 查看服务器肝帝 ]', 'textures/items/gold_nugget');
        fm.addButton('§l§d  幸 运 欧 皇 榜  \n§r§8[ 查看脸白玩家 ]', 'textures/items/emerald');
    } else {
        const reward = config.plugin.signReward, lucky = config.plugin.luckyBonus;
        let continuousDesc = reward.continuous.map(i => `§e${i.days}§f天/§g${i.reward}`).join(' §8| ');
        fm.setContent(`§7┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n  §8[§7 玩 家 档 案 §8] §f${displayChineseName}\n  §8[§7 账 号 状 态 §8] ${!userId ? "§c[游客 - 未绑定QQ]" : "§a[已绑定]"}\n§7┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n\n  §l§e✦ 今 日 奖 励 预 览 ✦§r\n\n  §g ◆ §f基础薪资: §g${reward.base} §f金币\n  §b ↗ §f连签加成: ${continuousDesc}\n  §d ★ §f七日周奖: §g+${reward.weekReward} §f金币\n  §6 ♛ §f全勤大奖: 月底瓜分 §g${reward.fullMonthMin}§f~§g${reward.fullMonthMax} §f金币\n  §a ✤ §f幸运暴击: §o§7${Math.round(lucky.chance * 100)}% 概率获 ${lucky.min}~${lucky.max} 金币§r\n\n§7┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n${userId ? `  §8▶ 您的当前连签进度：§e${currentStreak} §8天\n` : `  §c▶ ⚠ 游客固定获 888 金币，绑定解锁全额！\n`}`);
        fm.addButton('§l§2  立 即 签 到  \n§r§8[ 点击领取今日福利 ]', 'textures/items/gold_ingot');
        fm.addButton('§l§c  暂 不 签 到  \n§r§8[ 退出签到中心 ]', 'textures/ui/cancel');
        fm.addButton('§l§6  连 签 风 云 榜  \n§r§8[ 查看本服肝帝 ]', 'textures/items/gold_nugget');
        fm.addButton('§l§d  幸 运 欧 皇 榜  \n§r§8[ 查看脸白玩家 ]', 'textures/items/emerald');
    }

    player.sendForm(fm, (p, id) => {
        if (id === null) return; 
        if (alreadySigned) {
            if (id === 0) mc.runcmdEx(`playsound random.click "${p.realName}"`);
            if (id === 1) { mc.runcmdEx(`playsound random.click "${p.realName}"`); openRankForm(p, "continuous"); }
            if (id === 2) { mc.runcmdEx(`playsound random.click "${p.realName}"`); openRankForm(p, "lucky"); }
        } else {
            if (id === 0) handleSignForGame(p, findUserIdByXuid(p.xuid) || findUserIdByPlayerName(p.realName), p.realName);
            if (id === 1) mc.runcmdEx(`playsound random.click "${p.realName}"`);
            if (id === 2) { mc.runcmdEx(`playsound random.click "${p.realName}"`); openRankForm(p, "continuous"); }
            if (id === 3) { mc.runcmdEx(`playsound random.click "${p.realName}"`); openRankForm(p, "lucky"); }
        }
    });
}

spark.on("message.group.normal", (event, sendReply) => {
    const { raw_message: message, group_id: groupId, user_id: userId, sender } = event;
    if (groupId != getGroup()) return;
    
    const nickname = sender.card || sender.nickname || `用户${userId}`;
    const trimmedMsg = message.trim();
    
    if (trimmedMsg === "签到") {
        const result = processSign(userId, nickname, getPlayerInfo(userId));
        if (result.code === 'SUCCESS') {
            const data = result.data;
            if (data.isFullMonth) {
                sendReply(`🎉 ${data.nickname} 达成月度全勤！\n📅 本月共 ${data.monthInfo.daysInMonth} 天已全部打卡！\n🎁 获得大奖：${data.finalRewardAmount} 金币\n💎 当前余额：${data.newBalance} 金币\n🔄 连续签到已重置，明天开始新征程！`);
            } else {
                let replyStr = config.plugin.reply.simpleMode ? 
                    `🎉 ${data.nickname} 签到成功！\n💰 获得 ${data.finalRewardAmount}金币 (连续${data.continuousDays}天)\n💎 余额：${data.newBalance}金币` :
                    `🎉 签到成功\n👤 ${data.nickname}\n💰 获得 ${data.finalRewardAmount}金币\n📈 连续 ${data.continuousDays}天 / 累计 ${data.totalDays}天\n💎 余额：${data.newBalance}金币`;
                if (data.luckyBonus.amount > 0) replyStr += `\n🍀 幸运加成 +${data.luckyBonus.amount}金币`;
                if (data.protectUsed) replyStr += "\n🛡️ 已使用断签保护";
                if (data.isStreakBroken) replyStr += "\n💔 连续签到已中断";
                sendReply(replyStr);
            }
        } else if (result.code === 'ALREADY_SIGNED') sendReply("✅ 您今天已经签到过了");
        else if (result.code === 'NO_BIND') sendReply("❌ " + result.message);
        else sendReply("❌ 签到异常: " + result.message);
    }
    
    else if (trimmedMsg === "查询签到" || trimmedMsg === "签到查询") {
        const userData = getUserData(userId);
        if (!userData) { sendReply("❌ 查无数据"); return; }
        const playerInfo = getPlayerInfo(userId);
        let realBal = playerInfo.success ? getRealTimeBalance(playerInfo) : userData.balance;
        
        const infoMsg = [
            `👤 ${nickname}`, `🎮 ${playerInfo.success ? playerInfo.playerName : "未绑定"}`, `💰 余额：${realBal} 金币 (实时)`,
            `📈 连续 ${userData.continuousDays}天 | 📊 累计 ${userData.totalDays}天`, `🏆 最高 ${userData.streakRecord}天`,
            `🍀 幸运触发 ${userData.luckyCount}次`, `📅 上次签到：${userData.lastSignDate || "从未签到"}`
        ].join("\n");
        
        if (config.plugin.reply.showAvatar) sendReply([msgbuilder.img(`https://q2.qlogo.cn/headimg_dl?dst_uin=${userId}@qq.com&spec=100`), "\n", infoMsg]);
        else sendReply(infoMsg);
    }
    
    else if (trimmedMsg === "签到排行" || trimmedMsg === "连续排行") signCountRanking("continuous", sendReply);
    else if (trimmedMsg === "累计排行") signCountRanking("total", sendReply);
    else if (trimmedMsg === "幸运排行") {
        const data = JSON5.parse(_config.getFile("data.json"));
        const luckyUsers = Object.entries(data).filter(([_, u]) => u.luckyCount > 0).map(([uid, u]) => ({ nickname: u.nickname || `用户${uid}`, luckyCount: u.luckyCount, luckyTotal: u.luckyTotal })).sort((a, b) => b.luckyTotal - a.luckyTotal);
        if (luckyUsers.length === 0) { sendReply("🎰 暂无数据"); return; }
        let luckyMessage = "🍀 幸运奖励排行榜\n══════════════\n";
        luckyUsers.slice(0, 5).forEach((user, index) => { luckyMessage += `${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][index] || (index + 1 + ".")} ${user.nickname}\n   🎰 ${user.luckyCount}次 / 💰 ${user.luckyTotal}金币\n`; });
        sendReply(luckyMessage);
    }
    else if (trimmedMsg === "签到规则") {
        sendReply(`📖 签到规则\n💰 基础奖励：${config.plugin.signReward.base}金币\n📈 连签递增最高加成：${config.plugin.signReward.continuous[2].reward}金币\n📅 全勤大奖：最高${config.plugin.signReward.fullMonthMax}金币\n🎲 幸运暴击：${Math.round(config.plugin.luckyBonus.chance * 100)}%概率\n💡 注：需绑定游戏ID才可享受最高加成。`);
    }
    else if (trimmedMsg === "不签到" || trimmedMsg === "签不到") {
        if (config.plugin.punishment.allowPunish && !getAdmins().includes(String(userId)) && !getAdmins().includes(Number(userId))) {
            spark.QClient.sendWSPack(packbuilder.GroupBanPack(groupId, userId, config.plugin.punishment.banTime));
            sendReply(`🤬 禁言 ${config.plugin.punishment.banTime} 秒冷静一下！`);
        }
    }
});

if (typeof mc !== 'undefined' && mc.listen) {
    mc.listen('onJoin', (pl) => {
        if (pl.isSimulatedPlayer()) return;
        setTimeout(() => {
            let player = mc.getPlayer(pl.xuid);
            if (!player) return;
            let boundUserId = findUserIdByPlayerName(player.realName);
            if (boundUserId) {
                let userData = getUserData(boundUserId);
                if (userData && (!userData.xuid || userData.xuid !== player.xuid)) {
                    userData.xuid = player.xuid;
                    userData.playerName = player.realName;
                    saveUserData(boundUserId, userData);
                }
            }
        }, 1000);

        setTimeout(() => {
            if (!config.plugin.features.joinTip) return;
            let player = mc.getPlayer(pl.xuid);
            if (!player) return;
            let userId = findUserIdByXuid(player.xuid) || findUserIdByPlayerName(player.realName);
            if (!userId) {
                player.tell(GAME_PREFIX + '§e本服支持每日签到，首次请在QQ群发送§b“绑定 游戏名”§e，之后可用 §a/sign §e指令。');
            } else {
                let uData = getUserData(userId);
                if (uData && uData.lastSignDate === getCurrentDate()) player.tell(GAME_PREFIX + '§e你今天已经签到过了，明天再来吧！');
                else player.tell(GAME_PREFIX + '§e你今天还未签到，输入 §a/sign §e打开签到表单领取奖励！');
            }
        }, 3000);

        setTimeout(() => {
            let player = mc.getPlayer(pl.xuid);
            if (!player) return;
            let guestData = getUserData(player.xuid);
            if (guestData && guestData.totalDays > 0) {
                let userId = findUserIdByXuid(player.xuid);
                if (userId) {
                    let bindData = getUserData(userId) || JSON.parse(JSON.stringify(defaultUserData));
                    bindData.totalDays += guestData.totalDays;
                    bindData.balance += guestData.balance;
                    bindData.luckyCount += guestData.luckyCount;
                    bindData.luckyTotal += guestData.luckyTotal;
                    bindData.continuousDays = Math.max(bindData.continuousDays, guestData.continuousDays);
                    bindData.streakRecord = Math.max(bindData.streakRecord, guestData.streakRecord);
                    bindData.hasStreakProtect = bindData.hasStreakProtect || guestData.hasStreakProtect;
                    saveUserData(userId, bindData);
                    let allData = JSON5.parse(_config.getFile("data.json"));
                    delete allData[player.xuid];
                    _config.updateFile("data.json", allData);
                    player.tell(GAME_PREFIX + '§a您的游客签到记录已合并到绑定账号中。');
                }
            }
        }, 5000);
    });

    mc.listen('onServerStarted', () => {
        const signCmd = mc.newCommand('sign', '打开每日签到表单', PermType.Any);
        signCmd.overload();
        signCmd.setCallback((cmd, origin, output) => {
            if (!origin.player || origin.player.isSimulatedPlayer()) return output.error('此命令仅限真实玩家');
            openSignMainForm(origin.player);
        });
        signCmd.setup();

        const queryCmd = mc.newCommand('qsign', '查询签到信息', PermType.Any);
        queryCmd.overload();
        queryCmd.setCallback((cmd, origin, output) => {
            if (!origin.player || origin.player.isSimulatedPlayer()) return;
            const userId = findUserIdByXuid(origin.player.xuid) || findUserIdByPlayerName(origin.player.realName);
            if (!userId) { origin.player.tell(GAME_PREFIX + '§c请先在QQ群发送“绑定 游戏名”完成绑定，或使用游客签到。'); return; }
            querySignInfoForGame(origin.player, userId, origin.player.realName);
        });
        queryCmd.setup();
    });
}
