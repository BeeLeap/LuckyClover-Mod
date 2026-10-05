const PLUGIN_NAME = "LuckyClover-Plugin";
const PLUGIN_DESC = "LuckyClover core: daily tasks, hub protection, cinematic, mute, online time, menu, chat pipeline";
const PLUGIN_VERSION = [1, 4, 1];
const PLUGIN_EXTRA = {
    Author: "Mell",
};

const NAMESPACE = "LuckyCloverCore";
const VIP_NAMESPACE = "LuckyCloverVIP";
const TPA_NAMESPACE = "LuckyCloverTPA";

const BASE_DIR = "plugins/LuckyClover-Plugin/";
const CONFIG_PATH = `${BASE_DIR}config.json`;
const DAILY_TASK_DATA_PATH = `${BASE_DIR}daily_tasks.json`;
const ONLINE_TIME_DATA_PATH = `${BASE_DIR}online_time.json`;
const MUTE_DATA_PATH = `${BASE_DIR}mutes.json`;
const ONLINE_TIME_SCOREBOARD_OBJ = "onlineTime";
const ONLINE_TIME_ACCUMULATE_INTERVAL_MS = 60000;
const ONLINE_TIME_RANKING_COUNT = 10;
const TEXTURE_FORM_LIST = "/L ";
const TEXTURE_FORM_AD = "/A ";
const TEXTURE_FORM_CAMERA = "/C ";
const hubProtectionSelections = {};
let dailyTaskLoopStarted = false;
let onlineTimeLoopStarted = false;
const vipApiCache = {};
const tpaApiCache = {};
ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, PLUGIN_EXTRA);

logger.setTitle(PLUGIN_NAME);

function exportApi(name, fn) {
    ll.export(fn, NAMESPACE, name);
}
File.mkdir(BASE_DIR);

const config = new JsonConfigFile(
    CONFIG_PATH,
    JSON.stringify(
        {
            chatFormatMode: "vanilla",
            chatBridge: {
                enabled: true,
                namespace: "LuckyCloverMC2QQ",
                functionName: "send",
            },
            joinNotify: {
                enabled: true,
                vipTitle: "§6§l👑 尊贵会员降临",
                vipContent: "§e{name}（{vip}）加入了服务器，大家欢迎！",
                newTitle: "§a§l👋 欢迎新玩家",
                newContent: "§a{name} 第一次来到服务器，大家欢迎！",
            },
            transfer: {
                enabled: true,
                command: "serverhub",
                host: "127.0.0.1",
                port: 19132,
                message: "§a正在将你传送到目标服务器...",
            },
            hubProtection: {
                command: "hubprotect",
                defaultName: "主城",
                regions: {},
            },
            dailyTasks: {
                enabled: true,
                command: "daily",
                resetHour: 0,
                dailyCount: 5,
                tasks: [
                    {
                        id: "kill_zombie",
                        name: "击杀僵尸",
                        type: "kill",
                        target: "minecraft:zombie",
                        required: 10,
                        reward: 80,
                    },
                    {
                        id: "break_stone",
                        name: "挖掘圆石或石头",
                        type: "break",
                        target: ["minecraft:stone", "minecraft:cobblestone"],
                        required: 32,
                        reward: 60,
                    },
                    {
                        id: "place_blocks",
                        name: "放置任意方块",
                        type: "place",
                        target: "*",
                        required: 16,
                        reward: 40,
                    },
                    {
                        id: "online_time",
                        name: "在线 30 分钟",
                        type: "online",
                        required: 1800,
                        reward: 100,
                    },
                    {
                        id: "harvest_wheat",
                        name: "收获成熟小麦",
                        type: "harvest",
                        target: "minecraft:wheat",
                        required: 16,
                        reward: 70,
                    },
                ],
            },
            nameColor: {
                enabled: true,
                tiers: [
                    { hours: 5, color: "§e" },
                    { hours: 24, color: "§b" },
                    { hours: 100, color: "§d" },
                    { hours: 500, color: "§5" }
                ]
            },
        },
        null,
        4,
    ),
);
const dailyTaskStore = new JsonConfigFile(DAILY_TASK_DATA_PATH, "{}");
const muteStore = new JsonConfigFile(
    MUTE_DATA_PATH,
    JSON.stringify({ players: {} }, null, 4),
);

// === Online Time Storage ===
const onlineTimeStore = new JsonConfigFile(
    ONLINE_TIME_DATA_PATH,
    JSON.stringify({ players: {} }, null, 4)
);
// In-memory cache: { xuid: { name, time } }
let onlineTimeCache = {};
// Session start timestamps: { xuid: timestamp }
const onlineSessionStarts = {};

function initOnlineTimeCache() {
    const data = onlineTimeStore.get("players");
    onlineTimeCache = data && typeof data === "object" ? data : {};
}
initOnlineTimeCache();

function initConfig() {
    config.init("chatFormatMode", "vanilla");
    config.init("chatBridge", {
        enabled: true,
        namespace: "LuckyCloverMC2QQ",
        functionName: "send",
    });
    config.init("joinNotify", {
        enabled: true,
        vipTitle: "§6§l👑 尊贵会员降临",
        vipContent: "§e{name}（{vip}）加入了服务器，大家欢迎！",
        newTitle: "§a§l👋 欢迎新玩家",
        newContent: "§a{name} 第一次来到服务器，大家欢迎！",
    });
    config.init("transfer", {
        enabled: true,
        command: "serverhub",
        host: "127.0.0.1",
        port: 19132,
        message: "§a正在将你传送到目标服务器...",
    });
    config.init("hubProtection", {
        command: "hubprotect",
        defaultName: "主城",
        regions: {},
    });
    config.init("dailyTasks", {
        enabled: true,
        command: "daily",
        resetHour: 0,
        dailyCount: 5,
        tasks: [
            {
                id: "kill_zombie",
                name: "击杀僵尸",
                type: "kill",
                target: "minecraft:zombie",
                required: 10,
                reward: 80,
            },
            {
                id: "break_stone",
                name: "挖掘圆石或石头",
                type: "break",
                target: ["minecraft:stone", "minecraft:cobblestone"],
                required: 32,
                reward: 60,
            },
            {
                id: "place_blocks",
                name: "放置任意方块",
                type: "place",
                target: "*",
                required: 16,
                reward: 40,
            },
            {
                id: "online_time",
                name: "在线 30 分钟",
                type: "online",
                required: 1800,
                reward: 100,
            },
            {
                id: "harvest_wheat",
                name: "收获成熟小麦",
                type: "harvest",
                target: "minecraft:wheat",
                required: 16,
                reward: 70,
            },
        ],
    });
    config.init("nameColor", {
        enabled: true,
        tiers: [
            { hours: 5, color: "§e" },
            { hours: 24, color: "§b" },
            { hours: 100, color: "§d" },
            { hours: 500, color: "§5" }
        ]
    });
    config.init("cinematic", {
        enabled: true,
        command: "cinematic",
        defaultEaseTime: 2.0,
        defaultEaseType: "linear",
        defaultHoldTime: 3.0,
        maxWaypoints: 50,
    });
    config.init("mute", {
        enabled: true,
        command: "mute",
        unmuteCommand: "unmute",
        listCommand: "mutelist",
        infoCommand: "muteinfo",
        defaultReason: "违反服务器规定",
    });
}

function getNameColorConfig() {
    const nc = config.get("nameColor", {});
    return nc && typeof nc === "object" ? nc : {};
}

function isNameColorEnabled() {
    return getNameColorConfig().enabled !== false;
}

function getColorForSeconds(totalSeconds) {
    if (!isNameColorEnabled()) return "§f";

    const nc = getNameColorConfig();
    const rawTiers = Array.isArray(nc.tiers) ? nc.tiers : [];

    const tiers = [];
    for (const raw of rawTiers) {
        if (raw && typeof raw === "object" && raw.hours > 0 && raw.color) {
            tiers.push({ seconds: raw.hours * 3600, color: String(raw.color) });
        }
    }
    if (!tiers.length) return "§a";

    tiers.sort((a, b) => a.seconds - b.seconds);
    for (let i = tiers.length - 1; i >= 0; i--) {
        if (totalSeconds >= tiers[i].seconds) return tiers[i].color;
    }
    return "§a";
}

function getOnlineTimeColor(player) {
    if (player && typeof player.isOP === "function" && player.isOP()) return "§c";
    return getColorForSeconds(getPlayerOnlineTime(player));
}

function getTransferConfig() {
    const transfer = config.get("transfer", {});
    return transfer && typeof transfer === "object" ? transfer : {};
}

function getHubProtectionConfig() {
    const hubProtection = config.get("hubProtection", {});
    return hubProtection && typeof hubProtection === "object" ? hubProtection : {};
}

function getDailyTaskConfig() {
    const dailyTasks = config.get("dailyTasks", {});
    return dailyTasks && typeof dailyTasks === "object" ? dailyTasks : {};
}

function getDailyTaskCommand() {
    return String(getDailyTaskConfig().command || "daily").trim() || "daily";
}

function getDailyTaskDefs() {
    const dailyTasks = getDailyTaskConfig();
    const rawTasks = Array.isArray(dailyTasks.tasks) ? dailyTasks.tasks : [];
    const tasks = [];

    for (const rawTask of rawTasks) {
        if (!rawTask || typeof rawTask !== "object") {
            continue;
        }

        const id = String(rawTask.id || "").trim();
        const type = String(rawTask.type || "").trim().toLowerCase();
        const required = Math.max(1, Math.floor(Number(rawTask.required) || 0));
        const reward = Math.max(0, Math.floor(Number(rawTask.reward) || 0));
        if (!id || !type || !required) {
            continue;
        }

        tasks.push({
            id,
            name: String(rawTask.name || id),
            type,
            target: rawTask.target,
            required,
            reward,
        });
    }

    return tasks;
}

function getDailyTaskStateKey() {
    return "__daily_task_state__";
}

function shuffleArray(values) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = result[i];
        result[i] = result[j];
        result[j] = temp;
    }
    return result;
}

function ensureDailyTaskRotation() {
    const day = getCurrentDailyTaskDayKey();
    const configState = getDailyTaskConfig();
    const pool = getDailyTaskDefs();
    const desiredCount = Math.max(1, Math.floor(Number(configState.dailyCount) || 5));
    const stored = dailyTaskStore.get(getDailyTaskStateKey());

    if (stored && stored.day === day && Array.isArray(stored.activeTaskIds)) {
        return stored;
    }

    const shuffled = shuffleArray(pool);
    const activeTaskIds = shuffled.slice(0, Math.min(desiredCount, shuffled.length)).map((task) => task.id);
    const nextState = {
        day,
        activeTaskIds,
    };
    dailyTaskStore.set(getDailyTaskStateKey(), nextState);
    return nextState;
}

function getActiveDailyTaskDefs() {
    const taskMap = getDailyTaskDefMap();
    const rotation = ensureDailyTaskRotation();
    const activeTasks = [];
    for (const id of rotation.activeTaskIds) {
        if (taskMap[id]) {
            activeTasks.push(taskMap[id]);
        }
    }
    return activeTasks;
}

function getDailyTaskDefMap() {
    const map = {};
    for (const task of getDailyTaskDefs()) {
        map[task.id] = task;
    }
    return map;
}

