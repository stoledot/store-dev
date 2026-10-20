# MinShop — evaluaciones, entregas, calificación y orden de lecciones

Este parche añade la mínima capa académica para configurar actividades, recibir entregas, revisarlas y calcular un promedio ponderado. Reutiliza Astro, D1, la sesión administrativa existente y el bucket R2 privado `FILES` que ya aparece en el `wrangler.jsonc` del proyecto compartido. No añade paquetes npm.

## Qué incluye

- Reordenación de lecciones en dos fases: primero asigna secuencias temporales positivas fuera del rango actual y luego normaliza a `1..N`, dentro de `DB.batch`. Así no colisiona con `UNIQUE(course_id, sequence_no)` ni con `CHECK(sequence_no >= 1)`.
- Configuración por lección de preguntas de opción múltiple, respuesta corta, respuesta larga y/o envío de archivo.
- Peso de calificación por lección (predeterminado `1`, válido `(0, 1000]`).
- Envíos de archivos privados en el bucket R2 `FILES`, límite de 10 MB, con tipos permitidos PDF, PNG, JPG, WEBP, TXT y DOCX. Los archivos no se hacen públicos.
- Bandeja administrativa para revisar respuestas, descargar archivos, guardar una nota de 0 a 100 y retroalimentación.
- Vista del alumno con calificación y comentarios, y página de promedio ponderado.
- Las APIs administrativas verifican la sesión de administrador de MinShop o la identidad `locals.adminEmail` establecida por el middleware de Cloudflare Access.

Las respuestas son calificadas manualmente. La opción múltiple no se autocorrige en esta versión; sirve para presentar y guardar la elección del alumno. Esto mantiene la implementación sencilla y deja la decisión académica al docente.

## Archivos del ZIP y destinos

Copia las carpetas del parche a la raíz que contiene `pages/`, `features/` y `migrations/` en tu proyecto. Si tu repositorio coloca esos directorios dentro de `src/`, antepón `src/` a las rutas. No copies la carpeta contenedora del ZIP como una subcarpeta nueva dentro del proyecto.

- `migrations/0047_school_assessment_grading.sql` — nuevas columnas de preguntas, peso, nota, retroalimentación y archivo.
- `features/school/adminApiAuth.ts` — comprobación administrativa para las APIs.
- `pages/admin/escuela/evaluaciones.astro` — editor de preguntas y pesos.
- `pages/admin/escuela/orden-lecciones.astro` — interfaz para ordenar lecciones.
- `pages/admin/escuela/calificaciones.astro` — bandeja de entregas y calificación.
- `pages/api/admin/escuela/reordenar-lecciones.ts` — endpoint de reordenación sin colisiones.
- `pages/api/admin/escuela/calificar-entrega.ts` — endpoint de calificación/retroalimentación.
- `pages/api/admin/escuela/entregas/[id]/archivo.ts` — descarga protegida de archivo del alumno.
- `pages/api/escuela/cursos/[curso]/[slug].ts` — endpoint de lectura/entrega actualizado.
- `pages/escuela/cursos/[curso]/[slug].astro` — lección con formulario según el tipo de pregunta.
- `pages/escuela/mi-escuela/calificaciones.astro` — calificaciones y promedio del alumno.

El archivo dinámico anterior `[leccion].astro`, si todavía existe, no se debe duplicar con `[slug].astro` en la misma carpeta. En este parche se usa `[slug].astro` porque corresponde a la ruta que se está implementando.

## Migraciones y prueba local

1. Haz commit o copia de seguridad.
2. Comprueba en `wrangler d1 migrations list` (y en el registro de migraciones local) que las migraciones educativas `0040`–`0046` estén aplicadas y que la tabla `school_lesson_progress` ya tenga `student_response` y `submission_at`.
3. Si `0047_school_assessment_grading.sql` ya está registrada en algún entorno, **no la vuelvas a ejecutar**. Si el número `0047` ya se utilizó para otra migración, renombra esta migración al siguiente número libre antes de aplicarla.
4. Ejecuta localmente:

   ```bash
   npm run db:migrate
   npm run check
   npm run build
   npm run dev
   ```

5. Inicia sesión como administrador y abre:
   - `/admin/escuela/evaluaciones` — configura preguntas y pesos.
   - `/admin/escuela/orden-lecciones?curso=ID_DEL_CURSO` — cambia el orden de las lecciones.
   - `/admin/escuela/calificaciones` — revisa entregas y califica.
6. Inicia sesión como alumno con asignación y pagos vigentes; abre su lección y prueba los distintos tipos de pregunta. Después revisa `/escuela/mi-escuela/calificaciones`.
7. Solo después de probar en local, aplica la migración remota y despliega el código.

## Cómo se calcula el promedio

Solo participan las lecciones que tengan una entrega (`submission_at IS NOT NULL`) y una nota (`grade IS NOT NULL`). Para cada una se utiliza su peso `w`:

`promedio = SUM(calificación × peso) / SUM(peso)`

Por ejemplo, notas `80` con peso `1` y `90` con peso `2` dan `(80×1 + 90×2)/(1+2) = 86.67`. Las entregas pendientes de calificar no cuentan en el numerador ni en el denominador. Las calificaciones son porcentajes de `0` a `100`.

## Seguridad y límites

- La autorización del alumno se vuelve a comprobar en servidor con sesión verificada, curso asignado y pagos vigentes. No se acepta el correo del alumno desde el navegador.
- Los endpoints administrativos verifican la sesión firmada `admin_session` o el correo administrativo que el middleware ya haya validado con Cloudflare Access.
- El bucket `FILES` debe permanecer privado; no actives acceso público para las entregas.
- El envío de archivos está limitado a 10 MB y a los formatos enumerados. No se ejecutan ni se muestran directamente archivos subidos.
- Las preguntas y sus opciones se guardan en `school_lessons.assessment_json`; las respuestas del alumno se guardan en `school_lesson_progress.student_response` como JSON.
- Una nueva entrega elimina la calificación anterior y su retroalimentación para evitar que una respuesta modificada conserve una nota vieja. Si reemplaza un archivo, se intenta borrar el anterior del bucket.
- Esta versión no califica automáticamente preguntas de opción múltiple ni gestiona rúbricas. La revisión es manual.

No se ha afirmado que `npm run check` o `npm run build` pasen: ejecuta esos comandos en tu repositorio, porque el ZIP original no incluía todo el árbol de trabajo y no se pudo hacer una compilación integral aquí.
