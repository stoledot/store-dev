# MinShop — acceso a la escuela desde /account

## Qué cambia
Añade una tarjeta visible en la página de cuenta del cliente (`/account`) con un enlace directo a `/escuela/mi-escuela`. No agrega dependencias, endpoints ni migraciones.

## Dónde copiar
Copia `pages/account/index.astro` de este ZIP sobre el archivo del mismo nombre en la raíz de tu proyecto MinShop. Si tu proyecto usa `src/`, el destino es `src/pages/account/index.astro`.

Antes de reemplazarlo, haz un commit o copia de seguridad. Si has cambiado recientemente tu página de cuenta, conserva esos cambios e incorpora únicamente el bloque marcado `School access` inmediatamente después del párrafo `Signed in as`.

## Cómo probar
Desde la raíz del proyecto, ejecuta `npm run check`, `npm run build` y `npm run dev`. Inicia sesión y abre `/account`; debe aparecer la tarjeta “Escuela de Matemáticas”. El enlace lleva a `/escuela/mi-escuela`. La autorización académica debe seguir validándose en esa página: este enlace por sí solo no concede acceso a cursos.
