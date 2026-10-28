# Biblioteca de textos matemáticos LaTeX para Minshop

## Qué incluye

- Panel `Admin → Products → Textos matemáticos` en `/admin/textos-matematicos` para crear, subir, editar y eliminar textos `.tex`.
- Selector para vincular un texto con un producto, tanto al crearlo como al editarlo.
- Al confirmar la compra, el artículo del pedido guarda una copia del título y del código fuente adquirido. Los cambios posteriores al producto o la eliminación del texto de la biblioteca no borran esa copia.
- En el pedido del cliente aparece la sección **Lecturas matemáticas** y el enlace privado para abrir el lector.
- Lector con índice lateral generado a partir de `\chapter`, `\section`, `\subsection` y `\subsubsection`; admite párrafos, listas `itemize`/`enumerate`, negritas, cursivas y fórmulas delimitadas por `$...$`, `$$...$$`, `\(...\)` o `\[...\]`.
- El contenido HTML de los archivos se escapa antes de mostrarse. MathJax se carga desde CDN para renderizar las fórmulas.

## Instalación

1. Haz una copia de seguridad de tu base D1 antes de migrar.
2. Copia cada archivo de este ZIP sobre la raíz de tu repositorio Minshop, respetando las rutas. No reemplaces el proyecto completo.
3. Aplica la migración local:

   ```bash
   npm run db:migrate
   ```

4. Prueba la tienda y el panel en local:

   ```bash
   npm run dev
   ```

5. Cuando verifiques el flujo, aplica la migración a la base D1 remota:

   ```bash
   npm run db:migrate:remote
   ```

6. Despliega tu aplicación con el procedimiento habitual de tu proyecto.
7. Entra a **Admin → Products → Textos matemáticos**, sube un `.tex`, y luego abre o crea un producto para elegir el texto en el campo **Texto matemático (.tex)**.
8. Realiza una compra de prueba y abre el pedido desde su enlace de confirmación para comprobar que aparezca **Leer texto**.

## Límites actuales del lector

Este lector no compila un proyecto LaTeX completo. No procesa paquetes personalizados, bibliografías, imágenes, TikZ, tablas complejas ni macros definidas por el autor. Está pensado para material didáctico estructurado con secciones, texto, listas y matemáticas comunes. Los archivos están limitados a 500 KB.

## Archivos añadidos

- `migrations/0052_math_text_library.sql`
- `src/features/mathTexts/db.ts`
- `src/features/mathTexts/render.ts`
- `src/features/mathTexts/render.test.ts`
- `src/pages/admin/textos-matematicos/index.astro`
- `src/pages/api/admin/math-texts.ts`
- `src/pages/order/[token]/text/[itemPublicId].astro`

## Archivos modificados

- `src/features/orders/db.ts`
- `src/features/products/ProductForm.astro`
- `src/pages/admin/products/index.astro`
- `src/pages/admin/products/new.astro`
- `src/pages/admin/products/[id]/edit.astro`
- `src/pages/api/admin/products.ts`
- `src/pages/api/admin/products/[id].ts`
- `src/pages/order/[token].astro`

## Validación realizada

La migración SQL se ejecutó correctamente sobre una copia de la base D1 local incluida en el archivo del proyecto. También se probó el renderer con ejemplos de secciones, fórmulas y contenido HTML potencialmente peligroso. No se pudo completar `astro check` porque la instalación de dependencias (`npm ci`) agotó el tiempo disponible en el entorno; ejecuta `npm run check` y `npm run build` en tu entorno de desarrollo antes de desplegar.
