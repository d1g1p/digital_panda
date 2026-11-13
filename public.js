import { firebaseConfig, BUSINESS_WHATSAPP, SOCIAL_LINKS, CATALOG_DEFAULTS } from "./firebase-config.js";
import { escapeHtml, money, safeHttpUrl, setBusy, showToast, statusLabel } from "./shared.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let db = null;
let catalog = JSON.parse(JSON.stringify(CATALOG_DEFAULTS));
let submitting = false;
const configured = firebaseConfig.apiKey !== "REEMPLAZAR_API_KEY"
    && firebaseConfig.authDomain !== "REEMPLAZAR_AUTH_DOMAIN"
    && firebaseConfig.projectId !== "REEMPLAZAR_PROJECT_ID"
    && firebaseConfig.appId !== "REEMPLAZAR_APP_ID";
const byId = id => document.getElementById(id);

const businessWhatsappLink = byId("businessWhatsappLink");
if (businessWhatsappLink) businessWhatsappLink.href = "https://wa.me/" + BUSINESS_WHATSAPP.replace(/\D/g, "");

function applySocialLinks() {
    const links = {
        facebook: byId("socialFacebook"),
        instagram: byId("socialInstagram"),
        tiktok: byId("socialTiktok")
    };
    Object.entries(links).forEach(([key, element]) => {
        if (!element) return;
        const url = safeHttpUrl(SOCIAL_LINKS[key] || "");
        if (!url) {
            element.classList.add("hidden");
            return;
        }
        element.href = url;
        element.classList.remove("hidden");
    });
}
applySocialLinks();

function renderQuoteOptions() {
    byId("projectType").innerHTML = catalog.types.map(item =>
        '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + ' — desde Bs ' + money(item.price) + '</option>'
    ).join("");
    byId("moduleOptions").innerHTML = catalog.modules.map(item =>
        '<label class="flex items-start gap-3 p-3 rounded-xl bg-navy-950/80 border border-navy-800 cursor-pointer hover:border-navy-700">' +
        '<input type="checkbox" data-module-id="' + escapeHtml(item.id) + '" class="mt-1 w-4 h-4 accent-navy-500">' +
        '<span><span class="block text-sm text-slate-200">' + escapeHtml(item.name) + ' <span class="text-cyan-300">( + Bs ' + money(item.price) + ' )</span></span>' +
        '<span class="block text-[11px] text-slate-500 mt-1">' + escapeHtml(item.description) + '</span></span></label>'
    ).join("");
    const durations = catalog.durations.slice().sort((a,b) => Number(a.days) - Number(b.days));
    byId("durationOption").innerHTML = durations.map(item =>
        '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.days) + ' días' +
        (Number(item.discount) > 0 ? ' — ' + escapeHtml(item.discount) + '% de descuento' : ' — sin descuento') + '</option>'
    ).join("");
    calculateQuote();
}

function calculateQuote() {
    const type = catalog.types.find(item => item.id === byId("projectType").value) || catalog.types[0];
    const duration = catalog.durations.find(item => item.id === byId("durationOption").value) || catalog.durations[0];
    const selectedIds = Array.from(document.querySelectorAll("#moduleOptions input:checked")).map(input => input.dataset.moduleId);
    const addons = catalog.modules.filter(item => selectedIds.includes(item.id)).reduce((sum,item) => sum + (Number(item.price) || 0), 0);
    const beforeDiscount = (Number(type && type.price) || 0) + addons;
    const discount = Number(duration && duration.discount) || 0;
    const total = Math.max(0, Math.round(beforeDiscount * (1 - discount / 100)));
    byId("quoteTotalAmount").textContent = money(total);
    byId("quoteDiscountLabel").textContent = discount > 0 ? "Ahorro " + discount + "%" : "";
    return { type:type, duration:duration, selectedIds:selectedIds, total:total, discount:discount };
}

function renderMilestones(progress) {
    const names = ["Revisión de tu idea", "Diseño", "Preparación", "Entrega"];
    byId("trackerMilestones").innerHTML = names.map((name, index) => {
        const threshold = (index + 1) * 25;
        const done = progress >= threshold;
        const active = !done && progress > 0 && progress >= index * 25;
        const color = done ? "border-emerald-500/40 text-emerald-300" : (active ? "border-navy-500/50 text-cyan-300" : "border-navy-800 text-slate-500");
        const caption = done ? "Listo" : (active ? "En proceso" : "Pendiente");
        return '<div class="p-3 rounded-xl bg-navy-950/70 border ' + color + ' text-center"><div class="w-7 h-7 rounded-full bg-navy-800 font-bold text-xs flex items-center justify-center mx-auto mb-2">' + (index + 1) + '</div><p class="text-xs font-semibold text-white">' + name + '</p><span class="text-[10px] block mt-1">' + caption + '</span></div>';
    }).join("");
}

