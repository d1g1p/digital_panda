const fs = require("node:fs");
const path = require("node:path");
const { readEnv } = require("./env.cjs");

const root = path.resolve(__dirname, "..");
const errors = [];
const prod = process.argv.includes("--prod");

function collectFiles(directory, extension, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectFiles(fullPath, extension, files);
        } else if (entry.name.endsWith(extension)) {
            files.push(fullPath);
        }
    }
    return files;
}

function relative(filePath) {
    return path.relative(root, filePath).replaceAll(path.sep, "/");
}

const htmlFiles = collectFiles(root, ".html");
const buildSource = fs.readFileSync(path.join(root, "scripts", "build.cjs"), "utf8");
const publicFilesMatch = buildSource.match(/const publicFiles = \[([\s\S]*?)\];/);
const publicFiles = publicFilesMatch
    ? [...publicFilesMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
    : [];

if (!publicFiles.length) errors.push("No se pudo leer publicFiles desde scripts/build.cjs.");
for (const file of publicFiles) {
    if (!fs.existsSync(path.join(root, file))) errors.push("build.cjs copia un archivo inexistente: " + file);
}
for (const file of htmlFiles) {
    const name = relative(file);
    if (!publicFiles.includes(name)) errors.push("La página " + name + " no está en publicFiles de scripts/build.cjs.");
}
for (const name of fs.readdirSync(root)) {
    if (!/\.(?:js|css)$/.test(name) || name === "firebase-config.js") continue;
    if (!publicFiles.includes(name)) errors.push("El recurso " + name + " no está en publicFiles de scripts/build.cjs.");
}

const attributePattern = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
for (const file of htmlFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(attributePattern)) {
        const reference = match[1].trim();
        if (!reference || reference.startsWith("#") || reference.startsWith("//")) continue;
        if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference)) continue;

        const cleanReference = reference.split(/[?#]/)[0];
        if (!cleanReference) continue;
        const decodedReference = decodeURIComponent(cleanReference);
        const target = decodedReference.startsWith("/")
            ? path.join(root, decodedReference)
            : path.resolve(path.dirname(file), decodedReference);
        if (!fs.existsSync(target)) {
            errors.push(relative(file) + " referencia un archivo inexistente: " + reference);
        }
    }
}

const firebaseConfigPath = path.join(root, "firebase.json");
if (!fs.existsSync(firebaseConfigPath)) {
    errors.push("Falta firebase.json.");
} else {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    if (!firebaseConfig.hosting || firebaseConfig.hosting.public !== "dist") {
        errors.push("firebase.json debe publicar la carpeta dist.");
    }
    if (!firebaseConfig.firestore || firebaseConfig.firestore.rules !== "firebase.rules") {
        errors.push("firebase.json debe declarar firebase.rules como reglas de Firestore.");
    }
}

const env = readEnv(path.join(root, ".env"));
const rulesPath = path.join(root, "firebase.rules");
if (!fs.existsSync(rulesPath)) {
    errors.push("Falta firebase.rules.");
} else if (fs.readFileSync(rulesPath, "utf8").includes("REEMPLAZAR_CORREO_DUENO")) {
    errors.push("Reemplaza REEMPLAZAR_CORREO_DUENO en firebase.rules por el correo del propietario.");
}

if (env.BUSINESS_WHATSAPP && !env.BUSINESS_WHATSAPP.includes("XXXXXXXXX") && !/^\d{8,15}$/.test(env.BUSINESS_WHATSAPP)) {
    errors.push("BUSINESS_WHATSAPP debe tener de 8 a 15 dígitos, sin +.");
}
for (const field of ["SOCIAL_FACEBOOK", "SOCIAL_INSTAGRAM", "SOCIAL_TIKTOK"]) {
    if (env[field] && !/^https?:\/\//i.test(env[field])) {
        errors.push(field + " debe ser una URL http:// o https://.");
    }
}

const firebasercPath = path.join(root, ".firebaserc");
if (fs.existsSync(firebasercPath) && env.FIREBASE_PROJECT_ID && !env.FIREBASE_PROJECT_ID.startsWith("REEMPLAZAR_")) {
    const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, "utf8"));
    if (!firebaserc.projects || firebaserc.projects.default !== env.FIREBASE_PROJECT_ID) {
        errors.push("El proyecto predeterminado de .firebaserc no coincide con FIREBASE_PROJECT_ID.");
    }
}

if (prod) {
    const distConfigPath = path.join(root, "dist", "firebase-config.js");
    if (!fs.existsSync(distConfigPath)) {
        errors.push("No existe dist/firebase-config.js. Ejecuta npm run build antes de check:prod.");
    } else {
        const distConfig = fs.readFileSync(distConfigPath, "utf8");
        if (/REEMPLAZAR_|591XXXXXXXXX/.test(distConfig)) {
            errors.push("dist/firebase-config.js conserva marcadores. Completa .env y vuelve a ejecutar el build.");
        }
    }
}

if (errors.length) {
    console.error("Se encontraron " + errors.length + " problema(s):");
    errors.forEach(error => console.error("- " + error));
    process.exit(1);
}

console.log("Verificación correcta: " + htmlFiles.length + " páginas, " + publicFiles.length + " archivos publicados" + (prod ? " y configuración de producción lista." : "."));
