# Lecturas XML, suscripciones y secciones de producto

## Lecturas XML

En Administración → **Lecturas XML** pega el documento o sube un `.xml`. El botón **Validar y previsualizar** señala línea y columna cuando encuentra un error. Guarda como borrador y publícala desde la tabla cuando esté lista.

El elemento raíz debe ser `<lectura>`. Requiere `title`, `author` y `date` dentro de `<meta>`; la fecha usa `AAAA-MM-DD`. `summary` puede quedar vacío. Las secciones siguen esta jerarquía:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<lectura>
  <meta>
    <title>Estructura de Lecturas</title>
    <author>Autor</author>
    <date>2024-06-18</date>
    <summary>Descripción breve.</summary>
  </meta>
  <section id="estructura" title="Estructura de las lecturas">
    <subsection id="introduccion" title="Introducción">
      <subsubsection id="detalle" title="Detalle">
        <p>Texto HTML de presentación y una fórmula: $\frac{a}{b}$.</p>
        <theorem id="teorema-1" title="Teorema de ejemplo">
          <statement>El enunciado.</statement>
          <proof>La demostración.</proof>
        </theorem>
        <definition id="def-1" title="Definición">El contenido.</definition>
        <example id="ejemplo-1" title="Ejemplo">El contenido.</example>
        <remark id="nota-1" title="Observación">El contenido.</remark>
        <corollary id="corolario-1" title="Corolario">El contenido.</corollary>
        <lemma id="lema-1" title="Lema">El contenido.</lemma>
        <proposition id="proposicion-1" title="Proposición">El contenido.</proposition>
        <conjecture id="conjetura-1" title="Conjetura">El contenido.</conjecture>
        <axiom id="axioma-1" title="Axioma">El contenido.</axiom>
        <exercise id="ejercicio-1" title="Ejercicio">El contenido.</exercise>
        <solution id="solucion-1" title="Solución">El contenido.</solution>
        <geogebragraphics ref="grafica-1" title="Gráfica interactiva"/>
      </subsubsection>
    </subsection>
  </section>
</lectura>
```

También se admite el alias con error de escritura `<geogebrapraphics>`. Los `id` deben ser únicos. Cada apartado con contenido se convierte en una tarjeta navegable; la tabla de contenidos conserva la profundidad section → subsection → subsubsection. Los ambientes matemáticos se presentan como tarjetas con estilo propio. El HTML se sanea con una lista permitida de etiquetas y atributos; los scripts, eventos y enlaces activos no se publican. Las expresiones LaTeX en texto se procesan con el renderizador latex.js del sitio.

Para GeoGebra, primero carga la construcción en Administración → Escuela → GeoGebra y usa su `ref`. El lector aplica la misma autorización de curso/lectura que el resto de recursos privados.

## Suscripciones comerciales

1. En Stripe crea un precio recurrente (mensual o anual) y copia su Price ID (`price_…`).
2. En Administración → Ajustes guarda la clave secreta y el secreto de firma del webhook Stripe. No los pongas en el XML ni en el contenido del producto.
3. En Administración → Suscripciones crea el plan, introduce el Price ID, importe en unidad menor (por ejemplo, centavos), moneda e intervalo. Selecciona los cursos y lecturas publicados incluidos y actívalo.
4. En el editor de producto asocia uno o más planes activos. El mismo plan puede pertenecer a muchos productos. Si el producto tiene un plan asociado, su compra inicia el checkout recurrente de Stripe; el precio e intervalo del Price se comparan con los datos del plan antes de abrir Checkout.
5. Configura el endpoint Stripe `POST /api/webhook/stripe` para `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded` e `invoice.payment_failed`.

El cliente debe iniciar sesión para contratar. Un webhook firmado activa los accesos. Al cancelar, Stripe deja la suscripción vigente hasta el cierre del periodo pagado; el cliente ve estado, último pago y fecha de próxima renovación en Mi cuenta → Suscripciones. La sección personalizada de inicio y la cuenta muestran los cursos y lecturas activos.

La suscripción es independiente del producto y del vínculo legado producto-contenido: se conecta por tablas de relación muchos a muchos. Archivar un plan evita nuevas compras y conserva el historial de suscriptores.

## Secciones y videos en productos

En el editor del producto, **Secciones adicionales** acepta una lista JSON de `{ "title": "…", "text": "…" }`. El texto admite Markdown seguro y fórmulas LaTeX. Ejemplo:

```json
[
  {"title":"Temario","text":"Repasa las fracciones y la expresión $\\frac{a}{b}$."},
  {"title":"Material","text":"Incluye ejercicios y ejemplos resueltos."}
]
```

**Videos de producto** acepta una lista de videos. YouTube usa el ID validado desde su URL y se incrusta en el dominio de privacidad mejorada:

```json
[{"type":"youtube","title":"Introducción","url":"https://www.youtube.com/watch?v=VIDEO_ID"}]
```

Para R2 el editor muestra referencias de la biblioteca que ya están insertadas en una lección publicada. Copia su objeto JSON, por ejemplo:

```json
[{"type":"r2","title":"Clase de muestra","courseSlug":"algebra","lessonSlug":"introduccion-a-fracciones-a1b2c3d4","ref":"muestra-1"}]
```

El video R2 usa la ruta autenticada del curso y requiere acceso vigente a ese curso. Los videos YouTube son públicos.

## Migración

La migración nueva es `0071_content_subscriptions_and_product_sections.sql`. En local ejecuta:

```powershell
npx wrangler d1 migrations apply minshop-db --local
```

En producción, después de respaldar D1 y antes de desplegar el código:

```powershell
npx wrangler d1 migrations apply minshop-db --remote
```

La migración agrega tablas de planes y relaciones, vincula las suscripciones Stripe existentes con el catálogo nuevo, guarda fechas de pago y agrega los campos JSON de secciones y videos de producto. No borra pedidos ni suscripciones existentes.
