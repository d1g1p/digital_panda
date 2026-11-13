// Plantilla compartida por la página pública y el panel de administración.
// scripts/build.cjs sustituye estos valores con las variables públicas de .env al generar dist/.
// La configuración Firebase Web es visible en el navegador; protege los datos con Authentication y firebase.rules.
export const firebaseConfig = {
    apiKey: "REEMPLAZAR_API_KEY",
    authDomain: "REEMPLAZAR_AUTH_DOMAIN",
    projectId: "REEMPLAZAR_PROJECT_ID",
    storageBucket: "REEMPLAZAR_STORAGE_BUCKET",
    messagingSenderId: "REEMPLAZAR_MESSAGING_SENDER_ID",
    measurementId: "REEMPLAZAR_MEASUREMENT_ID",
    appId: "REEMPLAZAR_APP_ID"
};

// Código de país incluido, sin el signo +.
export const BUSINESS_WHATSAPP = "591XXXXXXXXX";

// Redes sociales. Si una URL queda vacía, su icono se oculta.
export const SOCIAL_LINKS = {
    facebook: "REEMPLAZAR_FACEBOOK",
    instagram: "REEMPLAZAR_INSTAGRAM",
    tiktok: "REEMPLAZAR_TIKTOK"
};

// Tarifas iniciales de ejemplo; se pueden modificar desde el panel de administración.
export const CATALOG_DEFAULTS = {
    types: [
        { id: "pagina-negocio", name: "Página para mi negocio", description: "Una página para mostrar tus servicios, ubicación y contacto.", price: 900 },
        { id: "tienda-online", name: "Tienda para recibir pedidos", description: "Un espacio para mostrar productos y recibir pedidos.", price: 1800 },
        { id: "control-ventas", name: "Sistema para organizar ventas", description: "Una herramienta para controlar productos, ventas y clientes.", price: 2600 },
        { id: "sistema-medida", name: "Sistema hecho para mi negocio", description: "Una solución preparada según las tareas de tu negocio.", price: 3200 }
    ],
    modules: [
        { id: "panel", name: "Quiero poder cambiar la información yo mismo", description: "Un panel sencillo para actualizar textos, fotos o productos.", price: 350 },
        { id: "whatsapp", name: "Quiero recibir consultas por WhatsApp", description: "Un botón para que tus clientes te escriban fácilmente.", price: 150 },
        { id: "dominio", name: "Quiero que tenga dirección propia en internet", description: "Dominio y alojamiento del primer año.", price: 450 },
        { id: "reportes", name: "Quiero ver resúmenes y reportes", description: "Un resumen claro de ventas, pedidos u otros datos.", price: 300 }
    ],
    durations: [
        { id: "15", days: 15, discount: 0 },
        { id: "30", days: 30, discount: 5 },
        { id: "45", days: 45, discount: 10 }
    ]
};
