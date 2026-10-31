# Checklist de inscripción — implementación

## Archivos incluidos

- `src/pages/index.astro`: checklist en la portada y CTA de inscripción.
- `src/components/school/EnrollmentChecklist.astro`: interfaz reutilizable, progreso y palomitas verdes.
- `src/features/school/enrollmentChecklist.ts`: obtiene el estado desde D1; no confía en datos del navegador.
- `src/pages/account/profile.astro`: checklist al inicio del perfil.
- `src/pages/programas/matematicas.astro` y `lectura.astro`: registran visitas de alumnos autenticados y sustituyen el CTA.
- `src/pages/account/login.astro`, `src/pages/account/verify.astro`, `src/features/auth/customer.ts`: conservan el destino de inscripción al iniciar sesión mediante enlace mágico.
- `src/pages/escuela/diagnostico.astro`: al pedir login conserva el destino del diagnóstico.
- `src/pages/escuela/cursos/[curso]/[slug].astro`: registra el inicio del curso al abrir una lección autorizada, después de validar el desbloqueo secuencial.
- `src/pages/preguntas-frecuentes.astro` y `src/pages/agendar-cita.astro`: actualizan el texto y redirigen la antigua ruta.
- `migrations/0057_school_program_views.sql`: tabla para registrar la visita a los programas.

## Cómo se calcula cada palomita

1. **Iniciar sesión:** sesión de cliente verificada.
2. **Conocer los programas:** el alumno autenticado visita matemáticas o lectura; basta con uno. Se registra en D1.
3. **Enviar diagnóstico:** existe una solicitud con respuestas y fecha de envío.
4. **Pagar inscripción:** existe un registro de pago `enrollment` en `school_fee_payments`.
5. **Pagar mensualidad:** existe un registro `monthly` vigente.
6. **Iniciar curso asignado:** existe un curso asignado y `school_course_progress.started_at` se establece al abrir una lección permitida.

La portada y el perfil calculan el checklist en cada petición, por lo que el estado se actualiza al volver a esas páginas. No hay un checkbox editable por el alumno.

## Migración

El proyecto contiene las migraciones `0001` a `0056` (hay prefijos repetidos `0033` y `0053` con nombres distintos). Esta implementación agrega **`0057_school_program_views.sql`**. La probé en SQLite después de ejecutar en orden alfabético las 59 migraciones SQL que venían en el ZIP: todas se aplicaron correctamente y la nueva tabla quedó creada.

Antes de producción, compara el historial real de D1; el ZIP no permite consultar el estado remoto de Cloudflare:

```bash
npx wrangler d1 migrations list minshop-db --remote
npx wrangler d1 migrations apply minshop-db --remote
```

Para local:

```bash
npx wrangler d1 migrations apply minshop-db --local
```

No ejecutes manualmente migraciones antiguas ni cambies sus nombres si ya están aplicadas. En particular, `0055_school_student_journey.sql` contiene `ALTER TABLE ... ADD COLUMN` sin guardas de columna y no debe repetirse manualmente.

## Diagnóstico y límites encontrados

- **Pagos:** el modelo actual registra los pagos escolares en `school_fee_payments` desde el panel administrativo (`/admin/escuela/administracion`). El propio formulario indica que se debe verificar primero el pedido MinShop. No encontré una integración que inserte automáticamente esos pagos escolares desde el webhook de Stripe. Por eso las palomitas de inscripción y mensualidad se activan cuando la administración registra el pago; no se simula una confirmación de Stripe.
- **Productos de pago:** los pasos de pago llevan al catálogo `/products`. El esquema no define en estas migraciones un producto obligatorio dedicado a inscripción y otro a mensualidad. Verifica que existan y estén publicados, o cambia los enlaces por las páginas reales de checkout.
- **Programa visto:** solo se registra si el alumno ya inició sesión al abrir la página. Si la visita ocurre antes de iniciar sesión, tendrá que volver a abrir uno de los programas para que quede registrada.
- **Inicio del curso:** se registra al abrir una lección que el servidor ya autorizó y que no está bloqueada por la secuencia. El acceso sigue dependiendo de las reglas actuales de asignación y pagos.
- **Acceso y retorno:** el enlace mágico ahora admite únicamente destinos internos permitidos (`/account/profile` y `/escuela/diagnostico`); cualquier otro destino cae en `/account`.
- **Migraciones con prefijo repetido:** existen dos archivos `0033_*` y dos `0053_*`. SQLite los aplicó bien ordenados por nombre en la prueba local; conserva los nombres exactos y comprueba el historial remoto antes de desplegar.
- **Verificación de build:** el ZIP recibido no contenía `node_modules`; por ello no pude ejecutar `astro check`, Vitest ni `astro build`. No afirmo que el build esté validado. Ejecuta después de instalar dependencias:

```bash
npm ci
npm run check
npm test
npm run build
```

## Revisión manual recomendada antes de publicar

1. Probar alumno nuevo: CTA → login → enlace mágico → perfil.
2. Abrir matemáticas y volver al perfil; debe marcarse el segundo paso. Repetir con lectura en otra cuenta.
3. Enviar diagnóstico y comprobar el tercer paso.
4. Registrar en administración un pago de inscripción y otro de mensualidad; comprobar ambas palomitas.
5. Asignar curso, confirmar ambos pagos vigentes y abrir la primera lección; comprobar el último paso.
6. Probar sesión caducada, pagos vencidos, curso suspendido, curso sin lecciones publicadas y navegación directa a una lección bloqueada.

No se incluyen `.dev.vars`, credenciales, `.git`, `node_modules` ni archivos no modificados.
