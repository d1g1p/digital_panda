const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const localCli = path.join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");

function globalCliPath() {
    const result = spawnSync("npm", ["root", "--global"], { encoding: "utf8" });
    if (result.status !== 0) return null;

    const candidate = path.join(result.stdout.trim(), "firebase-tools", "lib", "bin", "firebase.js");
    return fs.existsSync(candidate) ? candidate : null;
}

const cli = fs.existsSync(localCli) ? localCli : globalCliPath();
if (!cli) {
    console.error("No se encontró Firebase CLI. Instálala con: npm install --global firebase-tools");
    process.exit(1);
}

const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
