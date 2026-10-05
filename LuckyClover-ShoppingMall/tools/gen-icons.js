// 生成 Icons.json：把物品目录（Items.json）里的每个物品类型映射到「客户端真实存在」的贴图路径。
// 数据来源（全部为官方文件）：
//   - bedrock-samples/resource_pack/textures/item_texture.json   物品图标表
//   - bedrock-samples/resource_pack/textures/terrain_texture.json 方块贴图键 -> 文件
//   - BDS/resource_packs/vanilla/blocks.json                      方块 -> 贴图键（含 carried_textures 手持贴图）
//   - textures/items 与 textures/blocks 的真实文件名清单（用于最终校验）
// 输出里每一条都经过「文件确实存在」校验，不会出现空白或错误图标。
const fs = require("fs");
const path = require("path");

const SAMPLES = "D:\\Minecraft示例\\bedrock-samples-1.21.130.3\\resource_pack\\textures";
const LEGACY_BLOCKS = "D:\\Minecraft Server\\BDS\\bedrock-server-1.26.33.2\\resource_packs\\vanilla\\blocks.json";
const CATALOG = path.join(__dirname, "..", "Items.json");
const OUT = path.join(__dirname, "..", "Icons.json");

function listPngs(dir, prefix) {
    const out = new Set();
    const base = prefix || "";
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        if (name.isDirectory()) {
            for (const sub of listPngs(path.join(dir, name.name), `${base}${name.name}/`)) out.add(sub);
        } else if (name.name.toLowerCase().endsWith(".png")) {
            out.add(base + name.name.slice(0, -4));
        }
    }
    return out;
}
const itemPngs = listPngs(path.join(SAMPLES, "items"));
const blockPngs = listPngs(path.join(SAMPLES, "blocks"));

// 去掉 // 行注释（要区分字符串内外），官方 JSON 允许注释
function readJsonc(file) {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            out += ch;
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; out += ch; continue; }
        if (ch === "/" && raw[i + 1] === "/") {
            while (i < raw.length && raw[i] !== "\n") i++;
            out += "\n";
            continue;
        }
        out += ch;
    }
    return JSON.parse(out);
}
const atlas = readJsonc(path.join(SAMPLES, "item_texture.json")).texture_data;
const terrain = readJsonc(path.join(SAMPLES, "terrain_texture.json")).texture_data;
const legacyBlocks = readJsonc(LEGACY_BLOCKS);

function pickTexture(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        for (const v of value) { const p = pickTexture(v); if (p) return p; }
        return "";
    }
    for (const key of ["side", "up", "north", "south", "east", "west", "down"]) {
        const p = pickTexture(value[key]);
        if (p) return p;
    }
    const first = Object.keys(value)[0];
    return first ? pickTexture(value[first]) : "";
}

function asPath(raw) {
    const p = String(raw || "");
    const m = /^textures\/(items|blocks)\/(.+)$/.exec(p);
    if (!m) return "";
    return (m[1] === "items" ? itemPngs : blockPngs).has(m[2]) ? p : "";
}
function terrainPath(key) {
    if (!key) return "";
    const entry = terrain[key];
    if (!entry) return "";
    const list = entry.textures;
    const arr = Array.isArray(list) ? list : [list];
    for (const t of arr) {
        const raw = typeof t === "string" ? t : (t && t.path) || "";
        const full = raw.indexOf("textures/") === 0 ? raw : `textures/blocks/${raw}`;
        const p = asPath(full);
        if (p) return p;
    }
    return "";
}
function atlasPath(key) {
    if (!key) return "";
    const entry = atlas[key];
    if (!entry) return "";
    const list = entry.textures;
    const arr = Array.isArray(list) ? list : [list];
    for (const t of arr) {
        const p = asPath(typeof t === "string" ? t : (t && t.path) || "");
        if (p) return p;
    }
    return "";
}

const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const sortedKey = (s) => tokens(s).sort().join(" ");
const itemByTokens = new Map();
const blockByTokens = new Map();
for (const n of itemPngs) if (!itemByTokens.has(sortedKey(n))) itemByTokens.set(sortedKey(n), n);
for (const n of blockPngs) if (!blockByTokens.has(sortedKey(n))) blockByTokens.set(sortedKey(n), n);

const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray",
    "cyan", "purple", "blue", "brown", "green", "red", "black"];
const WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "bamboo",
    "crimson", "warped", "pale_oak"];
const alt = (c) => (c === "light_gray" ? "silver" : c);
const altWood = (w) => (w === "dark_oak" ? "big_oak" : w);

