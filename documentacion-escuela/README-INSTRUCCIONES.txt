MINSHOP - PÁGINAS DE CURSOS (PARCHE)

Archivos incluidos:
- migrations/0044_school_nivel0_seed.sql: crea el curso de ejemplo Nivel 0 y tres lecciones.
- pages/escuela/cursos/[curso]/[leccion].astro: plantilla de lección protegida por login y suscripción vigente.
- pages/escuela/mi-escuela/index.astro: dashboard actualizado para enlazar cada lección.

INSTALACIÓN
1. Haz una copia de seguridad/commit de tu proyecto antes de modificarlo.
2. Copia el contenido del ZIP conservando las rutas relativas dentro de la raíz del proyecto. El index.astro reemplaza el archivo existente e incluye el enlace a las lecciones.
3. Verifica que ya existen las migraciones 0040_school_catalog.sql, 0041_school_progress.sql y 0042_school_billing.sql, y que tu base de datos local las tiene aplicadas.
4. Ejecuta `npm run db:migrate` para aplicar la migración 0044 en local.
5. Ejecuta `npm run check` y `npm run build`.
6. Para probar, inicia `npm run dev`, entra como cliente y confirma que existe una suscripción vigente en `school_subscriptions` para ese correo. Abre `/escuela/mi-escuela/`, despliega el temario de Nivel 0 y abre una lección.
7. Solo después de probar, aplica migraciones remotas con `npm run db:migrate:remote` y despliega por tu flujo habitual conectado a GitHub/Cloudflare.

CÓMO CREAR OTRO CURSO
1. Crea una migración nueva con un número libre, por ejemplo `0045_school_otro_curso.sql`. No edites migraciones ya aplicadas.
2. Inserta una fila en `school_courses`: `id` único, `slug` URL-safe, `title`, `summary`, `sequence_no` único y `status='published'`.
3. Inserta una fila por lección en `school_lessons`: `id` único, `course_id` igual al id del curso, `slug` único dentro del curso, `title`, `summary`, `content_md` en Markdown, `sequence_no` único dentro del curso, `lesson_type='reading'` y `status='published'`.
4. Usa `required_to_complete=1` para las lecciones necesarias para completar el curso y `0` para complementarias.
5. Aplica la migración local, prueba las rutas `/escuela/cursos/SLUG-CURSO/SLUG-LECCION` y luego aplica la migración remota.

FORMATO DE CONTENIDO
- Encabezados Markdown: `## Título`
- Negritas: `**texto**`
- Listas: `- elemento`
- Código matemático: por ahora usa texto/código en línea como `p ∧ q`. Esta plantilla no añade un motor LaTeX/MathJax.

IMPORTANTE
- El acceso sigue el modelo ya presente en el proyecto: suscripción vigente en `school_subscriptions`. No concede acceso por una compra individual de producto.
- El contenido se almacena en D1; no hace falta crear una página Astro por lección.
- La plantilla marca lecciones completadas y actualiza el progreso del curso. El contenido HTML incrustado en Markdown está deshabilitado.
