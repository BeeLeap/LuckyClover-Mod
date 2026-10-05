// LuckyClover-WhiteList.js
// HuHoBot BDSAdapter 附属插件 — QQ验证码绑定白名单
// 依赖: HuHoBot BDSAdapter (legacy-script-engine-quickjs)

const PLUGIN_NAME = 'LuckyClover-WhiteList';
const HUHO_NAMESPACE = 'HuHoBot';
const MY_NAMESPACE = 'LuckyClover_WhiteList';
const PATH = `plugins/${PLUGIN_NAME}/`;
const CONFIG_PATH = `${PATH}config.json`;
const DATA_PATH = `${PATH}data/bindings.json`;
const ALLOWLIST_PATH = 'allowlist.json';

logger.setTitle(PLUGIN_NAME);

// ===================== 工具函数 =====================

function readJson(filePath) {
    try {
        return JSON.parse(File.readFrom(filePath));
    } catch (_) {
        return null;
    }
}

function writeJson(filePath, data) {
    return File.writeTo(filePath, JSON.stringify(data, null, '    '));
}

function generateCode(length) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < length; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function nowMs() {
    return Date.now();
}

/**
 * 检查玩家是否在 BDS 白名单中
 */
function isInAllowlist(playerName) {
    try {
        var list = readJson(ALLOWLIST_PATH);
        if (!Array.isArray(list)) return false;
        var lower = playerName.toLowerCase();
        for (var i = 0; i < list.length; i++) {
            if (list[i].name && list[i].name.toLowerCase() === lower) {
                return true;
            }
        }
        return false;
    } catch (_) {
        return false;
    }
}

/**
 * 读取绑定数据（带默认值）
 */
function loadData() {
    var data = readJson(DATA_PATH);
    if (data && typeof data === 'object') {
        if (!data.pendingCodes) data.pendingCodes = {};
        if (!data.playerBindings) data.playerBindings = {};
        if (!data.qqBindings) data.qqBindings = {};
        return data;
    }
    return { pendingCodes: {}, playerBindings: {}, qqBindings: {} };
}

function saveData(data) {
    return writeJson(DATA_PATH, data);
}

/**
 * 清理过期验证码
 */
function cleanExpiredCodes(data) {
    var now = nowMs();
    var expired = [];
    for (var code in data.pendingCodes) {
        if (data.pendingCodes[code].expiresAt <= now) {
            expired.push(code);
        }
    }
    for (var i = 0; i < expired.length; i++) {
        delete data.pendingCodes[expired[i]];
    }
    return expired.length;
}

/**
 * 从 pendingCodes 中查找玩家名对应的有效验证码
 * 返回 { code, pending } 或 null
 */
function findExistingCode(data, playerName) {
    var lower = playerName.toLowerCase();
    var now = nowMs();
    for (var code in data.pendingCodes) {
        var p = data.pendingCodes[code];
        if (p.playerName && p.playerName.toLowerCase() === lower && p.expiresAt > now) {
            return { code: code, pending: p };
        }
    }
    return null;
}

// ===================== 表单显示 =====================

/**
 * 给玩家弹表单显示验证码，并确保玩家最终被踢出
 * 1. 关表单 → 踢出
 * 2. 10秒后自动踢出（兜底，防止表单回调没触发）
 */
function showBindForm(player, code, cmdName, isRebind) {
    var config = readJson(CONFIG_PATH);
    if (!config || !config.form) {
        player.kick('§c配置读取失败');
        return;
    }

    var formCfg = config.form;
    var expiryMin = Math.ceil((config.codeExpirySeconds || 300) / 60);

    var title, content;
    if (isRebind) {
        title = formCfg.rebindTitle || '§l§e绑定已过期';
        content = formCfg.rebindContent || '';
    } else {
        title = formCfg.title || '§l§aLuckyClover 服务器';
        content = formCfg.content || '';
    }

    content = content
        .replace('{code}', code)
        .replace('{cmd}', cmdName)
        .replace('{expiry}', String(expiryMin));

    var buttonText = formCfg.button || '§c我知道了';
    var playerName = player.realName;

    logger.info('玩家 ' + playerName + ' 未绑定QQ，显示验证码表单，验证码: ' + code);

    // 显示表单
    player.sendSimpleForm(
        title,
        content,
        [buttonText],
        [''],
        function (_pl, index) {
            // 无论关表单还是点按钮，都踢出
            mc.runcmdEx('kick "' + playerName + '" §c请先在QQ群完成绑定后再进服');
            logger.info('玩家 ' + playerName + ' 已关闭验证码表单，已踢出');
        }
    );

    // 兜底: 10秒后如果玩家还没被踢出，强制踢出
    setTimeout(function () {
        mc.runcmdEx('kick "' + playerName + '" §c绑定验证超时，请重新进服');
    }, 10000);
}

