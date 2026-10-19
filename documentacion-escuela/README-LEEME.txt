MINSHOP ESCUELA — PARCHE INCREMENTAL: EDICIÓN, VISTAS PREVIAS Y AVANCE

Este ZIP añade tres páginas. No incluye una migración nueva: reutiliza las tablas de las migraciones educativas 0040, 0041 y 0045.

ARCHIVOS Y DESTINOS
- pages/admin/escuela/editar.astro -> src/pages/admin/escuela/editar.astro
  Permite editar áreas de interés, cursos, lecciones, estado del diagnóstico y estado de asignación académica de alumnos. Incluye vistas previas renderizadas de áreas, cursos y lecciones.
- pages/admin/escuela/avance.astro -> src/pages/admin/escuela/avance.astro
  Panel administrativo de avance por alumno y curso.
- pages/escuela/mi-escuela/avance.astro -> src/pages/escuela/mi-escuela/avance.astro
  Panel del alumno para ver su propio avance y marcar las lecciones publicadas como completadas.

INSTALACIÓN
1. Haz commit/copia de seguridad antes de copiar.
2. Descomprime el ZIP y copia la carpeta `pages` dentro de `src/` de tu proyecto. Si tu estructura ya usa `src/pages`, conserva esa ruta. Los archivos de este ZIP están organizados como contenido de `src/`.
3. Verifica que las migraciones 0040_school_catalog.sql, 0041_school_progress.sql y 0045_school_monthly_model.sql ya se aplicaron en el entorno local. Si no existen las tablas school_lesson_progress y school_course_progress, no uses estas páginas hasta resolver las migraciones.
4. Ejecuta `npm run check`, `npm run build` y luego prueba con `npm run dev`.
5. Rutas de administración (protegidas por el middleware /admin de MinShop):
   - /admin/escuela/editar
   - /admin/escuela/avance
6. Ruta del alumno (requiere sesión verificada y curso asignado, inscripción y mensualidad vigentes):
   - /escuela/mi-escuela/avance
7. Cuando pase las pruebas locales, publica mediante tu flujo habitual de GitHub/Cloudflare. No apliques migraciones nuevas: este parche no añade ninguna.

ENLACES DE NAVEGACIÓN
Para tener enlaces visibles, añade en la página existente src/pages/escuela/mi-escuela/index.astro un enlace a `/escuela/mi-escuela/avance`, por ejemplo:
<a href="/escuela/mi-escuela/avance" class="mt-4 inline-flex rounded-lg border px-4 py-2 text-sm">Consultar mi avance</a>

En src/pages/admin/escuela/administracion.astro o en el encabezado del panel administrativo puedes añadir enlaces a `/admin/escuela/editar` y `/admin/escuela/avance`. Las páginas nuevas ya enlazan entre sí.

COMPORTAMIENTO Y SEGURIDAD
- La edición de administración usa las rutas /admin existentes, que el middleware de MinShop debe proteger. No publiques estas rutas si tu middleware local difiere del proyecto que compartiste.
- El email del alumno se obtiene de getCustomerEmail(Astro.cookies), nunca de un campo enviado por el navegador.
- La página de avance del alumno vuelve a validar que la lección pertenece al único curso activo del alumno y que inscripción y mensualidad estén vigentes antes de registrar el progreso.
- El HTML de lecciones se regenera en servidor desde Markdown con renderMarkdown (html arbitrario desactivado); MathJax muestra las fórmulas LaTeX en vistas previas.
- “Marcar completada” es un registro de lectura, no un examen ni una calificación automática. Las calificaciones se mantienen para evaluación administrativa.

IMPORTANTE
El ZIP se preparó como parche incremental a partir de los archivos compartidos y no modifica las migraciones ni reemplaza las páginas de creación existentes. Ejecuta `npm run check` y `npm run build` en tu checkout antes de desplegar; no se ha afirmado aquí que el build completo de tu repositorio haya sido ejecutado.
