# Incorporación de la implementación Minshop TeX

## Contenido del ZIP

El archivo incluye únicamente los archivos nuevos o modificados:

- `src/features/mathTexts/validate.ts` — valida estructura, delimitadores, atributos, IDs y opciones de respuesta.
- `src/pages/admin/escuela/tex.astro` — ejecuta el validador antes de escribir en R2/D1, guarda el HTML de cada unidad en D1 y conserva revisiones/progreso.
- `src/pages/api/escuela/cursos/[curso]/[slug].ts` — califica automáticamente las preguntas de opción múltiple con su clave almacenada en D1.
- `src/pages/escuela/cursos/[curso]/[slug].astro` — presenta el HTML almacenado en D1 y comunica la nota automática al alumno.
- `src/pages/admin/escuela/calificaciones.astro` — documenta la consulta escolar existente para revisión y anulación manual.
- `documentacion-escuela/examples/curso-tex-demo.tex` — añade ID a la tabla del ejemplo.
- `cursos/curso-logica-conjuntos.tex` — corrige `choise` a `choice` y añade IDs a tablas de referencia.

## Incorporación

1. Guarda una copia de seguridad de D1 y de R2/FILES.
2. Extrae el ZIP en la raíz del repositorio, conservando las rutas incluidas.
3. No ejecutes una migración: la implementación usa el esquema existente, en particular `school_lessons.content_html`, `school_lessons.assessment_json`, `school_lesson_progress.grade`, `school_lesson_progress.feedback`, `school_course_revisions` y `school_lesson_revisions`.
4. Ejecuta el flujo normal de comprobación y despliegue de tu proyecto Minshop.
5. En local, crea un curso de prueba con una lectura y una actividad `type=choice`; verifica una respuesta correcta y otra incorrecta, y luego actualiza el mismo `.tex` manteniendo sus IDs para confirmar que el progreso anterior sigue asociado.

## Sintaxis comprobada

Las unidades y los bloques de contenido semántico deben tener IDs únicos. Usa `id`, `type`, `weight`, `due`, `required`, `title` o `header` según el entorno. Los entornos de presentación anidados (fórmulas, listas) no requieren ID.

```tex
\begin{lesson}[id=introduccion,weight=0]
Texto y fórmula \(x^2+1=0\).
\end{lesson}

\begin{activity}[id=opcion-1,type=choice,weight=1]
Selecciona la respuesta.
\option{a}{Primera}
\option{b}{Segunda}
\correct{b}
\end{activity}
```

Las actividades de opción múltiple se califican en escala 0–10 para unidades TeX y 0–100 para lecciones escolares antiguas. Las preguntas abiertas, entregas y actividades mixtas continúan en revisión docente.

## Comprobaciones y límites

Se ejecutó la validación sobre el archivo de curso y el ejemplo incluidos: ambos quedaron sin errores. También se verificó que una actividad con opción múltiple incompleta devuelve errores con línea y sugerencias, y que el parser recupera opciones y clave correcta.

El ZIP recibido no incluye `package.json`, configuración de despliegue ni dependencias del proyecto; por eso no fue posible ejecutar el build o la suite de pruebas completa. El validador cubre el subconjunto TeX que Minshop interpreta; no sustituye un compilador LaTeX general ni puede diagnosticar comandos arbitrarios fuera de ese formato.
