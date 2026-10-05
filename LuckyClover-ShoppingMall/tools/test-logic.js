// 交易/经济逻辑回归测试：验证"可刷物品 / 丢物品 / 凭空增发"这几类问题真的被修掉了。
// 用法：node tools/test-logic.js
const { loadPlugin } = require("./lse-stub");

const results = [];
function check(name, fn) {
    try {
        fn();
        results.push({ name, ok: true });
    } catch (error) {
        results.push({ name, ok: false, error: error && error.message ? error.message : String(error) });
    }
}
function assert(cond, msg) {
    if (!cond) throw new Error(msg || "断言失败");
}
function eq(actual, expected, msg) {
    if (actual !== expected) throw new Error(`${msg || "值不相等"}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

function fresh(wallet) {
    const h = loadPlugin({ wallet: wallet || {} });
    h.startServer();
    return h;
}
// ll.export 的 mgmt* 接口返回 JSON 字符串
function call(h, name, payload) {
    const out = h.exports[name](typeof payload === "string" ? payload : JSON.stringify(payload));
    return typeof out === "string" ? JSON.parse(out) : out;
}
function shopWith(h, xuid, items, extra) {
    const shops = h.store("shops.json");
    shops.shops = shops.shops || {};
    shops.shops[xuid] = Object.assign({
        name: "测试店铺",
        ownerName: "店主",
        isOpen: true,
        notice: "",
        createdAt: Date.now(),
        items: items || {},
        earnings: 0,
        pendingEarnings: 0,
        pendingItems: [],
    }, extra || {});
    return shops.shops[xuid];
}
function officialWith(h, purchaseItems, recycleItems) {
    const store = h.store("official.json");
    store.purchaseItems = purchaseItems || {};
    store.recycleItems = recycleItems || {};
    return store;
}
function listing(type, price, quantity, extra) {
    return Object.assign({
        type,
        aux: 0,
        nbt: `{Name:"${type}",Count:1b}`,
        name: type.replace("minecraft:", ""),
        price,
        quantity,
        category: "材料",
        createdAt: Date.now(),
        sales: 0,
    }, extra || {});
}
// 让 executePurchase / executeRecycle 能真正构造物品：stub 的 mc.newItem 返回 null，
// 这里用 vm 里的函数替换掉 createItemFromNbt 的行为（通过 NBT 桩已经返回假 NBT，故直接注入实现）
function patchItemFactory(h) {
    h.vm.runInContext(`
        createItemFromNbt = function (snbt, count) {
            if (!snbt) return null;
            const m = /Name:"([^"]+)"/.exec(String(snbt));
            const type = m ? m[1] : "minecraft:stone";
            return { type: type, count: count === undefined ? 1 : count, aux: 0,
                     getNbt: () => ({ toSNBT: () => String(snbt) }),
                     maxStackSize: 64, isNull: () => false, setCount(n) { this.count = n; } };
        };
    `, h.sandbox);
}

// ---------------------------------------------------------------- 1. 部分发放不再全额退款
check("购买时只发放了一部分 → 只按到手数量扣款、只退差额", () => {
    const h = fresh({ "xuid-buyer": 10000 });
    patchItemFactory(h);
    // 钻石已有 62 个（还能叠 2 个）+ 2 个空格 → 一次买 70 个：先叠 2 个，再发 64 个，最后 4 个失败
    const specs = [{ type: "minecraft:diamond", count: 62 }];
    while (specs.length < 34) specs.push({ type: "minecraft:stone", count: 64 });
    const buyer = h.makePlayer("买家", "xuid-buyer", false, specs);
    h.setCurrentPlayer(buyer);
    // 让官方交易也计税，顺便验证"只按到手数量计税"
    h.store("config.json").tax = { enabled: true, rate: 0.05, scope: "all" };
    officialWith(h, { k1: listing("minecraft:diamond", 100, -1) });
    let calls = 0;
    h.setGiveItemHook(() => { calls++; return calls <= 1; });
    const result = h.run("executePurchase")(buyer, { isOfficial: true, key: "k1", qty: 70 });
    h.setGiveItemHook(null);
    eq(result.ok, true, "购买应当成功（部分交付）");
    eq(result.qty, 66, "实际到手 66 个");
    // 应扣 66 个的钱（6600）+ 税（330）= 6930；预付 7000 + 350，退回 420
    eq(h.wallet["xuid-buyer"], 10000 - 6930, "只应扣到手数量的钱");
    eq(result.tax, 330, "税也只按到手数量计算");
});

// ---------------------------------------------------------------- 2. 0 库存不进暂存区
check("0 库存条目下架时不会生成幽灵物品", () => {
    const h = fresh();
    const shop = shopWith(h, "xuid-test", { k1: listing("minecraft:diamond", 10, 0) });
    const result = call(h, "mgmtRemoveShopItem", { xuid: "xuid-test", key: "k1" });
    eq(result.ok, true, "下架应当成功");
    eq((shop.pendingItems || []).length, 0, "暂存区不应出现 0 库存的条目");
});

// ---------------------------------------------------------------- 3. 取出仓库负数不会多扣
check("takeFromWarehouse 传入负数会直接拒绝", () => {
    const h = fresh();
    const warehouses = h.store("warehouse.json");
    warehouses.players = { "xuid-test": { playerName: "测试", purchased: false, items: [{ id: "w1", type: "minecraft:diamond", aux: 0, nbt: "", name: "钻石", quantity: 8, description: "", at: Date.now() }], updatedAt: Date.now() } };
    const result = h.run("takeFromWarehouse")("xuid-test", "w1", -3);
    eq(result.ok, false, "负数应当被拒绝");
    eq(warehouses.players["xuid-test"].items[0].quantity, 8, "仓库数量不应变化");
});

// ---------------------------------------------------------------- 4. 买断只扣一次钱
check("连续买断两次只扣一次钱", () => {
    const h = fresh({ "xuid-test": 50000 });
    const warehouses = h.store("warehouse.json");
    warehouses.players = { "xuid-test": { playerName: "测试", purchased: false, items: [], updatedAt: Date.now() } };
    const first = h.run("buyoutWarehouse")("xuid-test");
    const second = h.run("buyoutWarehouse")("xuid-test");
    eq(first.ok, true, "第一次买断成功");
    eq(second.ok, false, "第二次应当失败");
    eq(h.wallet["xuid-test"], 50000 - 10000, "只应扣一次买断费用");
});

// ---------------------------------------------------------------- 5. 已取消的订单不能履约
check("已取消 / 已结束的订单不能履约", () => {
    const h = fresh({ "xuid-seller": 0 });
    patchItemFactory(h);
    const seller = h.makePlayer("卖家", "xuid-seller", false, [{ type: "minecraft:diamond", count: 8 }]);
    h.setCurrentPlayer(seller);
    const req = h.store("requests.json");
    req.requests = [];
    const stale = { id: "R1", itemType: "minecraft:diamond", itemName: "钻石", quantity: 3, priceEach: 10, requesterXuid: "xuid-other", requesterName: "别人", status: "active", createdTime: Date.now(), expiresAt: Date.now() + 100000 };
    const result = h.run("fulfillRequest")(seller, stale, 2);
    eq(result.ok, false, "订单不在进行中列表里应当被拒绝");
    eq(h.wallet["xuid-seller"], 0, "不应有钱入账");
});

// ---------------------------------------------------------------- 6. 履约只收订单指定的那一种
check("履约只收订单指定的 NBT，不会用普通物品掉包", () => {
    const h = fresh({ "xuid-seller": 0 });
    patchItemFactory(h);
    const plainNbt = '{Name:"minecraft:diamond_sword",Count:1b}';
    const fancyNbt = '{Name:"minecraft:diamond_sword",Count:1b,display:{Name:"神剑"}}';
    const seller = h.makePlayer("卖家", "xuid-seller", false, [
        { type: "minecraft:diamond_sword", count: 1, nbt: fancyNbt },
        { type: "minecraft:diamond_sword", count: 3, nbt: plainNbt },
    ]);
    h.setCurrentPlayer(seller);
    const key = h.run("listingKey")("minecraft:diamond_sword", plainNbt);
    const req = h.store("requests.json");
    req.requests = [{
        id: "R2", itemType: "minecraft:diamond_sword", itemName: "钻石剑",
        itemNbt: plainNbt, itemAux: 0,
        quantity: 2, priceEach: 50, requesterXuid: "xuid-other", requesterName: "别人",
        status: "active", createdTime: Date.now(), expiresAt: Date.now() + 100000,
    }];
    const result = h.run("fulfillRequest")(seller, req.requests[0], 2);
    eq(result.ok, true, "履约应当成功");
    const slots = seller.getInventory()._slots.filter(Boolean);
    const fancy = slots.filter((s) => s.nbt === fancyNbt).reduce((n, s) => n + s.count, 0);
    const plain = slots.filter((s) => s.nbt === plainNbt).reduce((n, s) => n + s.count, 0);
    eq(fancy, 1, "附魔/改名的那把必须原封不动");
    eq(plain, 1, "只应扣掉订单指定 NBT 的 2 把");
    eq(h.wallet["xuid-seller"], 100, "按 2 件结算收入");
    assert(key, "key 计算异常");
});

// ---------------------------------------------------------------- 7. 发放失败会退回仓库而不是消失
check("取出仓库时背包写入失败 → 物品退回仓库，不会消失", () => {
    const h = fresh();
    patchItemFactory(h);
    const player = h.makePlayer("测试", "xuid-test", false, []);
    h.setCurrentPlayer(player);
    const warehouses = h.store("warehouse.json");
    warehouses.players = { "xuid-test": { playerName: "测试", purchased: false, items: [{ id: "w1", type: "minecraft:diamond", aux: 0, nbt: '{Name:"minecraft:diamond",Count:1b}', name: "钻石", quantity: 5, description: "", at: Date.now() }], updatedAt: Date.now() } };
    // 背包直接放不下：giveItem 一律失败
    h.setGiveItemHook(() => false);
    player.getInventory()._slots.length = 36;
    player.getInventory()._slots.fill(h.makeItem("minecraft:stone", 64));
    h.vm.runInContext("canReceive = function () { return false; };", h.sandbox);
    h.run("withdrawWarehouseItem")(player, warehouses.players["xuid-test"].items[0], 0, 1);
    h.setGiveItemHook(null);
    const record = warehouses.players["xuid-test"];
    const total = (record.items || []).reduce((n, it) => n + (it.quantity || 0), 0);
    eq(total, 5, "仓库里的 5 个钻石必须还在");
});

// ---------------------------------------------------------------- 8. 面板非法库存不再变无限
check("面板把非法 quantity 写进官方商品会被拒绝（不会变成 -1 无限）", () => {
    const h = fresh();
    officialWith(h, { k1: listing("minecraft:diamond", 10, 5) });
    const bad = call(h, "mgmtSetOfficialStock", { key: "k1", quantity: "abc" });
    eq(bad.ok, false, "非法数量应当报错");
    eq(h.store("official.json").purchaseItems.k1.quantity, 5, "库存不应被改动");
    const missing = call(h, "mgmtSetOfficialStock", { key: "k1" });
    eq(missing.ok, false, "缺失数量应当报错");
    const ok = call(h, "mgmtSetOfficialStock", { key: "k1", quantity: -1 });
    eq(ok.ok, true, "显式 -1 仍然允许（无限库存）");
    eq(h.store("official.json").purchaseItems.k1.quantity, -1, "显式 -1 应被写入");
});

// ---------------------------------------------------------------- 9. 折扣中改价不会被旧原价覆盖
check("折扣中改价会先结束折扣，到期不会把新价覆盖回旧价", () => {
    const h = fresh();
    shopWith(h, "xuid-test", {
        k1: listing("minecraft:diamond", 50, 10, {
            originalPrice: 100, discount: 5, discountEndTime: Date.now() + 60000,
        }),
    });
    const result = call(h, "mgmtSetShopPrice", { xuid: "xuid-test", key: "k1", price: 70 });
    eq(result.ok, true, "改价应当成功");
    eq(result.discountCleared, true, "应当报告已结束折扣");
    // 注意：存储层每次 get 都是新副本，落库后必须重新读
    const item = h.store("shops.json").shops["xuid-test"].items.k1;
    eq(item.price, 70, "新价应当是 70");
    assert(item.discount === undefined && item.originalPrice === undefined, "折扣字段应当被清掉");
    // 模拟折扣到期扫描
    h.run("checkDiscounts")();
    eq(h.store("shops.json").shops["xuid-test"].items.k1.price, 70, "到期扫描不应把价格改回去");
});

// ---------------------------------------------------------------- 10. 缺 quantity 的官方商品不再无限
check("官方商品缺 quantity 字段按库存 0 处理（不再无限出售）", () => {
    const h = fresh({ "xuid-buyer": 100000 });
    patchItemFactory(h);
    const buyer = h.makePlayer("买家", "xuid-buyer", false);
    h.setCurrentPlayer(buyer);
    officialWith(h, { k1: { type: "minecraft:diamond", nbt: '{Name:"minecraft:diamond",Count:1b}', name: "钻石", price: 10 } });
    const result = h.run("executePurchase")(buyer, { isOfficial: true, key: "k1", qty: 1 });
    eq(result.ok, false, "缺数量的条目应当买不到");
    eq(h.wallet["xuid-buyer"], 100000, "不应扣钱");
});

// ---------------------------------------------------------------- 11. 卖家在线入账失败转待结算
check("卖家在线但入账失败 → 钱进待结算，不会消失", () => {
    const h = fresh({ "xuid-buyer": 10000, "xuid-seller": 0 });
    patchItemFactory(h);
    const buyer = h.makePlayer("买家", "xuid-buyer", false);
    h.setCurrentPlayer(buyer);
    shopWith(h, "xuid-seller", { k1: listing("minecraft:diamond", 100, 5) });
    // 让 money.add 对卖家失败
    h.sandbox.money.add = (xuid, amount) => (String(xuid) === "xuid-seller" ? false : true);
    const result = h.run("executePurchase")(buyer, { isOfficial: false, ownerXuid: "xuid-seller", key: "k1", qty: 1 });
    eq(result.ok, true, "购买应当成功");
    // 落库后重新读，避免读到旧副本
    eq(h.store("shops.json").shops["xuid-seller"].pendingEarnings, 100, "货款应当转为待结算");
    eq(h.store("shops.json").shops["xuid-seller"].items.k1.quantity, 4, "库存应当扣掉 1 个");
});

// ---------------------------------------------------------------- 12. 取消求购退款展示与实际一致
check("部分履约后取消：提示的退款金额与实际一致", () => {
    const h = fresh();
    const req = h.store("requests.json");
    req.requests = [];
    const request = {
        id: "R3", itemType: "minecraft:diamond", itemName: "钻石", quantity: 4, priceEach: 25,
        totalAmount: 100, requesterXuid: "xuid-test", requesterName: "测试", status: "active",
        createdTime: Date.now(), expiresAt: Date.now() + 100000,
    };
    // 先履约 1 件：剩余 3 件
    request.quantity = 3;
    request.fulfilled = 1;
    const refund = h.run("requestRefund")(request);
    eq(refund, 3 * 25 + h.run("getRequestConfig")().fee, "退款应为剩余 3 件 + 手续费");
});

// ---------------------------------------------------------------- 13. 非法价格不再被静默写成最低价
check("面板传入非法价格会被拒绝（不会静默写成最低价）", () => {
    const h = fresh();
    shopWith(h, "xuid-test", { k1: listing("minecraft:diamond", 50, 5) });
    const bad = call(h, "mgmtSetShopPrice", { xuid: "xuid-test", key: "k1", price: "abc" });
    eq(bad.ok, false, "非法价格应当报错");
    eq(h.store("shops.json").shops["xuid-test"].items.k1.price, 50, "价格不应被改动");
});

// ---------------------------------------------------------------- 14. 面板删店保护未领取资产
check("面板删店时若还有暂存物品会被拒绝", () => {
    const h = fresh();
    shopWith(h, "xuid-test", {}, { pendingItems: [{ type: "minecraft:diamond", nbt: "", name: "钻石", quantity: 2, at: Date.now() }] });
    const result = call(h, "mgmtDeleteShop", { xuid: "xuid-test" });
    eq(result.ok, false, "应当拒绝删除");
    assert(h.store("shops.json").shops["xuid-test"], "店铺应当还在");
});

// ---------------------------------------------------------------- 输出
const failed = results.filter((r) => !r.ok);
for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.ok ? "" : " → " + r.error}`);
}
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
process.exit(failed.length ? 1 : 0);