function getDailyTaskKeyByDate(date) {
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getCurrentDailyTaskDayKey() {
    const resetHour = Math.max(0, Math.min(23, Math.floor(Number(getDailyTaskConfig().resetHour) || 0)));
    const now = new Date();
    const workDate = new Date(now.getTime());
    if (workDate.getHours() < resetHour) {
        workDate.setDate(workDate.getDate() - 1);
    }
    return getDailyTaskKeyByDate(workDate);
}

function getDailyTaskPlayerKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function createDefaultDailyTaskState() {
    const progress = {};
    const claimed = {};
    const notified = {};
    for (const task of getActiveDailyTaskDefs()) {
        progress[task.id] = 0;
        claimed[task.id] = false;
        notified[task.id] = false;
    }

    return {
        day: getCurrentDailyTaskDayKey(),
        progress,
        claimed,
        notified,
    };
}

function normalizeDailyTaskState(state) {
    const currentDay = getCurrentDailyTaskDayKey();
    const nextState = state && typeof state === "object"
        ? {
            day: String(state.day || currentDay),
            progress: state.progress && typeof state.progress === "object" ? state.progress : {},
            claimed: state.claimed && typeof state.claimed === "object" ? state.claimed : {},
            notified: state.notified && typeof state.notified === "object" ? state.notified : {},
        }
        : createDefaultDailyTaskState();

    if (nextState.day !== currentDay) {
        return createDefaultDailyTaskState();
    }

    for (const task of getActiveDailyTaskDefs()) {
        if (typeof nextState.progress[task.id] !== "number") {
            nextState.progress[task.id] = 0;
        }
        if (typeof nextState.claimed[task.id] !== "boolean") {
            nextState.claimed[task.id] = false;
        }
        if (typeof nextState.notified[task.id] !== "boolean") {
            nextState.notified[task.id] = false;
        }
    }

    return nextState;
}

function getDailyTaskState(player) {
    const key = getDailyTaskPlayerKey(player);
    const state = normalizeDailyTaskState(dailyTaskStore.get(key));
    dailyTaskStore.set(key, state);
    return state;
}

function saveDailyTaskState(player, state) {
    dailyTaskStore.set(getDailyTaskPlayerKey(player), state);
}

function matchesTaskTarget(target, value) {
    if (target === undefined || target === null || target === "*") {
        return true;
    }

    if (Array.isArray(target)) {
        return target.includes(value);
    }

    return String(target) === String(value);
}

function isMatureCrop(block) {
    if (!block || typeof block.getBlockState !== "function") {
        return false;
    }

    const states = block.getBlockState() || {};
    const maxByField = {
        growth: 7,
        age: 7,
        coral_color: -1,
        weirdo_direction: -1,
    };

    if (block.type === "minecraft:beetroot") {
        return Number(states.growth) >= 3;
    }
    if (block.type === "minecraft:nether_wart") {
        return Number(states.age) >= 3;
    }
    if (block.type === "minecraft:pitcher_crop") {
        return Number(states.growth) >= 4;
    }
    if (block.type === "minecraft:torchflower_crop") {
        return Number(states.growth) >= 7;
    }
    if (typeof states.growth === "number") {
        return states.growth >= (maxByField.growth || 7);
    }
    if (typeof states.age === "number") {
        return states.age >= 7;
    }

    return false;
}

function addDailyTaskProgress(player, type, amount, value, extraMatcher) {
    const dailyTaskConfig = getDailyTaskConfig();
    if (!dailyTaskConfig.enabled) {
        return;
    }

    const state = getDailyTaskState(player);
    let changed = false;
    const completedTasks = [];
    for (const task of getActiveDailyTaskDefs()) {
        if (task.type !== type) {
            continue;
        }
        if (!matchesTaskTarget(task.target, value)) {
            continue;
        }
        if (typeof extraMatcher === "function" && !extraMatcher(task)) {
            continue;
        }
        const before = Math.min(task.required, Number(state.progress[task.id] || 0));
        const after = Math.min(task.required, before + amount);
        state.progress[task.id] = after;
        if (before < task.required && after >= task.required && !state.notified[task.id]) {
            state.notified[task.id] = true;
            completedTasks.push(task);
        }
        changed = true;
    }

    if (changed) {
        saveDailyTaskState(player, state);
        for (const task of completedTasks) {
            player.tell(`§a每日任务已完成: ${task.name} §7- 使用 /${getDailyTaskCommand()} claim ${task.id} 领取奖励`);
        }
    }
}

function claimDailyTask(player, taskId) {
    const task = getDailyTaskDefMap()[taskId];
    if (!task) {
        player.tell("§c指定每日任务不存在");
        return false;
    }

    const state = getDailyTaskState(player);
    const progress = Number(state.progress[task.id] || 0);
    if (state.claimed[task.id]) {
        player.tell(`§e任务 ${task.name} 已领取过奖励`);
        return false;
    }
    if (progress < task.required) {
        player.tell(`§e任务 ${task.name} 尚未完成`);
        return false;
    }
    if (!player.xuid) {
        player.tell("§c无法识别经济账户，领取失败");
        return false;
    }
    const reward = applyVipRewardMultiplierSafe(player, task.reward, "dailyRewardMultiplier");
    if (reward > 0 && !money.add(player.xuid, reward)) {
        player.tell("§c每日任务奖励发放失败");
        return false;
    }

    state.claimed[task.id] = true;
    saveDailyTaskState(player, state);
    player.tell(`§a已领取任务 ${task.name} 奖励 ${reward} 金币`);
    return true;
}

function claimAllDailyTasks(player) {
    let claimedCount = 0;
    for (const task of getActiveDailyTaskDefs()) {
        if (claimDailyTask(player, task.id)) {
            claimedCount++;
        }
    }

    if (!claimedCount) {
        player.tell("§e当前没有可领取的每日任务奖励");
    }
}

function claimAllDailyTasksQuiet(player) {
    const tasks = getActiveDailyTaskDefs();
    const state = getDailyTaskState(player);
    const claimableTasks = [];
    let totalReward = 0;

    for (const task of tasks) {
        const progress = Number(state.progress[task.id] || 0);
        if (!state.claimed[task.id] && progress >= task.required) {
            claimableTasks.push(task);
            totalReward += applyVipRewardMultiplierSafe(player, task.reward, "dailyRewardMultiplier");
        }
    }

    if (!claimableTasks.length) {
        player.tell("\u00A7e当前没有可领取的每日任务奖励");
        return false;
    }

    if (!player.xuid) {
        player.tell("\u00A7c无法识别经济账户，领取失败");
        return false;
    }

    if (totalReward > 0 && !money.add(player.xuid, totalReward)) {
        player.tell("\u00A7c每日任务奖励发放失败");
        return false;
    }

    for (const task of claimableTasks) {
        state.claimed[task.id] = true;
    }
    saveDailyTaskState(player, state);

    player.tell(`\u00A7a已领取 ${claimableTasks.length} 个每日任务奖励，共 ${totalReward} 金币`);
    return true;
}

function getDailyTaskSummary(player) {
    const tasks = getActiveDailyTaskDefs();
    const state = getDailyTaskState(player);
    let completed = 0;

    for (const task of tasks) {
        const progress = Number(state.progress[task.id] || 0);
        if (progress >= task.required) {
            completed++;
        }
    }

    return {
        total: tasks.length,
        completed,
    };
}

function showDailyTasks(player) {
    const dailyTaskConfig = getDailyTaskConfig();
    if (!dailyTaskConfig.enabled) {
        player.tell("§e每日任务功能未启用");
        return;
    }

    const tasks = getActiveDailyTaskDefs();
    if (!tasks.length) {
        player.tell("§e当前没有配置每日任务");
        return;
    }

    const state = getDailyTaskState(player);
    player.tell(`§6每日任务§f - ${state.day}`);
    for (const task of tasks) {
        const progress = Math.min(task.required, Number(state.progress[task.id] || 0));
        const claimed = Boolean(state.claimed[task.id]);
        const status = claimed ? "§7已领取" : (progress >= task.required ? "§a可领取" : "§e进行中");
        player.tell(`§b${task.id}§f | ${task.name} §7(${progress}/${task.required}) §6奖励:${task.reward} ${status}`);
    }
    player.tell(`§a使用 /${getDailyTaskCommand()} claim <任务ID|all> 领取奖励`);
}

function getDailyTaskStatusText(task, state) {
    const progress = Math.min(task.required, Number(state.progress[task.id] || 0));
    const claimed = Boolean(state.claimed[task.id]);
    if (claimed) {
        return "\u00A77已领取";
    }
    if (progress >= task.required) {
        return "\u00A7a可领取";
    }
    return "\u00A7e进行中";
}

function buildDailyTaskFormContent(player) {
    const tasks = getActiveDailyTaskDefs();
    const state = getDailyTaskState(player);
    const lines = [`\u00A76每日任务 \u00A7f- ${state.day}`, ""];

    if (!tasks.length) {
        lines.push("\u00A7e当前没有配置每日任务");
        return lines.join("\n");
    }

    for (const task of tasks) {
        const progress = Math.min(task.required, Number(state.progress[task.id] || 0));
        const status = getDailyTaskStatusText(task, state);
        lines.push(`${status} \u00A7f${task.name}`);
        lines.push(`\u00A77进度: \u00A7f${progress}/${task.required}  \u00A76奖励: \u00A7f${task.reward} 金币`);
        lines.push("");
    }

    lines.push("\u00A7a点击下方按钮领取所有可领取奖励。");
    return lines.join("\n");
}

function openDailyTasksForm(player) {
    const dailyTaskConfig = getDailyTaskConfig();
    if (!dailyTaskConfig.enabled) {
        player.tell("\u00A7e每日任务功能未启用");
        return;
    }

    const buttons = ["领取全部", "刷新"];
    const images = ["", ""];
    player.sendSimpleForm(
        buildTextureFormTitle(TEXTURE_FORM_LIST, "每日任务"),
        buildDailyTaskFormContent(player),
        buttons,
        images,
        (_pl, index) => {
            if (index === null || index === undefined) {
                return;
            }
            if (index === 0) {
                claimAllDailyTasksQuiet(player);
                openDailyTasksForm(player);
                return;
            }
            if (index === 1) {
                openDailyTasksForm(player);
            }
        }
    );
}

function buildTextureFormTitle(prefix, displayTitle) {
    const suffix = String(displayTitle || "").trim();
    return prefix + (suffix || "Menu");
}

function getDailyTaskListLines() {
    const tasks = getActiveDailyTaskDefs();
    const lines = [`今日每日任务列表 - ${getCurrentDailyTaskDayKey()}`];

    if (!tasks.length) {
        lines.push("当前没有可用的每日任务");
        return lines;
    }

    for (const task of tasks) {
        lines.push(`${task.id} | ${task.name} | 类型: ${task.type} | 目标: ${Array.isArray(task.target) ? task.target.join(",") : (task.target || "*")} | 需求: ${task.required} | 奖励: ${task.reward}`);
    }

    return lines;
}

function scheduleDailyTaskLoop() {
    if (dailyTaskLoopStarted) {
        return;
    }

    dailyTaskLoopStarted = true;
    const tick = () => {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            addDailyTaskProgress(player, "online", 60, "*");
        }
    };

    if (typeof mc.setInterval === "function") {
        mc.setInterval(tick, 60000);
    } else {
        setInterval(tick, 60000);
    }
}

function scheduleOnlineTimeLoop() {
    if (onlineTimeLoopStarted) {
        return;
    }

    onlineTimeLoopStarted = true;
    const tick = () => {
        const players = mc.getOnlinePlayers();
        for (const player of players) {
            const key = getOnlineTimeKey(player);
            const start = onlineSessionStarts[key];
            if (start) {
                const elapsed = Math.floor((Date.now() - start) / 1000);
                if (elapsed > 0) {
                    addPlayerOnlineTime(player, elapsed);
                }
                onlineSessionStarts[key] = Date.now();
            }
        }
        saveOnlineTimeCache();
        syncOnlineTimeScoreboard();
    };

    if (typeof mc.setInterval === "function") {
        mc.setInterval(tick, ONLINE_TIME_ACCUMULATE_INTERVAL_MS);
    } else {
        setInterval(tick, ONLINE_TIME_ACCUMULATE_INTERVAL_MS);
    }
}

function saveHubProtectionConfig(hubProtection) {
    config.set("hubProtection", hubProtection);
}

