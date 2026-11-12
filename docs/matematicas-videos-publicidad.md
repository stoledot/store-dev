# Matemáticas, videos y espacios publicitarios

## Videos y práctica en lecturas o ediciones

Dentro de cualquier `section`, `subsection` o `subsubsection` de una lectura (`<lectura>`) o edición (`<edicion>`) puedes insertar:

```xml
<videoyoutube url="https://www.youtube.com/watch?v=VIDEO_ID"
              title="Introducción al tema" start="90"
              aspect-ratio="16:9" privacy-enhanced="true"/>
<video ref="video-r2-unico" title="Explicación en video"/>
<inputlatex>Escribe una explicación breve usando $x^2+y^2=z^2$.</inputlatex>
<anunciarte/>
```

YouTube admite `url`, `title`, `start` (segundos), `aspect-ratio` y `privacy-enhanced`. El video R2 usa `ref` y `title`; en las lecturas se carga primero en Administración → Escuela → Videos dentro del curso que contiene esa lectura. En ediciones se usa la referencia de la biblioteca de videos R2 de cursos; elige referencias únicas para que no coincidan con otro archivo. Las ediciones solo sirven el archivo a clientes con acceso vigente. `inputlatex` conserva su presentación de instrucción. En los cursos, el bloque `<lesson><inputlatex>…</inputlatex></lesson>` conserva exactamente el editor interactivo que ya existía.

Los cursos ya aceptan `<videoyoutube>` y `<video>` como bloques directos dentro de `<lesson>`. Para colocar un anuncio en un curso, inserta `<anunciarte/>` dentro de `<content>`, por ejemplo:

```xml
<content><p>Lección con una fórmula $a^2+b^2=c^2$.</p><anunciarte/></content>
```

En las lecturas y ediciones, `videoyoutube`, `video`, `inputlatex` y `anunciarte` pueden ir como hijos de una sección en el orden que se verán.

## MathJax

El contenido de las páginas de tienda y administración se procesa con MathJax 4. Admite fórmulas en línea `$…$` y `\(…\)`, y fórmulas desplegadas `$$…$$` y `\[…\]`. El sistema mantiene LaTeX.js dentro del editor interactivo `inputlatex`; no se usa para componer el texto normal de cursos, lecciones, lecturas o ediciones. MathJax se carga desde jsDelivr, por lo que el navegador necesita acceso a ese CDN.

## Solicitudes de publicidad

El bloque `<anunciarte/>` muestra una tarjeta discreta que abre `/anunciarte`. El formulario solicita negocio, contacto, correo, teléfono y sitio opcionales, modalidad (visualizaciones, presupuesto o patrocinio), vistas mensuales, presupuesto mensual y mensaje. Guarda las solicitudes en D1 y las muestra en Administración → **Publicidad**.

Para recibir el aviso por correo, activa correo y configura el destinatario de notificaciones en Administración → Ajustes (o `email.notifyTo` en `store.config.ts`). El Worker reintenta automáticamente errores temporales. Sin un correo configurado, la solicitud sigue disponible en el panel de Administración. Se aplica un límite de cinco envíos por correo al día y un campo señuelo antispam.

## Migración

Aplica `0074_advertising_inquiries.sql` después de `0073_math_magazines.sql`:

```powershell
npm run db:migrate
npm run db:migrate:remote
```

El cambio agrega la tabla `advertising_inquiries`; no altera los datos existentes.
