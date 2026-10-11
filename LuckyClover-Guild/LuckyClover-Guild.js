// LuckyClover-Guild — 轻量工会系统 MVP
// 创建、邀请、加入/退出、成员权限、公告与管理接口。
const PLUGIN_NAME = "LuckyClover-Guild";
const PLUGIN_DESC = "Guilds: create, invite, membership, roles and notices";
const PLUGIN_VERSION = [1, 0, 2];
const PLUGIN_EXTRA = { Author: "Mell" };
const NAMESPACE = "LuckyCloverGuild";
const BASE_DIR = "plugins/LuckyClover-Guild/";
const DATA_PATH = BASE_DIR + "guilds.json";
const CONFIG_PATH = BASE_DIR + "config.json";

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, PLUGIN_EXTRA);
logger.setTitle(PLUGIN_NAME);
File.mkdir(BASE_DIR);

function jsonOk(extra) { return JSON.stringify(Object.assign({ ok: true }, extra || {})); }
function jsonError(error) { return JSON.stringify({ ok: false, error: String(error || "unknown error") }); }
function exportApi(name, fn) { ll.export(fn, NAMESPACE, name); }
function argsOf(args) {
    if (Array.isArray(args)) return args.map((item) => String(item));
    const text = String(args || "").trim();
    return text ? text.split(/\s+/) : [];
}
function cleanText(value, max) {
    return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}
function lower(value) { return String(value || "").toLowerCase(); }
function now() { return Date.now(); }

const configStore = new JsonConfigFile(CONFIG_PATH, JSON.stringify({ config: {
    createCost: 1000,
    maxMembers: 30,
    nameMin: 2,
    nameMax: 16,
    tagMax: 6,
} }));
const dataStore = new JsonConfigFile(DATA_PATH, JSON.stringify({ data: { guilds: {}, invites: {}, applications: {}, players: {} } }));

