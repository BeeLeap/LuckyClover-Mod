class gmoney {
    constructor(type, object = "") {
        this.type = type;
        this.object = object;
    }
    set(xuid, value) {
        if (this.type == "llmoney") {
            return money.set(xuid, value);
        } else if (this.type == "score") {
            return mc.setPlayerScore(data.xuid2uuid(xuid), this.object, value);
        }
    }
    add(xuid, value) {
        if (this.type == "llmoney") {
            return money.add(xuid, value);
        } else if (this.type == "score") {
            return mc.addPlayerScore(data.xuid2uuid(xuid), this.object, value);
        }
    }
    reduce(xuid, value) {
        if (this.type == "llmoney") {
            return money.reduce(xuid, value);
        } else if (this.type == "score") {
            return mc.reducePlayerScore(data.xuid2uuid(xuid), this.object, value);
        }
    }
    trans(xuid1, xuid2, value, PayNote) {
        if (this.type == "llmoney") {
            return money.trans(xuid1, xuid2, value, PayNote);
        } else if (this.type == "score") {
            mc.addPlayerScore(data.xuid2uuid(xuid2), this.object, value);
            return mc.reducePlayerScore(data.xuid2uuid(xuid1), this.object, value);
        }
    }
    get(xuid) {
        switch (this.type) {
            case "score": {
                return mc.getPlayerScore(data.xuid2uuid(xuid), this.object);
            }
            case "llmoney": {
                try {
                    if (!xuid) return 0;
                    return money.get(xuid);
                } catch (error) {
                    logger.error(`[SB2] [Sign] gmoney.js：get(xuid) 发生错误：xuid=${xuid}`);
                    logger.error(`[SB2] [Sign] gmoney.js：get(xuid) 发生错误：${error.stack}`)
                }
            }
        }
    }
}

module.exports = gmoney;