// 旧名/怪名与需要绝对正确的常见物品
const OVERRIDES = {
    "air": "", "carpet": "textures/blocks/wool_colored_white", "planks": "textures/blocks/planks_oak",
    "wooden_slab": "textures/blocks/planks_oak", "double_wooden_slab": "textures/blocks/planks_oak",
    "stained_glass": "textures/blocks/glass", "stained_glass_pane": "textures/blocks/glass_pane_top",
    "stained_hardened_clay": "textures/blocks/hardened_clay_stained_white",
    "flowing_water": "textures/blocks/water_flow_grey", "water": "textures/blocks/water_still_grey",
    "flowing_lava": "textures/blocks/lava_flow", "lava": "textures/blocks/lava_still",
    "potion": "textures/items/potion_bottle_drinkable",
    "lingering_potion": "textures/items/potion_bottle_lingering",
    "splash_potion": "textures/items/potion_bottle_splash",
    "item.iron_door": "textures/blocks/door_iron_lower",
    "item.campfire": "textures/blocks/campfire_log",
    "item.beetroot": "textures/items/beetroot", "item.beetroot_soup": "textures/items/beetroot_soup",
    "sparkler": "textures/items/sparkler", "glow_stick": "textures/items/glow_stick",
    "balloon": "textures/items/balloon", "rapid_fertilizer": "textures/items/rapid_fertilizer",
    "bleach": "textures/items/bleach", "ice_bomb": "textures/items/ice_bomb",
    "medicine": "textures/items/medicine", "camera": "textures/items/camera",
    "enchanted_book": "textures/items/book_enchanted", "written_book": "textures/items/book_written",
    "writable_book": "textures/items/book_writable", "book": "textures/items/book_normal",
    "book_and_quill": "textures/items/book_writable", "knowledge_book": "textures/items/book_written",
    "bow": "textures/items/bow_standby", "crossbow": "textures/items/crossbow_standby",
    "trident": "textures/items/trident", "shield": "textures/items/shield",
    "arrow": "textures/items/arrow", "spectral_arrow": "textures/items/spectral_arrow",
    "tipped_arrow": "textures/items/arrow",
    "beef": "textures/items/beef_raw", "cooked_beef": "textures/items/beef_cooked",
    "porkchop": "textures/items/porkchop_raw", "cooked_porkchop": "textures/items/porkchop_cooked",
    "chicken": "textures/items/chicken_raw", "cooked_chicken": "textures/items/chicken_cooked",
    "mutton": "textures/items/mutton_raw", "cooked_mutton": "textures/items/mutton_cooked",
    "rabbit": "textures/items/rabbit_raw", "cooked_rabbit": "textures/items/rabbit_cooked",
    "cod": "textures/items/fish_raw", "cooked_cod": "textures/items/fish_cooked",
    "salmon": "textures/items/fish_salmon", "cooked_salmon": "textures/items/fish_salmon_cooked",
    "tropical_fish": "textures/items/fish_clownfish_raw", "pufferfish": "textures/items/fish_pufferfish_raw",
    "golden_apple": "textures/items/apple_golden", "enchanted_golden_apple": "textures/items/apple_golden",
    "beetroot_soup": "textures/items/beetroot_soup", "mushroom_stew": "textures/items/mushroom_stew",
    "rabbit_stew": "textures/items/rabbit_stew", "suspicious_stew": "textures/items/suspicious_stew",
    "cocoa_beans": "textures/items/dye_powder_brown", "melon_slice": "textures/items/melon_slice",
    "glistering_melon_slice": "textures/items/melon_speckled", "melon": "textures/items/melon",
    "melon_block": "textures/blocks/melon_side", "pumpkin": "textures/items/pumpkin",
    "carved_pumpkin": "textures/items/pumpkin", "jack_o_lantern": "textures/items/pumpkin",
    "lit_pumpkin": "textures/blocks/pumpkin_face_off", "carrot": "textures/items/carrot",
    "carrots": "textures/items/carrot", "potato": "textures/items/potato",
    "baked_potato": "textures/items/potato_baked", "poisonous_potato": "textures/items/potato_poisonous",
    "wheat_seeds": "textures/items/seeds_wheat", "pumpkin_seeds": "textures/items/seeds_pumpkin",
    "melon_seeds": "textures/items/seeds_melon", "beetroot_seeds": "textures/items/seeds_beetroot",
    "nether_wart": "textures/items/nether_wart",
    "map": "textures/items/map_empty", "filled_map": "textures/items/map_filled",
    "empty_map": "textures/items/map_empty", "clock": "textures/items/watch",
    "compass": "textures/items/compass_item", "recovery_compass": "textures/items/recovery_compass_item",
    "lead": "textures/items/lead", "leash": "textures/items/lead", "bone_meal": "textures/items/dye_powder_white",
    "slime_ball": "textures/items/slimeball", "slime": "textures/blocks/slime_block",
    "lapis_lazuli": "textures/items/dye_powder_blue", "redstone": "textures/items/redstone_dust",
    "redstone_dust": "textures/items/redstone_dust", "quartz": "textures/items/quartz",
    "golden_sword": "textures/items/gold_sword", "golden_pickaxe": "textures/items/gold_pickaxe",
    "golden_axe": "textures/items/gold_axe", "golden_shovel": "textures/items/gold_shovel",
    "golden_hoe": "textures/items/gold_hoe", "golden_helmet": "textures/items/gold_helmet",
    "golden_chestplate": "textures/items/gold_chestplate", "golden_leggings": "textures/items/gold_leggings",
    "golden_boots": "textures/items/gold_boots", "golden_horse_armor": "textures/items/horse_armor_gold",
    "wooden_sword": "textures/items/wood_sword", "wooden_pickaxe": "textures/items/wood_pickaxe",
    "wooden_axe": "textures/items/wood_axe", "wooden_shovel": "textures/items/wood_shovel",
    "wooden_hoe": "textures/items/wood_hoe", "clock_item": "textures/items/watch",
    "totem_of_undying": "textures/items/totem", "heart_of_the_sea": "textures/items/heartofthesea_closed",
    "nautilus_shell": "textures/items/nautilus_shell", "prismarine_shard": "textures/items/prismarine_shard",
    "prismarine_crystals": "textures/items/prismarine_crystals", "shulker_shell": "textures/items/shulker_shell",
    "cobblestone_wall": "textures/blocks/cobblestone_wall",
    "mossy_cobblestone": "textures/blocks/cobblestone_mossy",
    "mossy_cobblestone_wall": "textures/blocks/cobblestone_mossy",
    "stone_brick_wall": "textures/blocks/stonebrick",
    "stone_brick_stairs": "textures/blocks/stonebrick",
    "stone_brick_slab": "textures/blocks/stonebrick",
    "mossy_stone_brick_slab": "textures/blocks/mossy_stone_brick",
    "mossy_stone_brick_wall": "textures/blocks/mossy_stone_brick",
    "nether_brick_fence": "textures/blocks/nether_brick",
    "nether_brick_slab": "textures/blocks/nether_brick",
    "red_nether_brick_slab": "textures/blocks/red_nether_brick",
    "prismarine_brick_slab": "textures/blocks/prismarine_bricks",
    "prismarine_brick_stairs": "textures/blocks/prismarine_bricks",
    "dark_prismarine_slab": "textures/blocks/dark_prismarine",
    "prismarine_slab": "textures/blocks/prismarine",
    "smooth_stone_slab": "textures/blocks/smooth_stone",
    "smooth_stone": "textures/blocks/smooth_stone",
    "smooth_quartz": "textures/blocks/quartz_block_bottom",
    "quartz_block": "textures/blocks/quartz_block_side",
    "chiseled_quartz_block": "textures/blocks/quartz_block_chiseled",
    "quartz_pillar": "textures/blocks/quartz_block_lines",
    "quartz_bricks": "textures/blocks/quartz_bricks",
    "deepslate_bricks": "textures/blocks/deepslate/deepslate_bricks",
    "deepslate_tiles": "textures/blocks/deepslate/deepslate_tiles",
    "cracked_deepslate_bricks": "textures/blocks/deepslate/cracked_deepslate_bricks",
    "cracked_deepslate_tiles": "textures/blocks/deepslate/cracked_deepslate_tiles",
    "chiseled_deepslate": "textures/blocks/deepslate/chiseled_deepslate",
    "cobbled_deepslate": "textures/blocks/deepslate/cobbled_deepslate",
    "polished_deepslate": "textures/blocks/deepslate/polished_deepslate",
    "ancient_debris": "textures/blocks/ancient_debris_side",
    "hay_block": "textures/blocks/hayblock_side", "farmland": "textures/blocks/farmland",
    "decorated_pot": "textures/blocks/decorated_pot_base",
    "sugar_cane": "textures/items/reeds", "reeds": "textures/items/reeds",
    "item_frame": "textures/items/item_frame", "glow_item_frame": "textures/items/glow_item_frame",
    "glow_frame": "textures/items/glow_item_frame", "frame": "textures/items/item_frame",
    "deny": "textures/blocks/build_deny", "allow": "textures/blocks/build_allow",
    "border_block": "textures/blocks/border_block", "light_block": "textures/blocks/light_block_0",
    "reserved6": "textures/blocks/missing_tile", "info_update": "textures/blocks/missing_tile",
    "info_update2": "textures/blocks/missing_tile", "sticky_piston_arm_collision": "textures/blocks/piston_top_sticky",
    "chemistry_table": "textures/blocks/compound_creator_side_a",
    "colored_torch_rg": "textures/blocks/colored_torch_red",
    "double_plant": "textures/blocks/double_plant_sunflower_front",
    "standing_sign": "textures/items/sign", "wall_sign": "textures/items/sign", "sign": "textures/items/sign",
    "oak_sign": "textures/items/sign", "spruce_sign": "textures/blocks/spruce_sign",
    "birch_sign": "textures/blocks/birch_sign", "jungle_sign": "textures/blocks/jungle_sign",
    "acacia_sign": "textures/blocks/acacia_sign", "dark_oak_sign": "textures/blocks/darkoak_sign",
    "mangrove_sign": "textures/blocks/mangrove_sign", "cherry_sign": "textures/blocks/cherry_sign",
    "bamboo_sign": "textures/blocks/bamboo_sign", "crimson_sign": "textures/blocks/crimson_sign",
    "warped_sign": "textures/blocks/warped_sign",
    "chest": "textures/blocks/chest_inventory_front", "trapped_chest": "textures/blocks/trapped_chest_inventory_front",
    "ender_chest": "textures/blocks/ender_chest_inventory_front",
    "shulker_box": "textures/items/shulker_top_undyed", "undyed_shulker_box": "textures/items/shulker_top_undyed",
    "crafting_table": "textures/blocks/crafting_table_front",
    "furnace": "textures/blocks/furnace_front_off", "lit_furnace": "textures/blocks/furnace_front_on",
    "blast_furnace": "textures/blocks/blast_furnace_front_off",
    "lit_blast_furnace": "textures/blocks/blast_furnace_front_on",
    "smoker": "textures/blocks/smoker_front_off", "lit_smoker": "textures/blocks/smoker_front_on",
    "stonecutter_block": "textures/blocks/stonecutter2_saw", "stonecutter": "textures/blocks/stonecutter2_saw",
    "smithing_table": "textures/blocks/smithing_table_front",
    "cartography_table": "textures/blocks/cartography_table_side1",
    "fletching_table": "textures/blocks/fletching_table_front", "loom": "textures/blocks/loom_front",
    "barrel": "textures/blocks/barrel_side", "composter": "textures/blocks/composter_side",
    "lectern": "textures/blocks/lectern_front", "grindstone": "textures/blocks/grindstone_side",
    "brewing_stand": "textures/items/brewing_stand", "anvil": "textures/blocks/anvil_top_damaged_0",
    "beacon": "textures/blocks/beacon_core", "conduit": "textures/blocks/conduit_closed",
    "lodestone": "textures/blocks/lodestone_side", "respawn_anchor": "textures/blocks/respawn_anchor_side0",
    "bell": "textures/items/bell", "hopper": "textures/blocks/hopper_outside",
    "cauldron": "textures/items/cauldron", "lava_cauldron": "textures/blocks/cauldron_top",
    "rail": "textures/blocks/rail_normal", "golden_rail": "textures/blocks/rail_golden",
    "detector_rail": "textures/blocks/rail_detector", "activator_rail": "textures/blocks/rail_activator",
    "ladder": "textures/blocks/ladder", "scaffolding": "textures/blocks/scaffolding_side",
    "torch": "textures/items/torch", "soul_torch": "textures/items/soul_torch",
    "redstone_torch": "textures/items/redstone_torch_on", "unlit_redstone_torch": "textures/items/redstone_torch_off",
    "lantern": "textures/items/lantern", "soul_lantern": "textures/items/soul_lantern",
    "campfire": "textures/items/campfire", "soul_campfire": "textures/items/soul_campfire",
    "snow_layer": "textures/blocks/snow", "snow": "textures/blocks/snow",
    "grass": "textures/blocks/grass_side", "grass_block": "textures/blocks/grass_side",
    "grass_path": "textures/blocks/grass_path_side", "dirt_path": "textures/blocks/grass_path_side",
    "waterlily": "textures/blocks/waterlily", "lily_pad": "textures/blocks/waterlily",
    "deadbush": "textures/blocks/deadbush", "vine": "textures/blocks/vine",
    "tallgrass": "textures/blocks/tallgrass", "short_grass": "textures/blocks/tallgrass",
    "double_plant": "textures/blocks/double_plant_sunflower_front",
    "netherreactor": "textures/blocks/reactor_core", "glowingobsidian": "textures/blocks/glowing_obsidian",
    "monster_egg": "textures/blocks/monster_egg", "skull": "textures/blocks/skull",
    "mob_spawner": "textures/blocks/mob_spawner", "end_portal_frame": "textures/blocks/endframe_top",
    "end_portal": "textures/blocks/end_portal", "end_gateway": "textures/blocks/end_gateway",
    "dragon_egg": "textures/blocks/dragon_egg", "chorus_flower": "textures/blocks/chorus_flower",
    "portal": "textures/blocks/portal", "fire": "textures/blocks/fire_0",
    "bubble_column": "textures/blocks/bubble_column_outer", "seagrass": "textures/blocks/seagrass_carried",
    "kelp": "textures/items/kelp", "dried_kelp_block": "textures/blocks/dried_kelp_block_side_a",
    "sea_pickle": "textures/items/sea_pickle", "turtle_egg": "textures/items/turtle_egg",
    "beetroot": "textures/items/beetroot", "wheat": "textures/items/wheat", "cocoa": "textures/items/dye_powder_brown",
    "sweet_berry_bush": "textures/items/sweet_berries", "wither_rose": "textures/items/wither_rose",
    "flower_pot": "textures/items/flower_pot", "jigsaw": "textures/blocks/jigsaw_side",
    "structure_block": "textures/blocks/structure_block", "structure_void": "textures/blocks/structure_void",
    "command_block": "textures/blocks/command_block_front",
    "repeating_command_block": "textures/blocks/command_block_repeating_front",
    "chain_command_block": "textures/blocks/command_block_chain_front",
    "tripwire_hook": "textures/blocks/trip_wire_source", "tripWire": "textures/blocks/trip_wire",
    "cocoa": "textures/items/dye_powder_brown",
    "coral": "textures/blocks/coral_blue", "coral_block": "textures/blocks/coral_blue",
    "coral_fan": "textures/blocks/coral_fan_blue", "coral_fan_dead": "textures/blocks/coral_fan_blue_dead",
    "double_plant": "textures/blocks/double_plant_sunflower_front",
    "nether_wart_block": "textures/blocks/nether_wart_block", "warped_wart_block": "textures/blocks/warped_wart_block",
    "crimson_nylium": "textures/blocks/crimson_nylium_top", "warped_nylium": "textures/blocks/warped_nylium_top",
    "soul_soil": "textures/blocks/soul_soil", "soul_sand": "textures/blocks/soul_sand",
    "shroomlight": "textures/blocks/shroomlight", "twisting_vines": "textures/blocks/twisting_vines_bottom",
    "weeping_vines": "textures/blocks/weeping_vines_bottom", "target": "textures/blocks/target_side",
    "honey_block": "textures/blocks/honey_side", "honeycomb_block": "textures/blocks/honeycomb",
    "bee_nest": "textures/blocks/bee_nest_side", "beehive": "textures/blocks/beehive_side",
    "amethyst_block": "textures/blocks/amethyst_block", "budding_amethyst": "textures/blocks/budding_amethyst",
    "calcite": "textures/blocks/calcite", "tuff": "textures/blocks/tuff",
    "dripstone_block": "textures/blocks/dripstone_block", "moss_block": "textures/blocks/moss_block",
    "azalea_leaves": "textures/blocks/azalea_leaves", "flowering_azalea_leaves": "textures/blocks/flowering_azalea_leaves",
    "spore_blossom": "textures/blocks/spore_blossom", "glow_lichen": "textures/blocks/glow_lichen",
    "mud": "textures/blocks/mud", "packed_mud": "textures/blocks/packed_mud",
    "mud_bricks": "textures/blocks/mud_bricks", "sculk": "textures/blocks/sculk",
    "sculk_catalyst": "textures/blocks/sculk_catalyst_side", "sculk_shrieker": "textures/blocks/sculk_shrieker_side",
    "sculk_sensor": "textures/blocks/sculk_sensor_side", "reinforced_deepslate": "textures/blocks/reinforced_deepslate_side",
    "ochre_froglight": "textures/blocks/ochre_froglight_side", "verdant_froglight": "textures/blocks/verdant_froglight_side",
    "pearlescent_froglight": "textures/blocks/pearlescent_froglight_side",
    "chiseled_bookshelf": "textures/blocks/chiseled_bookshelf_side",
    "bamboo_block": "textures/blocks/bamboo_block", "bamboo_mosaic": "textures/blocks/bamboo_mosaic",
    "mangrove_roots": "textures/blocks/mangrove_roots_side", "muddy_mangrove_roots": "textures/blocks/muddy_mangrove_roots_side",
    "suspicious_sand": "textures/blocks/suspicious_sand_0", "suspicious_gravel": "textures/blocks/suspicious_gravel_0",
    "decorated_pot": "textures/blocks/decorated_pot_base",
    "crafter": "textures/blocks/crafter_north", "trial_spawner": "textures/blocks/trial_spawner_side_inactive",
    "vault": "textures/blocks/vault_side_off", "heavy_core": "textures/blocks/heavy_core",
    "copper_bulb": "textures/blocks/copper_bulb", "exposed_copper_bulb": "textures/blocks/exposed_copper_bulb",
    "weathered_copper_bulb": "textures/blocks/weathered_copper_bulb", "oxidized_copper_bulb": "textures/blocks/oxidized_copper_bulb",
    "copper_grate": "textures/blocks/copper_grate", "copper_door": "textures/blocks/copper_door_bottom",
    "copper_trapdoor": "textures/blocks/copper_trapdoor",
    "chiseled_copper": "textures/blocks/chiseled_copper", "cut_copper": "textures/blocks/cut_copper",
    "copper_block": "textures/blocks/copper_block", "raw_copper_block": "textures/blocks/raw_copper_block",
    "raw_iron_block": "textures/blocks/raw_iron_block", "raw_gold_block": "textures/blocks/raw_gold_block",
    "minecart": "textures/items/minecart_normal", "furnace_minecart": "textures/items/minecart_furnace",
    "glass_bottle": "textures/items/potion_bottle_empty", "ink_sac": "textures/items/dye_powder_black_new",
    "glow_ink_sac": "textures/items/dye_powder_cyan", "leather_helmet": "textures/items/leather_helmet",
    "chainmail_helmet": "textures/items/chainmail_helmet", "chainmail_leggings": "textures/items/chainmail_leggings",
    "hard_glass": "textures/blocks/glass", "hard_stained_glass": "textures/blocks/glass",
    "stripped_crimson_stem": "textures/blocks/stripped_crimson_stem_side",
    "stripped_warped_stem": "textures/blocks/stripped_warped_stem_side",
    "crimson_stem": "textures/blocks/crimson_stem_side", "warped_stem": "textures/blocks/warped_stem_side",
    "crimson_hyphae": "textures/blocks/crimson_stem_side", "warped_hyphae": "textures/blocks/warped_stem_side",
    "stripped_crimson_hyphae": "textures/blocks/stripped_crimson_stem_side",
    "stripped_warped_hyphae": "textures/blocks/stripped_warped_stem_side",
    "mangrove_wood": "textures/blocks/mangrove_log_side", "mangrove_log": "textures/blocks/mangrove_log_side",
    "stripped_mangrove_log": "textures/blocks/stripped_mangrove_log_side",
    "stripped_mangrove_wood": "textures/blocks/stripped_mangrove_log_side",
    "cherry_wood": "textures/blocks/cherry_log_side", "cherry_log": "textures/blocks/cherry_log_side",
    "stripped_cherry_log": "textures/blocks/stripped_cherry_log_side",
    "bamboo_block": "textures/blocks/bamboo_block", "stripped_bamboo_block": "textures/blocks/stripped_bamboo_block",
    "pale_oak_wood": "textures/blocks/pale_oak_log_side", "pale_oak_log": "textures/blocks/pale_oak_log_side",
    "stripped_pale_oak_log": "textures/blocks/stripped_pale_oak_log_side",
    "stripped_pale_oak_wood": "textures/blocks/stripped_pale_oak_log_side",
    // —— 以下为按官方贴图清单核对后的修正 ——
    "salmon": "textures/items/fish_salmon_raw", "cooked_salmon": "textures/items/fish_salmon_cooked",
    "melon_slice": "textures/items/melon", "glistering_melon_slice": "textures/items/melon_speckled",
    "pumpkin": "textures/blocks/pumpkin_side", "carved_pumpkin": "textures/blocks/pumpkin_face_off",
    "jack_o_lantern": "textures/blocks/pumpkin_face_on", "lit_pumpkin": "textures/blocks/pumpkin_face_on",
    "clock": "textures/items/clock_item", "clock_item": "textures/items/clock_item",
    "slime": "textures/blocks/slime", "golden_horse_armor": "textures/items/gold_horse_armor",
    "iron_horse_armor": "textures/items/iron_horse_armor",
    "diamond_horse_armor": "textures/items/diamond_horse_armor",
    "nautilus_shell": "textures/items/nautilus", "cobblestone_wall": "textures/blocks/cobblestone",
    "mossy_stone_brick_slab": "textures/blocks/stonebrick_mossy",
    "mossy_stone_brick_wall": "textures/blocks/stonebrick_mossy",
    "mossy_stone_brick_stairs": "textures/blocks/stonebrick_mossy",
    "smooth_stone": "textures/blocks/stone_slab_top", "smooth_stone_slab": "textures/blocks/stone_slab_top",
    "hay_block": "textures/blocks/hay_block_side", "farmland": "textures/blocks/farmland_wet",
    "shulker_box": "textures/blocks/shulker_top_undyed", "undyed_shulker_box": "textures/blocks/shulker_top_undyed",
    "torch": "textures/blocks/torch_on", "soul_torch": "textures/blocks/soul_torch",
    "redstone_torch": "textures/blocks/redstone_torch_on", "unlit_redstone_torch": "textures/blocks/redstone_torch_off",
    "grass": "textures/blocks/grass_side_carried", "grass_block": "textures/blocks/grass_side_carried",
    "cactus": "textures/blocks/cactus_side", "sunflower": "textures/blocks/double_plant_sunflower_front",
    "lilac": "textures/blocks/double_plant_syringa_top", "peony": "textures/blocks/double_plant_paeonia_top",
    "rose_bush": "textures/blocks/double_plant_rose_top", "large_fern": "textures/blocks/double_plant_fern_top",
    "tall_grass": "textures/blocks/tallgrass", "short_grass": "textures/blocks/tallgrass",
    "soul_fire": "textures/blocks/soul_fire_0", "scaffolding": "textures/blocks/scaffolding_side",
    "grindstone": "textures/blocks/grindstone_side", "wither_rose": "textures/blocks/flower_wither_rose",
    "azalea_leaves": "textures/blocks/azalea_leaves", "flowering_azalea_leaves": "textures/blocks/azalea_leaves_flowers",
    "flowering_azalea": "textures/blocks/flowering_azalea_side",
    "concrete_powder": "textures/blocks/concrete_powder_white",
    "banner": "textures/items/banner_pattern", "fire_charge": "textures/items/fireball",
    "lodestone_compass": "textures/items/compass_item",
    "cod_bucket": "textures/items/bucket_cod", "salmon_bucket": "textures/items/bucket_salmon",
    "tropical_fish_bucket": "textures/items/bucket_tropical",
    "pufferfish_bucket": "textures/items/bucket_pufferfish",
    "axolotl_bucket": "textures/items/bucket_axolotl", "tadpole_bucket": "textures/items/bucket_tadpole",
    "powder_snow_bucket": "textures/items/bucket_powder_snow", "water_bucket": "textures/items/bucket_water",
    "lava_bucket": "textures/items/bucket_lava", "milk_bucket": "textures/items/bucket_milk",
    "bucket": "textures/items/bucket_empty",
    "furnace_minecart": "textures/items/minecart_furnace", "minecart": "textures/items/minecart_normal",
    "glass_bottle": "textures/items/potion_bottle_empty",
    "potion": "textures/items/potion_bottle_drinkable",
    "lingering_potion": "textures/items/potion_bottle_lingering",
    "splash_potion": "textures/items/potion_bottle_splash",
    "enchanted_book": "textures/items/book_enchanted", "written_book": "textures/items/book_written",
    "writable_book": "textures/items/book_writable", "book": "textures/items/book_normal",
    "bed": "textures/items/bed_red", "map": "textures/items/map_empty",
    "filled_map": "textures/items/map_filled", "empty_map": "textures/items/map_empty",
    "brewing_stand": "textures/items/brewing_stand", "cauldron": "textures/items/cauldron",
    "feather": "textures/items/feather", "flint": "textures/items/flint",
    "clay_ball": "textures/items/clay_ball", "brick": "textures/items/brick",
    "nether_brick": "textures/items/netherbrick", "bowl": "textures/items/bowl",
    "stick": "textures/items/stick", "string": "textures/items/string",
    "leather": "textures/items/leather", "leather_chestplate": "textures/items/leather_chestplate",
    "sugar": "textures/items/sugar", "bone": "textures/items/bone",
    "gunpowder": "textures/items/gunpowder", "quartz": "textures/items/quartz",
    "coal": "textures/items/coal", "charcoal": "textures/items/charcoal",
    "diamond": "textures/items/diamond", "emerald": "textures/items/emerald",
    "iron_ingot": "textures/items/iron_ingot", "gold_ingot": "textures/items/gold_ingot",
    "copper_ingot": "textures/items/copper_ingot", "netherite_ingot": "textures/items/netherite_ingot",
    "netherite_scrap": "textures/items/netherite_scrap", "iron_nugget": "textures/items/iron_nugget",
    "gold_nugget": "textures/items/gold_nugget", "amethyst_shard": "textures/items/amethyst_shard",
    "echo_shard": "textures/items/echo_shard", "ender_pearl": "textures/items/ender_pearl",
    "ender_eye": "textures/items/ender_eye", "blaze_rod": "textures/items/blaze_rod",
    "blaze_powder": "textures/items/blaze_powder", "ghast_tear": "textures/items/ghast_tear",
    "magma_cream": "textures/items/magma_cream", "nether_star": "textures/items/nether_star",
    "totem_of_undying": "textures/items/totem", "heart_of_the_sea": "textures/items/heartofthesea_closed",
    "prismarine_shard": "textures/items/prismarine_shard", "prismarine_crystals": "textures/items/prismarine_crystals",
    "shulker_shell": "textures/items/shulker_shell", "experience_bottle": "textures/items/experience_bottle",
    "dragon_breath": "textures/items/dragon_breath", "phantom_membrane": "textures/items/phantom_membrane",
    "rabbit_hide": "textures/items/rabbit_hide", "rabbit_foot": "textures/items/rabbit_foot",
    "slime_ball": "textures/items/slimeball", "bone_meal": "textures/items/dye_powder_white",
    "lapis_lazuli": "textures/items/dye_powder_blue", "redstone": "textures/items/redstone_dust",
    "redstone_dust": "textures/items/redstone_dust", "apple": "textures/items/apple",
    "golden_apple": "textures/items/apple_golden", "enchanted_golden_apple": "textures/items/apple_golden",
    "bread": "textures/items/bread", "cookie": "textures/items/cookie", "cake": "textures/items/cake",
    "carrot": "textures/items/carrot", "carrots": "textures/items/carrot", "potato": "textures/items/potato",
    "baked_potato": "textures/items/potato_baked", "poisonous_potato": "textures/items/potato_poisonous",
    "beetroot": "textures/items/beetroot", "beetroot_soup": "textures/items/beetroot_soup",
    "mushroom_stew": "textures/items/mushroom_stew", "rabbit_stew": "textures/items/rabbit_stew",
    "suspicious_stew": "textures/items/suspicious_stew", "egg": "textures/items/egg",
    "honeycomb": "textures/items/honeycomb", "honey_bottle": "textures/items/honey_bottle",
    "sweet_berries": "textures/items/sweet_berries", "glow_berries": "textures/items/glow_berries",
    "kelp": "textures/items/kelp", "dried_kelp": "textures/items/dried_kelp",
    "sea_pickle": "textures/items/sea_pickle", "snowball": "textures/items/snowball",
    "item_frame": "textures/items/item_frame", "glow_item_frame": "textures/items/glow_item_frame",
    "glow_frame": "textures/items/glow_item_frame", "frame": "textures/items/item_frame",
    "painting": "textures/items/painting", "armor_stand": "textures/items/armor_stand",
    "flower_pot": "textures/items/flower_pot", "lead": "textures/items/lead",
    "leash": "textures/items/lead", "saddle": "textures/items/saddle",
    "name_tag": "textures/items/name_tag", "compass": "textures/items/compass_item",
    "recovery_compass": "textures/items/recovery_compass_item",
    "elytra": "textures/items/elytra", "shield": "textures/items/shield",
    "turtle_helmet": "textures/items/turtle_helmet", "turtle_egg": "textures/items/turtle_egg",
    "arrow": "textures/items/arrow", "spectral_arrow": "textures/items/spectral_arrow",
    "tipped_arrow": "textures/items/tipped_arrow_head",
    "bow": "textures/items/bow_standby", "crossbow": "textures/items/crossbow_standby",
    "trident": "textures/items/trident",
    "wheat": "textures/items/wheat", "wheat_seeds": "textures/items/seeds_wheat",
    "pumpkin_seeds": "textures/items/seeds_pumpkin", "melon_seeds": "textures/items/seeds_melon",
    "beetroot_seeds": "textures/items/seeds_beetroot", "nether_wart": "textures/items/nether_wart",
    "cocoa_beans": "textures/items/dye_powder_brown", "sugar_cane": "textures/items/reeds",
    "reeds": "textures/items/reeds",
    "coal_ore": "textures/blocks/coal_ore", "diamond_ore": "textures/blocks/diamond_ore",
    "iron_ore": "textures/blocks/iron_ore", "gold_ore": "textures/blocks/gold_ore",
    "emerald_ore": "textures/blocks/emerald_ore", "lapis_ore": "textures/blocks/lapis_ore",
    "redstone_ore": "textures/blocks/redstone_ore", "copper_ore": "textures/blocks/copper_ore",
    "quartz_ore": "textures/blocks/quartz_ore", "ancient_debris": "textures/blocks/ancient_debris_side",
    "stone": "textures/blocks/stone", "cobblestone": "textures/blocks/cobblestone",
    "dirt": "textures/blocks/dirt", "sand": "textures/blocks/sand", "gravel": "textures/blocks/gravel",
    "glass": "textures/blocks/glass", "obsidian": "textures/blocks/obsidian",
    "bedrock": "textures/blocks/bedrock", "clay": "textures/blocks/clay", "snow": "textures/blocks/snow",
    "ice": "textures/blocks/ice", "packed_ice": "textures/blocks/ice_packed", "blue_ice": "textures/blocks/blue_ice",
    "netherrack": "textures/blocks/netherrack", "soul_sand": "textures/blocks/soul_sand",
    "soul_soil": "textures/blocks/soul_soil", "glowstone": "textures/blocks/glowstone",
    "end_stone": "textures/blocks/end_stone", "sponge": "textures/blocks/sponge",
    "bookshelf": "textures/blocks/bookshelf", "tnt": "textures/blocks/tnt_side",
    "crafting_table": "textures/blocks/crafting_table_front",
    "furnace": "textures/blocks/furnace_front_off",
    "chest": "textures/blocks/chest_front", "trapped_chest": "textures/blocks/trapped_chest_front",
    "ender_chest": "textures/blocks/ender_chest_front", "hopper": "textures/blocks/hopper_outside",
    "anvil": "textures/blocks/anvil_top_damaged_0", "beacon": "textures/blocks/beacon_core",
    "lodestone": "textures/blocks/lodestone_side", "respawn_anchor": "textures/blocks/respawn_anchor_side0",
    "bell": "textures/items/bell", "chain": "textures/items/chain", "iron_bars": "textures/blocks/iron_bars",
    "sculk": "textures/blocks/sculk", "moss_block": "textures/blocks/moss_block",
    "calcite": "textures/blocks/calcite", "tuff": "textures/blocks/tuff",
    "dripstone_block": "textures/blocks/dripstone_block", "mud": "textures/blocks/mud",
    "packed_mud": "textures/blocks/packed_mud", "mud_bricks": "textures/blocks/mud_bricks",
    "amethyst_block": "textures/blocks/amethyst_block", "budding_amethyst": "textures/blocks/budding_amethyst",
    "honey_block": "textures/blocks/honey_side", "honeycomb_block": "textures/blocks/honeycomb",
    "shroomlight": "textures/blocks/shroomlight", "target": "textures/blocks/target_side",
    "copper_block": "textures/blocks/copper_block", "cut_copper": "textures/blocks/cut_copper",
    "raw_copper_block": "textures/blocks/raw_copper_block", "raw_iron_block": "textures/blocks/raw_iron_block",
    "raw_gold_block": "textures/blocks/raw_gold_block", "netherite_block": "textures/blocks/netherite_block",
    "diamond_block": "textures/blocks/diamond_block", "emerald_block": "textures/blocks/emerald_block",
    "gold_block": "textures/blocks/gold_block", "iron_block": "textures/blocks/iron_block",
    "coal_block": "textures/blocks/coal_block", "redstone_block": "textures/blocks/redstone_block",
    "lapis_block": "textures/blocks/lapis_block", "quartz_block": "textures/blocks/quartz_block_side",
    "chiseled_quartz_block": "textures/blocks/quartz_block_chiseled",
    "quartz_pillar": "textures/blocks/quartz_block_lines", "quartz_bricks": "textures/blocks/quartz_bricks",
    "smooth_quartz": "textures/blocks/quartz_block_bottom",
};