// ===================== 核心逻辑 =====================

/**
 * 处理玩家进服后的白名单验证
 * 核心原则: 玩家必须有有效的 QQ 绑定才能游玩
 * 即使已在 BDS 白名单中，没有 QQ 绑定也会被拦截
 */
function onPlayerJoin(player) {
    var playerName = player.realName;
    var lowerName = playerName.toLowerCase();
    var data = loadData();
    var config = readJson(CONFIG_PATH);
    if (!config) {
        logger.error('配置文件读取失败，跳过白名单检查');
        return;
    }

    // 清理过期验证码
    cleanExpiredCodes(data);

    var binding = data.playerBindings[lowerName];
    var cmdName = config.bindCommand || '验证码';

    // 情况1: 有绑定记录 → 检查是否有效
    if (binding) {
        // 1a) 检查绑定是否过期（如果启用了过期验证）
        if (config.rebindEnabled === true) {
            var rebindDays = config.rebindDays || 30;
            var expiryMs = rebindDays * 24 * 60 * 60 * 1000;
            if (nowMs() - binding.boundAt > expiryMs) {
                // 绑定已过期 → 生成新验证码，弹过期表单
                logger.info('玩家 ' + playerName + ' 绑定已过期，强制重新绑定');
                var code = generateCode(config.codeLength || 6);
                data.pendingCodes[code] = {
                    playerName: playerName,
                    createdAt: nowMs(),
                    expiresAt: nowMs() + (config.codeExpirySeconds || 300) * 1000
                };
                saveData(data);
                showBindForm(player, code, cmdName, true);
                return;
            }
        }

        // 1b) 绑定有效 → 检查 BDS 白名单是否还在
        if (isInAllowlist(playerName)) {
            return; // 一切正常，放行 ✓
        }

        // 1c) 有绑定但白名单被管理员移除了 → 走重新绑定流程
        logger.info('玩家 ' + playerName + ' 有绑定记录但白名单已被移除，强制重新绑定');
    }

    // 情况2: 没有绑定记录 或 绑定已失效
    // 即使玩家已经在 BDS 白名单中，也必须强制绑定 QQ
    if (isInAllowlist(playerName)) {
        logger.info('玩家 ' + playerName + ' 已在白名单中但未绑定QQ，强制绑定');
    }

    // 检查是否已有未过期的验证码可以复用
    var existing = findExistingCode(data, playerName);
    var code;

    if (existing) {
        code = existing.code;
    } else {
        code = generateCode(config.codeLength || 6);
        data.pendingCodes[code] = {
            playerName: playerName,
            createdAt: nowMs(),
            expiresAt: nowMs() + (config.codeExpirySeconds || 300) * 1000
        };
        saveData(data);
    }

    showBindForm(player, code, cmdName, false);
}

/**
 * 处理 QQ 群发送的绑定命令（HuHoBot 回调）
 * @param {object} params - 回调参数
 * @returns {string} 发送到 QQ 群的回复消息
 */
