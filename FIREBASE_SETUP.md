# Configurar Firebase para DIGITAL PANDA

La página ya guarda cotizaciones, clientes y pedidos en Firestore. Antes de publicar, conecta tu proyecto de Firebase:

1. Crea un proyecto en Firebase y registra una aplicación web.
2. Completa `.env` con los datos de configuración Firebase Web. `BUSINESS_WHATSAPP` debe ser tu número con código de país, solo dígitos y sin `+`; el enlace se forma como `https://wa.me/<número>`. Opcionalmente completa `SOCIAL_FACEBOOK`, `SOCIAL_INSTAGRAM` y `SOCIAL_TIKTOK` con las URLs completas.
3. En Firebase Authentication, activa Correo electrónico/contraseña y el método Enlace de correo electrónico (acceso sin contraseña). Añade el dominio donde publicarás la página a los dominios autorizados.
4. Crea una sola vez el documento del propietario en Firestore: `admins/{tu-correo}` con los campos `email` (tu correo en minúsculas), `role: "owner"`, `addedAt` (timestamp) y `addedBy` (tu correo). Ese documento se crea manualmente desde la consola de Firestore; las reglas del cliente no permiten crearlo. Después, el propietario podrá añadir más administradores desde la pestaña **Administradores** del panel; se guardan con `role: "admin"` y entran con su propio correo.
5. Crea la base de datos Firestore y publica `firebase.rules` desde la pestaña Reglas o con `npm run deploy:rules` después de iniciar sesión con `npm run firebase:login`.
6. Genera el sitio con `npm run build`. Instala Firebase CLI con `npm install --global firebase-tools`, inicia sesión con `npm run firebase:login` y publica Hosting con `npm run deploy:hosting`. La cuenta de la CLI necesita los roles Firebase Hosting Admin y API Keys Viewer en el proyecto ([roles de Firebase](https://firebase.google.com/docs/projects/iam/roles-predefined-product)). La configuración publica solo `dist/` e incorpora al `firebase-config.js` generado la configuración web, el número de WhatsApp y las URLs de redes sociales. No publiques `.env` ni subas credenciales privadas al repositorio.
7. Abre el sitio en el dominio autorizado. Entra en Admin, escribe tu correo y solicita el enlace de Firebase Authentication. Guarda los precios iniciales desde el panel. Desde **Administradores** puedes autorizar a otras personas con su correo.

## Qué valores son públicos

La configuración Firebase para una aplicación web, el número de WhatsApp y las URLs de redes sociales terminan visibles para el navegador porque el sitio es estático. La clave de Firebase Web identifica el proyecto; no es una contraseña. Protege los datos con Firebase Authentication y las reglas de Firestore. No uses una clave de cuenta de servicio en el sitio.

Los precios que aparecen inicialmente son valores de ejemplo en bolivianos. Ajústalos en el panel antes de compartir el cotizador. También puedes cambiar el total y el descuento de un pedido concreto desde la pestaña **Pedidos** para dar un precio especial a un cliente.

El código de pedido es aleatorio y se usa como acceso al seguimiento. Firestore separa los datos: cualquier persona que tenga el código puede leer únicamente la ficha de seguimiento pública; nombre, teléfono, notas y cotización completa solo están disponibles para los administradores autorizados. No publiques reglas diferentes que permitan listar las colecciones orders o tracking.

La cotización muestra un estimado. El pedido se registra en Firebase al enviarlo, y WhatsApp se abre con el resumen para que el cliente pueda continuar la conversación. El estado, el porcentaje de avance y el enlace de prueba o entrega se actualizan desde el panel.

El panel separado está en admin.html. Su etiqueta noindex evita que los buscadores lo indexen, pero no oculta el archivo. Los permisos reales se aplican mediante Firebase Authentication y firebase.rules.

Las páginas demostrativas están en `muestras/` y el build las copia a `dist/muestras/`. `.gitignore` excluye `.env` y la salida `dist/` del control de versiones; esto evita subir esos archivos al repositorio, pero no oculta el código ni la configuración pública de una página entregada al navegador.
