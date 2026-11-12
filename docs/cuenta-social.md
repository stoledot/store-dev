# Cuenta social y grupos

## Qué incluye

- Administración para crear, editar, archivar y agregar portada a grupos en `/admin/grupos`.
- Catálogo de grupos en `/grupos`, con opción para unirse o salir.
- Publicaciones de integrantes en la página principal y dentro de cada grupo. La portada `/` carga cinco publicaciones por página al desplazarse; se puede cambiar entre relevancia (reacciones y comentarios) y fecha reciente.
- Reacciones y guardados de publicaciones; edición y borrado por su autor; comentarios, respuestas, reacciones a comentarios y copia del texto matemático original.
- `/account/social` reúne los grupos, publicaciones y guardados del usuario y enlaza a su cuenta académica. Nombre y foto social se editan desde `/account/profile`.
- En `/` hay un enlace destacado a `/shop`, que muestra el catálogo de productos.
- Los textos de publicaciones y comentarios se procesan con MathJax y admiten `$...$` y `$$...$$`.

## Migración

La migración nueva es `0075_social_groups.sql`. Desde la carpeta del proyecto, aplica primero a la base local y después a la base de Cloudflare:

```powershell
npx wrangler d1 migrations apply minshop-db --local
npx wrangler d1 migrations apply minshop-db --remote
```

Aplica la migración antes de desplegar los archivos. En instalaciones cuyo nombre de base D1 sea distinto de `minshop-db`, sustituye ese nombre por el que figura en `wrangler.jsonc`.

## Avisos del navegador

Cada persona puede habilitar avisos desde el botón “Activar avisos del navegador”. El navegador debe permitirlos y la página de inicio, un grupo o Cuenta social debe permanecer abierta para consultar avisos nuevos. Al comentar se avisa al autor de la publicación (o al autor del comentario al que se responde); una publicación avisa a los demás integrantes del grupo. Estos avisos usan la API de notificaciones del navegador y no se entregan cuando el navegador está cerrado.

## Uso

1. En Admin, abre **Grupos sociales**, crea un grupo y carga una imagen de portada. Se aceptan JPEG, PNG, WebP y GIF de hasta 5 MB.
2. Las personas inician sesión, visitan `/grupos` y se unen a los grupos que les interesen.
3. Publican en el inicio o dentro de la página del grupo. La publicación y los comentarios son texto con delimitadores de MathJax.
4. La cuenta social está en `/account/social`; la foto se administra desde **Mi perfil** en la cuenta académica.

El inicio conserva el resto de la experiencia existente y ya no muestra la lista de pasos de inscripción. El catálogo de productos queda disponible desde `/shop`.
