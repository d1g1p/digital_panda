import { firebaseConfig, CATALOG_DEFAULTS } from "./firebase-config.js";
import { escapeHtml, money, safeHttpUrl, setBusy, showToast, statusLabel } from "./shared.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_EMAIL_STORAGE_KEY = "digitalPandaAdminEmail";
const configured = firebaseConfig.apiKey !== "REEMPLAZAR_API_KEY"
    && firebaseConfig.authDomain !== "REEMPLAZAR_AUTH_DOMAIN"
    && firebaseConfig.projectId !== "REEMPLAZAR_PROJECT_ID"
    && firebaseConfig.appId !== "REEMPLAZAR_APP_ID";
let auth = null;
let db = null;
let currentAdmin = null;
let isOwner = false;
let pendingSignInLink = false;
let accessDeniedEmail = "";
let catalog = JSON.parse(JSON.stringify(CATALOG_DEFAULTS));
let allOrders = [];
let admins = [];
let orderSearch = "";
let savingCatalog = false;

const byId = id => document.getElementById(id);

function isValidEmail(email) {
    return email.length <= 254 && !email.includes("/") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readStoredAdminEmail() {
    try {
        return window.localStorage.getItem(ADMIN_EMAIL_STORAGE_KEY) || "";
    } catch (error) {
        console.error(error);
        return "";
    }
}

function storeAdminEmail(email) {
    try {
        window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, email);
    } catch (error) {
        console.error(error);
    }
}

function clearStoredAdminEmail() {
    try {
        window.localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
    } catch (error) {
        console.error(error);
    }
}

async function checkAdminAccess(user) {
    if (!user || !user.email || !db) return null;
    const email = user.email.toLowerCase();
    try {
        const snapshot = await getDoc(doc(db, "admins", email));
        if (!snapshot.exists()) return null;
        const data = snapshot.data() || {};
        return {
            ...data,
            email: String(data.email || email).toLowerCase()
        };
    } catch (error) {
        console.error(error);
        return null;
    }
}

function showAccessState() {
    const authorized = !!(currentAdmin && currentAdmin.email);
    byId("loginPanel").classList.toggle("hidden", authorized);
    byId("dashboard").classList.toggle("hidden", !authorized);
    byId("signOutButton").classList.toggle("hidden", !authorized);
    byId("adminsTabButton").classList.toggle("hidden", !authorized || !isOwner);
    if (!authorized || !isOwner) byId("adminsSection").classList.add("hidden");
    byId("adminEmail").textContent = authorized
        ? "Sesión iniciada como " + currentAdmin.email + (isOwner ? " · Propietario" : " · Administrador")
        : "";
    if (!configured) {
        byId("loginMessage").textContent = "Completa la configuración de Firebase en firebase-config.js. Sigue FIREBASE_SETUP.md.";
        byId("sendLoginLink").disabled = true;
        byId("adminLoginEmail").disabled = true;
        byId("sendLoginLink").classList.add("opacity-50", "cursor-not-allowed");
        return;
    }
    byId("sendLoginLink").disabled = false;
    byId("adminLoginEmail").disabled = false;
    byId("sendLoginLink").classList.remove("opacity-50", "cursor-not-allowed");
    byId("sendLoginLinkLabel").textContent = pendingSignInLink ? "Completar acceso" : "Enviar enlace de acceso";
    if (accessDeniedEmail) {
        byId("loginMessage").textContent = "El correo " + accessDeniedEmail + " no está autorizado. Pide a un administrador que te añada a la lista.";
    } else if (pendingSignInLink) {
        byId("loginMessage").textContent = "Confirma tu correo para completar el acceso.";
    } else {
        byId("loginMessage").textContent = "Solo los correos autorizados pueden entrar. Solicita tu enlace de acceso.";
    }
}

