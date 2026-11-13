# Administración de conferencias Zoom

## Configuración inicial

1. Aplica la migración `0050_zoom_conferences.sql` en la base D1 remota correcta.
2. En Admin → Settings → Zoom, guarda Account ID, Client ID y Client Secret de una aplicación **Server-to-Server OAuth** creada en Zoom Marketplace. Minshop los cifra en el vault existente; `SECRETS_KEK` debe estar configurado como secreto del Worker.
3. En Settings, configura y habilita un proveedor de correo (Resend o Cloudflare Email).
4. En Admin → Conferencias Zoom, crea una conferencia y agrega sus sesiones. Cada sesión crea una reunión distinta por la API de Zoom.
5. Publica la conferencia y enlázala a un producto desde su formulario de creación/edición.

## Grupos de subprogramas

Aplica la migración `0078_school_groups.sql` después de la `0077`. En Admin → Programas → Grupos escolares, crea un grupo por subprograma, añade los cursos vinculados al subprograma y selecciona una conferencia publicada. Asigna manualmente a cada alumno con sus pagos requeridos vigentes; puede cambiarse de grupo desde la misma pantalla. Si la modalidad limita el acceso a un curso, esa limitación sigue aplicando.

La asignación se conserva si un pago requerido vence o se reembolsa, pero se suspende el acceso a los cursos y a la conferencia del grupo hasta regularizarlo. Un cargo pendiente suspende el acceso a partir del día siguiente a su vencimiento, tomando como referencia la fecha UTC. Una compra o invitación independiente conserva sus propios derechos.

Las sesiones próximas aparecen en la página inicial y la agenda completa en `/account/conferences`. Las invitaciones nuevas se conservan también si el alumno compra la conferencia. En registros anteriores a esta migración no es posible distinguir una invitación que después se combinó con una compra; vuelve a invitar al alumno si necesita mantener ese acceso independientemente del pago.

## Migración y despliegue

Usa el comando de migración que ya utilice este checkout (`npm run db:migrate:remote` si está configurado en package.json). Verifica primero `wrangler.jsonc` y el entorno de destino. Luego ejecuta las comprobaciones habituales (`npm test` y `npm run build`) antes de desplegar.

## Consideraciones

- Las credenciales se guardan cifradas en D1; la clave `SECRETS_KEK` permanece en Cloudflare Worker Secrets.
- Las invitaciones contienen clave personal, fecha, zona horaria, enlace y passcode de cada sesión.
- Las compras se inscriben durante la entrega de la confirmación de pago. La outbox existente controla reintentos del correo de la orden.
- Verifica el formato de hora/zona horaria en una reunión de prueba antes de vender; las reuniones se crean en la cuenta Zoom conectada.
- Para listas grandes, usa recordatorios en lotes y considera una cola de trabajos. Esta primera interfaz envía de forma secuencial para limitar la presión sobre el proveedor.
- La app de Zoom debe conceder los scopes necesarios para crear reuniones y usar Server-to-Server OAuth.
