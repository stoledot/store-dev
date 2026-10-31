# Navegación, páginas públicas y diseño en español para Minshop

## Archivos incluidos

Este ZIP contiene únicamente archivos nuevos o modificados para esta actualización. No incluye dependencias, `.env`, `node_modules`, `.git` ni una copia completa del repositorio.

- `src/layouts/SchoolQuickNav.astro`: menú desplegable accesible con enlaces a programas, ayuda, cuenta, búsqueda y carrito.
- `src/pages/index.astro`: hero de inicio con nombre configurable, slogan, botones y tarjetas de programas. La raíz `/` muestra ahora este hero y ya no aplica la redirección de portada configurada en Ajustes.
- Páginas nuevas: `/programas/matematicas`, `/programas/lectura`, `/preguntas-frecuentes`, `/acerca-de`, `/buscar`, `/agendar-cita`, `/terminos-y-condiciones`, `/privacidad` y `/cookies`.
- `src/components/StoreLegalLinks.astro` y los cuatro footers: enlaces legales visibles en el pie.
- Los cuatro encabezados de tema y los controles de carrito, cuenta y búsqueda: etiquetas en español y ajustes de espaciado responsive.
- `src/layouts/Layout.astro`: idioma del documento `es-MX` y etiquetas del carrito lateral en español.
- Páginas de búsqueda, carrito, checkout y cuenta: traducción de las etiquetas principales visibles.
- `src/layouts/AdminLayout*.astro`: atributo de idioma `es-MX`.

## Instalación

1. Haz una copia de seguridad del repositorio.
2. Descomprime este ZIP en la raíz de tu proyecto y combina las carpetas.
3. Ejecuta `npm run check`, `npm test` y `npm run build`.
4. Revisa las páginas en escritorio y móvil, y prueba los flujos de búsqueda, carrito, cuenta y checkout.
5. Despliega solo cuando las comprobaciones terminen correctamente.

No se añade ninguna migración de base de datos.

## Personalización y advertencias

- El nombre del hero y del menú usa el nombre de tienda configurado en Minshop; si permanece el valor predeterminado `My Shop`, se muestra `Escuela de Matemáticas`.
- El diseño utiliza tokens de color y superficie del tema activo, por lo que acompaña los temas `default`, `my-store`, `market` y `studio`.
- La página `/agendar-cita` es informativa: no confirma reservas ni está conectada a un calendario. Describe cómo solicitar una cita por el canal oficial de contacto de la escuela. Para reservas automáticas se necesitaría implementar un sistema de agenda.
- Los textos de términos, privacidad y cookies son plantillas generales. Antes de publicar, adapta los datos del responsable, medios de contacto, proveedores, prácticas reales, cancelaciones y demás requisitos legales a la operación de la escuela. No deben considerarse asesoría jurídica.
- La raíz `/` muestra ahora el hero de la escuela en lugar de respetar una portada personalizada configurada previamente en Ajustes. Si necesitas conservar esa opción, hay que integrar el hero en el sistema de portada configurable.

## Verificación

El ZIP contiene únicamente los archivos enumerados en `ARCHIVOS-INCLUIDOS.txt`. Esta entrega no se ha compilado en este entorno porque las dependencias de Node/Astro no están instaladas aquí. Ejecuta los comandos de comprobación en tu entorno antes de desplegar.