function cfg() {
    let value = configStore.get("config");
    if (!value || typeof value !== "object") {
        value = {};
        ["createCost", "maxMembers", "nameMin", "nameMax", "tagMax"].forEach((key) => {
            const legacyValue = configStore.get(key);
            if (legacyValue !== undefined && legacyValue !== null) value[key] = legacyValue;
        });
    }
    const result = Object.assign({ createCost: 1000, maxMembers: 30, nameMin: 2, nameMax: 16, tagMax: 6 }, value || {});
    result.createCost = Math.max(1, Math.floor(Number(result.createCost) || 0));
    return result;
}
function saveCfg(value) { configStore.set("config", value); }
function data() {
    let value = dataStore.get("data");
    if (!value || typeof value !== "object") {
        value = {};
        ["guilds", "invites", "applications", "players"].forEach((key) => {
            const legacyValue = dataStore.get(key);
            if (legacyValue !== undefined && legacyValue !== null) value[key] = legacyValue;
        });
    }
    return Object.assign({ guilds: {}, invites: {}, applications: {}, players: {} }, value);
}
function saveData(value) { dataStore.set("data", value); }
function xuidOf(player) { return String((player && (player.xuid || player.uuid)) || ""); }
function nameOf(player) { return String((player && (player.realName || player.name)) || "未知玩家"); }
function guildId(name) { return String(name || "").toLowerCase(); }
function memberCount(guild) { return Object.keys(guild.members || {}).length; }
function getGuildForPlayer(xuid, store) {
    const source = store || data();
    for (const id of Object.keys(source.guilds || {})) {
        if (source.guilds[id] && source.guilds[id].members && source.guilds[id].members[xuid]) return { id, guild: source.guilds[id] };
    }
    return null;
}
function findPlayer(input) {
    const query = cleanText(input, 40);
    if (!query) return null;
    const direct = mc.getPlayer(query);
    if (direct) return direct;
    const list = mc.getOnlinePlayers();
    const exact = list.find((player) => lower(nameOf(player)) === lower(query));
    return exact || list.find((player) => lower(nameOf(player)).indexOf(lower(query)) >= 0);
}
function findKnownPlayer(input, store) {
    const online = findPlayer(input);
    if (online) return { xuid: xuidOf(online), name: nameOf(online), player: online };
    const query = lower(cleanText(input, 40));
    if (!query) return null;
    const source = store || data();
    for (const xuid of Object.keys(source.players || {})) {
        const record = source.players[xuid];
        if (lower(record.name) === query || lower(record.name).indexOf(query) >= 0) return { xuid, name: record.name, player: null };
    }
    for (const id of Object.keys(source.guilds || {})) {
        const members = source.guilds[id] && source.guilds[id].members ? source.guilds[id].members : {};
        for (const xuid of Object.keys(members)) {
            const record = members[xuid];
            if (lower(record.name) === query || lower(record.name).indexOf(query) >= 0) return { xuid, name: record.name, player: null };
        }
    }
    return null;
}
function rememberPlayer(player) {
    const xuid = xuidOf(player); const name = nameOf(player);
    if (!xuid || !name) return;
    const store = data(); store.players[xuid] = { xuid, name, lastSeen: now() }; saveData(store);
}
function tell(player, text) { if (player && typeof player.tell === "function") player.tell(String(text)); }
function sendGuildForm(player, title, content, buttons, callback) {
    if (!player || typeof player.sendSimpleForm !== "function") return false;
    const safeButtons = (buttons && buttons.length ? buttons : ["返回"]).map((button) => String(button || "按钮"));
    const images = safeButtons.map(() => "");
    player.sendSimpleForm("/L " + String(title || "工会"), String(content || " "), safeButtons, images, (_pl, index) => {
        if (index === null || index === undefined) return;
        callback(index);
    });
    return true;
}
function sendGuildInput(player, title, fields, callback) {
    try {
        if (typeof mc.newCustomForm === "function" && player && typeof player.sendForm === "function") {
            const form = mc.newCustomForm();
            form.setTitle("/TEXT " + String(title || "工会"));
            (fields || []).forEach((field) => form.addInput(String(field.label || "请输入"), String(field.placeholder || ""), String(field.value || "")));
            player.sendForm(form, (_pl, result) => {
                if (!result || result[0] === null || result[0] === undefined) return;
                callback(result.map((item) => String(item === null || item === undefined ? "" : item).trim()));
            });
            return true;
        }
    } catch (error) { logger.warn("工会输入表单打开失败: " + error); }
    tell(player, "§e当前客户端不支持输入表单，请使用指令完成此操作。");
    return false;
}
function roleOf(guild, xuid) { return guild && guild.members && guild.members[xuid] ? guild.members[xuid].role : ""; }
function canManage(guild, xuid) { return roleOf(guild, xuid) === "owner" || roleOf(guild, xuid) === "officer"; }
function getMoney(xuid) {
    try { return typeof money !== "undefined" && typeof money.get === "function" ? Math.floor(Number(money.get(xuid)) || 0) : 0; } catch (error) { return 0; }
}
function takeMoney(xuid, amount) {
    if (amount <= 0) return true;
    try {
        if (typeof money !== "undefined" && typeof money.reduce === "function") return Boolean(money.reduce(xuid, amount));
        if (typeof money !== "undefined" && typeof money.set === "function") {
            const balance = getMoney(xuid);
            if (balance < amount) return false;
            return Boolean(money.set(xuid, balance - amount));
        }
    } catch (error) { return false; }
    return false;
}
function giveMoney(xuid, amount) {
    try {
        return typeof money !== "undefined" && typeof money.add === "function" && Boolean(money.add(xuid, amount));
    } catch (error) { return false; }
}
function inventoryOf(player) {
    try { return player && typeof player.getInventory === "function" ? player.getInventory() : null; } catch (error) { return null; }
}
function forEachInventoryItem(player, callback) {
    const inv = inventoryOf(player); if (!inv) return;
    const size = Math.max(0, Math.floor(Number(inv.size) || 0));
    for (let slot = 0; slot < size; slot++) {
        let item = null;
        try { item = inv.getItem(slot); } catch (error) { item = null; }
        if (!item) continue;
        try { if (typeof item.isNull === "function" && item.isNull()) continue; } catch (error) { continue; }
        const type = String(item.type || ""); const count = Math.floor(Number(item.count) || 0);
        if (!type || type === "minecraft:air" || count <= 0) continue;
        callback(item, slot, type, count);
    }
}
function inventoryCountType(player, type) {
    let total = 0; const wanted = lower(type);
    forEachInventoryItem(player, (_item, _slot, itemType, count) => { if (lower(itemType) === wanted) total += count; });
    return total;
}
function inventoryTypes(player) {
    const counts = {};
    forEachInventoryItem(player, (_item, _slot, itemType, count) => { counts[itemType] = (counts[itemType] || 0) + count; });
    return Object.keys(counts).sort().map((type) => ({ type, count: counts[type] }));
}
function removeInventoryType(player, type, amount) {
    const wanted = lower(type); let remaining = Math.floor(Number(amount) || 0);
    const inv = inventoryOf(player); if (!inv || remaining < 1) return false;
    const picks = [];
    forEachInventoryItem(player, (_item, slot, itemType, count) => {
        if (remaining <= 0 || lower(itemType) !== wanted) return;
        const take = Math.min(count, remaining); picks.push({ slot, take }); remaining -= take;
    });
    if (remaining > 0) return false;
    const done = [];
    for (const pick of picks) {
        try { inv.removeItem(pick.slot, pick.take); done.push(pick); } catch (error) {
            for (const old of done) { try { const item = inv.getItem(old.slot); if (item && typeof item.setCount === "function") { item.setCount((Number(item.count) || 0) + old.take); inv.setItem(old.slot, item); } } catch (restoreError) {} }
            return false;
        }
    }
    try { if (typeof player.refreshItems === "function") player.refreshItems(); } catch (error) {}
    return true;
}
function taskList(guild) { if (!Array.isArray(guild.tasks)) guild.tasks = []; return guild.tasks; }
function taskId() { return "T" + now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(); }
function taskActive(task) { return task && task.status === "active" && Number(task.expiresAt) > now(); }
function taskItems(task) {
    if (Array.isArray(task.items) && task.items.length) return task.items;
    if (task.itemType && Number(task.target) > 0) return [{ itemType: task.itemType, target: Number(task.target) }];
    return [];
}
function participantProgress(participant, itemType) {
    if (!participant.progress || typeof participant.progress !== "object") participant.progress = {};
    return Math.max(0, Math.floor(Number(participant.progress[itemType]) || 0));
}
function participantCompleted(participant, task) {
    return taskItems(task).every((item) => participantProgress(participant, item.itemType) >= item.target);
}
function taskProgress(task, itemType) {
    if (!task.progress || typeof task.progress !== "object") task.progress = {};
    return Math.max(0, Math.floor(Number(task.progress[itemType]) || 0));
}
function taskCompleted(task) { return taskItems(task).every((item) => taskProgress(task, item.itemType) >= item.target); }
function allParticipantsCompleted(task) {
    const members = Object.keys(taskParticipants(task));
    return members.length > 0 && members.every((xuid) => Boolean(task.participants[xuid].completed && task.participants[xuid].rewarded));
}
function allBuildParticipantsApproved(task) {
    const members = Object.keys(taskParticipants(task));
    return members.length > 0 && members.every((xuid) => Boolean(task.participants[xuid].approved));
}
function finishTask(guild, task, status) {
    task.status = status; task.completedAt = now();
    const refund = Math.max(0, Math.floor(Number(task.escrow) || 0));
    if (refund > 0) guild.balance = Math.max(0, Math.floor(Number(guild.balance) || 0)) + refund;
    task.escrow = 0;
}
function grantTaskReward(task, member) {
    if (member.rewarded) return true;
    if (!giveMoney(member.xuid, task.rewardPerMember)) return false;
    member.rewarded = true; member.rewardedAt = now();
    task.escrow = Math.max(0, Number(task.escrow) || 0) - task.rewardPerMember;
    return true;
}
function settleExpiredTasks(guild) {
    let changed = false;
    taskList(guild).forEach((task) => {
        if (task.status === "active" && Number(task.expiresAt) <= now()) { task.status = "expired"; task.guildRefunded = Number(task.escrow) || 0; guild.balance = Math.max(0, Math.floor(Number(guild.balance) || 0)) + task.guildRefunded; task.escrow = 0; changed = true; }
    });
    return changed;
}
function settleCompletedTasks(guild) {
    let changed = false;
    taskList(guild).forEach((task) => {
        if (task.status !== "active") return;
        if (task.kind === "item" && task.mode !== "shared" && allParticipantsCompleted(task)) { finishTask(guild, task, "completed"); changed = true; }
    });
    return changed;
}
function taskParticipants(task) { if (!task.participants || typeof task.participants !== "object") task.participants = {}; return task.participants; }
function taskCompletedCount(task) { return Object.keys(taskParticipants(task)).filter((xuid) => task.participants[xuid].completed).length; }
function taskTitle(task) { return task.kind === "build" ? `建造 · ${task.title} · ${task.rewardPerMember}金币` : `${task.title} · ${taskItems(task).map((item) => `${item.itemType}×${item.target}`).join("、")} · ${task.rewardPerMember}金币`; }
function openTaskHub(player) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store);
    if (!found) return tell(player, "§c你还没有加入工会");
    const guild = found.guild; const changedExpired = settleExpiredTasks(guild); const changedCompleted = settleCompletedTasks(guild); if (changedExpired || changedCompleted) saveData(store);
    const tasks = taskList(guild).filter((task) => task.status === "active");
    const owner = canManage(guild, xuidOf(player));
    const buttons = tasks.map(taskTitle); if (owner) buttons.push("发布任务"); buttons.push("历史任务", "返回");
    const content = tasks.length ? tasks.map((task) => task.kind === "build"
        ? `${task.title} · 建造任务（${task.approvalMode === "collective" ? "共同验收" : "成员分别验收"}）\n${task.description || "会长未填写详细说明"}\n已接取 ${Object.keys(taskParticipants(task)).length}/${task.maxParticipants} 人 · ${task.rewardPerMember} 金币/人\n${task.approvalMode === "collective" ? `整体提交：${task.submitted ? "已提交，待会长确认" : "未提交"}` : `已验收 ${Object.keys(taskParticipants(task)).filter((xuid) => task.participants[xuid].approved).length}/${Object.keys(taskParticipants(task)).length} 人`}`
        : `${task.title} · ${task.mode === "shared" ? "共同完成" : "个人进度"}\n${taskItems(task).map((item) => `${item.itemType}：${item.target} 个`).join("、")} · ${task.rewardPerMember} 金币/人\n已接取 ${Object.keys(taskParticipants(task)).length}/${task.maxParticipants} 人`).join("\n\n") : "当前没有进行中的任务。";
    sendGuildForm(player, "工会任务", content, buttons.length ? buttons : ["返回"], (index) => {
        if (index < tasks.length) return openTaskDetail(player, guild.id, tasks[index].id);
        if (owner && index === tasks.length) return openCreateTaskForm(player, guild);
        const historyIndex = owner ? tasks.length + 1 : tasks.length;
        if (index === historyIndex) return openTaskHistory(player, guild);
        showMain(player);
    });
}
function openCreateTaskForm(player, guild) {
    if (!canManage(guild, xuidOf(player))) return tell(player, "§c你没有发布工会任务权限");
    sendGuildInput(player, "发布工会任务", [
        { label: "任务标题", placeholder: "例如：收集建筑材料" },
        { label: "每人奖励金币", placeholder: "例如：500" },
        { label: "最多接取人数", placeholder: "例如：5" },
        { label: "有效小时数", placeholder: "例如：72" },
    ], (values) => {
        const title = cleanText(values[0], 40); const reward = Math.floor(Number(values[1])); const maxParticipants = Math.floor(Number(values[2])); const hours = Math.floor(Number(values[3]));
        if (!title || reward < 1 || maxParticipants < 1 || maxParticipants > Math.max(1, Number(cfg().maxMembers) || 30) || hours < 1 || hours > 720) return tell(player, "§c任务参数无效：标题、奖励、人数和有效小时数必须填写正确（小时最多 720）");
        sendGuildForm(player, "任务类型", "选择任务类型。\n物品任务：成员提交指定物品。\n建造任务：成员完成建造后提交，由会长人工验收，必须多人通过。", ["物品任务", "建造任务", "取消"], (index) => {
            if (index === 2) return showMain(player);
            if (index === 1) return openBuildTaskSetup(player, guild, { title, reward, maxParticipants, hours });
            sendGuildForm(player, "任务进度", "选择物品任务的进度计算方式。", ["个人进度", "共同完成", "取消"], (modeIndex) => {
                if (modeIndex === 2) return showMain(player);
                openTaskItemPicker(player, guild, { title, reward, maxParticipants, hours, mode: modeIndex === 1 ? "shared" : "individual", items: [] });
            });
        });
    });
}
function openBuildTaskSetup(player, guild, draft) {
    sendGuildForm(player, "建造验收方式", "选择会长如何验收建造任务。", ["成员分别验收", "共同建筑一次验收", "取消"], (index) => {
        if (index === 2) return showMain(player);
        const collective = index === 1;
        const fields = [{ label: "建造说明", placeholder: "例如：在主城东门建造一座木桥" }];
        sendGuildInput(player, collective ? "设置共同建造任务" : "设置成员验收任务", fields, (values) => {
            const description = cleanText(values[0], 300); const requiredApprovals = collective ? 1 : 0;
            if (!description) return tell(player, "§c建造说明不能为空");
            createGuildTask(player, guild.id, Object.assign(draft, { kind: "build", mode: "shared", approvalMode: collective ? "collective" : "individual", description, requiredApprovals, items: [] }));
        });
    });
}
function openTaskItemPicker(player, guild, draft) {
    const available = inventoryTypes(player); const selected = draft.items || [];
    if (!available.length) return tell(player, "§c会长背包里没有可选择的物品");
    const selectedText = selected.length ? `\n已选择：${selected.map((item) => `${item.itemType}×${item.target}`).join("、")}` : "\n尚未选择物品";
    const buttons = available.map((item) => `${item.type} §7(背包 ${item.count})`);
    buttons.push("完成发布", "取消");
    sendGuildForm(player, "选择任务物品", `点击物品后设置该物品的目标数量。${selectedText}`, buttons, (index) => {
        if (index < available.length) return sendGuildInput(player, `设置 ${available[index].type}`, [{ label: draft.mode === "shared" ? "共同目标数量" : "每人目标数量", placeholder: "例如：64" }], (values) => {
            const target = Math.floor(Number(values[0])); if (target < 1 || target > 1000000) return tell(player, "§c目标数量必须是 1 ~ 1000000");
            const old = draft.items.find((item) => item.itemType === available[index].type); if (old) old.target = target; else draft.items.push({ itemType: available[index].type, target });
            openTaskItemPicker(player, guild, draft);
        });
        if (index === available.length) return createGuildTask(player, guild.id, draft);
        showMain(player);
    });
}
function createGuildTask(player, guildId, draft) {
    const store = data(); const guild = store.guilds[guildId];
    if (!guild || !canManage(guild, xuidOf(player))) return tell(player, "§c你没有发布工会任务权限");
    const title = cleanText(draft.title, 40); const items = Array.isArray(draft.items) ? draft.items.filter((item) => item && item.itemType && item.target > 0) : [];
    const reward = Math.floor(Number(draft.reward)); const maxParticipants = Math.floor(Number(draft.maxParticipants)); const hours = Math.floor(Number(draft.hours));
    const isBuild = draft.kind === "build"; const requiredApprovals = Math.floor(Number(draft.requiredApprovals));
    if (!title || (!isBuild && !items.length) || reward < 1 || maxParticipants < 1 || maxParticipants > Math.max(1, Number(cfg().maxMembers) || 30) || hours < 1 || hours > 720 || (isBuild && draft.approvalMode === "collective" && requiredApprovals !== 1)) return tell(player, isBuild ? "§c建造任务参数无效" : "§c任务参数无效，请至少选择一种物品");
    const escrow = reward * maxParticipants; if (!Number.isSafeInteger(escrow) || escrow > 1000000000) return tell(player, "§c任务总奖励过高");
    guild.balance = Math.max(0, Math.floor(Number(guild.balance) || 0)); if (guild.balance < escrow) return tell(player, `§c工会资金不足，需要预扣 ${escrow} 金币`);
    guild.balance -= escrow; taskList(guild).push({ id: taskId(), kind: isBuild ? "build" : "item", title, description: isBuild ? cleanText(draft.description, 300) : "", items, mode: isBuild ? "shared" : (draft.mode === "shared" ? "shared" : "individual"), approvalMode: isBuild ? (draft.approvalMode || "individual") : "", requiredApprovals: isBuild ? requiredApprovals : 0, rewardPerMember: reward, maxParticipants, createdBy: xuidOf(player), createdAt: now(), expiresAt: now() + hours * 3600000, participants: {}, progress: {}, escrow, status: "active" });
    saveData(store); sendGuildForm(player, "任务已发布", `已预扣 ${escrow} 金币作为任务奖励。\n成员可以在「工会任务」中接取。`, ["返回工会任务"], () => openTaskHub(player));
}
function openTaskDetail(player, guildId, taskIdValue) {
    const store = data(); const guild = store.guilds[guildId]; if (!guild) return showMain(player); const changed = settleExpiredTasks(guild); if (changed) saveData(store);
    const task = taskList(guild).find((item) => item.id === taskIdValue); if (!task) return openTaskHub(player);
    const xuid = xuidOf(player); const participant = taskParticipants(task)[xuid]; const owner = canManage(guild, xuid); const joined = Boolean(participant);
    if (task.kind === "build") return openBuildTaskDetail(player, guild, task, participant, owner, joined);
    const itemLines = taskItems(task).map((item) => {
        const progress = task.mode === "shared" ? taskProgress(task, item.itemType) : (joined ? participantProgress(participant, item.itemType) : 0);
        return `${item.itemType} × ${item.target}（${progress}/${item.target}）`;
    }).join("\n");
    const content = `${task.title} · ${task.mode === "shared" ? "共同完成" : "个人进度"}\n目标：\n${itemLines}\n奖励：${task.rewardPerMember} 金币/人\n截止：${new Date(task.expiresAt).toLocaleString()}\n已接取：${Object.keys(taskParticipants(task)).length}/${task.maxParticipants}`;
    const buttons = joined ? (participant.completed ? (participant.rewarded ? ["返回"] : ["重试领取奖励", "返回"]) : ["提交物品", "退出任务", "返回"]) : (Object.keys(taskParticipants(task)).length < task.maxParticipants ? ["接取任务", "返回"] : ["返回"]);
    if (owner) buttons.splice(buttons.length - 1, 0, "取消任务");
    sendGuildForm(player, "工会任务详情", content, buttons, (index) => {
        const cancelIndex = buttons.indexOf("取消任务");
        if (index === cancelIndex) return cancelGuildTask(player, guildId, task.id);
        if (joined && participant.completed && !participant.rewarded && buttons[index] === "重试领取奖励") return retryTaskReward(player, guildId, task.id);
        if (joined && !participant.completed && index === 0) return submitGuildTask(player, guildId, task.id);
        if (joined && !participant.completed && index === 1 && buttons[index] === "退出任务") { delete task.participants[xuid]; saveData(store); return openTaskDetail(player, guildId, task.id); }
        if (!joined && buttons[index] === "接取任务") { task.participants[xuid] = { xuid, name: nameOf(player), progress: {}, completed: false, joinedAt: now() }; saveData(store); return openTaskDetail(player, guildId, task.id); }
        openTaskHub(player);
    });
}
function openBuildTaskDetail(player, guild, task, participant, owner, joined) {
    if (task.approvalMode === "collective") return openCollectiveBuildDetail(player, guild, task, participant, owner, joined);
    const approved = Object.keys(taskParticipants(task)).filter((xuid) => task.participants[xuid].approved).length;
    const submitted = Object.keys(taskParticipants(task)).filter((xuid) => task.participants[xuid].submitted && !task.participants[xuid].approved).length;
    const content = `${task.title}\n${task.description || "会长未填写详细说明"}\n奖励：${task.rewardPerMember} 金币/人\n已接取人数：${Object.keys(taskParticipants(task)).length}/${task.maxParticipants}\n验收进度：${approved}/${Object.keys(taskParticipants(task)).length}\n待验收：${submitted} 人\n截止：${new Date(task.expiresAt).toLocaleString()}` + (joined ? `\n我的状态：${participant.approved ? "已通过" : participant.submitted ? "已提交，等待验收" : participant.rejected ? "上次被拒绝，可重新提交" : "已接取"}` : "");
    const buttons = [];
    if (joined && !participant.approved) buttons.push(participant.submitted ? "重新提交验收" : "提交验收", "退出任务");
    if (owner) buttons.push("验收管理");
    if (owner) buttons.push("取消任务");
    buttons.push("返回");
    sendGuildForm(player, "建造任务", content, buttons, (index) => {
        const label = buttons[index];
        if (label === "提交验收" || label === "重新提交验收") return submitBuildTask(player, guild.id, task.id);
        if (label === "退出任务") { delete task.participants[xuidOf(player)]; saveData(data()); return openBuildTaskDetail(player, guild, task, null, owner, false); }
        if (label === "验收管理") return openBuildReview(player, guild, task);
        if (label === "取消任务") return cancelGuildTask(player, guild.id, task.id);
        openTaskHub(player);
    });
}
function openCollectiveBuildDetail(player, guild, task, participant, owner, joined) {
    const members = Object.keys(taskParticipants(task)).length;
    const content = `${task.title}\n${task.description || "会长未填写详细说明"}\n验收方式：共同建筑一次验收\n已接取成员：${members}/${task.maxParticipants}\n整体提交：${task.submitted ? "已提交，等待会长确认" : "未提交"}\n奖励：每位已接取成员 ${task.rewardPerMember} 金币\n截止：${new Date(task.expiresAt).toLocaleString()}` + (joined ? `\n我的状态：${task.approved ? "任务已通过" : task.submitted ? "已提交整体验收" : "已接取"}` : "");
    const buttons = [];
    if (joined && !task.approved) buttons.push(task.submitted ? "重新提交整体验收" : "提交整体验收", "退出任务");
    if (owner && task.submitted && !task.approved) buttons.push("确认建筑完成", "拒绝本次验收");
    if (owner) buttons.push("取消任务");
    buttons.push("返回");
    sendGuildForm(player, "共同建造任务", content, buttons, (index) => {
        const label = buttons[index];
        if (label === "提交整体验收" || label === "重新提交整体验收") return submitBuildTask(player, guild.id, task.id);
        if (label === "退出任务") { const store = data(); const liveGuild = store.guilds[guild.id]; if (liveGuild && liveGuild.tasks) { const live = liveGuild.tasks.find((item) => item.id === task.id); if (live) delete live.participants[xuidOf(player)]; saveData(store); } return openCollectiveBuildDetail(player, guild, task, null, owner, false); }
        if (label === "确认建筑完成") return approveCollectiveBuild(player, guild, task);
        if (label === "拒绝本次验收") { const store = data(); const liveGuild = store.guilds[guild.id]; const live = liveGuild && taskList(liveGuild).find((item) => item.id === task.id); if (live) { live.submitted = false; live.rejected = true; saveData(store); } tell(player, "§e已拒绝整体验收，成员可以重新提交"); return openCollectiveBuildDetail(player, guild, task, participant, owner, joined); }
        if (label === "取消任务") return cancelGuildTask(player, guild.id, task.id);
        openTaskHub(player);
    });
}
function approveCollectiveBuild(player, guild, task) {
    if (!canManage(guild, xuidOf(player)) || !task.submitted || task.approved) return openTaskHub(player);
    const store = data(); const liveGuild = store.guilds[guild.id]; const live = liveGuild && taskList(liveGuild).find((item) => item.id === task.id);
    if (!live || !taskActive(live)) return openTaskHub(player);
    let allPaid = true;
    Object.keys(taskParticipants(live)).forEach((memberXuid) => {
        const member = live.participants[memberXuid];
        if (!grantTaskReward(live, member)) { allPaid = false; return; }
        member.approved = true; member.completedAt = member.completedAt || now();
    });
    if (!allPaid) {
        live.approved = false;
        live.submitted = true;
        saveData(store);
        tell(player, "§c部分奖励入账失败，任务仍等待重试，请稍后再次确认");
        return openCollectiveBuildDetail(player, liveGuild, live, taskParticipants(live)[xuidOf(player)], true, Boolean(taskParticipants(live)[xuidOf(player)]));
    }
    live.approved = true;
    finishTask(liveGuild, live, "completed");
    saveData(store); tell(player, "§a已确认共同建筑完成，所有已接取成员均已获得奖励"); openTaskHub(player);
}
function submitBuildTask(player, guildId, taskIdValue) {
    const store = data(); const guild = store.guilds[guildId]; const task = guild && taskList(guild).find((item) => item.id === taskIdValue); const participant = task && taskParticipants(task)[xuidOf(player)];
    if (!task || task.kind !== "build" || !taskActive(task) || !participant || participant.approved) return openTaskHub(player);
    sendGuildInput(player, "提交建造验收", [{ label: "提交说明（可空）", placeholder: "例如：已完成东门木桥，坐标 XXX" }], (values) => {
        if (task.approvalMode === "collective") { task.submitted = true; task.submittedBy = xuidOf(player); task.submission = cleanText(values[0], 300); task.submittedAt = now(); task.rejected = false; }
        else { participant.submitted = true; participant.rejected = false; participant.submission = cleanText(values[0], 300); participant.submittedAt = now(); }
        saveData(store); sendGuildForm(player, "已提交验收", "请等待会长检查并确认。", ["返回任务详情"], () => openBuildTaskDetail(player, guild, task, participant, roleOf(guild, xuidOf(player)) === "owner" || roleOf(guild, xuidOf(player)) === "officer", true));
    });
}
function openBuildReview(player, guild, task) {
    if (!task || !canManage(guild, xuidOf(player))) return openTaskHub(player);
    const rows = Object.keys(taskParticipants(task)).map((xuid) => task.participants[xuid]).filter((member) => member.submitted && !member.approved);
    if (!rows.length) return sendGuildForm(player, "验收管理", "暂无待验收的成员提交。", ["返回任务"], () => openBuildTaskDetail(player, guild, task, task.participants[xuidOf(player)], true, Boolean(task.participants[xuidOf(player)])));
    sendGuildForm(player, "选择验收成员", "选择一名已提交建造成果的成员。", rows.map((member) => member.name).concat(["返回"]), (index) => {
        if (index >= rows.length) return openBuildTaskDetail(player, guild, task, task.participants[xuidOf(player)], true, Boolean(task.participants[xuidOf(player)]));
        const member = rows[index]; sendGuildForm(player, "确认建造成果", `${member.name}\n${member.submission || "无提交说明"}\n提交时间：${new Date(member.submittedAt).toLocaleString()}`, ["确认通过", "拒绝", "返回"], (choice) => {
            const store = data(); const target = store.guilds[guild.id]; const live = target && taskList(target).find((item) => item.id === task.id); const liveMember = live && taskParticipants(live)[member.xuid];
            if (!live || !liveMember) return openTaskHub(player);
            if (choice === 2) return openBuildReview(player, target, live);
            if (choice === 1) { liveMember.submitted = false; liveMember.rejected = true; saveData(store); tell(player, "§e已拒绝该成员的验收申请"); return openBuildReview(player, target, live); }
            if (!grantTaskReward(live, liveMember)) { saveData(store); tell(player, "§c奖励入账失败，验收暂未确认，请稍后重试"); return openBuildReview(player, target, live); }
            liveMember.approved = true; liveMember.submitted = false; liveMember.rejected = false; liveMember.approvedAt = now();
            const approvedCount = Object.keys(taskParticipants(live)).filter((xuid) => live.participants[xuid].approved).length;
            const finished = allBuildParticipantsApproved(live);
            if (finished) finishTask(target, live, "completed");
            saveData(store); tell(player, finished ? "§a所有已接取成员均已通过，任务完成并发放奖励" : "§a已确认通过并发放奖励"); openBuildReview(player, target, live);
        });
    });
}
function submitGuildTask(player, guildId, taskIdValue) {
    const store = data(); const guild = store.guilds[guildId]; const task = guild && taskList(guild).find((item) => item.id === taskIdValue); const participant = task && taskParticipants(task)[xuidOf(player)];
    if (!task || !taskActive(task) || !participant || participant.completed) return openTaskHub(player);
    const items = taskItems(task);
    const chooseItem = (itemIndex) => {
        const item = items[itemIndex]; const current = task.mode === "shared" ? taskProgress(task, item.itemType) : participantProgress(participant, item.itemType); const remaining = Math.max(1, item.target - current);
        sendGuildInput(player, "提交任务物品", [{ label: `提交 ${item.itemType}（还需 ${remaining} 个）`, placeholder: String(remaining) }], (values) => {
            const amount = Math.floor(Number(values[0])); if (!Number.isFinite(amount) || amount < 1 || amount > remaining) return tell(player, `§c提交数量必须是 1 ~ ${remaining}`);
            if (inventoryCountType(player, item.itemType) < amount || !removeInventoryType(player, item.itemType, amount)) return tell(player, `§c背包中没有足够的 ${item.itemType}`);
            if (!participant.progress || typeof participant.progress !== "object") participant.progress = {};
            participant.progress[item.itemType] = participantProgress(participant, item.itemType) + amount;
            if (task.mode === "shared") {
                if (!task.progress || typeof task.progress !== "object") task.progress = {};
                task.progress[item.itemType] = taskProgress(task, item.itemType) + amount;
                if (taskCompleted(task)) {
                    let allPaid = true;
                    Object.keys(taskParticipants(task)).forEach((memberXuid) => {
                        const member = task.participants[memberXuid];
                        if (!member.rewarded) {
                            member.completed = true; member.completedAt = member.completedAt || now();
                            if (!grantTaskReward(task, member)) { member.rewardPending = true; allPaid = false; }
                            else member.rewardPending = false;
                        }
                    });
                    if (allPaid) finishTask(guild, task, "completed");
                    else { task.status = "active"; task.rewardPending = true; }
                }
            } else if (participantCompleted(participant, task)) {
                participant.completed = true; participant.completedAt = now();
                const paid = grantTaskReward(task, participant); participant.rewardPending = !paid;
                if (paid && allParticipantsCompleted(task)) finishTask(guild, task, "completed");
            }
            saveData(store); sendGuildForm(player, participant.completed ? "任务完成" : "提交成功", participant.completed ? (participant.rewarded ? `已获得 ${task.rewardPerMember} 金币奖励。` : "任务已完成，但奖励暂未入账，请稍后重试领取。") : `已提交 ${item.itemType} × ${amount}`, ["返回任务详情"], () => openTaskDetail(player, guildId, task.id));
        });
    };
    if (items.length === 1) return chooseItem(0);
    sendGuildForm(player, "选择提交物品", "选择要提交的物品。", items.map((item) => `${item.itemType} · ${participantProgress(participant, item.itemType)}/${item.target}`).concat(["返回"]), (index) => { if (index < items.length) chooseItem(index); else openTaskDetail(player, guildId, task.id); });
}
function retryTaskReward(player, guildId, taskIdValue) {
    const store = data(); const guild = store.guilds[guildId]; const task = guild && taskList(guild).find((item) => item.id === taskIdValue); const member = task && taskParticipants(task)[xuidOf(player)];
    if (!task || !member || !member.completed || member.rewarded) return openTaskHub(player);
    if (!grantTaskReward(task, member)) return tell(player, "§c奖励入账失败，请稍后重试");
    if (task.mode !== "shared" && allParticipantsCompleted(task)) finishTask(guild, task, "completed");
    if (task.mode === "shared" && taskCompleted(task)) {
        const pending = Object.keys(taskParticipants(task)).some((xuid) => {
            const participant = task.participants[xuid];
            return participant.completed && !participant.rewarded;
        });
        if (!pending) finishTask(guild, task, "completed");
    }
    saveData(store); sendGuildForm(player, "奖励领取成功", `已获得 ${task.rewardPerMember} 金币。`, ["返回任务"], () => openTaskHub(player));
}
function cancelGuildTask(player, guildId, taskIdValue) {
    const store = data(); const guild = store.guilds[guildId]; const task = guild && taskList(guild).find((item) => item.id === taskIdValue);
    if (!task || !canManage(guild, xuidOf(player))) return openTaskHub(player);
    guild.balance = Math.max(0, Math.floor(Number(guild.balance) || 0)) + Math.max(0, Math.floor(Number(task.escrow) || 0)); task.escrow = 0; task.status = "cancelled"; task.cancelledAt = now(); saveData(store); tell(player, "§a任务已取消，未发放的奖励已退回工会资金"); openTaskHub(player);
}
function openTaskHistory(player, guild) {
    const rows = taskList(guild).filter((task) => task.status !== "active").slice(-20).reverse();
    sendGuildForm(player, "任务历史", rows.length ? rows.map((task) => `${task.title} · ${task.status === "completed" ? "已完成" : task.status === "expired" ? "已过期" : "已取消"}`).join("\n") : "暂无历史任务", ["返回任务"], () => openTaskHub(player));
}
function addFundLog(guild, type, player, amount, balance) {
    if (!Array.isArray(guild.fundLogs)) guild.fundLogs = [];
    guild.fundLogs.push({ type, xuid: xuidOf(player), name: nameOf(player), amount, balance, at: now() });
    if (guild.fundLogs.length > 100) guild.fundLogs = guild.fundLogs.slice(-100);
}
function memberWithdrawAllowed(guild, xuid) {
    if (roleOf(guild, xuid) === "owner") return true;
    if (guild.allowMemberWithdraw === undefined) return true;
    return Boolean(guild.allowMemberWithdraw) || roleOf(guild, xuid) === "officer";
}
function fundDeposit(player, amount) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store); const value = Math.floor(Number(amount));
    if (!found) return tell(player, "§c你还没有加入工会");
    if (!Number.isFinite(value) || value < 1 || value > 1000000000) return tell(player, "§c存入金额必须是 1 ~ 1000000000 的整数");
    if (getMoney(xuidOf(player)) < value || !takeMoney(xuidOf(player), value)) return tell(player, "§c个人余额不足或扣款失败");
    found.guild.balance = Math.max(0, Math.floor(Number(found.guild.balance) || 0)) + value;
    addFundLog(found.guild, "deposit", player, value, found.guild.balance); saveData(store);
    sendGuildForm(player, "存入成功", `已存入 ${value} 金币\n工会余额：${found.guild.balance} 金币`, ["返回资金管理"], () => openFundForm(player));
}
function fundWithdraw(player, amount) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store); const value = Math.floor(Number(amount));
    const allowed = found && memberWithdrawAllowed(found.guild, xuidOf(player));
    if (!allowed) return tell(player, "§c你没有支出工会资金的权限");
    const balance = Math.max(0, Math.floor(Number(found.guild.balance) || 0));
    if (!Number.isFinite(value) || value < 1 || value > balance) return tell(player, `§c支出金额必须在 1 ~ ${balance} 之间`);
    if (!giveMoney(xuidOf(player), value)) return tell(player, "§c个人入账失败，工会资金未扣除");
    found.guild.balance = balance - value;
    addFundLog(found.guild, "withdraw", player, value, found.guild.balance); saveData(store);
    sendGuildForm(player, "支出成功", `已支出 ${value} 金币\n工会余额：${found.guild.balance} 金币`, ["返回资金管理"], () => openFundForm(player));
}
function openFundForm(player) {
    const found = getGuildForPlayer(xuidOf(player));
    if (!found) return tell(player, "§c你还没有加入工会");
    const balance = Math.max(0, Math.floor(Number(found.guild.balance) || 0));
    const canWithdraw = memberWithdrawAllowed(found.guild, xuidOf(player));
    const owner = roleOf(found.guild, xuidOf(player)) === "owner";
    const buttons = owner ? ["存入资金", "支出资金", "查看流水", "支出权限", "返回"] : canWithdraw ? ["存入资金", "支出资金", "查看流水", "返回"] : ["存入资金", "查看流水", "返回"];
    const policy = found.guild.allowMemberWithdraw === false ? "仅会长和副会长" : "所有成员";
    sendGuildForm(player, "工会公用资金", `当前余额：${balance} 金币\n成员支出权限：${policy}。`, buttons, (index) => {
        if (index === 0) return sendGuildInput(player, "存入工会资金", [{ label: "金额", placeholder: "输入金币数量" }], (values) => fundDeposit(player, values[0]));
        if (canWithdraw && index === 1) return sendGuildInput(player, "支出工会资金", [{ label: "金额", placeholder: "输入金币数量" }], (values) => fundWithdraw(player, values[0]));
        const logIndex = owner ? 2 : canWithdraw ? 2 : 1;
        if (index === logIndex) {
            const logs = Array.isArray(found.guild.fundLogs) ? found.guild.fundLogs.slice(-20).reverse() : [];
            return sendGuildForm(player, "资金流水", logs.length ? logs.map((item) => `${item.type === "deposit" ? "存入" : "支出"} ${item.amount} · ${item.name}`).join("\n") : "暂无资金流水", ["返回资金管理"], () => openFundForm(player));
        }
        if (owner && index === 3) return openFundPolicyForm(player, found.guild);
        showMain(player);
    });
}
function openFundPolicyForm(player, guild) {
    if (roleOf(guild, xuidOf(player)) !== "owner") return openFundForm(player);
    const current = guild.allowMemberWithdraw !== false;
    sendGuildForm(player, "支出权限", `当前设置：${current ? "所有成员可支出" : "仅会长和副会长可支出"}`, ["允许所有成员", "仅允许管理层", "返回"], (index) => {
        if (index === 2) return openFundForm(player);
        const store = data(); const target = store.guilds[guild.id];
        if (!target) return showMain(player);
        target.allowMemberWithdraw = index === 0; saveData(store); openFundForm(player);
    });
}
function makeGuild(input, player) {
    const store = data();
    const options = cfg();
    const name = cleanText(input.name, options.nameMax);
    const tag = cleanText(input.tag || name.slice(0, options.tagMax), options.tagMax);
    const xuid = xuidOf(player);
    if (name.length < options.nameMin) return { ok: false, error: `工会名称至少 ${options.nameMin} 个字符` };
    if (!tag) return { ok: false, error: "工会简称不能为空" };
    if (getGuildForPlayer(xuid, store)) return { ok: false, error: "你已经加入工会" };
    if (Object.keys(store.guilds).some((id) => lower(store.guilds[id].name) === lower(name))) return { ok: false, error: "工会名称已存在" };
    const cost = Math.max(1, Math.floor(Number(options.createCost) || 0));
    if (getMoney(xuid) < cost || !takeMoney(xuid, cost)) return { ok: false, error: `创建工会需要 ${cost} 金币` };
    const id = guildId(name) + "-" + String(now()).slice(-6);
    store.guilds[id] = {
        id, name, tag, owner: xuid, notice: "欢迎加入工会！", balance: 0, allowMemberWithdraw: true, tasks: [], createdAt: now(),
        members: { [xuid]: { xuid, name: nameOf(player), role: "owner", joinedAt: now() } },
    };
    saveData(store);
    return { ok: true, guild: store.guilds[id], cost };
}
function listGuilds(keyword) {
    const query = lower(keyword);
    return Object.keys(data().guilds).map((id) => data().guilds[id]).filter((guild) => !query || lower(guild.name).indexOf(query) >= 0 || lower(guild.tag).indexOf(query) >= 0).map((guild) => ({
        id: guild.id, name: guild.name, tag: guild.tag, owner: guild.members[guild.owner] ? guild.members[guild.owner].name : "未知", members: memberCount(guild), notice: guild.notice, createdAt: guild.createdAt,
    })).sort((a, b) => b.members - a.members);
}
function showMain(player) {
    const found = getGuildForPlayer(xuidOf(player));
    const buttons = found ? ["工会信息", "成员列表", "浏览工会", "成员管理", "公共资金", "工会任务", "工会公告", "退出/解散"] : ["浏览工会", "创建工会", "接受邀请", "使用说明"];
    const title = found ? `工会 · ${found.guild.name}` : "LuckyClover 工会";
    const content = found ? `简称：${found.guild.tag}\n成员：${memberCount(found.guild)}\n\n${found.guild.notice || "暂无公告"}` : "加入一个工会，和伙伴一起成长。";
    if (!sendGuildForm(player, title, content, buttons, (index) => {
        if (found && index === 0) return showInfo(player, found.guild);
        if (found && index === 1) return showMembers(player, found.guild);
        if (found && index === 2) return openGuildList(player);
        if (found && index === 3) return openMemberManageForm(player, found.guild);
        if (found && index === 4) return openFundForm(player);
        if (found && index === 5) return openTaskHub(player);
        if (found && index === 6) return openNoticeForm(player);
        if (found && index === 7) return openLeaveForm(player, found.guild);
        if (!found && index === 0) return openGuildList(player);
        if (!found && index === 1) return openCreateForm(player);
        if (!found && index === 2) return acceptInvite(player);
        tell(player, "§e/guild list§f 查看工会，§e/guild join <工会ID>§f 加入，§e/guild invite <玩家>§f 邀请成员。");
    })) tell(player, content);
}
function openCreateForm(player) {
    const cost = cfg().createCost;
    sendGuildInput(player, `创建工会（费用 ${cost} 金币）`, [
        { label: "工会名称", placeholder: "例如：星火联合" },
        { label: "工会简称（可空）", placeholder: "例如：XH" },
    ], (values) => {
        const result = makeGuild({ name: values[0], tag: values[1] }, player);
        tell(player, result.ok ? `§a工会创建成功：${result.guild.name}` : "§c" + result.error);
        if (result.ok) showMain(player);
    });
}
function openGuildList(player) {
    const rows = listGuilds("");
    if (!rows.length) return tell(player, "§e目前还没有工会");
    const buttons = rows.slice(0, 20).map((row) => `${row.name} §7(${row.members}人)`);
    buttons.push("返回");
    sendGuildForm(player, "工会列表", "选择工会查看详情并申请加入。", buttons, (index) => {
        if (index >= rows.length) return showMain(player);
        openGuildPreview(player, rows[index]);
    });
}
function openGuildPreview(player, row) {
    const guild = data().guilds[row.id];
    if (!guild) return openGuildList(player);
    const alreadyJoined = Boolean(getGuildForPlayer(xuidOf(player)));
    const buttons = alreadyJoined ? ["返回列表"] : ["申请加入", "返回列表"];
    const content = `简称：${guild.tag}\n会长：${row.owner}\n成员：${memberCount(guild)}\n\n${guild.notice || "暂无公告"}` + (alreadyJoined ? "\n\n你已经在一个工会中，不能申请加入。" : "");
    sendGuildForm(player, guild.name, content, buttons, (index) => {
        if (!alreadyJoined && index === 0) return applyGuild(player, guild.id);
        openGuildList(player);
    });
}
function applyGuild(player, id) {
    const store = data(); const guild = store.guilds[id]; const xuid = xuidOf(player);
    if (!guild) return tell(player, "§c工会不存在");
    if (getGuildForPlayer(xuid, store)) return showMain(player);
    if (memberCount(guild) >= Math.max(1, Number(cfg().maxMembers) || 30)) return tell(player, "§c工会成员已满");
    if (!store.applications[id]) store.applications[id] = {};
    store.applications[id][xuid] = { xuid, name: nameOf(player), createdAt: now() };
    saveData(store);
    sendGuildForm(player, "申请已提交", `已向「${guild.name}」提交加入申请，请等待会长或副会长审核。`, ["返回工会菜单"], () => showMain(player));
}
function joinGuild(player, id) {
    const store = data(); const guild = store.guilds[id]; const xuid = xuidOf(player);
    if (!guild) return tell(player, "§c工会不存在");
    if (getGuildForPlayer(xuid, store)) return tell(player, "§e你已经加入工会");
    if (memberCount(guild) >= Math.max(1, Number(cfg().maxMembers) || 30)) return tell(player, "§c工会成员已满");
    guild.members[xuid] = { xuid, name: nameOf(player), role: "member", joinedAt: now() };
    saveData(store); tell(player, `§a已加入工会：${guild.name}`); showMain(player);
}
function openNoticeForm(player) {
    const found = getGuildForPlayer(xuidOf(player));
    if (!found || !canManage(found.guild, xuidOf(player))) return tell(player, "§c你没有修改公告权限");
    sendGuildInput(player, "工会公告", [{ label: "公告内容", placeholder: "输入工会公告", value: found.guild.notice || "" }], (values) => setNotice(player, values[0]));
}
function openInviteForm(player) {
    sendGuildInput(player, "邀请成员", [{ label: "在线玩家名", placeholder: "输入要邀请的玩家" }], (values) => invite(player, values[0]));
}
function openMemberManageForm(player, guild) {
    if (!canManage(guild, xuidOf(player))) return tell(player, "§c你没有成员管理权限");
    sendGuildForm(player, "成员管理", "选择要执行的操作。", ["入会申请", "邀请成员", "任命副会长", "降为成员", "转让会长", "返回"], (index) => {
        if (index === 0) return openApplicationsForm(player, guild);
        if (index === 1) return openInviteForm(player);
        if (index === 2) return openRoleForm(player, "officer");
        if (index === 3) return openRoleForm(player, "member");
        if (index === 4) return openTransferForm(player);
        showMain(player);
    });
}
function openApplicationsForm(player, guild) {
    const list = data().applications[guild.id] || {};
    const rows = Object.keys(list).map((xuid) => list[xuid]);
    if (!rows.length) return sendGuildForm(player, "入会申请", "暂无待处理申请。", ["返回"], () => showMain(player));
    const buttons = rows.map((row) => row.name).concat(["返回"]);
    sendGuildForm(player, "入会申请", "选择申请人进行审核。", buttons, (index) => {
        if (index >= rows.length) return showMain(player);
        const row = rows[index];
        sendGuildForm(player, "审核申请", `${row.name}\n申请时间：${new Date(row.createdAt).toLocaleString()}`, ["同意加入", "拒绝申请", "返回"], (choice) => {
            if (choice === 0) return reviewApplication(player, guild.id, row.xuid, true);
            if (choice === 1) return reviewApplication(player, guild.id, row.xuid, false);
            openApplicationsForm(player, guild);
        });
    });
}
function reviewApplication(player, guildId, xuid, approved) {
    const store = data(); const guild = store.guilds[guildId]; const pending = store.applications[guildId] || {};
    if (!guild || !pending[xuid]) return openApplicationsForm(player, guild || { id: guildId });
    const request = pending[xuid]; delete pending[xuid];
    if (approved && !getGuildForPlayer(xuid, store) && memberCount(guild) < Math.max(1, Number(cfg().maxMembers) || 30)) {
        guild.members[xuid] = { xuid, name: request.name, role: "member", joinedAt: now() };
        saveData(store);
        return sendGuildForm(player, "审核完成", `已同意 ${request.name} 加入工会。`, ["返回成员管理"], () => openMemberManageForm(player, guild));
    }
    saveData(store);
    sendGuildForm(player, "审核完成", approved ? "工会已满或申请人已经加入其他工会。" : `已拒绝 ${request.name} 的申请。`, ["返回成员管理"], () => openMemberManageForm(player, guild));
}
function openRoleForm(player, role) {
    sendGuildInput(player, role === "officer" ? "任命副会长" : "降为成员", [{ label: "在线玩家名", placeholder: "输入成员名" }], (values) => setRole(player, values[0], role));
}
function openTransferForm(player) {
    sendGuildInput(player, "转让会长", [{ label: "成员名", placeholder: "输入接任会长的成员" }], (values) => transferGuild(player, values[0]));
}
function openLeaveForm(player, guild) {
    const owner = guild.owner === xuidOf(player);
    const buttons = owner ? ["解散工会", "返回"] : ["确认退出", "返回"];
    sendGuildForm(player, owner ? "解散工会" : "退出工会", owner ? "解散后所有成员都会被移出，且不可恢复。" : "确认退出当前工会吗？", buttons, (index) => {
        if (index !== 0) return showMain(player);
        if (owner) return disband(player);
        leaveGuild(player);
    });
}
function showInfo(player, guild) {
    const buttons = ["成员列表", "返回"];
    sendGuildForm(player, guild.name, `简称：${guild.tag}\n成员：${memberCount(guild)}\n\n公告：${guild.notice || "暂无公告"}`, buttons, (index) => index === 0 ? showMembers(player, guild) : showMain(player));
}
function showMembers(player, guild) {
    const lines = Object.keys(guild.members || {}).map((key) => `${guild.members[key].name} · ${guild.members[key].role === "owner" ? "会长" : guild.members[key].role === "officer" ? "副会长" : "成员"}`);
    sendGuildForm(player, "成员列表", lines.length ? lines.join("\n") : "暂无成员", ["返回"], () => showMain(player));
}
function showList(player, keyword) { const rows = listGuilds(keyword); tell(player, rows.length ? rows.map((row) => `§a${row.name} §7[${row.tag}] §f${row.members}人 §8ID:${row.id}`).join("\n") : "§e暂无工会"); }
function leaveGuild(player) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store);
    if (!found) return tell(player, "§e你不在工会中");
    if (found.guild.owner === xuidOf(player)) return tell(player, "§c会长不能直接退出，请使用 /guild disband 解散或先转让会长");
    delete found.guild.members[xuidOf(player)]; saveData(store); tell(player, "§a你已退出工会");
}
function invite(player, targetName) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store); const target = findKnownPlayer(targetName, store);
    if (!found || !canManage(found.guild, xuidOf(player))) return tell(player, "§c你没有工会邀请权限");
    if (!target) return tell(player, "§c找不到该玩家（玩家至少需要进服过一次）");
    const targetXuid = target.xuid; if (getGuildForPlayer(targetXuid, store)) return tell(player, "§e该玩家已经加入工会");
    store.invites[targetXuid] = { guildId: found.guild.id, guildName: found.guild.name, inviter: nameOf(player), expiresAt: now() + 86400000 };
    saveData(store); tell(player, `§a已邀请 ${target.name} 加入工会${target.player ? "" : "（离线玩家，上线后可接受）"}`); if (target.player) tell(target.player, `§a你收到工会邀请：${found.guild.name}，打开 /guild 接受邀请`);
}
function acceptInvite(player) {
    const store = data(); const xuid = xuidOf(player); const invite = store.invites[xuid];
    if (!invite || invite.expiresAt < now() || !store.guilds[invite.guildId]) return tell(player, "§e你没有有效的工会邀请");
    if (getGuildForPlayer(xuid, store)) return tell(player, "§e你已经加入工会");
    const guild = store.guilds[invite.guildId]; if (memberCount(guild) >= Math.max(1, Number(cfg().maxMembers) || 30)) return tell(player, "§c工会成员已满");
    guild.members[xuid] = { xuid, name: nameOf(player), role: "member", joinedAt: now() }; delete store.invites[xuid]; saveData(store); tell(player, `§a已加入工会：${guild.name}`);
}
function setNotice(player, text) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store);
    if (!found || !canManage(found.guild, xuidOf(player))) return tell(player, "§c你没有修改公告权限");
    found.guild.notice = cleanText(text, 100) || "暂无公告"; saveData(store); tell(player, "§a工会公告已更新");
}
function setRole(player, targetName, role) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store); const target = findKnownPlayer(targetName, store);
    if (!found || !canManage(found.guild, xuidOf(player))) return tell(player, "§c你没有管理成员权限");
    if (!target) return tell(player, "§c找不到该玩家（玩家至少需要进服过一次）");
    const targetXuid = target.xuid; const member = found.guild.members[targetXuid];
    if (!member || targetXuid === found.guild.owner) return tell(player, "§c目标玩家不是可调整的普通成员");
    member.role = role; saveData(store); tell(player, `§a已将 ${member.name} 设置为${role === "officer" ? "副会长" : "成员"}`);
}
function transferGuild(player, targetName) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store); const target = findKnownPlayer(targetName, store);
    if (!found || found.guild.owner !== xuidOf(player)) return tell(player, "§c只有会长可以转让工会");
    if (!target) return tell(player, "§c找不到该玩家（玩家至少需要进服过一次）");
    const targetXuid = target.xuid; if (!found.guild.members[targetXuid]) return tell(player, "§c目标玩家不是工会成员");
    found.guild.members[xuidOf(player)].role = "officer"; found.guild.members[targetXuid].role = "owner"; found.guild.owner = targetXuid;
    saveData(store); tell(player, `§a工会已转让给 ${target.name}`); if (target.player) tell(target.player, `§a你已成为工会「${found.guild.name}」会长`);
}
function disband(player) {
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store);
    if (!found || found.guild.owner !== xuidOf(player)) return tell(player, "§c只有会长可以解散工会");
    delete store.guilds[found.id]; saveData(store); tell(player, "§a工会已解散");
}
function isOp(player) { try { return Boolean(player && typeof player.isOP === "function" && player.isOP()); } catch (error) { return false; } }
function adminDisband(player, id) {
    if (!isOp(player)) return tell(player, "§c只有 OP 可以使用工会管理");
    const store = data(); const guild = store.guilds[id];
    if (!guild) return showAdminGuildList(player);
    delete store.guilds[id];
    if (store.applications) delete store.applications[id];
    saveData(store);
    sendGuildForm(player, "管理完成", `已强制解散工会：${guild.name}`, ["返回工会管理"], () => showAdminGuildList(player));
}
function openAdminGuildForm(player, id) {
    if (!isOp(player)) return tell(player, "§c只有 OP 可以使用工会管理");
    const guild = data().guilds[id];
    if (!guild) return showAdminGuildList(player);
    sendGuildForm(player, `管理 · ${guild.name}`, `简称：${guild.tag}\n会长：${guild.members[guild.owner] ? guild.members[guild.owner].name : "未知"}\n成员：${memberCount(guild)}\n公告：${guild.notice || "暂无"}`, ["查看成员", "修改公告", "强制解散", "返回列表"], (index) => {
        if (index === 0) return showMembers(player, guild);
        if (index === 1) return sendGuildInput(player, "修改工会公告", [{ label: "公告内容", value: guild.notice || "" }], (values) => {
            const store = data(); if (!store.guilds[id]) return showAdminGuildList(player);
            store.guilds[id].notice = cleanText(values[0], 100) || "暂无公告"; saveData(store); openAdminGuildForm(player, id);
        });
        if (index === 2) return sendGuildForm(player, "确认解散", `确定强制解散「${guild.name}」吗？此操作不可恢复。`, ["确认解散", "取消"], (choice) => choice === 0 ? adminDisband(player, id) : openAdminGuildForm(player, id));
        showAdminGuildList(player);
    });
}
function showAdminGuildList(player) {
    if (!isOp(player)) return tell(player, "§c只有 OP 可以使用工会管理");
    const rows = listGuilds("");
    if (!rows.length) return sendGuildForm(player, "工会管理", "当前没有工会。", ["返回"], () => showMain(player));
    const buttons = rows.slice(0, 30).map((row) => `${row.name} §7(${row.members}人)`).concat(["返回"]);
    sendGuildForm(player, "工会管理", "选择要管理的工会。", buttons, (index) => index >= rows.length ? showMain(player) : openAdminGuildForm(player, rows[index].id));
}
function createTestApplication(player, applicantName) {
    if (!player || typeof player.isOP !== "function" || !player.isOP()) return tell(player, "§c只有 OP 可以使用测试申请功能");
    const store = data(); const found = getGuildForPlayer(xuidOf(player), store); const name = cleanText(applicantName, 24) || "模拟玩家";
    if (!found || !canManage(found.guild, xuidOf(player))) return tell(player, "§c你需要先成为工会会长或副会长");
    const fakeXuid = `test:${found.id}:${lower(name)}`;
    if (!store.applications[found.id]) store.applications[found.id] = {};
    store.applications[found.id][fakeXuid] = { xuid: fakeXuid, name: name + "（测试）", createdAt: now(), test: true };
    saveData(store);
    sendGuildForm(player, "测试申请已创建", `已生成模拟申请人：${name}（测试）\n现在可以打开“成员管理 → 入会申请”，测试同意或拒绝流程。`, ["打开入会申请", "返回"], (index) => index === 0 ? openApplicationsForm(player, found.guild) : showMain(player));
}

