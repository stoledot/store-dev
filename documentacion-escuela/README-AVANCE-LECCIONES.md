# MinShop Escuela: completar lecturas y entregar actividades

Este parche separa la página de lectura (`.astro`) de su endpoint (`/api/...`) y añade el almacenamiento mínimo para respuestas de actividades.

## Archivos incluidos

- `pages/escuela/cursos/[curso]/[slug].astro`: página del alumno. Conserva la comprobación de curso asignado, estado publicado y vigencia de inscripción/mensualidad. Las lecturas se marcan automáticamente como completadas al abrir la página. Las lecciones `quiz`, `exercise` y `assignment` muestran un formulario para enviar una respuesta o procedimiento.
- `pages/api/escuela/cursos/[curso]/[slug].ts`: endpoint POST que obtiene la identidad desde la sesión verificada, vuelve a validar la asignación y los pagos, y registra el avance. No acepta el correo del alumno desde el navegador.
- `migrations/0046_school_lesson_submission.sql`: agrega `student_response` y `submission_at` a `school_lesson_progress`.

## Dónde copiarlo

Copia las carpetas `pages` y `migrations` de este paquete a la raíz de tu proyecto MinShop, donde ya existen esas carpetas junto a `features/` y `layouts/`. No las coloques dentro de `src/` en este repositorio.

### Importante sobre el nombre dinámico de la ruta

El ZIP incluye la ruta solicitada `[slug].astro`. En el parche anterior, la ruta se llamaba `[leccion].astro`. **No dejes ambos archivos en la misma carpeta**, porque Astro puede reportar una ruta dinámica duplicada. Si ya tienes `pages/escuela/cursos/[curso]/[leccion].astro`, reemplázala/renómbrala a `[slug].astro` y conserva una sola de las dos. La URL pública no cambia: `/escuela/cursos/:curso/:slug`.

El endpoint incluido usa la URL `/api/escuela/cursos/:curso/:slug` y debe copiarse a `pages/api/escuela/cursos/[curso]/[slug].ts`.

## Migración

La migración supone que ya aplicaste las migraciones educativas `0040_school_catalog.sql`, `0041_school_progress.sql` y el modelo de escuela `0045_school_monthly_model.sql`, además de la migración previa `0044_school_lesson_html.sql` que agrega `content_html`.

Si todavía no has aplicado `0046_school_lesson_submission.sql`, ejecuta en local:

```bash
npm run db:migrate
npm run check
npm run build
```

No vuelvas a editar ni ejecutar manualmente una migración que ya figure aplicada. Si tu proyecto usa una carpeta de migraciones distinta, conserva la ruta real del repositorio.

Después de probar localmente, aplica la migración remota con el procedimiento habitual de MinShop:

```bash
npm run db:migrate:remote
```

Despliega solo después de confirmar que el build funciona y que la migración está aplicada en el entorno de destino.

## Cómo funciona

- **Lectura (`lesson_type = 'reading'`)**: al cargar la página, el navegador envía `action: "read"`. El servidor verifica sesión, curso asignado, publicación y vigencia de pagos antes de marcar la lección como completada.
- **Actividad, ejercicio o tarea (`quiz`, `exercise`, `assignment`)**: el alumno debe enviar una respuesta de al menos cinco caracteres. Se guarda el texto, fecha de entrega, número de intento y estado completado. No se permite completar estas lecciones enviando la acción de lectura.
- **Avance general**: el endpoint actualiza `school_course_progress` según cuántas lecciones obligatorias publicadas están completadas.
- **Seguridad**: la identidad procede de `getCustomerEmail(cookies)`, no de un campo de formulario. El endpoint revalida la asignación y los pagos. El contenido del alumno se trata como texto y no se renderiza como HTML.

## Límite funcional de esta versión

La entrega de una actividad significa **“el alumno envió su respuesta”**, no “la respuesta es correcta”. El administrador todavía debe revisar y calificar la respuesta; no hay calificación automática ni adjuntos de archivos en este parche. Para marcar una lección como lectura, el cliente debe tener JavaScript habilitado.

## Prueba manual

1. Inicia sesión como alumno con una asignación activa, inscripción vigente y mensualidad vigente.
2. Abre una lección publicada de tipo `reading`: su estado debe cambiar a “Lección completada”.
3. Abre una lección `exercise`, `quiz` o `assignment`: no debe completarse hasta enviar una respuesta.
4. Envía una respuesta de menos de cinco caracteres: el endpoint debe rechazarla.
5. Envía una respuesta válida: debe guardarse en `school_lesson_progress.student_response` y actualizarse el avance general.
6. Prueba sin sesión, con pagos vencidos y con una ruta de otro curso: la API debe rechazar el acceso.
