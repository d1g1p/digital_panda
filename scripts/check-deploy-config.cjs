const fs = require("node:fs");
const path = require("node:path");
const { readEnv } = require("./env.cjs");

const envPath = path.resolve(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
    console.error("No se encontró .env. Completa la configuración antes de desplegar.");
    process.exit(1);
}

const env = readEnv(envPath);

const required = [
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_MEASUREMENT_ID",
    "FIREBASE_APP_ID",
    "BUSINESS_WHATSAPP"
];
const missing = required.filter(name => !env[name] || env[name].startsWith("REEMPLAZAR_") || env[name].includes("XXXXXXXXX"));
if (env.BUSINESS_WHATSAPP && !env.BUSINESS_WHATSAPP.includes("XXXXXXXXX") && !/^\d{8,15}$/.test(env.BUSINESS_WHATSAPP)) missing.push("BUSINESS_WHATSAPP (8 a 15 dígitos, sin +)");
for (const field of ["SOCIAL_FACEBOOK", "SOCIAL_INSTAGRAM", "SOCIAL_TIKTOK"]) {
    if (env[field] && !/^https?:\/\//i.test(env[field])) missing.push(field + " (URL http/https)");
}
const rulesPath = path.resolve(__dirname, "..", "firebase.rules");
if (!fs.existsSync(rulesPath) || !fs.readFileSync(rulesPath, "utf8").includes("request.auth.token.role")) {
    missing.push("firebase.rules debe autorizar por custom claim role");
}
if (fs.existsSync(rulesPath) && /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(fs.readFileSync(rulesPath, "utf8"))) {
    missing.push("firebase.rules no debe contener correos");
}
const aliasPath = path.resolve(__dirname, "..", ".firebaserc");
if (fs.existsSync(aliasPath) && env.FIREBASE_PROJECT_ID) {
    const alias = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
    if (alias.projects && alias.projects.default !== env.FIREBASE_PROJECT_ID) missing.push("proyecto predeterminado de .firebaserc (debe coincidir con FIREBASE_PROJECT_ID)");
}

if (missing.length) {
    console.error("Completa en .env antes de desplegar: " + missing.join(", ") + ".");
    process.exit(1);
}