mc.regPlayerCmd("guild", "工会系统 (/guild)", (player, rawArgs) => {
    const args = argsOf(rawArgs); const action = lower(args[0]);
    if (!action) return showMain(player);
    if (action === "create") { const result = makeGuild({ name: args[1], tag: args[2] }, player); return tell(player, result.ok ? "§a工会创建成功" : "§c" + result.error); }
    if (action === "list") return showList(player, args.slice(1).join(" "));
    if (action === "info") { const found = data().guilds[args[1]]; return found ? showInfo(player, found) : tell(player, "§c找不到该工会"); }
    if (action === "join") return applyGuild(player, args[1]);
    if (action === "invite") return invite(player, args[1]);
    if (action === "accept") return acceptInvite(player);
    if (action === "leave") return leaveGuild(player);
    if (action === "notice") return setNotice(player, args.slice(1).join(" "));
    if (action === "fund" || action === "funds") return openFundForm(player);
    if (action === "deposit") return fundDeposit(player, args[1]);
    if (action === "withdraw") return fundWithdraw(player, args[1]);
    if (action === "task" || action === "tasks") return openTaskHub(player);
    if (action === "promote") return setRole(player, args[1], "officer");
    if (action === "demote") return setRole(player, args[1], "member");
    if (action === "transfer") return transferGuild(player, args[1]);
    if (action === "test-application" || action === "testapply") return createTestApplication(player, args.slice(1).join(" "));
    if (action === "admin") return showAdminGuildList(player);
    if (action === "disband") return disband(player);
    tell(player, "§e/guild§f 打开菜单 | §e/guild list§f 列表 | §e/guild create <名称> [简称]§f 创建 | §e/guild invite <玩家>§f 邀请 | §e/guild accept§f 接受 | §e/guild leave§f 退出");
}, 0);

