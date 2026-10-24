# Administración de conferencias Zoom

## Configuración inicial

1. Aplica la migración `0050_zoom_conferences.sql` en la base D1 remota correcta.
2. En Admin → Settings → Zoom, guarda Account ID, Client ID y Client Secret de una aplicación **Server-to-Server OAuth** creada en Zoom Marketplace. Minshop los cifra en el vault existente; `SECRETS_KEK` debe estar configurado como secreto del Worker.
3. En Settings, configura y habilita un proveedor de correo (Resend o Cloudflare Email).
4. En Admin → Conferencias Zoom, crea una conferencia y agrega sus sesiones. Cada sesión crea una reunión distinta por la API de Zoom.
5. Publica la conferencia y enlázala a un producto desde su formulario de creación/edición.

## Migración y despliegue

Usa el comando de migración que ya utilice este checkout (`npm run db:migrate:remote` si está configurado en package.json). Verifica primero `wrangler.jsonc` y el entorno de destino. Luego ejecuta las comprobaciones habituales (`npm test` y `npm run build`) antes de desplegar.

## Consideraciones

- Las credenciales se guardan cifradas en D1; la clave `SECRETS_KEK` permanece en Cloudflare Worker Secrets.
- Las invitaciones contienen clave personal, fecha, zona horaria, enlace y passcode de cada sesión.
- Las compras se inscriben durante la entrega de la confirmación de pago. La outbox existente controla reintentos del correo de la orden.
- Verifica el formato de hora/zona horaria en una reunión de prueba antes de vender; las reuniones se crean en la cuenta Zoom conectada.
- Para listas grandes, usa recordatorios en lotes y considera una cola de trabajos. Esta primera interfaz envía de forma secuencial para limitar la presión sobre el proveedor.
- La app de Zoom debe conceder los scopes necesarios para crear reuniones y usar Server-to-Server OAuth.
