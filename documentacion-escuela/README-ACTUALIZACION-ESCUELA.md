# Actualización de `/escuela`

Este paquete actualiza la página pública `/escuela` con información de la escuela, el modelo de aprendizaje, los programas de matemáticas y lectura, el catálogo académico publicado y el checklist de inscripción.

## Archivos incluidos

- `src/pages/escuela/index.astro`: nueva página informativa de la escuela. Muestra el checklist únicamente mientras exista al menos un paso pendiente; cuando los seis pasos están completos, lo oculta.
- `src/features/school/enrollmentChecklist.ts`: cálculo del checklist con el orden solicitado: iniciar sesión, conocer los programas, pagar inscripción, pagar mensualidad, enviar diagnóstico e iniciar curso asignado.
- `src/components/school/EnrollmentChecklist.astro`: componente visual reutilizable del checklist y su progreso.
- `src/pages/programas/matematicas.astro` y `src/pages/programas/lectura.astro`: registran la visita del alumno autenticado para que el segundo paso se complete automáticamente; también actualizan el CTA antiguo.
- `migrations/0057_school_program_views.sql`: tabla para guardar la visita a los programas.

## Instalación

1. Haz una copia de seguridad de tu proyecto.
2. Extrae el ZIP en la raíz del proyecto y permite sobrescribir los archivos indicados.
3. Comprueba el historial de migraciones:

   ```bash
   npx wrangler d1 migrations list minshop-db --remote
   ```

4. Si `0057_school_program_views.sql` aparece pendiente, aplícala:

   ```bash
   npx wrangler d1 migrations apply minshop-db --remote
   ```

   Para desarrollo local, usa `npx wrangler d1 migrations apply minshop-db --local`.

5. Ejecuta `npm run check`, `npm test` y `npm run build`.

## Notas

- No se crea una migración duplicada si `0057` ya aparece aplicada; no vuelvas a ejecutarla manualmente con `wrangler d1 execute`.
- Las áreas y cursos se leen del catálogo `school_areas` y `school_courses`; se muestran los que estén activos/publicados. Si aún no hay áreas publicadas, la página muestra un mensaje informativo en lugar de una sección vacía.
- El checklist se calcula en el servidor a partir de la sesión y los registros de D1. Las visitas a los programas se guardan cuando el alumno ya inició sesión.
- Este paquete no cambia las reglas de acceso al diagnóstico ni la integración de pagos.
