// LuckyClover-Guild — 轻量工会系统 MVP
// 创建、邀请、加入/退出、成员权限、公告与管理接口。
const PLUGIN_NAME = "LuckyClover-Guild";
const PLUGIN_DESC = "Guilds: create, invite, membership, roles and notices";
const PLUGIN_VERSION = [1, 0, 1];
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
        id, name, tag, owner: xuid, notice: "欢迎加入工会！", balance: 0, allowMemberWithdraw: true, createdAt: now(),
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
    const buttons = found ? ["工会信息", "成员列表", "浏览工会", "成员管理", "公共资金", "工会公告", "退出/解散"] : ["浏览工会", "创建工会", "接受邀请", "使用说明"];
    const title = found ? `工会 · ${found.guild.name}` : "LuckyClover 工会";
    const content = found ? `简称：${found.guild.tag}\n成员：${memberCount(found.guild)}\n\n${found.guild.notice || "暂无公告"}` : "加入一个工会，和伙伴一起成长。";
    if (!sendGuildForm(player, title, content, buttons, (index) => {
        if (found && index === 0) return showInfo(player, found.guild);
        if (found && index === 1) return showMembers(player, found.guild);
        if (found && index === 2) return openGuildList(player);
        if (found && index === 3) return openMemberManageForm(player, found.guild);
        if (found && index === 4) return openFundForm(player);
        if (found && index === 5) return openNoticeForm(player);
        if (found && index === 6) return openLeaveForm(player, found.guild);
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
