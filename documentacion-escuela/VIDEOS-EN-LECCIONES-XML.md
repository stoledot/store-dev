# Videos dentro de lecciones XML

## Video privado cargado a R2

En **Admin → Cursos y lecciones → Videos para lecciones XML**, elige el curso,
sube MP4, WebM u Ogg (máximo 100 MB) y asigna una referencia. El panel muestra
referencia, título, descripción, archivo, MIME, tamaño y fecha de actualización.
Si vuelves a subir con la misma referencia, reemplaza el objeto y conserva los
enlaces de las lecciones. Los videos no se pueden borrar mientras estén ligados
a una lección activa.

En el XML, la referencia debe ser idéntica:

```xml
<lesson id="unidad-1-video" title="Ver la explicación">
  <content>Revisa este video antes de continuar.</content>
  <video ref="introduccion-unidad-1" title="Introducción a la unidad"/>
</lesson>
```

El reproductor solicita el archivo al endpoint privado de la lección. Se valida
la sesión del alumno, su acceso vigente al curso, el orden de avance y la
referencia. La respuesta admite solicitudes de rango para permitir búsqueda
dentro del video.

## YouTube

```xml
<videoyoutube
  url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  title="Introducción al tema"
  start="90"
  aspect-ratio="16:9"
  privacy-enhanced="true"
/>
```

`url` admite enlaces HTTPS de YouTube con ID de 11 caracteres (`watch`,
`youtu.be`, `embed`, `shorts` o `live`). `title` es opcional; `start` va de 0 a
86400 segundos; `aspect-ratio` usa `ancho:alto`; `privacy-enhanced` solo acepta
`true` o `false` y es `true` por defecto. El servidor produce el iframe con un
host de YouTube permitido; el XML no puede suministrar HTML o código iframe.

## Migración

Aplicar la migración aditiva `0069_school_course_videos.sql` con
`npm run db:migrate` en desarrollo o `npm run db:migrate:remote` antes del
despliegue. Se usa el binding R2 privado `FILES` ya configurado por este
proyecto. No se requieren nuevas variables secretas.