async function searchClientProgress(event) {
    event.preventDefault();
    const code = byId("trackerInputCode").value.trim().toUpperCase();
    if (!code) { showToast("Escribe el código de tu pedido.", false); return; }
    if (!db) { showToast("El seguimiento necesita que se configure Firebase.", false); return; }
    try {
        const snapshot = await getDoc(doc(db, "tracking", code));
        if (!snapshot.exists()) {
            byId("trackerDisplayArea").classList.add("hidden");
            byId("trackerEmpty").classList.remove("hidden");
            showToast("No encontramos ese código. Revísalo e intenta otra vez.", false);
            return;
        }
        const item = snapshot.data();
        const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
        byId("trackerEmpty").classList.add("hidden");
        byId("trackerDisplayArea").classList.remove("hidden");
        byId("displayClientCode").textContent = item.code;
        byId("displaySiteName").textContent = item.projectName || "Tu proyecto";
        byId("displayStatus").textContent = "Estado: " + statusLabel(item.status, true);
        byId("displayProgressPercent").textContent = progress + "%";
        byId("displayProgressBar").style.width = progress + "%";
        byId("displayDueDate").textContent = item.estimatedDate || "Por confirmar";
        const link = byId("displaySiteLink");
        const siteUrl = safeHttpUrl(item.siteLink);
        if (siteUrl) {
            link.href = siteUrl;
            link.textContent = "Abrir enlace de prueba o entrega";
            link.classList.remove("hidden");
        } else {
            link.removeAttribute("href");
            link.classList.add("hidden");
        }
        renderMilestones(progress);
    } catch (error) {
        console.error(error);
        showToast("No pudimos consultar el pedido. Intenta de nuevo.", false);
    }
}

function syncCustomRequirements(focus = false) {
    const checkbox = byId("quoteHasCustomRequirements");
    const textarea = byId("quoteCustomRequirements");
    if (!checkbox || !textarea) return;
    const active = checkbox.checked;
    textarea.classList.toggle("hidden", !active);
    textarea.required = active;
    if (!active) textarea.value = "";
    if (active && focus) textarea.focus();
}

function generateOrderCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return "DP-" + Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

function estimateDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return new Intl.DateTimeFormat("es-BO", { year:"numeric", month:"long", day:"numeric" }).format(date);
}

