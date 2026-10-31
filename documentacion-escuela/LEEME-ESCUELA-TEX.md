# Implementación alternativa: escuela y lecturas matemáticas desde TeX

Esta alternativa reutiliza las tablas escolares existentes (`school_courses`, `school_lessons`, `school_course_progress` y `school_lesson_progress`). **No crea tablas duplicadas para cursos, lecciones, inscripciones ni progreso.** La migración añade referencias de archivo/producto y metadatos de actividad; la única tabla nueva es `school_notifications` para retroalimentación académica.

## Antes de instalar

- Haz una copia de seguridad de D1 y del bucket R2.
- No apliques la migración de la implementación independiente anterior (`0053_academy_tex_courses.sql`); esta versión usa `0052_school_tex_source.sql`.
- El proyecto ya declara `FILES` como binding R2 privado. Comprueba que está configurado en local y Cloudflare.

## Instalar y probar

1. Descomprime el ZIP en la raíz del repositorio y combina las rutas. No reemplaces el proyecto completo.
2. Ejecuta `npm run db:migrate`.
3. Ejecuta `npm run check`, `npm test` y `npm run build`.
4. En `/admin/escuela/tex`, crea un curso o una lectura y carga el ejemplo `examples/curso-tex-demo.tex`.
5. Publica el contenido y vincúlalo con un producto. Puedes asociarlo desde el editor del curso o desde Admin → Products, en “Curso o lectura matemática”.
6. Prueba una compra de demostración que termine con estado `paid`, entra a `/account` y verifica el acceso.
7. Prueba una lectura, una respuesta breve, una opción múltiple y una entrega de archivo. Revisa la entrega en `/admin/escuela/calificaciones`, califica y verifica `/account/notificaciones`.
8. Tras las pruebas y una copia de seguridad, ejecuta `npm run db:migrate:remote` y despliega.

## Cómo funciona

- El `.tex` original se guarda en R2 privado. El contenido completo no se duplica en D1; `school_lessons` conserva únicamente identificadores, títulos, orden, pesos, fechas, tipo de actividad y configuración mínima de respuestas.
- Los nodos de contenido se sincronizan en `school_lessons`; el avance y las respuestas usan `school_lesson_progress`, y el resumen de curso usa `school_course_progress`.
- El acceso a contenido vendido se comprueba con `orders` pagadas sin reembolso total y el campo `order_items.school_course_id`, que conserva el contenido asociado al momento de la compra. No se crea una tabla paralela de inscripciones.
- Para que las correcciones mantengan el progreso, asigna un `id=` explícito y estable a cada entorno. Guardar el archivo actualiza el contenido que ven los alumnos al recargarlo, pero no elimina entregas ni calificaciones. Las unidades quitadas se archivan.
- Las calificaciones nuevas de unidades TeX se capturan en escala 0–10 en la interfaz y se guardan como 0–100 internamente para respetar el esquema existente. La calificación provisional ponderada considera como cero las actividades aún no calificadas.
- El parser procesa un subconjunto didáctico de LaTeX. No compila paquetes, macros arbitrarias ni TikZ. El HTML personalizado está filtrado; no admite scripts, iframes ni formularios.

## Archivos incluidos

Consulta `ARCHIVOS-INCLUIDOS.txt` para la lista completa de rutas modificadas y nuevas.
