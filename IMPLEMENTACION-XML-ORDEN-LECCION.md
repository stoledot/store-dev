# Bloques XML ordenados dentro de una lección

## Incorporación

1. Haz una copia de respaldo del proyecto.
2. Copia los archivos de este paquete respetando sus rutas desde la raíz del proyecto.
3. No se necesita migración: se reutilizan `school_lessons.assessment_json`, `content_html` e `inputlatex_instruction` existentes.
4. En el panel de administración, vuelve a cargar/guardar el XML del curso para regenerar la representación ordenada de sus lecciones.

## Formato permitido

Dentro de cada `<lesson>` coloca uno o más bloques `<content>` y, entre ellos, cualquier número de `<activity>`; también puedes colocar `<inputlatex>` en la posición en que debe aparecer su instrucción. Por ejemplo:

```xml
<lesson id="conjuntos-01" title="Conjuntos">
  <content><p>Primera explicación.</p></content>
  <activity id="conjuntos-pregunta-01" type="choice">
    <question>¿Cuál es un conjunto?</question>
    <options><option id="a">Una colección definida</option><option id="b">Un número cualquiera</option></options>
    <correct><id>a</id></correct>
  </activity>
  <content><p>Continúa la explicación después de la pregunta.</p></content>
  <inputlatex>Escribe un ejemplo con notación de conjuntos.</inputlatex>
  <content><p>Cierre de la lección.</p></content>
</lesson>
```

Los controles de respuesta se muestran junto al bloque de actividad y se envían como una sola entrega de la lección. Las preguntas objetivas se califican automáticamente; sus pesos usan el peso de sección, lección y actividad. Cada XML `<lesson>` genera una sola unidad navegable.

## Compatibilidad y progreso

Al actualizar un curso se reutiliza la fila asociada al ID XML estable de cada lección. La navegación conserva así el progreso de esa lección. Si el curso se había importado con una fila separada por actividad, las filas anteriores que ya no correspondan a una unidad se archivan; sus registros de progreso, entregas y calificaciones no se eliminan.

Los cursos ya cargados deben guardarse de nuevo desde **Admin → Escuela → Cursos XML** para adoptar este formato de bloques. La práctica LaTeX continúa guardando un borrador por lección con la tabla ya existente.

## Rutas incluidas

- `src/features/mathTexts/xmlCourse.ts`
- `src/pages/admin/escuela/xml.astro`
- `src/pages/api/admin/escuela/preview-xml.ts`
- `src/pages/escuela/cursos/[curso]/[slug].astro`

