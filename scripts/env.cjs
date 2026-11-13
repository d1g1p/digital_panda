const fs = require("node:fs");

function readEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};

    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((values, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return values;

        const separator = trimmed.indexOf("=");
        if (separator < 1) return values;

        const name = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else {
            value = value.replace(/\s+#.*$/, "").trim();
        }
        values[name] = value;
        return values;
    }, {});
}

module.exports = { readEnv };