const BASE_SUFFIXES = ["stairs", "slab", "double_slab", "wall", "fence", "fence_gate", "door", "trapdoor",
    "button", "pressure_plate", "sign", "standing_sign", "wall_sign", "hanging_sign", "shelf"];

function normalizeId(raw) {
    let id = String(raw || "").trim().toLowerCase();
    id = id.replace(/^minecraft:/, "").replace(/^item\./, "").replace(/\./g, "_");
    return id;
}

const notes = [];
// 手工表里路径写错的条目一律剔除，让规则引擎重新推导（避免生成不存在的贴图路径）
const BAD_OVERRIDES = [];
for (const k of Object.keys(OVERRIDES)) {
    if (OVERRIDES[k] && !asPath(OVERRIDES[k])) {
        BAD_OVERRIDES.push(`${k}=${OVERRIDES[k]}`);
        delete OVERRIDES[k];
    }
}
function resolve(id, depth) {
    if (OVERRIDES[id] !== undefined) return OVERRIDES[id] || "";
    // 0. 旧版 hard_ 前缀（hard_glass / hard_blue_stained_glass_pane 等）
    if (depth < 2 && id.indexOf("hard_") === 0) {
        const q = resolve(id.slice(5), depth + 1);
        if (q) { notes.push(`hard: ${id} -> ${q}`); return q; }
    }
    // 0a2. 涂蜡铜：waxed_xxx 与 xxx 贴图相同
    if (depth < 2 && id.indexOf("waxed_") === 0) {
        const q = resolve(id.slice(6), depth + 1);
        if (q) { notes.push(`waxed: ${id} -> ${q}`); return q; }
    }
    // 0a3. 深板岩矿：deepslate_<ore>_ore -> 深板岩矿石贴图
    if (depth < 2 && /^deepslate_(.+)_ore$/.test(id)) {
        const q = resolve(id.slice("deepslate_".length), depth + 1);
        if (q) { notes.push(`deepslate-ore: ${id} -> ${q}`); return q; }
    }
    // 0a4. 幽匿/竹/下界木质等的补名
    if (depth < 2 && /^stone_block_slab\d?$/.test(id)) {
        const q = terrainPath("stone_slab_side");
        if (q) { notes.push(`legacy-slab: ${id} -> ${q}`); return q; }
    }
    if (depth < 2 && /^double_stone_block_slab\d?$/.test(id)) {
        const q = terrainPath("stone_slab_side");
        if (q) { notes.push(`legacy-slab: ${id} -> ${q}`); return q; }
    }
    // 0b. 刷怪蛋：{entity}_spawn_egg -> egg_{entity}
    if (depth < 2 && /_spawn_egg$/.test(id)) {
        const entity = id.slice(0, -"_spawn_egg".length);
        const alias = { tropical_fish: "clownfish", elder_guardian: "elderguardian", zombie_pigman: "pigzombie",
            mooshroom: "mushroomcow", magma_cube: "magmacube", cave_spider: "cavespider",
            zombie_villager: "zombie_villager", snow_golem: "snowgolem", iron_golem: "irongolem" };
        const names = [alias[entity] || entity, entity, alias[entity] || entity].filter(Boolean);
        for (const n of [names[0], names[1]]) {
            if (!n) continue;
            for (const key of [`egg_${n}`, `spawn_egg_${n}`, `egg_${n.replace(/_/g, "")}`, entity === n ? `egg_${n.replace(/_/g, "")}` : ""]) {
                if (key && itemPngs.has(key)) { notes.push(`egg: ${id} -> ${key}`); return `textures/items/${key}`; }
            }
        }
        if (itemPngs.has("spawn_egg")) return "textures/items/spawn_egg";
    }
    // 0c. 唱片
    if (depth < 2 && /^music_disc_/.test(id)) {
        const key = `record_${id.slice("music_disc_".length)}`;
        if (itemPngs.has(key)) { notes.push(`record: ${id} -> ${key}`); return `textures/items/${key}`; }
    }
    // 0d. 化学元素/不可见物品
    if (/^element_\d+$/.test(id)) return "";
    // 1. 物品图标表（最权威）
    let p = atlasPath(id);
    if (p) return p;
    // 2. 旧版 blocks.json -> terrain_texture（方块手持贴图）
    if (depth === 0) {
        const block = legacyBlocks[id];
        if (block) {
            const carried = pickTexture(block.carried_textures);
            if (carried) { const q = terrainPath(carried); if (q) { notes.push(`blocks.carried: ${id} -> ${q}`); return q; } }
            const face = pickTexture(block.textures);
            if (face) { const q = terrainPath(face); if (q) { notes.push(`blocks: ${id} -> ${q}`); return q; } }
        }
    }
    // 3. 颜色族
    if (depth < 2) {
        const colorRules = [
            [/^(.+)_wool$/, (c) => `wool_colored_${alt(c)}`],
            [/^(.+)_carpet$/, (c) => `wool_colored_${alt(c)}`],
            [/^(.+)_concrete_powder$/, (c) => `concrete_powder_${alt(c)}`],
            [/^(.+)_concrete$/, (c) => `concrete_${alt(c)}`],
            [/^(.+)_terracotta$/, (c) => `hardened_clay_stained_${alt(c)}`],
            [/^(.+)_glazed_terracotta$/, (c) => `glazed_terracotta_${alt(c)}`],
            [/^(.+)_stained_glass_pane$/, (c) => `glass_pane_top_${alt(c)}`],
            [/^(.+)_stained_glass$/, (c) => `glass_${alt(c)}`],
            [/^(.+)_shulker_box$/, (c) => `shulker_top_${alt(c)}`],
            [/^(.+)_candle_cake$/, (c) => `candle_cake_${alt(c)}`],
            [/^(.+)_candle$/, (c) => `candle_${alt(c)}`],
            [/^(.+)_dye$/, (c) => `dye_powder_${alt(c)}`],
            [/^(.+)_bed$/, (c) => `bed_${alt(c)}`],
            [/^(.+)_banner$/, (c) => `banner_${alt(c)}`],
            [/^(.+)_torch$/, (c) => `colored_torch_${c === "light_blue" ? "light_blue" : c}`],
        ];
        for (const [re, fn] of colorRules) {
            const m = re.exec(id);
            if (m && COLORS.indexOf(m[1]) >= 0) {
                const key = fn(m[1]);
                const q = terrainPath(key);
                if (q) { notes.push(`color: ${id} -> ${q}`); return q; }
                const f = itemPngs.has(key) ? `textures/items/${key}` : (blockPngs.has(key) ? `textures/blocks/${key}` : "");
                if (f) { notes.push(`color file: ${id} -> ${f}`); return f; }
            }
        }
    }
    // 4. 木材族
    if (depth === 0) {
        const woodRules = [
            [/^(.+)_planks$/, (w) => [`planks_${altWood(w)}`, `${w}_planks`]],
            [/^(.+)_log$/, (w) => [`log_${altWood(w)}`, `stripped_${w}_log_side`, `${w}_log`]],
            [/^stripped_(.+)_log$/, (w) => [`stripped_${w}_log_side`, `stripped_${w}_log`]],
            [/^(.+)_wood$/, (w) => [`log_${altWood(w)}`, `${w}_log`, `stripped_${w}_log_side`]],
            [/^stripped_(.+)_wood$/, (w) => [`stripped_${w}_log_side`, `stripped_${w}_log`]],
            [/^(.+)_sapling$/, (w) => [`sapling_${w}`, `${w}_sapling`]],
            [/^(.+)_leaves$/, (w) => [`leaves_${w}_opaque`, `leaves_${w}`, `${w}_leaves`]],
            [/^(.+)_door$/, (w) => [`door_${w}_lower`, `${w}_door_lower`, `${w}_door`]],
            [/^(.+)_trapdoor$/, (w) => [`${w}_trapdoor`, `trapdoor_${w}`]],
            [/^(.+)_sign$/, (w) => [`${w}_sign`, `sign_${w}`]],
            [/^(.+)_hanging_sign$/, (w) => [`${w}_hanging_sign`, `hanging_sign_${w}`]],
            [/^(.+)_boat$/, (w) => [`boat_${w}`, `${w}_boat`]],
            [/^(.+)_chest_boat$/, (w) => [`chest_boat_${w}`, `${w}_chest_boat`]],
        ];
        for (const [re, fn] of woodRules) {
            const m = re.exec(id);
            if (!m || WOODS.indexOf(m[1]) < 0) continue;
            for (const key of fn(m[1])) {
                const q = terrainPath(key);
                if (q) { notes.push(`wood: ${id} -> ${q}`); return q; }
                if (itemPngs.has(key)) return `textures/items/${key}`;
                if (blockPngs.has(key)) return `textures/blocks/${key}`;
            }
        }
        // 木头材质的派生方块（栅栏/台阶/压力板/按钮等）：退回木板贴图
        for (const suf of ["stairs", "slab", "double_slab", "fence", "fence_gate", "pressure_plate", "button"]) {
            const tail = `_${suf}`;
            if (!id.endsWith(tail)) continue;
            const w = id.slice(0, -tail.length);
            if (WOODS.indexOf(w) < 0) continue;
            for (const key of [`planks_${altWood(w)}`, `${w}_planks`]) {
                if (blockPngs.has(key)) { notes.push(`wood-base: ${id} -> ${key}`); return `textures/blocks/${key}`; }
            }
        }
    }
    // 5. 词序无关的同名贴图
    const key = sortedKey(id);
    if (itemByTokens.has(key)) return `textures/items/${itemByTokens.get(key)}`;
    if (blockByTokens.has(key)) return `textures/blocks/${blockByTokens.get(key)}`;
    // 6. 原样文件名
    if (itemPngs.has(id)) return `textures/items/${id}`;
    if (blockPngs.has(id)) return `textures/blocks/${id}`;
    // 7. 派生方块（台阶/楼梯/墙/栅栏等）退回母材质，允许单复数差异
    if (depth < 1) {
        for (const suf of BASE_SUFFIXES) {
            const tail = `_${suf}`;
            if (!id.endsWith(tail) || id.length <= tail.length) continue;
            const base = id.slice(0, -tail.length);
            const variants = [base, `${base}s`, base.replace(/s$/, "")];
            for (const v of variants) {
                if (!v || v === id) continue;
                const q = resolve(v, depth + 1);
                if (q) { notes.push(`base: ${id} -> ${v} -> ${q}`); return q; }
            }
        }
    }
    // 8. 旧版方块名 -> terrain_texture 直接命中
    const q2 = terrainPath(id);
    if (q2) { notes.push(`terrain: ${id} -> ${q2}`); return q2; }
    return "";
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
const out = {};
const unresolved = [];
const seen = new Set();
for (const e of catalog.items || []) {
    const raw = String(e.fullName || e.typeName || "");
    if (!raw) continue;
    const id = normalizeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const p = resolve(id, 0);
    if (p) out[raw] = p;
    else unresolved.push(raw);
}
for (const id of Object.keys(OVERRIDES)) {
    const k = `minecraft:${id}`;
    if (out[k] === undefined && OVERRIDES[id]) out[k] = OVERRIDES[id];
}
const sorted = {};
for (const k of Object.keys(out).sort()) sorted[k] = out[k];

// 自检：输出里每一条路径都必须真实存在
const bad = [];
for (const k of Object.keys(sorted)) {
    if (!asPath(sorted[k])) bad.push(`${k} => ${sorted[k]}`);
}
// 自检：手工表里写错的路径（已在上面剔除，这里列出以便修正）
const badOverride = BAD_OVERRIDES;

fs.writeFileSync(OUT, JSON.stringify({
    note: "物品类型 -> 客户端贴图路径。由 tools/gen-icons.js 依据官方 bedrock-samples 资源包生成，"
        + "每条路径都已核对贴图文件真实存在；查不到的物品由插件按分类回退，不会出现空白/错误图标。",
    icons: sorted,
}, null, 0).replace(/\},\"minecraft/g, "},\n\"minecraft"), "utf8");
console.log("自检失败条数:", bad.length, bad.slice(0, 20).join(" | "));
console.log("无效的手工条目:", badOverride.length, badOverride.join(" | "));
console.log("mapped:", Object.keys(sorted).length, "unresolved:", unresolved.length);
console.log("unresolved:", unresolved.slice(0, 160).join(", "));
console.log("--- 需要人工确认的推导 ---");
console.log(notes.slice(0, 160).join("\n"));
