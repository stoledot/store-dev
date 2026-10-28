# Erratas de textos matemáticos y navegación móvil de Minshop

Este paquete contiene únicamente archivos modificados o añadidos. No incluye `node_modules`, credenciales ni archivos de configuración secretos. Está pensado para aplicarse sobre la versión del repositorio que ya tiene instalada la biblioteca de textos matemáticos y su migración `0052_math_text_library.sql`.

## Archivos incluidos

- `src/features/mathTexts/db.ts`: función para propagar una versión corregida a las compras anteriores.
- `src/pages/api/admin/math-texts.ts`: acción administrativa de propagación y mensajes de resultado.
- `src/pages/admin/textos-matematicos/index.astro`: botón de confirmación para actualizar las copias compradas.
- `src/pages/order/[token]/text/[itemPublicId].astro`: índice adaptable, navegación anterior/siguiente, selector de tema en celular, botón para volver al inicio, resaltado del tema actual y mejor presentación de fórmulas MathJax.
- `src/themes/default/Header.astro`, `src/themes/market/Header.astro`, `src/themes/my-store/Header.astro`, `src/themes/studio/Header.astro`: encabezados más compactos en móviles para las cuatro variantes de tema.
- `textos/porqueria_matematica_colorida_minshop.tex` y `textos/porqueria_matematica_tercera_version_colorida_minshop.tex`: archivos de lectura preparados para subir desde el administrador.

## Cómo instalar

1. Haz una copia de seguridad de tu repositorio.
2. Descomprime el ZIP en la raíz del proyecto y permite que se combinen las carpetas. Solo se reemplazan los archivos listados arriba.
3. No hace falta una migración nueva: se utilizan las columnas añadidas por `0052_math_text_library.sql`.
4. Ejecuta `npm run check` y `npm run build` antes de desplegar.

## Cómo corregir una errata para quienes ya compraron

1. Entra a **Administración → Textos matemáticos** y edita el texto que corresponda.
2. Sube el archivo `.tex` corregido y pulsa **Guardar cambios**.
3. La página volverá a abrir el mismo texto editado. En la sección amarilla, pulsa **Actualizar contenido de compradores anteriores** y confirma.
4. El sistema reemplazará la copia guardada en los artículos de pedido pagados que todavía no estén totalmente reembolsados. El administrador mostrará cuántos artículos se actualizaron. Si un cliente tenía abierta la lectura, tendrá que recargarla.

Guardar el texto y propagarlo son dos acciones separadas intencionalmente: guardar no cambia por accidente las compras anteriores. Para compras antiguas que no tengan `math_text_id` guardado, la propagación también intenta reconocerlas por el producto que actualmente está vinculado al texto; si el producto ya fue desvinculado o eliminado, no hay una asociación fiable para inferir qué texto compraron.

## Navegación móvil

En pantallas pequeñas aparece una barra fija inferior con volver al inicio, selector de tema y botones anterior/siguiente. El índice se puede desplegar, el tema activo se resalta y el contenido deja espacio inferior para que la barra no tape el final de la lectura. En escritorio, el índice permanece fijo al desplazarse y cada sección ofrece enlaces anterior/siguiente.