function onBindCommand(params) {
    // BDSAdapter 传过来的是 JSON.stringify(body) 的字符串，需要先解析
    if (typeof params === 'string') {
        try { params = JSON.parse(params); } catch (_) { return '§c参数解析失败'; }
    }
    var config = readJson(CONFIG_PATH);
    if (!config) {
        return '§c白名单插件配置读取失败，请联系管理员';
    }

    var runParams = params.runParams || [];
    var code = runParams[0] && runParams[0].trim();
    var qqOpenId = params.author && params.author.openId;

    // 无参数
    if (!code) {
        var usage = (config.messages && config.messages.usage) || '§e用法: /{cmd} <验证码>';
        return usage.replace('{cmd}', config.bindCommand || '验证码');
    }

    // 确保有 QQ 标识
    if (!qqOpenId) {
        return '§c无法获取 QQ 身份信息，请重试';
    }

    var data = loadData();

    // 验证验证码
    var pending = data.pendingCodes[code];
    if (!pending) {
        return (config.messages && config.messages.invalidCode) || '§c验证码无效或已过期';
    }

    // 检查是否过期
    if (pending.expiresAt <= nowMs()) {
        delete data.pendingCodes[code];
        saveData(data);
        return (config.messages && config.messages.invalidCode) || '§c验证码无效或已过期';
    }

    var playerName = pending.playerName;
    var lowerName = playerName.toLowerCase();

    // 检查该 QQ 的绑定数量上限
    var qqPlayerList = data.qqBindings[qqOpenId] || [];
    var maxAccounts = config.maxAccountsPerQQ || 1;
    if (qqPlayerList.length >= maxAccounts) {
        delete data.pendingCodes[code];
        saveData(data);
        var msg = (config.messages && config.messages.bindLimit) || '§c绑定上限（最多{max}个）';
        return msg.replace('{max}', String(maxAccounts));
    }

    // 检查该玩家是否已被其他 QQ 绑定
    var existingBinding = data.playerBindings[lowerName];
    if (existingBinding && existingBinding.qq !== qqOpenId) {
        delete data.pendingCodes[code];
        saveData(data);
        var msg2 = (config.messages && config.messages.alreadyBound) || '§c{player} 已被其他QQ绑定';
        return msg2.replace('{player}', playerName);
    }

    // 添加到白名单（如果已在白名单中会失败，但没关系）
    var addResult = mc.runcmdEx('allowlist add "' + playerName + '"');
    if (!addResult.success && !isInAllowlist(playerName)) {
        delete data.pendingCodes[code];
        saveData(data);
        logger.error('添加白名单失败: ' + playerName + ' - ' + addResult.output);
        return '§c白名单添加失败，请联系管理员';
    }

    // 保存绑定关系
    data.playerBindings[lowerName] = {
        qq: qqOpenId,
        playerName: playerName,
        boundAt: nowMs()
    };

    if (!data.qqBindings[qqOpenId]) {
        data.qqBindings[qqOpenId] = [];
    }
    if (data.qqBindings[qqOpenId].indexOf(lowerName) === -1) {
        data.qqBindings[qqOpenId].push(lowerName);
    }

    // 删除验证码
    delete data.pendingCodes[code];
    saveData(data);

    logger.info('玩家 ' + playerName + ' 通过 QQ(' + qqOpenId + ') 绑定白名单成功');

    var successMsg = (config.messages && config.messages.success) || '§a{player} 绑定成功，已加白名单';
    return successMsg.replace('{player}', playerName);
}

/**
 * 注册 HuHoBot 回调事件
 */
function registerHuHoCallback() {
    if (!ll.hasExported(HUHO_NAMESPACE, 'regEvent')) {
        logger.warn('未检测到 HuHoBot BDSAdapter，请确保已安装 HuHoBot 插件');
        return false;
    }

    var regEvent = ll.imports(HUHO_NAMESPACE, 'regEvent');

    // 导出回调函数，供 HuHoBot 跨模块调用
    ll.exports(onBindCommand, MY_NAMESPACE, 'onBindCommand');

    var config = readJson(CONFIG_PATH);
    var cmdName = (config && config.bindCommand) || '验证码';
    var registered = regEvent('run', cmdName, MY_NAMESPACE, 'onBindCommand');

    if (registered) {
        logger.info('HuHoBot 回调注册成功，绑定命令关键词: "' + cmdName + '"');
    } else {
        logger.error('HuHoBot 回调注册失败，关键词可能被占用: "' + cmdName + '"');
        return false;
    }

    return true;
}

// ===================== 插件初始化 =====================

