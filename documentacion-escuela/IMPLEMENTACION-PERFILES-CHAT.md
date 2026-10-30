# Perfiles de clientes, cuenta académica y buzón persistente

Esta implementación añade perfiles explícitos a Minshop sin reemplazar el inicio de sesión passwordless ni crear una segunda tabla de pedidos. La identidad sigue siendo el correo verificado; `customer_profiles` almacena la información de perfil y las compras siguen en `orders` / `order_items`.

## Funciones

- `/account`: panel de cuenta adaptable con accesos a perfil, cursos, lecturas, buzón, notificaciones y pedidos.
- `/account/profile`: nombre, edad, nivel académico, institución opcional, intereses y objetivos; correo actual, solicitud de cambio de correo y cierre de sesión.
- Cambio de correo: se envía un enlace firmado al nuevo correo (válido 24 horas). El cambio solo ocurre al confirmar el enlace. Se comprueba que el correo no esté asociado a perfiles, alias, pedidos o registros escolares. Tras verificarlo, los pedidos, progreso, asignaciones, pagos escolares y conversaciones pasan al nuevo correo y se conserva un alias para impedir que el correo anterior se use para reclamar la misma identidad.
- `/account/courses`: cursos comprados o asignados con enlaces para continuar.
- `/account/readings`: lecturas matemáticas compradas, basadas en la copia guardada en los artículos de pedido.
- `/account/messages`: chat de texto persistente entre alumno y administración.
- `/admin/customers`: lista perfiles, pedidos y alumnos identificados por las tablas escolares existentes.
- `/admin/customers/:email`: permite editar datos académicos, bloquear la edición del alumno, registrar estado administrativo de pago, próximo pago y notas internas.
- `/admin/messages` y `/admin/messages/:email`: bandeja de conversaciones, mensajes sin leer y respuesta al alumno.

## Chat

Los mensajes se guardan en `customer_messages` y no se eliminan al cerrar sesión o abandonar la página. La primera carga muestra los últimos dos días (hasta 50 mensajes); el botón «Cargar mensajes anteriores» y el desplazamiento al inicio permiten traer lotes previos. El cliente consulta mensajes nuevos cada 12 segundos. Solo se admite texto plano, hasta 5,000 caracteres; el contenido se inserta en el DOM como texto, no como HTML.

## Datos de pago

`payment_status`, `next_payment_at`, `payment_notes` y `admin_notes` son campos de control administrativo del expediente. **No procesan cargos ni cambian por sí mismos el estado del proveedor de pago**. El pago real sigue siendo el de `orders` y el estado de las tablas de pagos/suscripciones existentes.

## Instalación

1. Respaldar D1 y el repositorio.
2. Copiar los archivos del ZIP a la raíz del repositorio, combinando las carpetas.
3. Confirmar que las migraciones previas de Minshop y las implementaciones existentes de lecturas matemáticas / escuela TeX ya están en el repositorio. Esta migración es `0053_customer_profiles_and_messages.sql` y debe ejecutarse después de las migraciones `0052` existentes.
4. Ejecutar `npm run db:migrate` y luego `npm run check`, `npm test` y `npm run build`.
5. Probar: registro/entrada por enlace mágico, guardar perfil, bloquear edición desde administración, cambio de correo confirmado, acceso a pedidos y lecturas, envío de mensajes en ambos sentidos y carga de mensajes anteriores.
6. Después de verificarlo localmente y respaldar la base remota, ejecutar `npm run db:migrate:remote` y desplegar.

No hay nuevas dependencias ni se modifica el formato de los pedidos. No se debe publicar el buzón sin tener habilitado y probado el sistema de cuentas y el secreto `AUTH_SECRET`.
