# Consistencia entre cursos TeX y avance del alumno

## Qué cambia

- Cada guardado del contenido TeX crea una revisión inmutable del archivo fuente en `school-tex/<curso>/versions/<versión>/source.tex`.
- `school_course_revisions` conserva la versión, la clave del archivo, el hash SHA-256 y la fecha de guardado.
- `school_lesson_revisions` conserva una instantánea de cada versión de una actividad.
- `school_lessons.content_hash` permite distinguir una actividad cuyo contenido no cambió de una que sí cambió.
- Las actividades que desaparecen del `.tex` se archivan; no se borran. Las entregas y el progreso existentes permanecen ligados a su `lesson_id`.
- Las actividades que conservan su identidad conservan su `lesson_id`, así que también conservan las filas de `school_lesson_progress`.
- Al guardar el curso se recalcula el estado general del curso de cada alumno. Si se agrega una nueva actividad obligatoria pendiente, el curso deja de figurar como completado, pero no se borra el trabajo previo.
- El área de cursos del alumno ahora muestra progreso, siguiente paso y enlaces más claros; la vista de unidad separa contenido, entrega, navegación y ayuda.

## Regla esencial para editar los archivos `.tex`

Asigna un `id` permanente a cada lectura o actividad. No cambies ese ID solo porque cambie el título, el orden o el texto de las instrucciones.

```tex
\begin{lesson}[id=limites-introduccion,weight=0]
Contenido de la lectura...
\end{lesson}

\begin{activity}[id=limites-ejercicio-01,type=short,weight=1]
Resuelve el ejercicio...
\end{activity}
```

### Cómo decidir los IDs

- **Mismo objetivo y misma actividad:** conserva el ID. Corregir una errata, mejorar una explicación o mover la actividad no reinicia el avance.
- **Actividad nueva:** asigna un ID nuevo. Aparecerá como pendiente para los alumnos actuales y nuevos. Si cambias el ID de una actividad que ya existía, el sistema la trata como una actividad nueva; la anterior queda archivada.
- **Actividad reemplazada por otra sustancialmente diferente:** asigna un ID nuevo a la actividad nueva. La anterior queda archivada y su historial no se elimina.
- **Actividad retirada:** quítala del `.tex`; se archiva y deja de contar en el total de actividades publicadas, pero su historial se conserva.
- **Evita repetir IDs dentro de un mismo archivo.**

Si una actividad antigua no tenía un ID explícito, el sistema intenta conservarla mediante su ID anterior, su slug o la combinación de título y tipo. Esta compatibilidad ayuda a las migraciones iniciales, pero para futuras actualizaciones se recomienda declarar IDs explícitos y estables.

## Qué significa “conservar el avance”

El avance se vincula a la identidad de una actividad, no a su número de posición en el documento. Por eso insertar una actividad entre dos existentes no debería desplazar ni mezclar sus entregas. Si la actividad existente mantiene su ID, se mantiene su estado. Si el trabajo cambia lo suficiente como para requerir una nueva entrega, debe usarse otro ID para que no se considere completada por error.

Las versiones anteriores del TeX se conservan en el bucket privado `FILES`. No se elimina ni se sobrescribe la clave de una versión anterior. La columna `school_courses.tex_source_key` apunta a la versión activa.

## Instalación

1. Haz una copia de seguridad de D1 y del bucket privado `FILES` antes de actualizar el proyecto.
2. Copia los archivos del ZIP a la raíz del proyecto, respetando sus rutas.
3. Ejecuta primero la migración en la base local:

   ```bash
   npm run db:migrate
   ```

4. Ejecuta las comprobaciones:

   ```bash
   npm run check
   npm test
   npm run build
   ```

5. Prueba la edición de un curso con un alumno de prueba: completa una lectura, guarda el `.tex` sin cambios, añade una actividad con un ID nuevo y vuelve a guardar. La lectura debe seguir completada y la actividad nueva debe quedar pendiente.
6. Cuando confirmes el comportamiento en local, aplica la migración remota con `npm run db:migrate:remote` y despliega por tu flujo normal.

No ejecutes la migración remota sin revisar antes que la copia de seguridad esté disponible.
