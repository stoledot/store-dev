# Incorporación: programas, áreas, cursos y reenvíos

## Instalar

1. Haz una copia de seguridad de D1.
2. Extrae el ZIP en la raíz del proyecto, conservando las rutas.
3. Aplica `migrations/0060_school_multi_programs_and_access.sql` después de las migraciones actuales. La migración copia las áreas y diagnósticos existentes al nuevo modelo antes de que el código lo use.
4. Despliega el Worker y verifica el flujo con un alumno de prueba.

La migración crea los programas superiores Matemáticas y Lectura, asocia las áreas existentes con Matemáticas, agrega el límite de omisiones por curso y elimina la restricción de un curso activo por alumno. También guarda los diagnósticos por área y crea controles independientes para reenvíos de actividades.

## Comportamiento incluido

- Cada alumno puede marcar varias áreas y enviar un diagnóstico independiente para cada área.
- Los diagnósticos previos se conservan. Tras enviarlo, se bloquea otro intento; la administración puede habilitarlo en Administración de la escuela. Al aprobarlo, permanece bloqueado hasta que se vuelva a habilitar manualmente.
- La administración puede asignar varios cursos activos al mismo alumno, siempre que haya un diagnóstico aprobado cuyo nivel corresponda al área de cada curso. La asignación duplicada del mismo curso no se permite.
- Los cursos comprados siguen dando acceso de acuerdo con su pedido pagado y pueden aparecer junto con los cursos asignados.
- Al crear áreas se selecciona el programa superior. Los cursos y sus lecciones quedan organizados mediante su área y curso.
- El administrador establece cuántas actividades obligatorias se pueden omitir. El límite afecta el desbloqueo de unidades y el criterio de finalización.
- En Entregas y calificaciones, el administrador puede bloquear o permitir reenvíos por alumno y actividad. El primer envío siempre se admite; el bloqueo controla los intentos posteriores.
- “Mi escuela” ahora agrupa áreas, diagnósticos y todos los cursos en tarjetas compactas. El índice y los detalles secundarios de cada lección quedan plegados para reducir distracciones.

## Rutas incluidas

- Nueva: `migrations/0060_school_multi_programs_and_access.sql`
- Nueva: `src/pages/api/admin/escuela/control-reenvio.ts`
- Modificadas: `src/pages/escuela/diagnostico.astro`, `src/pages/escuela/mi-escuela/index.astro`, `src/pages/escuela/mi-escuela/calificaciones.astro`
- Modificadas: `src/pages/escuela/cursos/[curso]/[slug].astro`, `src/pages/escuela/cursos/[curso]/[leccion]4.astro`
- Modificadas: `src/pages/admin/escuela/administracion.astro`, `src/pages/admin/escuela/tex.astro`, `src/pages/admin/escuela/editar.astro`, `src/pages/admin/escuela/calificaciones.astro`
- Modificadas: `src/pages/api/escuela/cursos/[curso]/[slug].ts`, `src/pages/account/courses.astro`

## Límite conocido

El acceso de los cursos asignados conserva el requisito actual de inscripción y mensualidad vigentes. Las compras de curso se validan aparte con el pedido pagado y el vínculo `order_items.school_course_id`.