async function sendLoginLink() {
    if (!auth || !configured) {
        showToast("Configura Firebase antes de iniciar sesión.", false);
        return;
    }
    const input = byId("adminLoginEmail");
    const email = input.value.trim().toLowerCase();
    if (!isValidEmail(email)) {
        showToast("Escribe un correo válido.", false);
        input.focus();
        return;
    }
    const button = byId("sendLoginLink");
    if (button.disabled) return;
    accessDeniedEmail = "";
    setBusy(button, true);
    try {
        if (pendingSignInLink) {
            await signInWithEmailLink(auth, email, window.location.href);
            pendingSignInLink = false;
            clearStoredAdminEmail();
            window.history.replaceState({}, document.title, window.location.pathname);
            showToast("Acceso verificado.");
        } else {
            await sendSignInLinkToEmail(auth, email, {
                url: window.location.origin + window.location.pathname,
                handleCodeInApp: true
            });
            storeAdminEmail(email);
            showToast("Enviamos el enlace a " + email + ".");
        }
    } catch (error) {
        console.error(error);
        if (pendingSignInLink) {
            pendingSignInLink = false;
            clearStoredAdminEmail();
            byId("sendLoginLinkLabel").textContent = "Enviar enlace de acceso";
            byId("loginMessage").textContent = "El enlace no es válido o venció. Solicita uno nuevo.";
            showToast("El enlace no es válido o venció. Solicita uno nuevo.", false);
        } else {
            showToast("No se pudo enviar el enlace. Revisa el método de acceso por correo en Firebase.", false);
        }
    } finally {
        if (configured) setBusy(button, false);
    }
}

