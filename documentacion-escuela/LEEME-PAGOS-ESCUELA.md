# Pagos escolares privados para MinShop

## Qué agrega

- `/account/payments`: obligaciones asignadas al correo autenticado, estado, importe, vencimiento, último pago y próximo vencimiento.
- `/account/calendar`: calendario mensual con vencimientos, pagos realizados, inicio/término de cursos y eventos escolares. La administración académica permite indicar fechas de inicio y término al asignar un curso y editar las fechas de las asignaciones activas existentes.
- `/admin/escuela/pagos`: alta de conceptos privados de pago, asignación individual, fecha de disponibilidad, vencimiento y cancelación de asignaciones pendientes.
- Los conceptos y obligaciones viven en tablas propias (`school_payment_products` y `school_payment_obligations`), no son productos del catálogo público. La migración desactiva el producto público cuyo nombre sea exactamente `Mensualidad de escuela` (sin borrar pedidos ni historial). Cada concepto puede ser de tipo inscripción, mensualidad u otro pago.
- El checkout se inicia desde la cuenta del alumno. Importe, moneda y alumno se recuperan de D1; no se aceptan desde el navegador.
- Stripe Checkout incorpora el identificador de obligación en metadata. Solo el webhook firmado puede marcarla pagada, y valida alumno, importe, moneda, estado y sesión. La operación es idempotente. Los conceptos de inscripción/mensualidad también se reflejan en `school_fee_payments` para actualizar el checklist y la vigencia escolar.

## Instalación

1. Descomprime el ZIP en la raíz del proyecto y permite sobrescribir los archivos.
2. Verifica que `0057_school_program_views.sql` (si instalaste el parche anterior de programas) esté aplicado. Esta entrega agrega `0058_school_assigned_payments.sql`.
3. En local:

   ```bash
   npx wrangler d1 migrations apply minshop-db --local
   npm run check
   npm test
   npm run build
   ```

4. En producción, después de probar localmente:

   ```bash
   npx wrangler d1 migrations list minshop-db --remote
   npx wrangler d1 migrations apply minshop-db --remote
   ```

5. Configura Stripe en MinShop y apunta el webhook a `/api/webhook/stripe` (o al endpoint de webhook Stripe que ya uses). Debe escuchar `checkout.session.completed`, `checkout.session.expired` y `checkout.session.async_payment_failed`, además de los eventos habituales de pagos que ya consume MinShop.

## Uso administrativo

1. Entra a `/admin/escuela/pagos`.
2. Crea un concepto privado (por ejemplo, inscripción o mensualidad).
3. Asigna ese concepto al correo exacto del alumno e indica vencimiento y, opcionalmente, desde qué fecha podrá iniciar el checkout.
4. El alumno lo verá en `/account/payments` y en `/account/calendar`.

Cada mensualidad/periodo debe asignarse como una nueva obligación. Esta entrega no crea cargos recurrentes automáticos ni suscripciones: no se programan cargos sin consentimiento explícito.

## Importante / límites

- El checkout de obligaciones está conectado a Stripe. Si Stripe no está configurado o está deshabilitado, la pantalla informa que el pago online no está disponible. No se usa el modo demo para marcar pagos escolares.
- La confirmación depende del webhook Stripe firmado; la página de éxito NO marca el pago como pagado.
- No se han añadido ni expuesto productos de pago en el catálogo público.
- La fecha `available_at` controla desde cuándo puede abrirse checkout; `due_at` es la fecha de vencimiento.
- Se añade una columna nullable `orders.school_payment_obligation_id` para auditoría. Los pedidos normales conservan NULL.
- Si el proveedor confirma un cobro cuyo alumno/importe/moneda no coincide con la obligación, el pedido queda registrado, pero la obligación no se marca pagada; se escribe un error en el log para conciliación manual.
- La integración de pagos se basa en Stripe Checkout. Otros proveedores MinShop (Lightning/OpenNode) no se usan en este flujo.

## Verificación manual recomendada

- Crear un concepto de pago y asignarlo a una cuenta de prueba.
- Confirmar que no aparece en el catálogo público y sí en `/account/payments`.
- Intentar pagar con Stripe test mode y verificar que el estado no cambia al volver a la página de éxito.
- Confirmar que el webhook firmado actualiza la obligación y registra el pedido relacionado.
- Reenviar el mismo evento Stripe y confirmar que no duplica ni el pedido ni el pago.
- Probar que otro usuario no puede iniciar checkout con el ID de obligación ajeno.
