# Acceso visible a la Escuela de Matemáticas en MinShop

Parche pequeño para que visitantes descubran la escuela desde la portada y para que alumnos encuentren su panel desde cualquier página pública.

## Archivos incluidos

- `pages/escuela/index.astro`: reemplaza la página pública actual de la escuela con una descripción breve, pasos de ingreso, mensualidad e inscripción, y CTA al diagnóstico/panel.
- `features/school/SchoolHomeBanner.astro`: banner compacto para la portada de la tienda.
- `layouts/SchoolQuickNav.astro`: barra de acceso a la escuela, diagnóstico y panel del alumno.
- `snippets/INTEGRACION-LAYOUT.txt`: instrucciones para insertar los componentes sin reemplazar archivos completos sensibles.

## Instalación

1. Haz un commit o copia de seguridad.
2. Descomprime el ZIP en una carpeta temporal.
3. Copia `pages/escuela/index.astro` a `src/pages/escuela/index.astro` (si tu repositorio tiene la carpeta `src`; si `pages` está en la raíz, usa `pages/escuela/index.astro`).
4. Copia `features/school/SchoolHomeBanner.astro` y `layouts/SchoolQuickNav.astro` a las mismas rutas relativas de tu proyecto.
5. Sigue `snippets/INTEGRACION-LAYOUT.txt` para agregar el import y `<SchoolQuickNav />` a `Layout.astro`, y el banner a `pages/index.astro`. No reemplaces todo `Layout.astro`: solo añade el componente para conservar tus personalizaciones.
6. Verifica que las rutas de diagnóstico y panel coincidan con las páginas instaladas: `/escuela/diagnostico` y `/escuela/mi-escuela`. El parche no crea ni modifica el flujo de diagnóstico, pagos ni autenticación.
7. Ejecuta `npm run check`, `npm run build` y luego `npm run dev`.

## Comportamiento

- En la portada predeterminada, el banner aparece encima del catálogo.
- Si MinShop tiene configurada una página de inicio personalizada, la lógica actual `resolveHomePath` seguirá funcionando. La barra global añadida en `Layout.astro` mantiene visible el acceso a la escuela en las páginas que usan el layout.
- El botón `Panel del alumno` enlaza a `/escuela/mi-escuela`, donde debe mantenerse la autenticación y la comprobación de acceso existentes.
- No se agregan tablas, dependencias ni migraciones.

## Nota

El ZIP contiene archivos de parche, no una copia completa del proyecto. Debes integrar los dos fragmentos descritos antes de probarlo. No se afirma que se haya ejecutado una compilación Astro en tu entorno.