async function submitQuote(event) {
    event.preventDefault();
    if (submitting) return;
    if (!db) { showToast("El formulario necesita la conexión a Firebase.", false); return; }

    const quote = calculateQuote();
    if (!quote.type || !quote.duration) { showToast("Por favor, elige un tipo de proyecto y un plazo.", false); return; }

    const name = byId("quoteClientName").value.trim();
    const phone = byId("quoteClientPhone").value.trim();
    const notes = byId("quoteClientNotes").value.trim();
    const hasCustomRequirements = byId("quoteHasCustomRequirements").checked;
    const customRequirements = hasCustomRequirements ? byId("quoteCustomRequirements").value.trim() : "";
    const phoneDigits = phone.replace(/\D/g, "");
    if (name.length < 2) {
        showToast("Escribe tu nombre o el de tu negocio.", false);
        byId("quoteClientName").focus();
        return;
    }
    if (phoneDigits.length < 7) {
        showToast("Escribe un teléfono válido, con al menos 7 dígitos.", false);
        byId("quoteClientPhone").focus();
        return;
    }
    if (hasCustomRequirements && customRequirements.length < 5) {
        showToast("Describe tus requerimientos personalizados o desmarca la opción.", false);
        byId("quoteCustomRequirements").focus();
        return;
    }

    const selectedModules = catalog.modules
        .filter(item => quote.selectedIds.includes(item.id))
        .map(item => ({ id:item.id, name:item.name, price:Number(item.price) || 0 }));
    const code = generateOrderCode();
    const days = Number(quote.duration.days) || 0;
    const dueDate = estimateDate(days);
    const order = {
        code:code, clientName:name, clientPhone:phone, notes:notes,
        customRequirements:customRequirements,
        projectType:quote.type.name, projectTypeId:quote.type.id, modules:selectedModules,
        days:days, discount:quote.discount, total:quote.total,
        status:"pendiente", progress:0, siteName:quote.type.name, siteLink:"", estimatedDate:dueDate,
        createdAt:serverTimestamp()
    };
    const tracking = {
        code:code, projectName:quote.type.name, progress:0, status:"pendiente",
        siteLink:"", estimatedDate:dueDate, updatedAt:serverTimestamp()
    };

    const submitButton = byId("quoteSubmit");
    submitting = true;
    setBusy(submitButton, true);
    let whatsapp = null;
    try {
        whatsapp = window.open("about:blank", "_blank");
        const batch = writeBatch(db);
        batch.set(doc(db, "orders", code), order);
        batch.set(doc(db, "tracking", code), tracking);
        await batch.commit();

        const modulesText = selectedModules.length ? selectedModules.map(item => "• " + item.name).join("\n") : "Sin complementos";
        const message = "🐼 NUEVA SOLICITUD - DIGITAL PANDA\n\nCliente: " + name + "\nTeléfono: " + phone + "\nProyecto: " + quote.type.name + "\nComplementos: " + modulesText + "\nPlazo: " + days + " días (descuento " + quote.discount + "%)\nEstimado: Bs " + money(quote.total) + "\nCódigo de seguimiento: " + code + (notes ? "\nDetalles: " + notes : "") + (customRequirements ? "\nRequerimientos personalizados: " + customRequirements : "");
        const whatsappUrl = "https://wa.me/" + BUSINESS_WHATSAPP.replace(/\D/g, "") + "?text=" + encodeURIComponent(message);

        const confirmation = byId("quoteConfirmation");
        confirmation.innerHTML = '<strong class="text-emerald-300">Solicitud guardada. Tu código es <span class="font-mono">' + escapeHtml(code) + '</span>.</strong><br><span class="text-xs">Guárdalo para revisar el avance de tu pedido.</span><br><a href="' + escapeHtml(whatsappUrl) + '" target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"><i class="fa-brands fa-whatsapp"></i> Abrir WhatsApp</a>';
        confirmation.classList.remove("hidden");
        byId("trackerInputCode").value = code;

        if (whatsapp) whatsapp.location.href = whatsappUrl;
        showToast("Tu solicitud quedó guardada. Código: " + code);
        byId("quoteForm").reset();
        syncCustomRequirements();
        renderQuoteOptions();
    } catch (error) {
        if (whatsapp) whatsapp.close();
        console.error(error);
        showToast("No se pudo guardar. Revisa la conexión y vuelve a intentarlo.", false);
    } finally {
        submitting = false;
        setBusy(submitButton, false);
    }
}

async function loadCatalog() {
    if (!db) return renderQuoteOptions();
    try {
        const snapshot = await getDoc(doc(db, "settings", "catalog"));
        if (snapshot.exists()) {
            const data = snapshot.data();
            catalog = {
                types:Array.isArray(data.types) ? data.types : CATALOG_DEFAULTS.types,
                modules:Array.isArray(data.modules) ? data.modules : CATALOG_DEFAULTS.modules,
                durations:Array.isArray(data.durations) ? data.durations : CATALOG_DEFAULTS.durations
            };
        }
    } catch (error) {
        console.error(error);
        showToast("No se pudieron cargar los precios actualizados.", false);
    }
    renderQuoteOptions();
}

async function initialize() {
    const mobileMenu = byId("mobileMenu");
    if (mobileMenu) {
        mobileMenu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => { mobileMenu.open = false; }));
    }
    byId("quoteForm").addEventListener("submit", submitQuote);
    byId("trackerForm").addEventListener("submit", searchClientProgress);
    byId("quoteHasCustomRequirements").addEventListener("change", () => syncCustomRequirements(true));
    document.addEventListener("change", event => {
        if (event.target.closest("#quoteForm")) calculateQuote();
    });
    if (!configured) {
        renderQuoteOptions();
        return;
    }
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        // Muestra los precios por defecto de inmediato; loadCatalog los actualiza después.
        renderQuoteOptions();
        await loadCatalog();
    } catch (error) {
        console.error(error);
        showToast("No se pudo conectar con Firebase. Revisa la configuración.", false);
        renderQuoteOptions();
    }
}

initialize();
