# Editor de cursos y lecciones para MinShop

Este paquete añade un editor administrativo mínimo para cursos de la Escuela de Matemáticas. Reutiliza Astro, D1, la sesión administrativa existente y `markdown-it`, que ya está en las dependencias del proyecto. No requiere instalar paquetes npm nuevos.

## Qué agrega

- `/admin/escuela`: crear cursos y lecciones; ver listados; elegir estado borrador/publicado.
- `/api/admin/escuela/preview`: genera vista previa del contenido.
- `/escuela/cursos/[curso]/[leccion]`: lector de lecciones con navegación anterior/siguiente y MathJax.
- `migrations/0044_school_lesson_html.sql`: añade `content_html` a `school_lessons`.
- Enlace «Escuela» en la navegación administrativa.
- Enlaces de cada lección desde `/escuela/mi-escuela`.

## Dónde copiar los archivos

Copia las carpetas/archivos del ZIP sobre la raíz del repositorio MinShop, conservando las rutas:

- `layouts/AdminLayout.astro`
- `migrations/0044_school_lesson_html.sql`
- `pages/admin/escuela/index.astro`
- `pages/api/admin/escuela/preview.ts`
- `pages/escuela/cursos/[curso]/[leccion].astro`
- `pages/escuela/mi-escuela/index.astro`

El README del ZIP también se puede copiar a la raíz del proyecto.

## Cómo funciona el contenido matemático

El campo de edición acepta Markdown y LaTeX. Ejemplos:

- En línea: `La negación se escribe $\\neg p$.`
- En bloque: `$$\\forall x \\in A,\\; P(x)$$`
- Encabezados Markdown: `#`, `##`, `###`; listas con `-` o `1.`; negritas con `**texto**`.

El servidor convierte el Markdown a HTML con el renderizador ya existente de MinShop, configurado con `html: false`. En la tabla `school_lessons` conserva el Markdown editable en `content_md` y guarda el HTML generado en `content_html`. El HTML no se recibe directamente del navegador; esto evita que una etiqueta `<script>` escrita en el editor se ejecute. MathJax renderiza los delimitadores LaTeX en la vista previa y en la lectura.

MathJax se carga desde jsDelivr (CDN), por lo que la vista de fórmulas necesita conexión a Internet. Si más adelante quieres no depender del CDN, se puede empaquetar MathJax localmente.

## Migraciones y pruebas

1. Haz un commit o copia de seguridad antes de copiar archivos.
2. Verifica que las migraciones `0040_school_catalog.sql`, `0041_school_progress.sql`, `0042_school_billing.sql` y `0043_create_customer_subscriptions.sql` ya estén aplicadas al entorno local.
3. En la raíz de MinShop, ejecuta:

   ```bash
   npm run db:migrate
   npm run check
   npm run build
   ```

4. Inicia el entorno local con `npm run dev` e inicia sesión en el administrador.
5. Abre `http://localhost:4321/admin/escuela`, crea un curso en borrador, luego una lección con una fórmula, y prueba la vista previa.
6. Para verla en el área del alumno, publica tanto el curso como la lección y entra con una cuenta que tenga una suscripción vigente.
7. Después de validar localmente, despliega primero la migración D1 remota y luego el código, siguiendo el procedimiento normal de tu proyecto.

No ejecutes la migración 0044 en producción antes de revisar que los entornos anteriores tengan la tabla `school_lessons`. No edites migraciones ya aplicadas: este paquete añade una migración nueva.

## Seguridad y límites de esta primera versión

- Las rutas `/admin/*` y `/api/admin/*` deben seguir protegidas por el middleware administrativo de MinShop; no las publiques sin esa protección.
- La ruta de lectura verifica en servidor la sesión del cliente y la suscripción vigente.
- Esta versión permite crear cursos y lecciones, pero no editar ni eliminar registros existentes desde la interfaz. La edición de contenido puede agregarse después reutilizando el mismo formulario.
- El lector usa el campo `content_html` generado por el renderizador de Markdown de confianza. No rellenes ese campo con HTML arbitrario mediante SQL o endpoints externos.
- No se añadió una biblioteca de editor WYSIWYG externa: se usa un textarea robusto y Markdown, con vista previa HTML y renderizado matemático. Es más sencillo de desplegar en Cloudflare Workers y mantiene las dependencias existentes. Si necesitas edición visual tipo Word, el siguiente paso sería integrar un editor como TipTap con una extensión matemática, pero habría que evaluar y probar su compatibilidad con el bundle de Astro.