function sanitizeHubRegionId(id) {
    return String(id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeHubRegion(id, region, defaultName) {
    if (!region || typeof region !== "object") {
        return null;
    }

    const minX = Math.floor(Number(region.minX));
    const maxX = Math.floor(Number(region.maxX));
    const minZ = Math.floor(Number(region.minZ));
    const maxZ = Math.floor(Number(region.maxZ));
    const dimid = Math.floor(Number(region.dimid));
    if ([minX, maxX, minZ, maxZ, dimid].some((value) => isNaN(value))) {
        return null;
    }

    return {
        id,
        name: String(region.name || defaultName || id),
        enabled: region.enabled !== false,
        allowedPlayers: Array.isArray(region.allowedPlayers) ? region.allowedPlayers.map((item) => String(item)) : [],
        minX: Math.min(minX, maxX),
        maxX: Math.max(minX, maxX),
        minZ: Math.min(minZ, maxZ),
        maxZ: Math.max(minZ, maxZ),
        dimid,
    };
}

function getHubProtectionRegions() {
    const hubProtection = getHubProtectionConfig();
    const defaultName = String(hubProtection.defaultName || hubProtection.name || "主城");
    const regions = {};
    const rawRegions = hubProtection.regions;

    if (rawRegions && typeof rawRegions === "object") {
        for (const key in rawRegions) {
            const id = sanitizeHubRegionId(key);
            if (!id) {
                continue;
            }

            const region = normalizeHubRegion(id, rawRegions[key], defaultName);
            if (region) {
                regions[id] = region;
            }
        }
    }

    if (!Object.keys(regions).length && hubProtection.region && typeof hubProtection.region === "object") {
        const legacyRegion = normalizeHubRegion("hub", {
            ...hubProtection.region,
            name: hubProtection.name || defaultName,
            enabled: hubProtection.enabled !== false,
        }, defaultName);
        if (legacyRegion) {
            regions[legacyRegion.id] = legacyRegion;
        }
    }

    return regions;
}

function saveHubProtectionRegions(regions) {
    const hubProtection = getHubProtectionConfig();
    const nextRegions = {};

    for (const key in regions) {
        const region = normalizeHubRegion(key, regions[key], hubProtection.defaultName || "主城");
        if (region) {
            nextRegions[region.id] = {
                name: region.name,
                enabled: region.enabled,
                allowedPlayers: region.allowedPlayers,
                dimid: region.dimid,
                minX: region.minX,
                maxX: region.maxX,
                minZ: region.minZ,
                maxZ: region.maxZ,
            };
        }
    }

    hubProtection.regions = nextRegions;
    delete hubProtection.region;
    delete hubProtection.enabled;
    delete hubProtection.name;
    saveHubProtectionConfig(hubProtection);
}

function getHubProtectionRegion(id) {
    const regionId = sanitizeHubRegionId(id);
    if (!regionId) {
        return null;
    }

    return getHubProtectionRegions()[regionId] || null;
}

function hasAnyEnabledHubProtection() {
    const regions = getHubProtectionRegions();
    for (const key in regions) {
        if (regions[key].enabled) {
            return true;
        }
    }
    return false;
}

function getHubProtectionCommand() {
    return String(getHubProtectionConfig().command || "hubprotect").trim() || "hubprotect";
}

function getHubSelectionKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function getHubSelection(player) {
    const key = getHubSelectionKey(player);
    if (!hubProtectionSelections[key]) {
        hubProtectionSelections[key] = {
            pos1: null,
            pos2: null,
        };
    }

    return hubProtectionSelections[key];
}

function escapeCmdString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizePlayerCmdArgs(args) {
    if (Array.isArray(args)) {
        return args;
    }

    const text = String(args || "").trim();
    return text ? text.split(/\s+/) : [];
}

function captureSelectionPos(player) {
    return {
        x: Math.floor(player.pos.x),
        z: Math.floor(player.pos.z),
        dimid: player.pos.dimid,
    };
}

function setHubSelectionPos(player, key) {
    const selection = getHubSelection(player);
    selection[key] = captureSelectionPos(player);
    return selection[key];
}

function formatHubSelectionPos(pos) {
    if (!pos) {
        return "未设置";
    }

    return `X=${pos.x}, Z=${pos.z}, 维度=${pos.dimid}`;
}

function getHubProtectionRegionAtPos(pos) {
    if (!pos) {
        return null;
    }

    const regions = getHubProtectionRegions();
    for (const key in regions) {
        const region = regions[key];
        if (!region.enabled) {
            continue;
        }

        if (pos.dimid === region.dimid
            && pos.x >= region.minX
            && pos.x <= region.maxX
            && pos.z >= region.minZ
            && pos.z <= region.maxZ) {
            return region;
        }
    }

    return null;
}

function canBypassHubProtection(player) {
    return player && player.isOP();
}

function isPlayerAllowedInRegion(player, region) {
    if (!player || !region) {
        return false;
    }

    const allowedPlayers = Array.isArray(region.allowedPlayers) ? region.allowedPlayers : [];
    const realName = String(player.realName || "").toLowerCase();
    const xuid = String(player.xuid || "");
    for (const item of allowedPlayers) {
        const value = String(item || "").trim();
        if (!value) {
            continue;
        }
        if (value === xuid || value.toLowerCase() === realName) {
            return true;
        }
    }

    return false;
}

function buildAllowedPlayerEntries(playerName) {
    const input = String(playerName || "").trim();
    const entries = [];
    if (!input) {
        return entries;
    }

    const onlinePlayer = mc.getPlayer(input);
    if (onlinePlayer) {
        if (onlinePlayer.xuid) {
            entries.push(String(onlinePlayer.xuid));
        }
        entries.push(String(onlinePlayer.realName || input));
    } else {
        entries.push(input);
    }

    return [...new Set(entries.map((item) => String(item).trim()).filter(Boolean))];
}

function denyHubProtection(player, actionText, region) {
    const regionName = region && region.name ? region.name : "保护区域";
    player.tell(`§c${regionName}内禁止${actionText}`);
    return false;
}

function showHubProtectionInfo(player, id) {
    const hubProtection = getHubProtectionConfig();
    const command = String(hubProtection.command || "hubprotect");
    const region = id ? getHubProtectionRegion(id) : null;

    if (id) {
        if (!region) {
            player.tell("§e指定保护区域不存在");
            return;
        }

        player.tell(`§6区域 ID§f: ${region.id}`);
        player.tell(`§6区域名称§f: ${region.name}`);
        player.tell(`§6状态§f: ${region.enabled ? "启用" : "关闭"}`);
        player.tell(`§6白名单§f: ${region.allowedPlayers.length ? region.allowedPlayers.join(", ") : "无"}`);
        player.tell(`§6维度§f: ${region.dimid}`);
        player.tell(`§6X 范围§f: ${region.minX} ~ ${region.maxX}`);
        player.tell(`§6Z 范围§f: ${region.minZ} ~ ${region.maxZ}`);
        player.tell(`§6命令§f: /${command}`);
        return;
    }

    const regions = getHubProtectionRegions();
    const ids = Object.keys(regions);
    player.tell(`§6保护命令§f: /${command}`);
    player.tell(`§6区域数量§f: ${ids.length}`);
    player.tell(`§6启用区域§f: ${hasAnyEnabledHubProtection() ? "有" : "无"}`);
    if (!ids.length) {
        player.tell("§e当前未设置保护区域");
    }
}

function showHubProtectionUsage(player) {
    const command = getHubProtectionCommand();
    player.tell(`§e/${command} pos1`);
    player.tell(`§e/${command} pos2`);
    player.tell(`§e/${command} save <id> [名称]`);
    player.tell(`§e/${command} info [id]`);
    player.tell(`§e/${command} list`);
    player.tell(`§e/${command} on <id>`);
    player.tell(`§e/${command} off <id>`);
    player.tell(`§e/${command} allow <id> <玩家名>`);
    player.tell(`§e/${command} disallow <id> <玩家名>`);
    player.tell(`§e/${command} listallow <id>`);
    player.tell(`§e/${command} clear <id|all>`);
}

function saveHubProtectionRegion(player, id, name) {
    const selection = getHubSelection(player);
    if (!selection.pos1 || !selection.pos2) {
        player.tell("§c请先设置 pos1 和 pos2");
        return;
    }

    if (selection.pos1.dimid !== selection.pos2.dimid) {
        player.tell("§cpos1 和 pos2 必须位于同一维度");
        return;
    }

    const regionId = sanitizeHubRegionId(id);
    if (!regionId) {
        player.tell("§c请输入有效区域 ID，仅支持字母数字下划线中划线");
        return;
    }

    const hubProtection = getHubProtectionConfig();
    const regions = getHubProtectionRegions();
    regions[regionId] = {
        id: regionId,
        name: name || `${String(hubProtection.defaultName || "主城")}-${regionId}`,
        enabled: true,
        allowedPlayers: regions[regionId] && Array.isArray(regions[regionId].allowedPlayers) ? regions[regionId].allowedPlayers : [],
        dimid: selection.pos1.dimid,
        minX: Math.min(selection.pos1.x, selection.pos2.x),
        maxX: Math.max(selection.pos1.x, selection.pos2.x),
        minZ: Math.min(selection.pos1.z, selection.pos2.z),
        maxZ: Math.max(selection.pos1.z, selection.pos2.z),
    };
    saveHubProtectionRegions(regions);
    player.tell(`§a已保存保护区域 ${regionId}`);
    showHubProtectionInfo(player, regionId);
}

function listHubProtectionRegions(player) {
    const regions = getHubProtectionRegions();
    const ids = Object.keys(regions);
    if (!ids.length) {
        player.tell("§e当前没有保护区域");
        return;
    }

    player.tell("§6保护区域列表:");
    for (const id of ids) {
        const region = regions[id];
        player.tell(`§b${region.id}§f (${region.name}) §7[${region.enabled ? "启用" : "关闭"}] dim=${region.dimid} X=${region.minX}~${region.maxX} Z=${region.minZ}~${region.maxZ}`);
    }
}

function addRegionAllowedPlayer(player, regionId, playerName) {
    const region = getHubProtectionRegion(regionId);
    if (!region) {
        player.tell("§c指定保护区域不存在");
        return;
    }

    const entriesToAdd = buildAllowedPlayerEntries(playerName);
    if (!entriesToAdd.length) {
        player.tell("§c请输入玩家名");
        return;
    }

    const regions = getHubProtectionRegions();
    const allowedPlayers = Array.isArray(regions[region.id].allowedPlayers) ? regions[region.id].allowedPlayers.slice() : [];
    for (const entry of entriesToAdd) {
        if (!allowedPlayers.some((item) => String(item).trim().toLowerCase() === entry.toLowerCase())) {
            allowedPlayers.push(entry);
        }
    }
    regions[region.id].allowedPlayers = allowedPlayers;
    saveHubProtectionRegions(regions);
    player.tell(`§a已允许玩家 ${String(playerName).trim()} 访问区域 ${region.id}`);
}

function removeRegionAllowedPlayer(player, regionId, playerName) {
    const region = getHubProtectionRegion(regionId);
    if (!region) {
        player.tell("§c指定保护区域不存在");
        return;
    }

    const entriesToRemove = buildAllowedPlayerEntries(playerName).map((item) => item.toLowerCase());
    if (!entriesToRemove.length) {
        player.tell("§c请输入玩家名");
        return;
    }

    const regions = getHubProtectionRegions();
    regions[region.id].allowedPlayers = (Array.isArray(regions[region.id].allowedPlayers) ? regions[region.id].allowedPlayers : [])
        .filter((item) => !entriesToRemove.includes(String(item).trim().toLowerCase()));
    saveHubProtectionRegions(regions);
    player.tell(`§a已移除玩家 ${playerName} 对区域 ${region.id} 的访问权限`);
}

function listRegionAllowedPlayers(player, regionId) {
    const region = getHubProtectionRegion(regionId);
    if (!region) {
        player.tell("§c指定保护区域不存在");
        return;
    }

    const allowedPlayers = Array.isArray(region.allowedPlayers) ? region.allowedPlayers : [];
    player.tell(`§6区域 ${region.id} 白名单§f: ${allowedPlayers.length ? allowedPlayers.join(", ") : "无"}`);
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function transferPlayerToConfiguredServer(player) {
    const transfer = getTransferConfig();
    const host = String(transfer.host || "").trim();
    const port = Math.floor(Number(transfer.port));
    const message = String(transfer.message || "§a正在将你传送到目标服务器...");

    if (!transfer.enabled) {
        player.tell("§c跨服功能未启用");
        return false;
    }

    if (!host) {
        player.tell("§c目标服务器地址未配置");
        return false;
    }

    if (!port || isNaN(port) || port <= 0 || port > 65535) {
        player.tell("§c目标服务器端口配置无效");
        return false;
    }

    player.tell(message);
    return player.transServer(host, port);
}

function stripMinecraftColorCodes(text) {
    return String(text || "").replace(/\u00A7[0-9a-fk-or]/gi, "");
}

function sendChatToBridge(playerName, rawMsg) {
    const bridge = config.get("chatBridge", {});
    if (!bridge || typeof bridge !== "object" || bridge.enabled === false) {
        return;
    }

    const namespace = String(bridge.namespace || "LuckyCloverMC2QQ");
    const functionName = String(bridge.functionName || "send");
    try {
        if (typeof ll.hasExported === "function" && !ll.hasExported(namespace, functionName)) {
            logger.warn(`Chat bridge export not found: ${namespace}.${functionName}`);
            return;
        }

        const send = ll.imports(namespace, functionName);
        if (typeof send !== "function") {
            logger.warn(`Chat bridge import is not a function: ${namespace}.${functionName}`);
            return;
        }

        // 传 玩家名 + 原始消息（由桥接插件自己处理 # 前缀筛选/过滤/格式化）
        send(
            stripMinecraftColorCodes(String(playerName || "")),
            stripMinecraftColorCodes(String(rawMsg || ""))
        );
    } catch (e) {
        logger.warn(`Failed to send chat to bridge: ${e}`);
    }
}

function notifyPlayerJoin(player) {
    try {
        const jn = config.get("joinNotify", {});
        if (jn.enabled === false || !player) {
            return;
        }
        const name = player.name || "未知";

        // 新玩家判定：复用在线时长统计（onlineTimeCache 无记录 = 首登；同一次 onJoin 里
        // startOnlineSession 随后会把它种进缓存并落盘）
        const key = getOnlineTimeKey(player);
        const isNew = !!(key && !onlineTimeCache[key]);

        const vipStatus = getVipStatusSafe(player);
        const vipName = vipStatus.display || "";

        let title = "";
        let content = "";
        if (vipStatus.isVip) {
            title = String(jn.vipTitle || "§6§l👑 尊贵会员降临");
            content = String(jn.vipContent || "§e{name}（{vip}）加入了服务器，大家欢迎！");
        } else if (isNew) {
            title = String(jn.newTitle || "§a§l👋 欢迎新玩家");
            content = String(jn.newContent || "§a{name} 第一次来到服务器，大家欢迎！");
        } else {
            return;
        }
        title = title.split("{name}").join(name).split("{vip}").join(vipName);
        content = content.split("{name}").join(name).split("{vip}").join(vipName);

        for (const pl of mc.getOnlinePlayers()) {
            try {
                if (pl && typeof pl.sendToast === "function") {
                    pl.sendToast(title, content);
                }
            } catch (e) { /* 单个玩家失败不影响其余 */ }
        }
    } catch (e) {
        logger.warn(`Failed to notify player join: ${e}`);
    }
}

// === Player Online Time System ===

function getOnlineTimeKey(player) {
    return player.xuid || player.uuid || player.realName;
}

function getPlayerOnlineTime(player) {
    const key = getOnlineTimeKey(player);
    const entry = onlineTimeCache[key];
    const stored = entry ? Math.max(0, Math.floor(Number(entry.time) || 0)) : 0;
    const sessionStart = onlineSessionStarts[key];
    if (sessionStart) {
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        return stored + Math.max(0, elapsed);
    }
    return stored;
}

function addPlayerOnlineTime(player, seconds) {
    const key = getOnlineTimeKey(player);
    const entry = onlineTimeCache[key];
    const current = entry ? Math.max(0, Math.floor(Number(entry.time) || 0)) : 0;
    if (!entry) {
        onlineTimeCache[key] = { name: player.realName, time: 0, op: !!player.isOP() };
    } else {
        onlineTimeCache[key].name = player.realName;
        if (player.isOP()) onlineTimeCache[key].op = true;
    }
    onlineTimeCache[key].time = current + Math.max(0, Math.floor(seconds));
}

function saveOnlineTimeCache() {
    onlineTimeStore.set("players", onlineTimeCache);
}

function syncOnlineTimeScoreboard() {
    try {
        for (const key in onlineTimeCache) {
            const entry = onlineTimeCache[key];
            if (!entry || typeof entry !== "object") continue;
            const total = Math.floor(Number(entry.time) || 0);
            const name = String(entry.name || key);
            if (name) {
                mc.runcmdEx(`scoreboard players set "${name}" ${ONLINE_TIME_SCOREBOARD_OBJ} ${total}`);
            }
        }
    } catch (e) {
        logger.error(`同步在线时长计分板失败: ${e}`);
    }
}

function startOnlineSession(player) {
    const key = getOnlineTimeKey(player);
    onlineSessionStarts[key] = Date.now();
    if (!onlineTimeCache[key]) {
        onlineTimeCache[key] = { name: player.realName, time: 0, op: !!player.isOP() };
        saveOnlineTimeCache();
    } else {
        const changed = onlineTimeCache[key].name !== player.realName;
        const opChanged = onlineTimeCache[key].op !== !!player.isOP();
        onlineTimeCache[key].name = player.realName;
        onlineTimeCache[key].op = !!player.isOP();
        if (changed || opChanged) saveOnlineTimeCache();
    }
}

function endOnlineSession(player) {
    const key = getOnlineTimeKey(player);
    const start = onlineSessionStarts[key];
    if (!start) {
        return;
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    delete onlineSessionStarts[key];
    if (elapsed > 0) {
        addPlayerOnlineTime(player, elapsed);
        saveOnlineTimeCache();
    }
}

function getOnlineTimeLeaderboard(count) {
    const limit = Math.max(1, Math.min(Number(count) || ONLINE_TIME_RANKING_COUNT, 20));
    const entries = [];
    for (const key in onlineTimeCache) {
        const entry = onlineTimeCache[key];
        let seconds = Math.floor(Number(entry.time) || 0);
        // Add live session time for currently online players
        const sessionStart = onlineSessionStarts[key];
        if (sessionStart) {
            const liveElapsed = Math.floor((Date.now() - sessionStart) / 1000);
            if (liveElapsed > 0) seconds += liveElapsed;
        }
        if (seconds > 0) {
            entries.push({ name: String(entry.name || key), seconds, op: entry.op === true });
        }
    }
    entries.sort((a, b) => b.seconds - a.seconds);
    return entries.slice(0, limit);
}

function formatOnlineTimeShort(totalSeconds) {
    totalSeconds = Math.floor(Math.max(0, totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) return `${hours}h${minutes}m`;
    if (minutes > 0) return `${minutes}m${secs}s`;
    return `${secs}s`;
}

function getOnlineTimeRankingValues() {
    const ranking = getOnlineTimeLeaderboard(ONLINE_TIME_RANKING_COUNT);
    const values = {};
    for (let i = 0; i < ranking.length; i++) {
        const nameColor = ranking[i].op ? "§c" : getColorForSeconds(ranking[i].seconds);
        values[`topOnline${i + 1}`] =
            `§e${i + 1}. ${nameColor}${ranking[i].name}`;
    }
    for (let i = ranking.length; i < ONLINE_TIME_RANKING_COUNT; i++) {
        values[`topOnline${i + 1}`] = "";
    }
    return values;
}

// === Teleport / Home / Warp System ===

function findOnlinePlayerByName(input) {
    const query = String(input || "").trim();
    if (!query) {
        return null;
    }

    const direct = mc.getPlayer(query);
    if (direct) {
        return direct;
    }

    const lowered = query.toLowerCase();
    const players = mc.getOnlinePlayers();
    for (const player of players) {
        if (String(player.realName || "").toLowerCase() === lowered) {
            return player;
        }
    }

    for (const player of players) {
        if (String(player.realName || "").toLowerCase().indexOf(lowered) >= 0) {
            return player;
        }
    }

    return null;
}

function canRegisterTrueCommand(commandName) {
    return false;
}

function getCommandOriginPlayer(origin) {
    return origin && origin.player ? origin.player : null;
}

function getCommandString(results, name, fallback) {
    if (!results || results[name] === undefined || results[name] === null) {
        return fallback === undefined ? "" : fallback;
    }
    return String(results[name]);
}

function filterCommandEnumValues(values) {
    const seen = {};
    const safe = [];
    for (const value of values || []) {
        const text = String(value || "").trim();
        if (/^[a-z0-9_]+$/.test(text) && !seen[text]) {
            seen[text] = true;
            safe.push(text);
        }
    }
    return safe;
}

function mandatoryEnum(command, name, values) {
    command.setEnum(name, values);
    command.mandatory(name, ParamType.Enum, name, name, 1);
}

function registerTruePlayerCommand(commandName, description, permission, buildCommand, callback, fallback) {
    if (!canRegisterTrueCommand(commandName)) {
        fallback();
        return false;
    }

    try {
        const command = mc.newCommand(commandName, description, permission, 0x80);
        buildCommand(command);
        command.setCallback((_cmd, origin, output, results) => {
            const player = getCommandOriginPlayer(origin);
            if (!player) {
                output.error("该命令只能由玩家执行");
                return;
            }
            callback(player, results || {}, output);
        });
        const setupResult = command.setup();
        if (setupResult === false) {
            throw new Error("setup returned false");
        }
        return true;
    } catch (error) {
        logger.warn(`True command registration failed for /${commandName}, fallback to regPlayerCmd: ${error}`);
        fallback();
        return false;
    }
}

function registerDailyCommand() {
    const commandName = getDailyTaskCommand();
    registerTruePlayerCommand(commandName, "每日任务", PermType.Any, (command) => {
        const taskIds = filterCommandEnumValues(["all", ...getActiveDailyTaskDefs().map((task) => task.id)]);
        mandatoryEnum(command, "dailyclaim", ["claim"]);
        if (taskIds.length) {
            mandatoryEnum(command, "taskid", taskIds);
        } else {
            command.mandatory("taskid", ParamType.String);
        }
        command.overload([]);
        command.overload(["dailyclaim", "taskid"]);
    }, (player, results) => {
        if (results.dailyclaim) {
            const target = getCommandString(results, "taskid").trim();
            if (target.toLowerCase() === "all") {
                claimAllDailyTasksQuiet(player);
                openDailyTasksForm(player);
                return;
            }
            claimDailyTask(player, target);
            openDailyTasksForm(player);
            return;
        }
        openDailyTasksForm(player);
    }, () => {
        mc.regPlayerCmd(commandName, "每日任务", (player, args) => {
            args = normalizePlayerCmdArgs(args);
            if (!args.length) {
                openDailyTasksForm(player);
                return;
            }

            const action = String(args[0]).toLowerCase();
            if (action === "claim") {
                const target = String(args[1] || "").trim();
                if (!target) {
                    player.tell(`§e使用 /${commandName} claim <任务ID|all>`);
                    return;
                }
                if (target.toLowerCase() === "all") {
                    claimAllDailyTasksQuiet(player);
                    openDailyTasksForm(player);
                    return;
                }
                claimDailyTask(player, target);
                openDailyTasksForm(player);
                return;
            }

            openDailyTasksForm(player);
        }, 0);
    });
}

function handleHubProtectionCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    if (!player.isOP()) {
        player.tell("§c你没有权限使用该命令");
        return;
    }

    if (!args.length) {
        showHubProtectionUsage(player);
        return;
    }

    const action = String(args[0]).toLowerCase();
    if (action === "pos1") {
        const pos = setHubSelectionPos(player, "pos1");
        player.tell(`§a已设置 pos1: ${formatHubSelectionPos(pos)}`);
        return;
    }

    if (action === "pos2") {
        const pos = setHubSelectionPos(player, "pos2");
        player.tell(`§a已设置 pos2: ${formatHubSelectionPos(pos)}`);
        return;
    }

    if (action === "save") {
        saveHubProtectionRegion(player, args[1], args.slice(2).join(" ").trim());
        return;
    }

    if (action === "info") {
        showHubProtectionInfo(player, args[1]);
        const selection = getHubSelection(player);
        player.tell(`§7当前 pos1: ${formatHubSelectionPos(selection.pos1)}`);
        player.tell(`§7当前 pos2: ${formatHubSelectionPos(selection.pos2)}`);
        return;
    }

    if (action === "list") {
        listHubProtectionRegions(player);
        return;
    }

    if (action === "on") {
        const region = getHubProtectionRegion(args[1]);
        if (!region) {
            player.tell("§c指定保护区域不存在");
            return;
        }
        const regions = getHubProtectionRegions();
        regions[region.id].enabled = true;
        saveHubProtectionRegions(regions);
        player.tell(`§a保护区域 ${region.id} 已启用`);
        return;
    }

    if (action === "off") {
        const region = getHubProtectionRegion(args[1]);
        if (!region) {
            player.tell("§c指定保护区域不存在");
            return;
        }
        const regions = getHubProtectionRegions();
        regions[region.id].enabled = false;
        saveHubProtectionRegions(regions);
        player.tell(`§e保护区域 ${region.id} 已关闭`);
        return;
    }

    if (action === "allow") {
        addRegionAllowedPlayer(player, args[1], args.slice(2).join(" ").trim());
        return;
    }

    if (action === "disallow") {
        removeRegionAllowedPlayer(player, args[1], args.slice(2).join(" ").trim());
        return;
    }

    if (action === "listallow") {
        listRegionAllowedPlayers(player, args[1]);
        return;
    }

    if (action === "clear") {
        const target = String(args[1] || "").toLowerCase();
        const regions = getHubProtectionRegions();
        if (target === "all") {
            saveHubProtectionRegions({});
            player.tell("§a已清除全部保护区域");
            return;
        }

        const region = getHubProtectionRegion(target);
        if (!region) {
            player.tell("§c指定保护区域不存在");
            return;
        }
        delete regions[region.id];
        saveHubProtectionRegions(regions);
        player.tell(`§a已清除保护区域 ${region.id}`);
        return;
    }

    showHubProtectionUsage(player);
}

function registerHubProtectionCommand() {
    const commandName = getHubProtectionCommand();
    registerTruePlayerCommand(commandName, "主城保护设置", PermType.GameMasters, (command) => {
        mandatoryEnum(command, "hubpos", ["pos1", "pos2", "list"]);
        mandatoryEnum(command, "hubsave", ["save"]);
        command.mandatory("regionid", ParamType.String);
        command.optional("regionname", ParamType.RawText);
        mandatoryEnum(command, "hubregion", ["info", "on", "off", "listallow"]);
        command.mandatory("regionidb", ParamType.String);
        mandatoryEnum(command, "hubplayer", ["allow", "disallow"]);
        command.mandatory("regionidc", ParamType.String);
        command.mandatory("playername", ParamType.RawText);
        mandatoryEnum(command, "hubclear", ["clear"]);
        command.mandatory("regionidd", ParamType.String);
        command.overload([]);
        command.overload(["hubpos"]);
        command.overload(["hubsave", "regionid", "regionname"]);
        command.overload(["hubregion", "regionidb"]);
        command.overload(["hubplayer", "regionidc", "playername"]);
        command.overload(["hubclear", "regionidd"]);
    }, (player, results) => {
        if (results.hubpos) {
            handleHubProtectionCommand(player, [results.hubpos]);
            return;
        }
        if (results.hubsave) {
            handleHubProtectionCommand(player, ["save", getCommandString(results, "regionid"), getCommandString(results, "regionname")]);
            return;
        }
        if (results.hubregion) {
            handleHubProtectionCommand(player, [results.hubregion, getCommandString(results, "regionidb")]);
            return;
        }
        if (results.hubplayer) {
            handleHubProtectionCommand(player, [results.hubplayer, getCommandString(results, "regionidc"), getCommandString(results, "playername")]);
            return;
        }
        if (results.hubclear) {
            handleHubProtectionCommand(player, ["clear", getCommandString(results, "regionidd")]);
            return;
        }
        handleHubProtectionCommand(player, []);
    }, () => {
        mc.regPlayerCmd(commandName, "主城保护设置", (player, args) => {
            handleHubProtectionCommand(player, normalizePlayerCmdArgs(args));
        }, 1);
    });
}

function registerCinematicCommand() {
    const cinematicCfg = getCinematicConfig();
    if (cinematicCfg.enabled === false) {
        return;
    }

    const commandName = getCinematicCommandName();
    registerTruePlayerCommand(commandName, "电影运镜系统", PermType.Any, (command) => {
        mandatoryEnum(command, "cinsimple", ["list", "stop", "end", "cancel"]);
        mandatoryEnum(command, "cinnamecmd", ["record", "play", "info", "remove"]);
        command.mandatory("cinname", ParamType.String);
        mandatoryEnum(command, "cinaddpoint", ["addpoint"]);
        command.optional("easetime", ParamType.Float);
        command.optional("easetype", ParamType.String);
        command.optional("holdtime", ParamType.Float);
        command.overload([]);
        command.overload(["cinsimple"]);
        command.overload(["cinnamecmd", "cinname"]);
        command.overload(["cinaddpoint", "easetime", "easetype", "holdtime"]);
    }, (player, results) => {
        if (results.cinsimple) {
            handleCinematicCommand(player, [results.cinsimple]);
            return;
        }
        if (results.cinnamecmd) {
            handleCinematicCommand(player, [results.cinnamecmd, getCommandString(results, "cinname")]);
            return;
        }
        if (results.cinaddpoint) {
            const args = ["addpoint"];
            if (results.easetime !== undefined) {
                args.push(String(results.easetime));
            }
            if (results.easetype !== undefined) {
                args.push(getCommandString(results, "easetype"));
            }
            if (results.holdtime !== undefined) {
                args.push(String(results.holdtime));
            }
            handleCinematicCommand(player, args);
            return;
        }
        handleCinematicCommand(player, []);
    }, () => {
        mc.regPlayerCmd(commandName, "电影运镜系统", (player, args) => {
            handleCinematicCommand(player, normalizePlayerCmdArgs(args));
        }, 0);
    });
}

// ============================================================
// Mute System — 玩家禁言
// ============================================================

function getMuteConfig() {
    const mute = config.get("mute", {});
    return mute && typeof mute === "object" ? mute : {};
}

function getMutePlayers() {
    const players = muteStore.get("players");
    if (players && typeof players === "object") {
        return players;
    }
    muteStore.set("players", {});
    return {};
}

function saveMutePlayers(players) {
    muteStore.set("players", players && typeof players === "object" ? players : {});
}

function normalizeMuteEntry(entry) {
    if (!entry || typeof entry !== "object") {
        return null;
    }
    return {
        name: String(entry.name || ""),
        mutedAt: Math.max(0, Number(entry.mutedAt) || 0),
        expireAt: Math.max(0, Number(entry.expireAt) || 0),
        reason: String(entry.reason || ""),
        mutedBy: String(entry.mutedBy || ""),
    };
}

function isMuteEntryActive(entry, now) {
    const normalized = normalizeMuteEntry(entry);
    if (!normalized) {
        return false;
    }
    return !normalized.expireAt || normalized.expireAt > now;
}

function getMutePlayerKey(player) {
    return player && (player.xuid || player.uuid || player.realName);
}

function findMutePlayerKey(input) {
    const query = String(input || "").trim();
    if (!query) {
        return "";
    }
    const online = mc.getPlayer(query);
    if (online) {
        return getMutePlayerKey(online);
    }
    const lower = query.toLowerCase();
    const players = getMutePlayers();
    for (const key in players) {
        const entry = normalizeMuteEntry(players[key]);
        if (!entry) {
            continue;
        }
        if (String(key).toLowerCase() === lower || String(entry.name || "").toLowerCase() === lower) {
            return key;
        }
    }
    return query;
}

function getMuteEntry(player) {
    const key = getMutePlayerKey(player);
    if (!key) {
        return null;
    }
    const players = getMutePlayers();
    const entry = normalizeMuteEntry(players[key]);
    if (!entry) {
        return null;
    }
    if (!isMuteEntryActive(entry, Date.now())) {
        delete players[key];
        saveMutePlayers(players);
        return null;
    }
    return entry;
}

function isPlayerMuted(player) {
    if (getMuteConfig().enabled === false) {
        return false;
    }
    return Boolean(getMuteEntry(player));
}

function checkMuteExpired(player) {
    const key = getMutePlayerKey(player);
    if (!key) {
        return false;
    }
    const players = getMutePlayers();
    const entry = normalizeMuteEntry(players[key]);
    if (!entry) {
        return false;
    }
    if (!isMuteEntryActive(entry, Date.now())) {
        delete players[key];
        saveMutePlayers(players);
        return true;
    }
    return false;
}

function migrateMuteEntryForPlayer(player) {
    const primary = getMutePlayerKey(player);
    const name = player && (player.realName || player.name);
    if (!primary || !name || name === primary) {
        return;
    }
    const players = getMutePlayers();
    if (!players[name]) {
        return;
    }
    if (players[primary]) {
        delete players[name];
    } else {
        players[primary] = players[name];
        delete players[name];
    }
    saveMutePlayers(players);
}

function isOpSender(sender) {
    return !sender || sender.isOP();
}

function getSenderName(sender) {
    return sender && sender.realName ? sender.realName : "CONSOLE";
}

function tellSender(sender, text) {
    if (sender && sender.tell) {
        sender.tell(String(text));
    } else {
        logger.info(stripMinecraftColorCodes(text));
    }
}

function parseMuteDuration(text) {
    const raw = String(text || "").trim().toLowerCase();
    if (!raw || raw === "0" || raw === "perm" || raw === "permanent") {
        return 0;
    }
    const match = raw.match(/^(\d+(?:\.\d+)?)([smhdw]?)$/);
    if (!match) {
        return -1;
    }
    const value = parseFloat(match[1]);
    if (isNaN(value) || value <= 0) {
        return -1;
    }
    const unit = match[2] || "m";
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return Math.floor(value * multipliers[unit]);
}

function formatMuteDuration(ms) {
    if (!ms) {
        return "永久";
    }
    const totalSeconds = Math.ceil(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${minutes}分`;
    if (minutes > 0) return `${minutes}分${seconds}秒`;
    return `${seconds}秒`;
}

function mutePlayer(targetPlayer, durationMs, reason, adminName) {
    const key = getMutePlayerKey(targetPlayer);
    if (!key) {
        return false;
    }
    const now = Date.now();
    const players = getMutePlayers();
    players[key] = {
        name: targetPlayer.realName || targetPlayer.name || key,
        mutedAt: now,
        expireAt: durationMs > 0 ? now + durationMs : 0,
        reason: String(reason || getMuteConfig().defaultReason || ""),
        mutedBy: String(adminName || ""),
    };
    saveMutePlayers(players);
    return true;
}

function unmutePlayerByKey(key) {
    const players = getMutePlayers();
    if (!players[key]) {
        return false;
    }
    delete players[key];
    saveMutePlayers(players);
    return true;
}

function buildMuteInfoText(player) {
    const entry = getMuteEntry(player);
    if (!entry) {
        return "§a你当前未被禁言。";
    }
    const duration = entry.expireAt
        ? `${formatMuteDuration(entry.expireAt - Date.now())} 后解除`
        : "永久禁言";
    return [
        "§c你已被禁言",
        `§7时长: §f${duration}`,
        `§7原因: §f${entry.reason || "未说明"}`,
        `§7操作人: §f${entry.mutedBy || "未知"}`,
    ].join("\n");
}

function handleMuteCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    if (!isOpSender(player)) {
        player.tell("§c你没有权限使用该命令");
        return;
    }
    if (!args.length) {
        tellSender(player, "§e/mute <玩家> [时长] [原因]");
        tellSender(player, "§7时长: 30m, 1h, 7d, 0=永久; 省略=永久");
        return;
    }
    const targetName = String(args[0]).trim();
    const target = findOnlinePlayerByName(targetName);
    let durationMs = 0;
    let reason = "";
    if (args.length > 1) {
        const parsed = parseMuteDuration(args[1]);
        if (parsed < 0) {
            tellSender(player, "§c时长格式无效，支持: 30m, 1h, 7d, 0=永久");
            return;
        }
        durationMs = parsed;
        if (args.length > 2) {
            reason = args.slice(2).join(" ").trim();
        }
    }
    if (!reason) {
        reason = String(getMuteConfig().defaultReason || "违反服务器规定");
    }
    if (target) {
        mutePlayer(target, durationMs, reason, getSenderName(player));
        target.tell(buildMuteInfoText(target));
        tellSender(player, `§a已禁言 ${target.realName} ${durationMs > 0 ? formatMuteDuration(durationMs) : "永久"}`);
        return;
    }
    // Offline mute: store under the name key; migrated to xuid key on join.
    const key = findMutePlayerKey(targetName);
    if (!key) {
        tellSender(player, "§c无法确定目标玩家");
        return;
    }
    const players = getMutePlayers();
    players[key] = {
        name: targetName,
        mutedAt: Date.now(),
        expireAt: durationMs > 0 ? Date.now() + durationMs : 0,
        reason: reason,
        mutedBy: getSenderName(player),
    };
    saveMutePlayers(players);
    tellSender(player, `§a已禁言 ${targetName} ${durationMs > 0 ? formatMuteDuration(durationMs) : "永久"} (离线)`);
}

function handleUnmuteCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    if (!isOpSender(player)) {
        player.tell("§c你没有权限使用该命令");
        return;
    }
    if (!args.length) {
        tellSender(player, "§e/unmute <玩家>");
        return;
    }
    const targetName = String(args[0]).trim();
    const key = findMutePlayerKey(targetName);
    if (!key) {
        tellSender(player, "§c未找到该玩家");
        return;
    }
    if (unmutePlayerByKey(key)) {
        const online = mc.getOnlinePlayers().find((p) => getMutePlayerKey(p) === key);
        if (online) {
            online.tell("§a你已被解除禁言。");
        }
        tellSender(player, `§a已解除 ${targetName} 的禁言`);
        return;
    }
    tellSender(player, `§e${targetName} 当前未被禁言`);
}

function handleMuteListCommand(player) {
    if (!isOpSender(player)) {
        player.tell("§c你没有权限使用该命令");
        return;
    }
    const players = getMutePlayers();
    const now = Date.now();
    const lines = [];
    for (const key in players) {
        const entry = normalizeMuteEntry(players[key]);
        if (!entry || !isMuteEntryActive(entry, now)) {
            continue;
        }
        const duration = entry.expireAt
            ? `${formatMuteDuration(entry.expireAt - now)} 后解除`
            : "永久";
        lines.push(`§e${entry.name || key} §7- ${duration} §7原因: §f${entry.reason || "未说明"} §7操作: §f${entry.mutedBy || "未知"}`);
    }
    if (!lines.length) {
        tellSender(player, "§e当前没有活跃的禁言记录");
        return;
    }
    tellSender(player, "§6====== 禁言列表 ======");
    tellSender(player, lines.join("\n"));
}

function handleMuteInfoCommand(player, args) {
    args = normalizePlayerCmdArgs(args);
    if (!args.length) {
        if (player) {
            player.tell(buildMuteInfoText(player));
        } else {
            tellSender(player, "§e用法: /muteinfo <玩家>");
        }
        return;
    }
    if (player && !player.isOP()) {
        player.tell(buildMuteInfoText(player));
        return;
    }
    const targetName = String(args[0]).trim();
    const target = mc.getPlayer(targetName);
    if (target) {
        tellSender(player, buildMuteInfoText(target));
        return;
    }
    const key = findMutePlayerKey(targetName);
    const entry = normalizeMuteEntry(getMutePlayers()[key]);
    if (!entry || !isMuteEntryActive(entry, Date.now())) {
        tellSender(player, `§e${targetName} 未被禁言`);
        return;
    }
    const duration = entry.expireAt
        ? `${formatMuteDuration(entry.expireAt - Date.now())} 后解除`
        : "永久禁言";
    tellSender(player, `§c${entry.name || targetName}`);
    tellSender(player, `§7时长: §f${duration}`);
    tellSender(player, `§7原因: §f${entry.reason || "未说明"}`);
    tellSender(player, `§7操作人: §f${entry.mutedBy || "未知"}`);
}

function registerMuteCommands() {
    const muteCfg = getMuteConfig();
    if (muteCfg.enabled === false) {
        return;
    }
    const muteCmd = String(muteCfg.command || "mute").trim() || "mute";
    const unmuteCmd = String(muteCfg.unmuteCommand || "unmute").trim() || "unmute";
    const listCmd = String(muteCfg.listCommand || "mutelist").trim() || "mutelist";
    const infoCmd = String(muteCfg.infoCommand || "muteinfo").trim() || "muteinfo";

    mc.regPlayerCmd(muteCmd, "禁言玩家", (player, args) => {
        handleMuteCommand(player, normalizePlayerCmdArgs(args));
    }, 1);
    mc.regPlayerCmd(unmuteCmd, "解除禁言", (player, args) => {
        handleUnmuteCommand(player, normalizePlayerCmdArgs(args));
    }, 1);
    mc.regPlayerCmd(listCmd, "查看禁言列表", (player) => {
        handleMuteListCommand(player);
    }, 1);
    mc.regPlayerCmd(infoCmd, "查看禁言状态", (player, args) => {
        handleMuteInfoCommand(player, normalizePlayerCmdArgs(args));
    }, 0);

    mc.regConsoleCmd(muteCmd, "禁言玩家(控制台)", (args) => {
        handleMuteCommand(null, normalizePlayerCmdArgs(args));
    });
    mc.regConsoleCmd(unmuteCmd, "解除禁言(控制台)", (args) => {
        handleUnmuteCommand(null, normalizePlayerCmdArgs(args));
    });
    mc.regConsoleCmd(listCmd, "查看禁言列表(控制台)", () => {
        handleMuteListCommand(null);
    });
    mc.regConsoleCmd(infoCmd, "查看禁言状态(控制台)", (args) => {
        handleMuteInfoCommand(null, normalizePlayerCmdArgs(args));
    });
}

initConfig();
registerCommands();

// ============================================================
// Cross-plugin API (lazy imports; failures degrade, never throw)
// ============================================================
function importCached(cache, namespace, name) {
    if (Object.prototype.hasOwnProperty.call(cache, name)) {
        return cache[name];
    }

    let fn = null;
    try {
        if (typeof ll.hasExported !== "function" || ll.hasExported(namespace, name)) {
            const imported = ll.imports(namespace, name);
            if (typeof imported === "function") {
                fn = imported;
            }
        }
    } catch (error) {
        fn = null;
    }

    if (fn) {
        cache[name] = fn;
    }
    return fn;
}

function importVip(name) {
    return importCached(vipApiCache, VIP_NAMESPACE, name);
}

function importTpa(name) {
    return importCached(tpaApiCache, TPA_NAMESPACE, name);
}

function getVipStatusSafe(player) {
    const fn = importVip("getVipStatus");
    if (fn) {
        try {
            const status = fn(player);
            if (status && typeof status === "object") {
                return status;
            }
        } catch (error) {
            logger.warn(`VIP getVipStatus failed: ${error}`);
        }
    }
    return { isVip: false, level: "", display: "", expireAt: 0 };
}

function applyVipRewardMultiplierSafe(player, reward, key) {
    const base = Math.max(0, Math.floor(Number(reward) || 0));
    const fn = importVip("getRewardMultiplier");
    if (fn) {
        try {
            const multiplier = Number(fn(player, key, 1));
            if (!isNaN(multiplier) && multiplier > 0) {
                return Math.max(0, Math.floor(base * multiplier));
            }
        } catch (error) {
            logger.warn(`VIP getRewardMultiplier failed: ${error}`);
        }
    }
    return base;
}

function consumeChatInput(player, msg) {
    const fn = importTpa("handleChatInput");
    if (!fn) {
        return false;
    }
    try {
        return fn(player, msg) === true;
    } catch (error) {
        logger.warn(`TPA handleChatInput failed: ${error}`);
        return false;
    }
}

function renderChatLine(player, msg) {
    const fn = importVip("format");
    if (fn) {
        try {
            const text = fn(null, player, msg);
            if (typeof text === "string" && text) {
                return text;
            }
        } catch (error) {
            logger.warn(`VIP format failed: ${error}`);
        }
    }
    return `${player.realName}: ${msg}`;
}

// ============================================================
// Command registration (title/name/VIP/fly/teleport/seat moved out)
// ============================================================
function registerCommands() {
    registerDailyCommand();

    mc.regConsoleCmd("dailytasks", "列出今日每日任务", () => {
        for (const line of getDailyTaskListLines()) {
            logger.info(line);
        }
    });

    const transfer = getTransferConfig();
    const transferCommand = String(transfer.command || "serverhub").trim() || "serverhub";
    mc.regPlayerCmd(transferCommand, "前往目标服务器", (player) => {
        transferPlayerToConfiguredServer(player);
    }, 0);

    registerHubProtectionCommand();
    registerCinematicCommand();
    registerMuteCommands();
}

// ============================================================
// Runtime exports (for LuckyClover-Sidebar / LuckyClover-VIP)
// ============================================================
exportApi("getOnlineTimeColor", (player) => {
    try {
        return getOnlineTimeColor(player);
    } catch (error) {
        return "";
    }
});

exportApi("getSidebarExtras", (player) => {
    try {
        const summary = getDailyTaskSummary(player);
        const extras = {
            dailyTaskTotal: summary.total,
            dailyTaskCompleted: summary.completed,
            dailyTaskProgress: `${summary.completed}/${summary.total}`,
            onlineTime: formatOnlineTimeShort(getPlayerOnlineTime(player)),
        };
        const ranking = getOnlineTimeRankingValues();
        for (const key in ranking) {
            extras[key] = ranking[key];
        }
        // 排行页行用计分板分数列显示在线时长（秒），行内只留名字避免字数截断
        const board = getOnlineTimeLeaderboard(ONLINE_TIME_RANKING_COUNT);
        extras.topOnlineSeconds = board.map((entry) => entry.seconds);
        return extras;
    } catch (error) {
        logger.warn(`getSidebarExtras failed: ${error}`);
        return null;
    }
});

// ============================================================
// Management exports (JSON string in/out for the web panel)
// ============================================================
const MAIN_CONFIG_KEYS = [
    "chatFormatMode", "chatBridge", "joinNotify", "transfer", "hubProtection",
    "dailyTasks", "nameColor", "cinematic", "mute",
];

function jsonOk(extra) {
    return JSON.stringify(Object.assign({ ok: true }, extra || {}));
}

function jsonError(error) {
    return JSON.stringify({ ok: false, error: String(error || "unknown error") });
}

exportApi("mgmtGetConfig", () => {
    const result = {};
    for (const key of MAIN_CONFIG_KEYS) {
        result[key] = config.get(key);
    }
    return JSON.stringify(result);
});

exportApi("mgmtSetConfig", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return jsonError("config must be a JSON object");
        }
        for (const key of Object.keys(parsed)) {
            if (MAIN_CONFIG_KEYS.indexOf(key) < 0) {
                return jsonError(`unknown config key: ${key}`);
            }
        }
        for (const key of Object.keys(parsed)) {
            const incoming = parsed[key];
            const existing = config.get(key);
            // 合并写入：未提供的子键保留原值，防止整体替换丢配置
            config.set(key, (incoming && typeof incoming === "object" && !Array.isArray(incoming)
                && existing && typeof existing === "object" && !Array.isArray(existing))
                ? Object.assign({}, existing, incoming)
                : incoming);
        }
        return jsonOk();
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtReload", () => {
    try {
        if (typeof config.refresh === "function") {
            config.refresh();
        }
        return jsonOk();
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtStatus", () => {
    const mutes = muteStore.get("players") || {};
    return JSON.stringify({
        ok: true,
        version: PLUGIN_VERSION.join("."),
        chatFormatMode: String(config.get("chatFormatMode", "vanilla")),
        dailyTaskLoop: dailyTaskLoopStarted,
        onlineTimeLoop: onlineTimeLoopStarted,
        muteCount: Object.keys(mutes).length,
        onlinePlayers: mc.getOnlinePlayers().length,
        vipApi: importVip("format") !== null,
        tpaApi: importTpa("handleChatInput") !== null,
    });
});

exportApi("mgmtListDailyTasks", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const name = String(parsed.name || "").trim();
        let player = null;
        if (name) {
            const lowered = name.toLowerCase();
            for (const item of mc.getOnlinePlayers()) {
                if (String(item.realName || "").toLowerCase() === lowered) {
                    player = item;
                    break;
                }
            }
        }
        const tasks = getActiveDailyTaskDefs().map((task) => {
            const entry = { id: task.id, name: task.name, required: task.required, reward: task.reward };
            if (player) {
                const state = getDailyTaskState(player);
                entry.progress = Number(state.progress[task.id] || 0);
                entry.claimed = Boolean(state.claimed[task.id]);
            }
            return entry;
        });
        return JSON.stringify({ ok: true, day: getCurrentDailyTaskDayKey(), tasks });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtGetOnlineTop", (json) => {
    try {
        const parsed = JSON.parse(String(json || "{}"));
        const count = Math.max(1, Math.min(50, Number(parsed.count) || 10));
        const ranking = getOnlineTimeLeaderboard(count);
        return JSON.stringify({ ok: true, ranking });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtMuteList", () => {
    try {
        const players = muteStore.get("players") || {};
        const now = Date.now();
        const list = [];
        for (const key in players) {
            const entry = players[key];
            if (entry && typeof entry === "object") {
                const expireAt = Number(entry.expireAt) || 0;
                if (!expireAt || expireAt > now) {
                    list.push({
                        key,
                        name: String(entry.name || key),
                        reason: String(entry.reason || ""),
                        expireAt,
                        mutedBy: String(entry.mutedBy || ""),
                    });
                }
            }
        }
        return JSON.stringify({ ok: true, mutes: list });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtUnmute", (json) => {
    try {
        const parsed = JSON.parse(String(json));
        const name = String(parsed && parsed.name || "").trim();
        if (!name) {
            return jsonError("name is required");
        }
        const players = muteStore.get("players") || {};
        const target = findMutePlayerKey(name);
        if (!target || !players[target]) {
            return jsonError("mute entry not found");
        }
        delete players[target];
        muteStore.set("players", players);
        const online = findOnlinePlayerByName(name);
        if (online) {
            online.tell("§a你已被解除禁言");
        }
        return jsonOk({ key: target });
    } catch (error) {
        return jsonError(error);
    }
});

exportApi("mgmtHubRegions", () => {
    try {
        const regions = getHubProtectionRegions();
        const list = [];
        for (const id in regions) {
            const region = regions[id];
            list.push({
                id,
                name: String(region.name || id),
                enabled: region.enabled !== false,
                allow: Array.isArray(region.allow) ? region.allow : [],
            });
        }
        return JSON.stringify({ ok: true, regions: list });
    } catch (error) {
        return jsonError(error);
    }
});

// ============================================================
// Events (onChat 单一属主；其余事件与拆出插件各挂各的)
// ============================================================
mc.listen("onServerStarted", () => {
    scheduleDailyTaskLoop();
    scheduleOnlineTimeLoop();
    mc.runcmdEx(`scoreboard objectives add ${ONLINE_TIME_SCOREBOARD_OBJ} dummy 在线时长(秒)`);
    const vipConnected = importVip("format") !== null;
    const tpaConnected = importTpa("handleChatInput") !== null;
    logger.info(`LuckyClover-Plugin v${PLUGIN_VERSION.join(".")} loaded (VIP API: ${vipConnected ? "ok" : "missing"}, TPA API: ${tpaConnected ? "ok" : "missing"})`);
});

mc.listen("onJoin", (player) => {
    notifyPlayerJoin(player);
    migrateMuteEntryForPlayer(player);
    checkMuteExpired(player);
    startOnlineSession(player);
});

mc.listen("onLeft", (player) => {
    endOnlineSession(player);
    clearSession(player);
});

mc.listen("onChat", (player, msg) => {
    if (consumeChatInput(player, msg)) {
        return false;
    }

    if (isPlayerMuted(player)) {
        player.tell(buildMuteInfoText(player));
        return false;
    }

    const chatFormatMode = String(config.get("chatFormatMode", "vanilla") || "vanilla").toLowerCase();
    if (chatFormatMode !== "override") {
        return true;
    }

    const text = renderChatLine(player, msg);
    sendChatToBridge(player.name, msg);
    mc.broadcast(text);
    return false;
});

mc.listen("onPlaceBlock", (player, block) => {
    const region = getHubProtectionRegionAtPos(block.pos);
    if (canBypassHubProtection(player) || !region || isPlayerAllowedInRegion(player, region)) {
        return;
    }

    return denyHubProtection(player, "放置方块", region);
});

mc.listen("onDestroyBlock", (player, block) => {
    const region = getHubProtectionRegionAtPos(block.pos);
    if (canBypassHubProtection(player) || !region || isPlayerAllowedInRegion(player, region)) {
        addDailyTaskProgress(player, "break", 1, block.type);
        if (isMatureCrop(block)) {
            addDailyTaskProgress(player, "harvest", 1, block.type);
        }
        return;
    }

    return denyHubProtection(player, "破坏方块", region);
});

mc.listen("onUseItemOn", (player, _item, block) => {
    const region = getHubProtectionRegionAtPos(block.pos);
    if (canBypassHubProtection(player) || !region || isPlayerAllowedInRegion(player, region)) {
        return;
    }

    return denyHubProtection(player, "与方块交互", region);
});

mc.listen("onOpenContainer", (player, block) => {
    const region = getHubProtectionRegionAtPos(block.pos);
    if (canBypassHubProtection(player) || !region || isPlayerAllowedInRegion(player, region)) {
        return;
    }

    return denyHubProtection(player, "打开容器", region);
});

mc.listen("afterPlaceBlock", (player, block) => {
    addDailyTaskProgress(player, "place", 1, block.type);
});

mc.listen("onMobDie", (mob, source) => {
    if (!source || !source.isPlayer || !source.isPlayer()) {
        return;
    }

    const player = source.toPlayer();
    if (!player || mob.isPlayer && mob.isPlayer()) {
        return;
    }

    addDailyTaskProgress(player, "kill", 1, mob.type);
});

mc.listen("onAttackEntity", (player, entity) => {
    const region = getHubProtectionRegionAtPos(entity.pos);
    if (canBypassHubProtection(player) || !region || isPlayerAllowedInRegion(player, region)) {
        return;
    }

    return denyHubProtection(player, "攻击实体", region);
});

// ============================================================
// Cinematic Camera System — 电影式玩家视角运镜
// ============================================================

const CINEMATIC_DATA_PATH = `${BASE_DIR}cinematics.json`;
const VALID_EASE_TYPES = {
    linear: "linear",
    spring: "spring",
    in_quad: "in_quad", out_quad: "out_quad", in_out_quad: "in_out_quad",
    in_cubic: "in_cubic", out_cubic: "out_cubic", in_out_cubic: "in_out_cubic",
    in_sine: "in_sine", out_sine: "out_sine", in_out_sine: "in_out_sine",
    in_expo: "in_expo", out_expo: "out_expo", in_out_expo: "in_out_expo",
    in_quart: "in_quart", out_quart: "out_quart", in_out_quart: "in_out_quart",
    in_quint: "in_quint", out_quint: "out_quint", in_out_quint: "in_out_quint",
    in_circ: "in_circ", out_circ: "out_circ", in_out_circ: "in_out_circ",
    in_back: "in_back", out_back: "out_back", in_out_back: "in_out_back",
    in_bounce: "in_bounce", out_bounce: "out_bounce", in_out_bounce: "in_out_bounce",
    in_elastic: "in_elastic", out_elastic: "out_elastic", in_out_elastic: "in_out_elastic",
};

// Recording & playback sessions: { playerRealName: { ... } }
const cinematicSessions = {};

// ---- Config helpers ----

function getCinematicConfig() {
    const cfg = config.get("cinematic", {});
    return cfg && typeof cfg === "object" ? cfg : {};
}

function getCinematicCommandName() {
    return String(getCinematicConfig().command || "cinematic").trim() || "cinematic";
}

// ---- Data store ----

const cinematicStore = new JsonConfigFile(CINEMATIC_DATA_PATH, "{}");

function getAllCinematics() {
    const data = cinematicStore.get("data");
    return data && typeof data === "object" ? data : {};
}

function saveAllCinematics(all) {
    cinematicStore.set("data", all);
}

function getCinematicData(name) {
    const all = getAllCinematics();
    return all[name] || null;
}

function saveCinematic(name, data) {
    const all = getAllCinematics();
    all[name] = data;
    saveAllCinematics(all);
}

function deleteCinematic(name) {
    const all = getAllCinematics();
    delete all[name];
    saveAllCinematics(all);
}

// ---- Session helpers ----

function getPlayerSessionKey(player) {
    return player.xuid || player.realName;
}

function getSession(player) {
    return cinematicSessions[getPlayerSessionKey(player)];
}

function setSession(player, session) {
    cinematicSessions[getPlayerSessionKey(player)] = session;
}

function clearSession(player) {
    delete cinematicSessions[getPlayerSessionKey(player)];
}

// ---- Recording ----

function cmdCinematicRecord(player, recordName) {
    if (!player.isOP()) {
        player.tell("§c你没有权限使用该命令");
        return false;
    }
    const name = String(recordName || "").trim();
    if (!name) {
        player.tell(`§e用法: /${getCinematicCommandName()} record <运镜名称>`);
        return false;
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5\-]+$/.test(name)) {
        player.tell("§c运镜名称只能包含字母、数字、下划线、中文和短横线");
        return false;
    }
    if (getCinematicData(name)) {
        player.tell(`§c运镜 "${name}" 已存在，请使用其他名称`);
        return false;
    }
    const existing = getSession(player);
    if (existing) {
        if (existing.isRecording) {
            player.tell(`§e你已经在录制运镜 "${existing.name}"，请先 /${getCinematicCommandName()} end 结束`);
            return false;
        }
        // Stop any ongoing playback first
        cmdCinematicStop(player);
    }
    setSession(player, {
        name: name,
        waypoints: [],
        isRecording: true,
    });
    player.tell(`§a开始录制运镜 "${name}"`);
    player.tell(`§e使用 /${getCinematicCommandName()} addpoint 添加关键帧`);
    player.tell(`§e使用 /${getCinematicCommandName()} end 结束录制`);
    return true;
}

function cmdCinematicAddPoint(player, args) {
    const session = getSession(player);
    if (!session || !session.isRecording) {
        player.tell(`§c你没有在录制中，请使用 /${getCinematicCommandName()} record <名称> 开始录制`);
        return;
    }
    const cfg = getCinematicConfig();
    const easeTime = parseFloat(args[0]);
    const holdTime = parseFloat(args[2]);
    const finalEaseTime = !isNaN(easeTime) && easeTime >= 0 ? easeTime : Number(cfg.defaultEaseTime) || 2.0;
    const finalHoldTime = !isNaN(holdTime) && holdTime >= 0 ? holdTime : Number(cfg.defaultHoldTime) || 3.0;
    const easeTypeRaw = String(args[1] || "").toLowerCase().trim();
    const easeType = VALID_EASE_TYPES[easeTypeRaw] || String(cfg.defaultEaseType || "linear");

    const pos = player.pos;
    const dir = player.direction;

    // If this is the first waypoint, store easeTime=0 (snap)
    const wpEaseTime = session.waypoints.length === 0 ? 0 : finalEaseTime;
    const wpEaseType = session.waypoints.length === 0 ? "linear" : easeType;

    const waypoint = {
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { yaw: dir.yaw || 0, pitch: dir.pitch || 0 },
        easeTime: wpEaseTime,
        easeType: wpEaseType,
        holdTime: finalHoldTime,
    };
    session.waypoints.push(waypoint);
    player.tell(`§a已添加关键帧 #${session.waypoints.length}`);
    player.tell(`  §7位置: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
    player.tell(`  §7视角: 偏航=${(dir.yaw || 0).toFixed(1)}° 俯仰=${(dir.pitch || 0).toFixed(1)}°`);
    if (session.waypoints.length > 1) {
        player.tell(`  §7过渡: ${finalEaseTime}s ${easeType} | 停留: ${finalHoldTime}s`);
    } else {
        player.tell(`  §7起始帧, 停留: ${finalHoldTime}s`);
    }

    const maxWp = Number(cfg.maxWaypoints) || 50;
    if (session.waypoints.length >= maxWp) {
        player.tell(`§e已达最大关键帧数量(${maxWp})，自动结束录制`);
        cmdCinematicEnd(player);
    }
}

function cmdCinematicEnd(player) {
    if (!player.isOP()) {
        player.tell("§c你没有权限使用该命令");
        return false;
    }
    const session = getSession(player);
    if (!session || !session.isRecording) {
        player.tell(`§c你没有在录制中`);
        return false;
    }
    if (session.waypoints.length < 2) {
        player.tell("§c至少需要录制 2 个关键帧才能保存运镜");
        return false;
    }
    // Fix: first waypoint's easeTime was set to 0 during recording, keep it
    const data = {
        waypoints: session.waypoints,
        createdBy: player.realName,
        createdAt: new Date().toISOString(),
        totalTime: calculateTotalTime(session.waypoints),
    };
    saveCinematic(session.name, data);
    clearSession(player);
    player.tell(`§a运镜 "${session.name}" 已保存!`);
    player.tell(`§7包含 ${data.waypoints.length} 个关键帧, 总时长约 ${data.totalTime.toFixed(1)} 秒`);
    return true;
}

function calculateTotalTime(waypoints) {
    let total = 0;
    for (let i = 0; i < waypoints.length; i++) {
        total += waypoints[i].holdTime ?? 3;
        if (i > 0) {
            total += waypoints[i].easeTime ?? 2;
        }
    }
    return total;
}

// ---- Playback ----

function cmdCinematicPlay(player, name) {
    if (!name) {
        player.tell(`§e用法: /${getCinematicCommandName()} play <运镜名称>`);
        return false;
    }
    const data = getCinematicData(name);
    if (!data || !data.waypoints || !Array.isArray(data.waypoints) || data.waypoints.length < 2) {
        player.tell(`§c运镜 "${name}" 不存在或包含的关键帧不足`);
        return false;
    }
    // Stop any existing playback
    cmdCinematicStop(player);

    // Set playback session
    setSession(player, {
        playingName: name,
        waypoints: data.waypoints,
        currentIndex: 0,
        isRecording: false,
    });

    // Start sequential playback
    scheduleCinematicWaypoints(player, name, data.waypoints, 0);
    player.tell(`§a开始播放运镜 "${name}"`);
    return true;
}

function buildCameraSetCmd(player, wp, isInitial) {
    const p = wp.position;
    const r = wp.rotation;
    const pos = `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`;
    const rot = `${r.pitch.toFixed(2)} ${r.yaw.toFixed(2)}`;
    const name = escapeCmdString(player.realName);

    if (isInitial || wp.easeTime <= 0) {
        // First frame: snap to position (no ease)
        return `camera "${name}" set minecraft:free pos ${pos} rot ${rot}`;
    }
    // Subsequent frames: ease BEFORE pos+rot (Minecraft command syntax requirement)
    return `camera "${name}" set minecraft:free ease ${wp.easeTime.toFixed(1)} ${wp.easeType} pos ${pos} rot ${rot}`;
}

function buildCameraClearCmd(player) {
    return `camera "${escapeCmdString(player.realName)}" clear`;
}

function scheduleCinematicWaypoints(player, name, waypoints, index) {
    if (index >= waypoints.length) {
        // Done
        clearSession(player);
        try { mc.runcmdEx(buildCameraClearCmd(player)); } catch (e) { logger.error(`清除相机失败: ${e}`); }
        player.tell(`§a运镜 "${name}" 播放完毕`);
        return;
    }

    const wp = waypoints[index];
    const isInitial = index === 0;
    const cmd = buildCameraSetCmd(player, wp, isInitial);
    try { mc.runcmdEx(cmd); } catch (e) { logger.error(`执行相机命令失败: ${e}`); }

    // Update session state
    const session = getSession(player);
    if (session) {
        session.currentIndex = index;
        session.playingName = name;
    }

    // How long until next waypoint?
    // For initial frame: just the holdTime
    // For subsequent frames: easeTime + holdTime (ease time is for camera transition)
    let delayMs;
    if (isInitial) {
        delayMs = (wp.holdTime ?? 3) * 1000;
    } else {
        delayMs = (wp.easeTime ?? 2) * 1000 + (wp.holdTime ?? 3) * 1000;
    }

    const nextIndex = index + 1;

    // Schedule next waypoint — use a stopped flag so we don't need clearTimeout
    setTimeout(() => {
        const current = getSession(player);
        if (current && !current.stopped && current.playingName === name && !current.isRecording) {
            scheduleCinematicWaypoints(player, name, waypoints, nextIndex);
        }
    }, delayMs);
}

function cmdCinematicStop(player) {
    const session = getSession(player);
    if (session) {
        // Set stopped flag so pending timeouts don't advance playback
        session.stopped = true;
        clearSession(player);
    }
    try { mc.runcmdEx(buildCameraClearCmd(player)); } catch (e) { logger.error(`清除相机失败: ${e}`); }
    player.tell(`§e已停止运镜播放`);
    return true;
}

function cmdCinematicStopRecording(player) {
    const session = getSession(player);
    if (session && session.isRecording) {
        clearSession(player);
        player.tell(`§e已取消录制`);
        return true;
    }
    return false;
}

// ---- List & Info ----

function cmdCinematicList(player) {
    const all = getAllCinematics();
    const names = Object.keys(all);
    if (names.length === 0) {
        player.tell("§7暂无运镜");
        return;
    }
    player.tell("§6====== 可用运镜列表 ======");
    for (const name of names) {
        const data = all[name];
        const wpCount = data && data.waypoints ? data.waypoints.length : 0;
        const totalTime = data ? calculateTotalTime(data.waypoints || []) : 0;
        player.tell(`§e${name} §7- ${wpCount}帧, ${totalTime.toFixed(1)}秒`);
    }
    player.tell(`§7使用 /${getCinematicCommandName()} play <名称> 播放`);
}

function cmdCinematicInfo(player, name) {
    if (!name) {
        player.tell(`§e用法: /${getCinematicCommandName()} info <运镜名称>`);
        return;
    }
    const data = getCinematicData(name);
    if (!data || !data.waypoints) {
        player.tell(`§c运镜 "${name}" 不存在`);
        return;
    }
    const wps = data.waypoints;
    player.tell(`§6====== 运镜: ${name} ======`);
    player.tell(`§7创建者: ${data.createdBy || "未知"}`);
    player.tell(`§7创建时间: ${data.createdAt || "未知"}`);
    player.tell(`§7关键帧: ${wps.length}个`);
    player.tell(`§7总时长: ${calculateTotalTime(wps).toFixed(1)}秒`);
    for (let i = 0; i < wps.length; i++) {
        const wp = wps[i];
        const p = wp.position;
        const r = wp.rotation;
        let info = `  §e[${i + 1}] §7(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
        info += ` §7偏航=${r.yaw.toFixed(1)}°`;
        if (i > 0) info += ` §7过渡=${wp.easeTime}s ${wp.easeType}`;
        info += ` §7停留=${wp.holdTime ?? 3}s`;
        player.tell(info);
    }
}

function cmdCinematicRemove(player, name) {
    if (!player.isOP()) {
        player.tell("§c你没有权限使用该命令");
        return;
    }
    if (!name) {
        player.tell(`§e用法: /${getCinematicCommandName()} remove <运镜名称>`);
        return;
    }
    if (!getCinematicData(name)) {
        player.tell(`§c运镜 "${name}" 不存在`);
        return;
    }
    deleteCinematic(name);
    player.tell(`§a已删除运镜 "${name}"`);
}

// ---- Main command dispatcher ----

function handleCinematicCommand(player, args) {
    const cmdName = getCinematicCommandName();

    if (!args.length) {
        showCinematicHelp(player, cmdName);
        return;
    }

    const action = String(args[0]).toLowerCase();
    const rest = args.slice(1);

    switch (action) {
        case "record":
            cmdCinematicRecord(player, rest[0]);
            break;
        case "addpoint":
            cmdCinematicAddPoint(player, rest);
            break;
        case "end":
            cmdCinematicEnd(player);
            break;
        case "play":
            cmdCinematicPlay(player, rest[0]);
            break;
        case "stop":
            cmdCinematicStop(player);
            break;
        case "list":
            cmdCinematicList(player);
            break;
        case "info":
            cmdCinematicInfo(player, rest[0]);
            break;
        case "remove":
        case "rm":
        case "delete":
            cmdCinematicRemove(player, rest[0]);
            break;
        case "cancel":
            cmdCinematicStopRecording(player);
            break;
        default:
            showCinematicHelp(player, cmdName);
    }
}

function showCinematicHelp(player, cmdName) {
    player.tell(`§6====== 电影运镜系统 ======`);
    player.tell(`§e/${cmdName} §7- 显示本帮助`);
    player.tell(`§e/${cmdName} list §7- 列出所有运镜`);
    player.tell(`§e/${cmdName} info <名称> §7- 查看运镜详情`);
    player.tell(`§e/${cmdName} play <名称> §7- 播放运镜`);
    player.tell(`§e/${cmdName} stop §7- 停止播放`);
    if (player.isOP()) {
        player.tell(`§e/${cmdName} record <名称> §7- 开始录制`);
        player.tell(`§e/${cmdName} addpoint [过渡时间] [缓动类型] [停留时间] §7- 添加关键帧`);
        player.tell(`   §7缓动类型: ${Object.keys(VALID_EASE_TYPES).join(", ")}`);
        player.tell(`   §7默认: 过渡${getCinematicConfig().defaultEaseTime}s ${getCinematicConfig().defaultEaseType} 停留${getCinematicConfig().defaultHoldTime}s`);
        player.tell(`§e/${cmdName} end §7- 结束并保存录制`);
        player.tell(`§e/${cmdName} cancel §7- 取消录制`);
        player.tell(`§e/${cmdName} remove <名称> §7- 删除运镜`);
    }
}