exportApi("mgmtStatus", () => jsonOk({ version: PLUGIN_VERSION.join("."), namespace: NAMESPACE, guilds: Object.keys(data().guilds).length }));
exportApi("mgmtListGuilds", (payload) => { const input = typeof payload === "string" ? JSON.parse(payload || "{}") : (payload || {}); const rows = listGuilds(input.keyword); rows.forEach((row) => { row.balance = Math.max(0, Math.floor(Number((data().guilds[row.id] || {}).balance) || 0)); }); return jsonOk({ rows, total: rows.length }); });
exportApi("mgmtGetGuild", (payload) => { const input = typeof payload === "string" ? JSON.parse(payload || "{}") : (payload || {}); const guild = data().guilds[String(input.id || "")]; return guild ? jsonOk({ guild }) : jsonError("工会不存在"); });
exportApi("mgmtAdminDisband", (payload) => { const input = typeof payload === "string" ? JSON.parse(payload || "{}") : (payload || {}); const store = data(); const id = String(input.id || ""); if (!store.guilds[id]) return jsonError("工会不存在"); delete store.guilds[id]; if (store.applications) delete store.applications[id]; saveData(store); return jsonOk({ id }); });
exportApi("mgmtAdminSetNotice", (payload) => { const input = typeof payload === "string" ? JSON.parse(payload || "{}") : (payload || {}); const store = data(); const id = String(input.id || ""); if (!store.guilds[id]) return jsonError("工会不存在"); store.guilds[id].notice = cleanText(input.notice, 100) || "暂无公告"; saveData(store); return jsonOk({ id, notice: store.guilds[id].notice }); });
exportApi("mgmtGetConfig", () => jsonOk({ config: cfg() }));
exportApi("mgmtSetConfig", (payload) => { const input = typeof payload === "string" ? JSON.parse(payload || "{}") : (payload || {}); const next = Object.assign(cfg(), input || {}); saveCfg(next); return jsonOk({ config: next }); });

mc.listen("onServerStarted", () => logger.info(`${PLUGIN_NAME} v${PLUGIN_VERSION.join(".")} loaded`));
mc.listen("onJoin", (player) => {
    rememberPlayer(player);
    const invite = data().invites[xuidOf(player)];
    if (invite && invite.expiresAt > now()) tell(player, `§a你有来自「${invite.guildName}」的工会邀请，打开 /guild 接受。`);
});
