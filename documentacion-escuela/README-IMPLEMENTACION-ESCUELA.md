# MinShop — modelo sencillo de escuela con mensualidad y curso asignado

Este parche adapta la implementación educativa previa al nuevo modelo de negocio. Está construido para el ZIP de MinShop que compartiste (Astro + Cloudflare D1) y reutiliza la autenticación de clientes, el layout administrativo y las tablas educativas existentes.

## Modelo de funcionamiento

1. El alumno inicia sesión y elige **un área de interés**: Cálculo, Álgebra, Topología, etc.
2. Envía una descripción/respuestas para su diagnóstico inicial.
3. Un administrador revisa la solicitud, determina el nivel (N0, N1, N2…) y la aprueba o rechaza.
4. El administrador asigna **un solo curso publicado** del área y nivel aprobados. Solo se puede mantener una asignación activa por alumno.
5. La inscripción cubre seis meses; la mensualidad cubre un mes y una sola materia/curso.
6. El administrador verifica el pedido en MinShop y registra el pago y su fecha de vigencia.
7. El alumno solo ve el curso que tiene asignado. Las páginas de lecciones verifican en el servidor la sesión, la asignación y la vigencia de ambos pagos.

## Archivos del ZIP y dónde copiarlos

Copia las rutas dentro de la raíz del repositorio MinShop, manteniendo los directorios:

- `migrations/0044_school_lesson_html.sql` — si ya aplicaste el 0044 del editor anterior, no necesitas volver a ejecutarlo; conserva el archivo/migración que ya tienes.
- `migrations/0045_school_monthly_model.sql` — tablas de áreas, diagnósticos, asignaciones y pagos; agrega `area_id` y `level_code` a los cursos.
- `layouts/AdminLayout.astro` — agrega los enlaces de administración de cursos y alumnos/pagos al menú actual. Está basado en el layout del ZIP que compartiste; si has modificado ese archivo desde entonces, añade manualmente los dos enlaces en lugar de sobrescribir tus cambios.
- `pages/admin/escuela/index.astro` — editor previo de cursos/lecciones, adaptado para elegir área y nivel; conserva el guardado del HTML de lecciones.
- `pages/admin/escuela/administracion.astro` — crear áreas/cursos, revisar diagnósticos, asignar cursos y registrar pagos.
- `pages/api/admin/escuela/preview.ts` — vista previa Markdown/LaTeX del editor.
- `pages/escuela/diagnostico.astro` — selección de área y envío de respuestas por parte del alumno autenticado.
- `pages/escuela/mi-escuela/index.astro` — panel del alumno con su área, estado de inscripción/mensualidad y únicamente su curso asignado.
- `pages/escuela/cursos/[curso]/[leccion].astro` — lector de lecciones con MathJax y control de acceso.

Las rutas `/admin/*` y `/api/admin/*` dependen del middleware de administración que ya tiene MinShop. No las saques de esa protección.

## Migraciones

1. Haz un commit o una copia de seguridad.
2. Comprueba en `migrations/` qué migraciones ya tienes. El proyecto compartido incluye `0040_school_catalog.sql` y `0041_school_progress.sql`; el editor anterior propone `0044_school_lesson_html.sql`.
3. Si el campo `school_lessons.content_html` todavía no existe y el 0044 no está aplicado, deja `0044_school_lesson_html.sql` en `migrations/`. Si ya lo aplicaste, no lo vuelvas a aplicar manualmente.
4. Añade `0045_school_monthly_model.sql` y ejecuta en local:

   ```bash
   npm run db:migrate
   npm run check
   npm run build
   ```

5. Inicia `npm run dev` y entra al panel administrativo. Crea primero las áreas; luego crea cursos asociados a un área y nivel; finalmente crea las lecciones desde **Cursos y lecciones**.
6. Después prueba el diagnóstico con una cuenta de cliente. En administración, revisa y aprueba el diagnóstico, asigna el curso publicado correspondiente y registra inscripción y mensualidad de prueba.
7. Solo después de verificar todo localmente, aplica las migraciones remotas con `npm run db:migrate:remote` y despliega con tu flujo habitual de GitHub/Cloudflare.

**No ejecutes `0044` manualmente con `wrangler d1 execute` si ya está registrado por el sistema de migraciones.** Las migraciones ya aplicadas no se deben editar ni repetir.

## Cómo registrar pagos en esta versión

Para mantenerlo hiper sencillo, la escuela usa los productos y pedidos normales de MinShop. Puedes crear en la tienda productos como “Inscripción escolar” y “Mensualidad escolar”. Después de confirmar que un pedido está pagado, abre **Alumnos y pagos** y registra:

- el correo que coincide con la cuenta del alumno;
- concepto `Inscripción` o `Mensualidad`;
- monto en centavos (por ejemplo, `$250.00 MXN` = `25000`);
- ID numérico del pedido MinShop, si aplica;
- fecha de vigencia final: seis meses para inscripción y un mes para mensualidad.

El panel no cobra, no marca pedidos como pagados y no crea suscripciones. Solo registra la vigencia después de que el administrador haya verificado el pedido. Esta es la alternativa mínima para no implementar webhooks o pagos recurrentes innecesarios.

## Diagnóstico y aprobación

La página `/escuela/diagnostico` captura área y respuestas abiertas. No asigna nivel automáticamente: el administrador determina el nivel recomendado, lo aprueba y asigna el curso. Esto evita fingir que existe un examen autoevaluado por materia cuando aún no se han creado preguntas/rúbricas para cada área. Más adelante pueden agregarse bancos de preguntas y calificación automática sin cambiar el modelo de pagos.

## LaTeX en lecciones

En `/admin/escuela`, escribe Markdown y delimitadores LaTeX, por ejemplo:

```markdown
# Factorización

Para todo $x \in \mathbb{R}$:

$$
x^2 - 1 = (x-1)(x+1)
$$
```

El servidor conserva `content_md` como fuente editable y guarda el HTML generado en `school_lessons.content_html`. MathJax dibuja las fórmulas en el lector. El HTML se genera en el servidor a partir del Markdown; no pegues HTML arbitrario directamente en la base de datos.

## Pruebas manuales mínimas

- Un alumno sin inscripción o mensualidad vigente no debe abrir una lección.
- Un alumno con pagos vigentes pero sin curso asignado no debe ver el catálogo de cursos.
- Un alumno asignado a Cálculo N0 no debe poder abrir una lección de Álgebra N0 escribiendo su URL.
- No se debe permitir una asignación a un curso de otra área o nivel distinto al aprobado.
- Un administrador puede registrar inscripción semestral y mensualidad por separado.
- Las fórmulas en LaTeX se renderizan en la vista previa y en el lector.

## Límites de este parche

- No crea una integración automática entre Stripe/pasarela y los pagos escolares; el registro de pago es manual tras verificar el pedido.
- El diagnóstico es de respuesta abierta y revisión humana, no un examen auto-calificado. La calificación previa queda registrada en la asignación como referencia para decidir si el alumno avanza; el sistema no promueve automáticamente de nivel.
- La fecha `Vigente hasta` la introduce el administrador: debe ser seis meses para inscripción y un mes para mensualidad.
- No borra las tablas/migraciones antiguas `school_subscriptions` ni `customer_subscriptions`; simplemente deja de depender de ellas para las páginas nuevas de la escuela.
- No he ejecutado una compilación completa de Astro en este entorno. El SQL de las migraciones se probó con SQLite; ejecuta `npm run check` y `npm run build` en tu proyecto antes de publicar y corrige cualquier incompatibilidad que reporten.