(function () {
    logger.info('LuckyClover-WhiteList v1.0.0 加载中...');

    // 确保数据目录存在
    writeJson(DATA_PATH, loadData());

    mc.listen('onServerStarted', function () {
        logger.info('LuckyClover-WhiteList 正在初始化...');

        var ok = registerHuHoCallback();
        if (!ok) {
            logger.warn('HuHoBot 回调注册失败，白名单功能无法使用');
        }
    });

    // 玩家进服后检查白名单 → 未绑定则弹表单，关表单后踢出
    mc.listen('onJoin', function (player) {
        try {
            onPlayerJoin(player);
        } catch (e) {
            logger.error('处理玩家进服时出错: ' + e);
            logger.error(e.stack);
        }
    });

    // 注册管理命令
    var cmd = mc.newCommand(
        'whitelist_bind',
        'LuckyClover-WhiteList 管理命令',
        PermType.GameMasters
    );

    // 重载配置: /whitelist_bind reload
    cmd.setEnum('ReloadAction', ['reload']);
    cmd.mandatory('reloadAction', ParamType.Enum, 'ReloadAction', 1);
    cmd.overload(['reloadAction']);

    // 移除白名单: /whitelist_bind remove <玩家名>
    cmd.setEnum('RemoveAction', ['remove']);
    cmd.mandatory('removeAction', ParamType.Enum, 'RemoveAction', 1);
    cmd.mandatory('playerName', ParamType.RawText);
    cmd.overload(['removeAction', 'playerName']);

    // 通过 QQ OpenID 移除: /whitelist_bind removeqq <openId>
    cmd.setEnum('RemoveQQAction', ['removeqq']);
    cmd.mandatory('removeqqAction', ParamType.Enum, 'RemoveQQAction', 1);
    cmd.mandatory('qqOpenId', ParamType.RawText);
    cmd.overload(['removeqqAction', 'qqOpenId']);

    cmd.overload([]);

    cmd.setCallback(function (_cmd, _ori, out, res) {
        var action = res.reloadAction || res.removeAction || res.removeqqAction || 'help';
        switch (action) {
            case 'reload':
                var newConfig = readJson(CONFIG_PATH);
                if (newConfig) {
                    var newCmdName = newConfig.bindCommand || '验证码';
                    if (ll.hasExported(HUHO_NAMESPACE, 'regEvent')) {
                        var regEvent = ll.imports(HUHO_NAMESPACE, 'regEvent');
                        regEvent('run', newCmdName, MY_NAMESPACE, 'onBindCommand');
                    }
                    out.success('§a[白名单] 配置已重载');
                    logger.info('配置已重载，绑定命令: "' + newCmdName + '"');
                } else {
                    out.error('§c[白名单] 配置文件读取失败');
                }
                break;
            case 'remove': {
                var target = (res.playerName || '').trim();
                if (!target) {
                    out.error('§c用法: /whitelist_bind remove <玩家名>');
                    return;
                }
                var lowerTarget = target.toLowerCase();
                var data = loadData();

                // 从 BDS 白名单移除
                var rmResult = mc.runcmdEx('allowlist remove "' + target + '"');

                // 清理绑定数据
                var removed = false;
                if (data.playerBindings[lowerTarget]) {
                    var qq = data.playerBindings[lowerTarget].qq;
                    delete data.playerBindings[lowerTarget];
                    removed = true;
                    // 同步清理 qqBindings
                    if (qq && data.qqBindings[qq]) {
                        var idx = data.qqBindings[qq].indexOf(lowerTarget);
                        if (idx !== -1) {
                            data.qqBindings[qq].splice(idx, 1);
                        }
                        if (data.qqBindings[qq].length === 0) {
                            delete data.qqBindings[qq];
                        }
                    }
                }
                saveData(data);

                // 如果玩家在线，踢出
                var onlinePlayers = mc.getOnlinePlayers();
                for (var i = 0; i < onlinePlayers.length; i++) {
                    if (onlinePlayers[i].realName.toLowerCase() === lowerTarget) {
                        onlinePlayers[i].kick('§c你已被移出白名单');
                        break;
                    }
                }

                out.success('§a[白名单] 玩家 ' + target + ' 已从白名单移除' + (removed ? '，绑定数据已清理' : ''));
                logger.info('已将玩家 ' + target + ' 移出白名单' + (removed ? '，绑定数据已清理' : ''));
                break;
            }
            case 'removeqq': {
                var qq = (res.qqOpenId || '').trim();
                if (!qq) {
                    out.error('§c用法: /whitelist_bind removeqq <OpenID>');
                    return;
                }
                var data = loadData();
                var playerList = data.qqBindings[qq];
                if (!playerList || playerList.length === 0) {
                    out.error('§c该 QQ 没有绑定任何玩家');
                    return;
                }
                var count = 0;
                for (var i = 0; i < playerList.length; i++) {
                    var pName = playerList[i];
                    // 从 BDS 白名单移除
                    mc.runcmdEx('allowlist remove "' + pName + '"');
                    // 清理绑定数据
                    if (data.playerBindings[pName]) {
                        delete data.playerBindings[pName];
                    }
                    // 如果在线则踢出
                    var onlinePlayers = mc.getOnlinePlayers();
                    for (var j = 0; j < onlinePlayers.length; j++) {
                        if (onlinePlayers[j].realName.toLowerCase() === pName) {
                            onlinePlayers[j].kick('§c你已被移出白名单');
                            break;
                        }
                    }
                    count++;
                }
                delete data.qqBindings[qq];
                saveData(data);
                out.success('§a[白名单] 已移除 QQ(' + qq + ') 绑定的 ' + count + ' 个玩家');
                logger.info('通过 OpenID 移除 ' + count + ' 个玩家白名单: ' + playerList.join(', '));
                break;
            }
            default:
                out.success('§a=== LuckyClover-WhiteList 帮助 ===');
                out.success('§e/whitelist_bind reload §7- 重载配置');
                out.success('§e/whitelist_bind remove <玩家名> §7- 移出白名单并清理绑定');
                out.success('§e/whitelist_bind removeqq <OpenID> §7- 通过QQ OpenID移除其所有绑定');
                break;
        }
    });
    cmd.setup();

    logger.info('LuckyClover-WhiteList v1.0.0 已加载');
})();
