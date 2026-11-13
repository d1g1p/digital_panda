// Utilidades compartidas por la página pública y el panel de administración.

export const STATUS_LABELS = {
    pendiente: "Pendiente",
    en_proceso: "En proceso",
    entregado: "Entregado"
};

export const PUBLIC_STATUS_LABELS = {
    pendiente: "Solicitud recibida",
    en_proceso: "En proceso",
    entregado: "Entregado"
};

export function statusLabel(status, publicView = false) {
    const labels = publicView ? PUBLIC_STATUS_LABELS : STATUS_LABELS;
    return labels[status] || labels.pendiente;
}

export const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export const money = value => new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 }).format(Number(value) || 0);

export function safeHttpUrl(value) {
    const trimmed = String(value == null ? "" : value).trim();
    if (!trimmed) return "";
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : "https://" + trimmed;
    try {
        const url = new URL(candidate);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) {
        return "";
    }
}

export function showToast(message, success = true) {
    const toast = document.getElementById("toast");
    const messageElement = document.getElementById("toastMsg");
    const icon = document.getElementById("toastIcon");
    if (!toast || !messageElement || !icon) return;

    messageElement.textContent = message;
    icon.className = success ? "fa-solid fa-circle-check text-cyan-400 text-xl" : "fa-solid fa-circle-exclamation text-amber-400 text-xl";
    toast.classList.remove("translate-y-20", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
    window.setTimeout(() => {
        toast.classList.remove("translate-y-0", "opacity-100");
        toast.classList.add("translate-y-20", "opacity-0");
    }, 3500);
}

export function setBusy(element, busy) {
    if (!element) return;
    element.disabled = busy;
    element.classList.toggle("opacity-50", busy);
    element.classList.toggle("cursor-not-allowed", busy);
    element.setAttribute("aria-busy", busy ? "true" : "false");
}
