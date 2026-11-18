import { firebaseConfig, CATALOG_DEFAULTS } from "./firebase-config.js";
import { escapeHtml, money, safeHttpUrl, setBusy, showToast, statusLabel } from "./shared.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, limit, query, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_LOGIN_STORAGE_KEY = "digitalPandaAdminLogin";
const configured = firebaseConfig.apiKey !== "REEMPLAZAR_API_KEY"
    && firebaseConfig.authDomain !== "REEMPLAZAR_AUTH_DOMAIN"
    && firebaseConfig.projectId !== "REEMPLAZAR_PROJECT_ID"
    && firebaseConfig.appId !== "REEMPLAZAR_APP_ID";
let auth = null;
let db = null;
let currentAdmin = null;
let accessDeniedEmail = "";
let catalog = JSON.parse(JSON.stringify(CATALOG_DEFAULTS));
let allOrders = [];
let orderSearch = "";
let savingCatalog = false;

const byId = id => document.getElementById(id);

function isValidEmail(email) {
    return email.length <= 254 && !email.includes("/") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readStoredAdminEmail() {
    try {
        return window.localStorage.getItem(ADMIN_LOGIN_STORAGE_KEY) || "";
    } catch (error) {
        console.error(error);
        return "";
    }
}

function storeAdminEmail(email) {
    try {
        window.localStorage.setItem(ADMIN_LOGIN_STORAGE_KEY, email);
    } catch (error) {
        console.error(error);
    }
}

// La autorización vive en firebase.rules: solo el correo del propietario puede
// leer pedidos. Si Firestore permite una lectura mínima, la sesión es válida.
async function verifyAdminAccess() {
    if (!db) return false;
    try {
        await getDocs(query(collection(db, "orders"), limit(1)));
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

function showAccessState() {
    const authorized = !!(currentAdmin && currentAdmin.email);
    byId("loginPanel").classList.toggle("hidden", authorized);
    byId("dashboard").classList.toggle("hidden", !authorized);
    byId("signOutButton").classList.toggle("hidden", !authorized);
    byId("adminEmail").textContent = authorized
        ? "Sesión iniciada como " + currentAdmin.email
        : "";
    if (!configured) {
        byId("loginMessage").textContent = "Completa la configuración de Firebase en firebase-config.js. Sigue FIREBASE_SETUP.md.";
        byId("sendLoginLink").disabled = true;
        byId("adminLoginEmail").disabled = true;
        byId("adminLoginPassword").disabled = true;
        byId("sendLoginLink").classList.add("opacity-50", "cursor-not-allowed");
        return;
    }
    byId("sendLoginLink").disabled = false;
    byId("adminLoginEmail").disabled = false;
    byId("adminLoginPassword").disabled = false;
    byId("sendLoginLink").classList.remove("opacity-50", "cursor-not-allowed");
    byId("sendLoginLinkLabel").textContent = "Entrar";
    if (accessDeniedEmail) {
        byId("loginMessage").textContent = "El correo " + accessDeniedEmail + " no tiene acceso a este panel.";
    } else {
        byId("loginMessage").textContent = "Usa el correo y la contraseña creados en Firebase Authentication.";
    }
}

async function signIn() {
    if (!auth || !configured) {
        showToast("Configura Firebase antes de iniciar sesión.", false);
        return;
    }
    const emailInput = byId("adminLoginEmail");
    const passwordInput = byId("adminLoginPassword");
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!isValidEmail(email)) {
        showToast("Escribe un correo válido.", false);
        emailInput.focus();
        return;
    }
    if (!password) {
        showToast("Escribe tu contraseña.", false);
        passwordInput.focus();
        return;
    }
    const button = byId("sendLoginLink");
    if (button.disabled) return;
    accessDeniedEmail = "";
    setBusy(button, true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        storeAdminEmail(email);
        passwordInput.value = "";
        showToast("Sesión iniciada.");
    } catch (error) {
        console.error(error);
        const message = error && error.code === "auth/invalid-credential"
            ? "Correo o contraseña incorrectos."
            : "No se pudo iniciar sesión. Revisa tus credenciales de Firebase.";
        showToast(message, false);
    } finally {
        if (configured) setBusy(button, false);
    }
}

function activateTab(name) {
    const sections = { orders: "ordersSection", catalog: "catalogSection" };
    if (!sections[name]) name = "orders";
    Object.entries(sections).forEach(([key, id]) => byId(id).classList.toggle("hidden", key !== name));
    document.querySelectorAll(".tab-button").forEach(button => {
        const active = button.dataset.tab === name;
        button.classList.toggle("border-cyan-400", active);
        button.classList.toggle("text-white", active);
        button.classList.toggle("border-transparent", !active);
        button.classList.toggle("text-slate-400", !active);
    });
}

async function loadCatalog() {
    if (!db) return;
    try {
        const snapshot = await getDoc(doc(db, "settings", "catalog"));
        if (snapshot.exists()) {
            const data = snapshot.data();
            catalog = {
                types: Array.isArray(data.types) ? data.types : CATALOG_DEFAULTS.types,
                modules: Array.isArray(data.modules) ? data.modules : CATALOG_DEFAULTS.modules,
                durations: Array.isArray(data.durations) ? data.durations : CATALOG_DEFAULTS.durations
            };
        }
        renderCatalog();
    } catch (error) {
        console.error(error);
        showToast("No se pudieron cargar los precios de Firebase.", false);
    }
}

function catalogItemEditor(kind, item) {
    return '<article class="rounded-lg bg-navy-950/75 border border-navy-800 p-3 grid sm:grid-cols-2 gap-2">' +
        '<label class="text-[10px] text-slate-400">Nombre<input data-catalog-kind="' + kind + '" data-item="' + escapeHtml(item.id) + '" data-field="name" value="' + escapeHtml(item.name) + '" class="block w-full mt-1 bg-navy-900 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
        '<label class="text-[10px] text-slate-400">Precio en Bs<input type="number" min="0" data-catalog-kind="' + kind + '" data-item="' + escapeHtml(item.id) + '" data-field="price" value="' + Number(item.price || 0) + '" class="block w-full mt-1 bg-navy-900 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
        '<label class="sm:col-span-2 text-[10px] text-slate-400">Descripción para clientes<textarea rows="2" data-catalog-kind="' + kind + '" data-item="' + escapeHtml(item.id) + '" data-field="description" class="block w-full mt-1 bg-navy-900 border border-navy-700 rounded px-2 py-2 text-xs text-white">' + escapeHtml(item.description) + '</textarea></label>' +
        '<button data-remove-kind="' + kind + '" data-remove-id="' + escapeHtml(item.id) + '" class="sm:col-span-2 text-left text-[11px] text-rose-300 hover:underline"><i class="fa-solid fa-trash-can mr-1"></i>Quitar opción</button>' +
        '</article>';
}

function renderCatalog() {
    byId("typesEditor").innerHTML = catalog.types.map(item => catalogItemEditor("types", item)).join("");
    byId("modulesEditor").innerHTML = catalog.modules.map(item => catalogItemEditor("modules", item)).join("");
    byId("durationsEditor").innerHTML = catalog.durations.map(item =>
        '<article class="rounded-lg bg-navy-950/75 border border-navy-800 p-3 grid grid-cols-2 gap-2">' +
        '<label class="text-[10px] text-slate-400">Plazo en días<input type="number" min="1" data-catalog-kind="durations" data-item="' + escapeHtml(item.id) + '" data-field="days" value="' + Number(item.days || 1) + '" class="block w-full mt-1 bg-navy-900 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
        '<label class="text-[10px] text-slate-400">Descuento %<input type="number" min="0" max="80" data-catalog-kind="durations" data-item="' + escapeHtml(item.id) + '" data-field="discount" value="' + Number(item.discount || 0) + '" class="block w-full mt-1 bg-navy-900 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
        '<button data-remove-duration="' + escapeHtml(item.id) + '" class="col-span-2 text-left text-[11px] text-rose-300 hover:underline">Quitar plazo</button>' +
        '</article>'
    ).join("");
}

async function saveCatalog() {
    if (savingCatalog) return;
    if (!currentAdmin || !db) return showToast("Inicia sesión para guardar los precios.", false);
    if (!catalog.types.length || !catalog.durations.length) return showToast("Debe quedar al menos un tipo de proyecto y un plazo.", false);

    const button = byId("saveCatalog");
    savingCatalog = true;
    setBusy(button, true);
    try {
        await setDoc(doc(db, "settings", "catalog"), catalog);
        showToast("Precios y opciones guardados.");
    } catch (error) {
        console.error(error);
        showToast("No se pudieron guardar los precios.", false);
    } finally {
        savingCatalog = false;
        setBusy(button, false);
    }
}

function updateStats(orders) {
    const counts = { pendiente:0, en_proceso:0, entregado:0 };
    orders.forEach(item => { if (Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status] += 1; });
    byId("statAll").textContent = orders.length;
    byId("statPending").textContent = counts.pendiente;
    byId("statProgress").textContent = counts.en_proceso;
    byId("statDelivered").textContent = counts.entregado;
    byId("orderCounts").textContent = orders.length + " pedidos · " + counts.pendiente + " pendientes · " + counts.en_proceso + " en proceso · " + counts.entregado + " entregados";
}

function renderOrders() {
    updateStats(allOrders);
    const filter = byId("orderFilter").value;
    const search = orderSearch.toLowerCase();
    const orders = allOrders.filter(item => {
        const matchesStatus = filter === "todos" || item.status === filter;
        const matchesSearch = !search || [item.code, item.clientName, item.clientPhone, item.projectType, item.customRequirements, item.notes]
            .some(value => String(value || "").toLowerCase().includes(search));
        return matchesStatus && matchesSearch;
    });
    if (orders.length !== allOrders.length) {
        byId("orderCounts").textContent = "Mostrando " + orders.length + " de " + allOrders.length + " · " + byId("orderCounts").textContent;
    }
    if (!orders.length) {
        const message = allOrders.length ? "No hay pedidos que coincidan con la búsqueda." : "Todavía no hay pedidos.";
        byId("ordersList").innerHTML = '<div class="glass-card rounded-xl p-8 text-center text-sm text-slate-500">' + message + '</div>';
        return;
    }
    byId("ordersList").innerHTML = orders.map(item => {
        const modules = Array.isArray(item.modules) ? item.modules.map(module => typeof module === "string" ? module : module.name).join(", ") : "";
        return '<article class="glass-card rounded-xl p-4 sm:p-5 interactive-lift" data-order-card="' + escapeHtml(item.code) + '">' +
            '<div class="flex flex-col lg:flex-row lg:justify-between gap-4">' +
            '<div class="min-w-0"><span class="font-mono text-xs font-bold text-cyan-300">' + escapeHtml(item.code) + '</span><h3 class="text-lg font-bold mt-1">' + escapeHtml(item.clientName) + '</h3><p class="text-xs text-slate-400 mt-1">' + escapeHtml(item.clientPhone) + ' · ' + escapeHtml(item.projectType) + '</p><p class="text-xs text-slate-500 mt-2">Total cotizado: Bs ' + money(item.total) + ' · Plazo: ' + escapeHtml(item.days) + ' días · Descuento: ' + escapeHtml(item.discount) + '%</p>' +
            '<p class="text-[10px] text-slate-600 mt-1">El total es el precio final que se guarda; ajústalo si aplicas un descuento especial.</p>' +
            (modules ? '<p class="text-xs text-slate-400 mt-2">Complementos: ' + escapeHtml(modules) + '</p>' : '') +
            (item.customRequirements ? '<div class="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-400/5 p-3"><p class="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">Requerimientos personalizados</p><p class="text-sm text-slate-300 mt-1 whitespace-pre-wrap break-words">' + escapeHtml(item.customRequirements) + '</p></div>' : '') +
            (item.notes ? '<p class="text-sm text-slate-300 mt-3"><span class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Notas</span><br>' + escapeHtml(item.notes) + '</p>' : '') +
            '<p class="text-[11px] text-slate-500 mt-2">Registrado: ' + escapeHtml(item.estimatedDate || "fecha por confirmar") + '</p></div>' +
            '<div class="flex flex-wrap items-end gap-2 lg:min-w-[300px]">' +
            '<label class="text-[10px] text-slate-400">Estado<select data-order-field="status" class="block mt-1 bg-navy-950 border border-navy-700 rounded px-2 py-2 text-xs text-white"><option value="pendiente" ' + (item.status === "pendiente" ? "selected" : "") + '>Pendiente</option><option value="en_proceso" ' + (item.status === "en_proceso" ? "selected" : "") + '>En proceso</option><option value="entregado" ' + (item.status === "entregado" ? "selected" : "") + '>Entregado</option></select></label>' +
            '<label class="text-[10px] text-slate-400">Avance %<input data-order-field="progress" type="number" min="0" max="100" value="' + Number(item.progress || 0) + '" class="block w-20 mt-1 bg-navy-950 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
            '<label class="text-[10px] text-slate-400">Descuento %<input data-order-field="discount" type="number" min="0" max="80" value="' + Number(item.discount || 0) + '" class="block w-20 mt-1 bg-navy-950 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
            '<label class="text-[10px] text-slate-400">Total Bs<input data-order-field="total" type="number" min="0" step="1" value="' + Number(item.total || 0) + '" class="block w-28 mt-1 bg-navy-950 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
            '<label class="flex-1 min-w-48 text-[10px] text-slate-400">Enlace de prueba o entrega<input data-order-field="siteLink" type="url" value="' + escapeHtml(item.siteLink || "") + '" placeholder="https://..." class="block w-full mt-1 bg-navy-950 border border-navy-700 rounded px-2 py-2 text-xs text-white"></label>' +
            '<button data-save-order="' + escapeHtml(item.code) + '" class="px-4 py-2 rounded-lg gradient-blue-bg text-white text-xs font-bold">Guardar cambios</button></div></div></article>';
    }).join("");
}

async function loadOrders() {
    if (!currentAdmin || !db) return;
    byId("ordersList").innerHTML = '<p class="text-sm text-slate-500">Cargando pedidos…</p>';
    try {
        const snapshot = await getDocs(collection(db, "orders"));
        allOrders = snapshot.docs.map(item => item.data()).sort((a,b) => {
            const first = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const second = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return second - first;
        });
        renderOrders();
    } catch (error) {
        console.error(error);
        byId("ordersList").innerHTML = '<p class="text-sm text-rose-300">No se pudieron cargar los pedidos. Revisa las reglas de Firebase.</p>';
    }
}

async function saveOrderUpdate(code) {
    if (!currentAdmin) return;
    const card = document.querySelector('[data-order-card="' + code + '"]');
    if (!card) return;

    let status = card.querySelector('[data-order-field="status"]').value;
    let progress = Math.max(0, Math.min(100, Number(card.querySelector('[data-order-field="progress"]').value) || 0));
    const discount = Math.max(0, Math.min(80, Number(card.querySelector('[data-order-field="discount"]').value) || 0));
    const total = Math.max(0, Math.min(1000000000, Math.round(Number(card.querySelector('[data-order-field="total"]').value) || 0)));
    const rawLink = card.querySelector('[data-order-field="siteLink"]').value.trim();
    const siteLink = safeHttpUrl(rawLink);
    if (rawLink && !siteLink) {
        showToast("El enlace debe ser una dirección http:// o https:// válida.", false);
        card.querySelector('[data-order-field="siteLink"]').focus();
        return;
    }
    if (status === "entregado") progress = 100;

    const button = card.querySelector("[data-save-order]");
    setBusy(button, true);
    try {
        const orderRef = doc(db, "orders", code);
        const snapshot = await getDoc(orderRef);
        if (!snapshot.exists()) return showToast("No encontramos ese pedido.", false);
        const order = snapshot.data();
        const batch = writeBatch(db);
        batch.set(orderRef, { status:status, progress:progress, siteLink:siteLink, discount:discount, total:total }, { merge:true });
        batch.set(doc(db, "tracking", code), {
            code:code,
            projectName:order.siteName || order.projectType || "Proyecto",
            status:status,
            progress:progress,
            siteLink:siteLink,
            estimatedDate:order.estimatedDate || "",
            updatedAt:serverTimestamp()
        });
        await batch.commit();
        showToast("Pedido actualizado.");
        await loadOrders();
    } catch (error) {
        console.error(error);
        showToast("No se pudo actualizar el pedido.", false);
    } finally {
        setBusy(button, false);
    }
}

function exportOrders() {
    if (!allOrders.length) return showToast("No hay pedidos para exportar.", false);

    const escapeCsv = value => '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
    const rows = [
        ["Código", "Cliente", "Teléfono", "Proyecto", "Complementos", "Días", "Descuento %", "Total Bs", "Estado", "Avance %", "Enlace", "Fecha estimada", "Requerimientos personalizados", "Notas"],
        ...allOrders.map(item => [
            item.code,
            item.clientName,
            item.clientPhone,
            item.projectType,
            Array.isArray(item.modules) ? item.modules.map(module => typeof module === "string" ? module : module.name).join(", ") : "",
            item.days,
            item.discount,
            item.total,
            statusLabel(item.status),
            item.progress,
            item.siteLink,
            item.estimatedDate,
            item.customRequirements,
            item.notes
        ])
    ];
    const csv = "\ufeff" + rows.map(row => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pedidos-digital-panda.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addCatalogItem(kind) {
    const id = (kind === "types" ? "tipo-" : "complemento-") + Date.now();
    catalog[kind].push({
        id:id,
        name:kind === "types" ? "Nuevo tipo de proyecto" : "Nuevo complemento",
        description:"Describe esta opción con palabras sencillas.",
        price:0
    });
    renderCatalog();
}

async function initialize() {
    document.querySelectorAll(".tab-button").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
    document.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => addCatalogItem(button.dataset.add)));
    byId("sendLoginLink").addEventListener("click", signIn);
    byId("adminLoginEmail").addEventListener("keydown", event => {
        if (event.key === "Enter") byId("adminLoginPassword").focus();
    });
    byId("adminLoginPassword").addEventListener("keydown", event => {
        if (event.key === "Enter") signIn();
    });
    byId("saveCatalog").addEventListener("click", saveCatalog);
    byId("refreshOrders").addEventListener("click", loadOrders);
    byId("orderFilter").addEventListener("change", renderOrders);
    byId("orderSearch").addEventListener("input", event => {
        orderSearch = event.target.value.trim();
        renderOrders();
    });
    byId("exportOrders").addEventListener("click", exportOrders);
    byId("addDuration").addEventListener("click", () => {
        catalog.durations.push({ id:"plazo-" + Date.now(), days:60, discount:12 });
        renderCatalog();
    });
    byId("signOutButton").addEventListener("click", async () => {
        if (auth) await signOut(auth);
        currentAdmin = null;
        accessDeniedEmail = "";
        showAccessState();
        showToast("Sesión cerrada.");
    });
    document.addEventListener("change", event => {
        const field = event.target.closest("[data-catalog-kind]");
        if (field) {
            const list = catalog[field.dataset.catalogKind];
            const item = list && list.find(entry => entry.id === field.dataset.item);
            if (!item) return;
            const name = field.dataset.field;
            item[name] = ["price","days","discount"].includes(name) ? Math.max(0, Number(field.value) || 0) : field.value.trim();
            return;
        }
        if (event.target.matches("[data-order-field]")) return;
    });
    document.addEventListener("click", event => {
        const remove = event.target.closest("[data-remove-kind]");
        const removeDuration = event.target.closest("[data-remove-duration]");
        const save = event.target.closest("[data-save-order]");
        if (remove) {
            catalog[remove.dataset.removeKind] = catalog[remove.dataset.removeKind].filter(item => item.id !== remove.dataset.removeId);
            renderCatalog();
        }
        if (removeDuration) {
            catalog.durations = catalog.durations.filter(item => item.id !== removeDuration.dataset.removeDuration);
            renderCatalog();
        }
        if (save) saveOrderUpdate(save.dataset.saveOrder);
    });

    if (!configured) {
        showAccessState();
        renderCatalog();
        return;
    }
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        onAuthStateChanged(auth, async user => {
            if (user && user.email) {
                if (await verifyAdminAccess()) {
                    currentAdmin = user;
                    accessDeniedEmail = "";
                    showAccessState();
                    renderCatalog();
                    await Promise.all([loadCatalog(), loadOrders()]);
                    return;
                }
                accessDeniedEmail = user.email;
                currentAdmin = null;
                showAccessState();
                showToast("Ese correo no tiene acceso a este panel.", false);
                await signOut(auth);
                return;
            }
            currentAdmin = null;
            accessDeniedEmail = "";
            showAccessState();
        });
        byId("adminLoginEmail").value = readStoredAdminEmail();
        showAccessState();
    } catch (error) {
        console.error(error);
        byId("loginMessage").textContent = "No se pudo iniciar Firebase. Revisa la configuración del proyecto.";
        byId("sendLoginLink").disabled = true;
        byId("adminLoginEmail").disabled = true;
        byId("adminLoginPassword").disabled = true;
    }
}

initialize();
