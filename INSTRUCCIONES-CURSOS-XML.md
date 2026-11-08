# Cursos XML para Escuela

Este paquete agrega la carga y actualización de cursos desde XML y mantiene el almacenamiento de cursos, el control de acceso y el progreso sobre las tablas escolares existentes.

## Incorporación

1. Copia las rutas de este ZIP conservando su estructura relativa al proyecto.
2. Aplica las migraciones escolares pendientes en orden, hasta incluir `migrations/0063_school_latex_practice.sql`; no vuelvas a aplicar migraciones ya registradas en D1.
3. Confirma que la vinculación privada `FILES` a R2 siga habilitada: el XML original se guarda allí por versión.
4. Abre `/admin/escuela/xml`, selecciona un curso XML o carga uno nuevo.
5. Usa **Validar y previsualizar** para detectar errores con línea y columna y revisar el resumen, contenido, fórmulas y controles de actividad. Después usa **Validar y guardar XML**.

La copia recibida del proyecto no incluye el `package.json` Astro ni configuración Wrangler/Cloudflare en la raíz; por eso se entrega el SQL de migración para aplicarlo usando el flujo D1 ya configurado en tu repositorio, sin asumir nombre de base o entorno.

## Formato XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<curso>
  <meta>
    <title>Curso de ejemplo</title>
    <summary>Resumen del curso</summary>
    <author>Nombre del autor</author>
    <id>curso-ejemplo</id>
    <slug>curso-ejemplo</slug>
  </meta>
  <section id="unidad-1" title="Unidad 1" slug="unidad-1" weight="1">
    <lesson id="introduccion" title="Introducción" weight="1" required="true">
      <content>
        <p>Texto con fórmula en línea $x^2 + 1$.</p>
        <p>Fórmula destacada:</p>
        <p>$$\frac{a}{b}$$</p>
        <ul><li>Lista</li></ul>
        <style>p { color: #334155; }</style>
      </content>
      <inputlatex>
        <p>Desarrolla el cuadrado de una suma y comprueba tu expresión en la vista previa.</p>
      </inputlatex>
      <activity id="actividad-1" type="multiple-choise" weight="2">
        <question><p>Elige todas las respuestas correctas.</p></question>
        <options>
          <option id="a">Respuesta A</option>
          <option id="b">Respuesta B</option>
          <option id="c">Respuesta C</option>
        </options>
        <correct><id>a</id><id>c</id></correct>
        <explanation>La explicación aparecerá con la calificación.</explanation>
      </activity>
    </lesson>
  </section>
</curso>
```

`<inputlatex>` es opcional y puede aparecer una vez dentro de `<lesson>`. Su contenido usa el mismo subconjunto seguro de HTML que `<content>` y sirve como instrucción para el editor. El alumno escribe LaTeX en la página de esa lección; el borrador se guarda automáticamente y también con el botón **Guardar borrador**. Conserva el `id` de `<lesson>` al actualizar el XML: ese ID vincula el borrador con la lección para mantenerlo y reunirlo después en la descarga **Descargar todo mi código LaTeX (.tex)**. Si una lección tiene varias actividades, todas sus páginas muestran el mismo borrador de la lección y la exportación lo incluye una sola vez.

También acepta `tittle` en el atributo de sección por compatibilidad con la plantilla descrita. Para XML bien formado, las etiquetas vacías HTML deben cerrarse como `<br/>` y `<hr/>`; `<\br>` no es XML válido.

Tipos de actividad aceptados: `short`, `long`, `choice` o `choise` (una respuesta), `multiple-choice` o `multiple-choise` (varias respuestas). Las respuestas correctas se expresan con uno o más `<id>` dentro de `<correct>`. Para seleccionar varias, el máximo de casillas se fija al número de `<id>` correctos. La calificación parcial toma en cuenta aciertos y resta selecciones incorrectas, con mínimo 0 y máximo 100% del reactivo. Las actividades objetivas se califican automáticamente; las de respuesta corta/larga siguen disponibles para revisión docente.

Los pesos efectivos de una actividad son `peso de section × peso de lesson × peso de activity`, limitados al máximo que admite el esquema escolar. Los valores omitidos usan 1. El importador admite hasta 250 unidades y actividades por curso.

## Progreso y navegación

El esquema actual guarda avance y entregas por fila de `school_lessons`. Para integrarse con ese modelo, el importador crea una unidad de lectura por cada `<lesson>` y una unidad de actividad independiente por cada `<activity>`, en ese orden. Las actividades conservan el contexto de su sección y lección y pueden completarse/calificarse individualmente. Mantén estables los IDs de section, lesson y activity al actualizar. Las unidades retiradas se archivan, no se eliminan; sus entregas e historial permanecen.

Los cursos XML usan columnas XML nuevas para el origen y metadatos de agrupación. Los cursos TeX previos conservan su fuente e historial; el editor TeX redirige al editor XML cuando se abre un curso que ya usa XML.

## Validación y contenido

El validador comprueba la declaración UTF-8, el elemento raíz, los bloques requeridos, atributos, IDs obligatorios y repetidos, opciones, respuestas correctas, pesos, etiquetas XML y los tipos de actividad. La vista previa y el guardado usan el mismo parser.

El XML fuente se conserva en R2 privado y el HTML procesado en D1. Scripts, DTD, entidades externas, atributos de eventos, enlaces inseguros y etiquetas fuera de la lista de presentación no se renderizan. El contenido acepta párrafos, listas, tablas sencillas, imágenes HTTPS o rutas locales, enlaces seguros, estilos en línea limitados y bloques `<style>` con selectores confinados al contenido de esa lección. No uses scripts ni contenido embebido.

MathJax recibe `$...$` y `$$...$$` como delimitadores y renderiza en el navegador del alumno y en la vista previa administrativa. El archivo no se compila como un documento LaTeX: las expresiones se procesan en la página.

El editor valida llaves, delimitadores matemáticos y parejas `\begin{...}`/`\end{...}` con línea y columna, y usa MathJax para la vista previa y sus avisos de comandos o expresiones que no puede renderizar. No es un compilador completo de LaTeX ni ejecuta paquetes arbitrarios. La exportación junta los fragmentos guardados en un documento `.tex` básico con `amsmath`, `amssymb` y `mathtools`; si el alumno emplea otros paquetes o macros, tendrá que agregarlos al archivo descargado.

La previsualización administrativa no consulta ni modifica permisos de matrícula; permanece dentro del área protegida de administración. El contenido y los controles de pregunta se muestran antes de publicar.
