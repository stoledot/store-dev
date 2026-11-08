# Sustitución del renderizador MathJax por LaTeX.js

## Incorporación

1. Copia los archivos incluidos en el ZIP conservando sus rutas relativas a la raíz del proyecto.
2. No hace falta instalar un paquete npm ni ejecutar una migración. El módulo del navegador importa LaTeX.js 0.12.6 desde jsDelivr.
3. Publica/reinicia la aplicación y recarga las páginas. El renderer compartido se carga desde los diseños de tienda y administración.

## Qué cambia

- Las páginas que cargaban MathJax pasan al renderer común LaTeX.js.
- Las fórmulas delimitadas por `$...$`, `$$...$$`, `\(...\)` y `\[...\]` se convierten desde los textos de contenido.
- Los bloques `<content>` del XML se recorren respetando su HTML y los fragmentos TeX, incluidos entornos como `itemize` y `enumerate`, se procesan con LaTeX.js.
- Las listas TeX de la biblioteca antigua se delegan a LaTeX.js en vez de convertirse manualmente.
- Las vistas previas de administración y la práctica en vivo usan el mismo parser.
- El editor del alumno envuelve automáticamente el fragmento en un documento LaTeX mínimo cuando no incluye `\begin{document}`; si ya se incluye, se conserva y se agrega el cierre faltante.
- El XML con lecciones compuestas conserva los cambios para guardar y mostrar los bloques de la lección en orden.

## Límites que debes considerar

LaTeX.js traduce LaTeX a HTML y admite muchos entornos habituales, pero no es un motor TeX completo: no carga paquetes arbitrarios de LaTeX ni implementa todas las macros. Si un documento depende de macros personalizadas o paquetes que no estén implementados, habrá que añadirlas o adaptar ese contenido. La aplicación necesita que el navegador pueda descargar los módulos, estilos y fuentes de `cdn.jsdelivr.net`.

## Rutas incluidas

- `public/js/latex-renderer.js`
- `src/layouts/Layout.astro`
- `src/layouts/AdminLayout.astro`
- `src/features/mathTexts/render.ts`
- `src/features/mathTexts/validate.ts`
- `src/features/mathTexts/latexDraft.ts`
- `src/features/mathTexts/latexPracticeClient.ts`
- `src/features/mathTexts/render.test.ts` (solo actualiza el nombre del renderer en la descripción existente)
- `src/pages/admin/escuela/index.astro`
- `src/pages/admin/escuela/index2.astro`
- `src/pages/admin/escuela/editar.astro`
- `src/pages/admin/escuela/xml.astro`
- `src/pages/escuela/cursos/[curso]/[slug].astro`
- `src/pages/lecturas/[slug].astro`
- `src/pages/order/[token]/text/[itemPublicId].astro`
- `src/features/mathTexts/xmlCourse.ts`
- `src/pages/api/admin/escuela/preview-xml.ts`

