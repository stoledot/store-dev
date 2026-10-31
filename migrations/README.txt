# Migraciones propuestas para MinShop Escuela Virtual

Estos SQL son una **propuesta de esquema**, no una integración completa de la escuela.
Están separados en tres archivos:

1. `school_catalog.sql` — cursos y mini lecciones.
2. `school_progress.sql` — progreso y finalización por alumno.
3. `school_billing.sql` — suscripciones Stripe y registro idempotente de webhooks.

## Antes de ejecutar

- Revisa las migraciones existentes en `migrations/` de tu copia de MinShop.
- Crea las migraciones con el generador oficial para reservar números que no colisionen:
  `npx wrangler d1 migrations create minshop-db school_catalog`
  y repite para `school_progress` y `school_billing`.
- Copia el contenido del SQL correspondiente a cada archivo generado, conservando los números generados por MinShop.
- Aplica primero en local con `npm run db:migrate` y prueba; no ejecutes directamente en producción.
- No modifiques migraciones que ya se hayan aplicado.

## Suposiciones importantes

- El login de cliente de MinShop es passwordless y asocia pedidos por correo verificado; 
    por eso las tablas educativas usan `student_email` como clave de enlace, 
    en vez de asumir una tabla de usuarios que quizá no existe en tu versión.
- El email debe obtenerse de la sesión verificada del servidor, 
  nunca del formulario/navegador como prueba de identidad.
- El esquema no crea sesiones, login, checkout recurrente, webhooks ni páginas. 
    Esas partes requieren cambios TypeScript/Astro.
- El esquema registra estado de suscripción, pero la política de acceso debe 
    implementarse en el servidor y debe reconciliarse con Stripe.
- La secuencia de cursos/lecciones debe validarse en el servidor; 
    SQL por sí solo no evita que una ruta/API entregue contenido bloqueado.
- El campo `unit_amount_minor` guarda el importe en unidades menores de moneda 
  (por ejemplo, centavos para MXN), no en pesos enteros.
- No hay foreign key hacia una tabla de clientes porque el repositorio describe 
    cuentas de cliente passwordless basadas en email verificado 
    y no requiere una tabla independiente de usuarios para el historial de pedidos.

## Pruebas recomendadas

1. Ejecutar las migraciones en una D1 local limpia.
2. Verificar índices y restricciones con `npm run test:d1`.
3. Probar que no se duplique el progreso por alumno/lección.
4. Probar eventos de Stripe repetidos y eventos fuera de orden.
5. Probar que un alumno sin suscripción vigente no pueda recibir contenido protegido.
6. Hacer backup y validar restauración antes de migrar producción.
