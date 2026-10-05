const PLUGIN_NAME = "LuckyClover-GMLIB-Activator";
const PLUGIN_VERSION = [0, 1, 0];
const PLUGIN_DESC = "Activate GMLIB for other QuickJS plugins";

let gmlibApi = null;

ll.registerPlugin(PLUGIN_NAME, PLUGIN_DESC, PLUGIN_VERSION, { Author: "Mell" });
logger.setTitle(PLUGIN_NAME);

mc.listen("onServerStarted", () => {
    try {
        // The official GMLIB documentation requires importing after startup.
        gmlibApi = require("./GMLIB-LegacyRemoteCallApi/lib/GMLIB_API-JS");
        if (gmlibApi && gmlibApi.Minecraft) {
            logger.info(`${PLUGIN_NAME} activated GMLIB`);
        } else {
            logger.warn(`${PLUGIN_NAME} loaded GMLIB module, but Minecraft API is unavailable`);
        }
    } catch (error) {
        logger.error(`${PLUGIN_NAME} failed to activate GMLIB: ${error}`);
    }
});

ll.onUnload(() => {
    gmlibApi = null;
});