function activateTab(name) {
    if (name === "admins" && !isOwner) name = "orders";
    const sections = { orders: "ordersSection", catalog: "catalogSection", admins: "adminsSection" };
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

function formatAdminDate(value) {
    const date = value && typeof value.toDate === "function" ? value.toDate() : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-BO", { day:"2-digit", month:"short", year:"numeric" }).format(date);
}

function renderAdmins() {
    const sorted = [...admins].sort((a, b) => {
        if (a.role === "owner" && b.role !== "owner") return -1;
        if (b.role === "owner" && a.role !== "owner") return 1;
        return String(a.email || "").localeCompare(String(b.email || ""));
    });
    const rows = sorted.map(item => {
        const email = String(item.email || item.id || "").toLowerCase();
        const owner = item.role === "owner";
        const added = formatAdminDate(item.addedAt);
        const detail = owner
            ? "Propietario · acceso permanente"
            : (added ? "Añadido el " + added : "Administrador");
        return '<article class="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ' + (owner ? 'border-cyan-400/20 bg-cyan-400/5' : 'border-navy-800 bg-navy-950/60') + '">' +
            '<div class="min-w-0"><p class="font-mono text-xs break-all ' + (owner ? 'text-cyan-200' : 'text-slate-200') + '">' + escapeHtml(email) + '</p><p class="text-[11px] text-slate-500 mt-1">' + escapeHtml(detail) + '</p></div>' +
            (owner
                ? '<span class="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">Propietario</span>'
                : '<button type="button" data-remove-admin="' + escapeHtml(item.id || email) + '" class="text-xs font-bold text-rose-300 hover:text-rose-200"><i class="fa-solid fa-user-minus mr-1"></i>Quitar acceso</button>') +
            '</article>';
    });
    if (!rows.length) {
        rows.push('<p class="text-sm text-amber-300">No hay administradores configurados. Crea el documento del propietario en Firestore para habilitar el panel.</p>');
    }
    byId("adminsList").innerHTML = rows.join("");
}

async function loadAdmins() {
    if (!isOwner || !db) return;
    try {
        const snapshot = await getDocs(collection(db, "admins"));
        admins = snapshot.docs
            .map(item => ({ id:item.id, ...item.data() }))
            .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
        renderAdmins();
    } catch (error) {
        console.error(error);
        byId("adminsList").innerHTML = '<p class="text-sm text-rose-300">No se pudieron cargar los administradores.</p>';
    }
}

async function addAdmin() {
    if (!isOwner || !db || !currentAdmin) return showToast("Solo el propietario puede añadir administradores.", false);
    const input = byId("newAdminEmail");
    const email = input.value.trim().toLowerCase();
    if (!isValidEmail(email)) {
        showToast("Escribe un correo válido.", false);
        input.focus();
        return;
    }
    const button = byId("addAdminButton");
    if (button.disabled) return;
    setBusy(button, true);
    try {
        const adminRef = doc(db, "admins", email);
        const snapshot = await getDoc(adminRef);
        if (snapshot.exists()) {
            showToast("Ese correo ya es administrador.", false);
            return;
        }
        await setDoc(adminRef, {
            email:email,
            role:"admin",
            addedAt:serverTimestamp(),
            addedBy:(currentAdmin.email || "").toLowerCase()
        });
        input.value = "";
        showToast("Administrador añadido.");
        await loadAdmins();
    } catch (error) {
        console.error(error);
        showToast("No se pudo añadir el administrador.", false);
    } finally {
        setBusy(button, false);
    }
}

async function removeAdmin(email) {
    if (!isOwner || !db) return showToast("Solo el propietario puede quitar administradores.", false);
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;
    const target = admins.find(item => String(item.id || item.email || "").toLowerCase() === normalized);
    if (target && target.role === "owner") return showToast("No puedes quitar el acceso del propietario.", false);
    if (!window.confirm("¿Quitar el acceso de " + normalized + "?")) return;
    try {
        await deleteDoc(doc(db, "admins", normalized));
        showToast("Acceso de administrador quitado.");
        await loadAdmins();
    } catch (error) {
        console.error(error);
        showToast("No se pudo quitar el administrador.", false);
    }
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
    byId("sendLoginLink").addEventListener("click", sendLoginLink);
    byId("adminLoginEmail").addEventListener("keydown", event => {
        if (event.key === "Enter") sendLoginLink();
    });
    byId("addAdminButton").addEventListener("click", addAdmin);
    byId("newAdminEmail").addEventListener("keydown", event => {
        if (event.key === "Enter") addAdmin();
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
        isOwner = false;
        admins = [];
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
        const removeAdminButton = event.target.closest("[data-remove-admin]");
        if (remove) {
            catalog[remove.dataset.removeKind] = catalog[remove.dataset.removeKind].filter(item => item.id !== remove.dataset.removeId);
            renderCatalog();
        }
        if (removeDuration) {
            catalog.durations = catalog.durations.filter(item => item.id !== removeDuration.dataset.removeDuration);
            renderCatalog();
        }
        if (save) saveOrderUpdate(save.dataset.saveOrder);
        if (removeAdminButton) removeAdmin(removeAdminButton.dataset.removeAdmin);
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
            const access = user ? await checkAdminAccess(user) : null;
            if (access) {
                currentAdmin = user;
                isOwner = access.role === "owner";
                accessDeniedEmail = "";
                showAccessState();
                renderCatalog();
                if (!isOwner) activateTab("orders");
                await Promise.all([loadCatalog(), loadOrders(), isOwner ? loadAdmins() : Promise.resolve()]);
                return;
            }
            currentAdmin = null;
            isOwner = false;
            admins = [];
            if (user) {
                accessDeniedEmail = user.email || "";
                showAccessState();
                showToast("Ese correo no está autorizado como administrador.", false);
                await signOut(auth);
            } else {
                showAccessState();
            }
        });
        if (isSignInWithEmailLink(auth, window.location.href)) {
            pendingSignInLink = true;
            const storedEmail = readStoredAdminEmail();
            showAccessState();
            if (storedEmail && isValidEmail(storedEmail)) {
                byId("adminLoginEmail").value = storedEmail;
                await sendLoginLink();
            } else {
                byId("adminLoginEmail").focus();
            }
        } else {
            byId("adminLoginEmail").value = readStoredAdminEmail();
            showAccessState();
        }
    } catch (error) {
        console.error(error);
        byId("loginMessage").textContent = "No se pudo iniciar Firebase. Revisa la configuración del proyecto.";
        byId("sendLoginLink").disabled = true;
        byId("adminLoginEmail").disabled = true;
    }
}

initialize();
