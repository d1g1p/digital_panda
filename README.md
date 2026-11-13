# DIGITAL PANDA

Sitio estático con cotizador, seguimiento de pedidos, panel de administración y páginas de muestra.

## Preparar configuración

1. Completa `.env` con la configuración Firebase Web, `BUSINESS_WHATSAPP` y, si ya las tienes, las URLs de `SOCIAL_FACEBOOK`, `SOCIAL_INSTAGRAM` y `SOCIAL_TIKTOK`.
2. Sigue los pasos de [FIREBASE_SETUP.md](FIREBASE_SETUP.md) para habilitar Authentication y Firestore.
3. Crea una sola vez el documento del propietario en Firestore: `admins/{tu-correo}` con `email`, `role: "owner"`, `addedAt` y `addedBy`.
4. El propietario puede añadir o quitar administradores desde la pestaña **Administradores** del panel. Los administradores adicionales se guardan con `role: "admin"`.

## Generar el sitio

Ejecuta `npm run build` para generar el contenido de `dist/`. Puedes validar enlaces locales y configuración con `npm run check`; `npm run check:prod` además comprueba que el build no conserve marcadores. Instala Firebase CLI con `npm install --global firebase-tools`, inicia sesión con `npm run firebase:login`, publica las reglas con `npm run deploy:rules` y el sitio con `npm run deploy:hosting`. Antes de desplegar, completa Firebase Web, `BUSINESS_WHATSAPP` y las redes sociales en `.env`. El destino predeterminado está configurado en `.firebaserc` y Hosting publica solo `dist/` según `firebase.json`.

El archivo `.env` se queda local y se ignora en Git. La configuración Firebase Web se incluye en el JavaScript que recibe el navegador y debe protegerse con Authentication y las reglas de Firestore. La lista de administradores vive en la colección `admins` de Firestore: el documento con `role: "owner"` es el propietario y es el único que puede modificarla.
