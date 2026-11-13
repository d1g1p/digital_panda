const fs = require("node:fs");
const path = require("node:path");
const { readEnv } = require("./env.cjs");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const envPath = path.join(root, ".env");

const env = readEnv(envPath);
const configPath = path.join(root, "firebase-config.js");
let configSource = fs.readFileSync(configPath, "utf8");

const configFields = [
    ["FIREBASE_API_KEY", "REEMPLAZAR_API_KEY"],
    ["FIREBASE_AUTH_DOMAIN", "REEMPLAZAR_AUTH_DOMAIN"],
    ["FIREBASE_PROJECT_ID", "REEMPLAZAR_PROJECT_ID"],
    ["FIREBASE_STORAGE_BUCKET", "REEMPLAZAR_STORAGE_BUCKET"],
    ["FIREBASE_MESSAGING_SENDER_ID", "REEMPLAZAR_MESSAGING_SENDER_ID"],
    ["FIREBASE_MEASUREMENT_ID", "REEMPLAZAR_MEASUREMENT_ID"],
    ["FIREBASE_APP_ID", "REEMPLAZAR_APP_ID"],
    ["BUSINESS_WHATSAPP", "591XXXXXXXXX"],
    ["SOCIAL_FACEBOOK", "REEMPLAZAR_FACEBOOK"],
    ["SOCIAL_INSTAGRAM", "REEMPLAZAR_INSTAGRAM"],
    ["SOCIAL_TIKTOK", "REEMPLAZAR_TIKTOK"]
];

const optionalFields = new Set(["SOCIAL_FACEBOOK", "SOCIAL_INSTAGRAM", "SOCIAL_TIKTOK"]);
const missing = [];
for (const [envName, fallback] of configFields) {
    const configuredValue = env[envName];
    const value = optionalFields.has(envName) && !configuredValue ? "" : (configuredValue || fallback);
    if (!optionalFields.has(envName) && (!configuredValue || value.startsWith("REEMPLAZAR_") || (envName === "BUSINESS_WHATSAPP" && !/^\d{8,15}$/.test(value)))) {
        missing.push(envName);
    }
    if (optionalFields.has(envName) && value && !/^https?:\/\//i.test(value)) {
        missing.push(envName + " (URL http/https)");
    }

    const sourceValue = JSON.stringify(fallback);
    if (!configSource.includes(sourceValue)) {
        throw new Error(`No se encontró el valor de plantilla para ${envName} en firebase-config.js.`);
    }
    configSource = configSource.replace(sourceValue, JSON.stringify(value));
}

const publicFiles = [
    "index.html",
    "admin.html",
    "404.html",
    "public.js",
    "admin.js",
    "shared.js",
    "ui.css",
    "motion.js",
    "robots.txt",
    "muestras/index.html",
    "muestras/pagina-negocio.html",
    "muestras/tienda.html",
    "muestras/ventas.html",
    "muestras/clientes.html"
];

for (const relativePath of publicFiles) {
    const source = path.join(root, relativePath);
    const target = path.join(output, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

fs.writeFileSync(path.join(output, "firebase-config.js"), configSource, "utf8");

if (missing.length) {
    console.warn(`Faltan valores en .env: ${missing.join(", ")}. La salida conserva marcadores y no está lista para producción.`);
}
console.log("Sitio generado en dist/. El archivo .env no se copió.");
