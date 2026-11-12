# Revistas matemáticas

## Crear una revista

En Administración → **Revistas matemáticas**, crea la ficha con título, slug, presentación, editorial, editor responsable, idioma, periodicidad y portada. Las imágenes aceptadas son JPEG, PNG, WebP o GIF de hasta 5 MB; se guardan en la biblioteca pública de imágenes. Publica la ficha cuando quieras que aparezca en el inicio y en `/revistas/<slug>`.

Después, desde la misma ficha, abre **Administrar ediciones**. Carga XML, valida/preview, agrega la portada particular de la edición y guárdala como borrador o publícala. Las ediciones publicadas se anuncian por correo a las suscripciones activas de esa revista.

## XML de una edición

La raíz es `<edicion>`. Dentro de `<meta>` son obligatorios `title`, `number` y `date`; `author`, `volume` y `summary` pueden incluirse si aplican. `date` usa `AAAA-MM-DD`. El número identifica la edición dentro de su volumen. Usa números o claves breves, por ejemplo `4`, `2026-02` o `especial-a`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<edicion>
  <meta>
    <title>Ideas y estructuras matemáticas</title>
    <volume>12</volume>
    <number>2</number>
    <date>2026-11-10</date>
    <author>Equipo editorial</author>
    <summary>Una edición sobre patrones, demostraciones y modelos.</summary>
  </meta>
  <section id="editorial" title="Editorial">
    <subsection id="bienvenida" title="Bienvenida">
      <p>Exploramos una pregunta clásica: ¿por qué funciona esta identidad?</p>
      <p>La respuesta comienza con $a^2+b^2=c^2$.</p>
    </subsection>
  </section>
  <section id="articulos" title="Artículos">
    <subsection id="demostraciones" title="Demostraciones">
      <subsubsection id="teorema" title="Un resultado notable">
        <theorem id="teorema-1" title="Teorema de ejemplo">
          <statement>Enunciado del teorema.</statement>
          <proof>Demostración con fórmulas como $\sum_{k=1}^{n}k$.</proof>
        </theorem>
        <definition id="def-1" title="Definición">Una definición.</definition>
        <example id="ej-1" title="Ejemplo">Un ejemplo resuelto.</example>
        <remark id="nota-1" title="Observación">Una nota editorial.</remark>
        <exercise id="ejercicio-1" title="Ejercicio">Un problema para explorar.</exercise>
        <solution id="solucion-1" title="Solución">Una solución comentada.</solution>
        <geogebragraphics ref="grafica-unica" title="Exploración interactiva">
          Arrastra los puntos y observa qué cambia.
        </geogebragraphics>
      </subsubsection>
    </subsection>
  </section>
</edicion>
```

Las secciones tienen la misma jerarquía y elementos que Lecturas XML: `section > subsection > subsubsection`, HTML seguro, LaTeX, ambientes matemáticos (`theorem`, `proof`, `definition`, `example`, `remark`, `corollary`, `lemma`, `proposition`, `conjecture`, `axiom`, `exercise`, `solution` y otros ambientes reconocidos), además de `geogebragraphics ref="…" title="…"`. Se aplican el saneamiento y el renderizador LaTeX existentes. GeoGebra debe estar cargado en Administración → Escuela → GeoGebra; procura que el `ref` sea único para que no se confunda con otra construcción de la biblioteca.

Los IDs de sección deben ser únicos y usar letras, números, guion o guion bajo. Cada sección con contenido se convierte en una tarjeta navegable. El archivo puede pesar hasta 1 MB. La portada se carga en el panel y no se pone dentro del XML.

## Suscripciones y productos

1. Crea y publica la revista y al menos una edición.
2. En Administración → Productos crea el producto que se venderá y agrega el plan recurrente a ese producto.
3. En Administración → Suscripciones crea el plan, vincula su Price ID de Stripe, precio, periodicidad, textos legales y consentimiento explícito. En **Acceso a una revista** elige la revista y uno de estos alcances:
   - **Solo la edición más reciente**: el acceso cambia a la edición vigente al publicarse una nueva.
   - **Todas las ediciones, anteriores y futuras**: da acceso al archivo publicado y a futuras ediciones.
4. Publica el plan. El producto asociado aparece en la página de la revista. El cliente contrata desde el producto; se reutilizan el checkout recurrente, aceptación legal de una sola casilla, registro de consentimiento y cancelación ya implementados.

El inicio muestra las revistas publicadas y marca las que la persona ya puede leer. Mi cuenta → **Mis revistas** muestra sus accesos activos. `/revistas/<slug>` es la página pública de promoción y catálogo; las ediciones privadas requieren una suscripción vigente.

## Avisos por correo

Al publicar una edición se crea una notificación pendiente para los correos con suscripción activa o de prueba que incluya esa revista. El cron existente la envía en lotes, evita duplicar avisos y vuelve a intentar fallas. Configura un proveedor de correo en Administración → Ajustes. Si el correo no está habilitado o configurado, los avisos quedan pendientes hasta que vuelva a estar disponible.

## Migración

Aplica `0073_math_magazines.sql` después de las migraciones `0071` y `0072`, antes del despliegue:

```powershell
npx wrangler d1 migrations apply minshop-db --local
npx wrangler d1 migrations apply minshop-db --remote
```

Ejecuta el comando local para desarrollo y el remoto para producción. La migración añade revistas, ediciones, su cola de correo y el alcance de revista a los planes sin eliminar datos existentes.
