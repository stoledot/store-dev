# Actualizaciones de conferencias y órdenes

Esta extensión aplica sobre el delta `minshop-zoom-conferences-delta.zip` y agrega la migración `0051_conference_order_live_details.sql`.

## Comportamiento

- La orden conserva su artículo, precio y nombre comprados. Al borrar un producto, `order_items.product_id` se pone en `NULL` antes de eliminar el registro del catálogo.
- Cada acceso comprado conserva `conference_id`, independiente del vínculo actual del producto. La vista de orden vuelve a leer las sesiones vigentes de esa conferencia, por lo que los cambios de nombre, fecha, duración, zona horaria y enlaces aparecen también en órdenes anteriores.
- El checkout Demo envía el correo de cliente cuando la orden contiene accesos de conferencia. Los correos de Demo que no tienen conferencia siguen respetando la política existente de no enviar recibos al cliente.
- Agregar, editar o eliminar una sesión actualiza la reunión correspondiente en Zoom cuando aplica y envía una notificación a los participantes registrados. La eliminación también elimina la reunión de Zoom.
- La notificación se intenta participante por participante; un fallo se registra y no impide notificar al resto.

## Despliegue

1. Aplicar el ZIP respetando las rutas desde la raíz del repositorio.
2. Ejecutar `npm run db:migrate:remote` contra la base D1 de producción, o aplicar específicamente la migración `0051_conference_order_live_details.sql` mediante el flujo de migraciones del proyecto.
3. Ejecutar `npm run check`, `npm test` y `npm run build`.
4. Probar con una conferencia no productiva: comprar con un método real de prueba y Demo, cambiar fecha/nombre de sesión, borrar una sesión y confirmar el correo y la vista privada de la orden.

## Límites importantes

- Las credenciales de Zoom y el proveedor de correo deben estar configurados y activos.
- Si Zoom no permite actualizar o eliminar una reunión por permisos o estado de la cuenta, la acción administrativa informa el error y no completa el cambio local cuando la operación de Zoom es previa.
- La lista de sesiones en órdenes refleja el calendario actual de la conferencia vinculada. Si se elimina una sesión, deja de mostrarse en la orden y se comunica mediante correo; la orden y su clave personal permanecen.
