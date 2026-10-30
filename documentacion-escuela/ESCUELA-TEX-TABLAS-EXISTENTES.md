# Escuela TeX sobre las tablas escolares existentes

Esta implementación **no crea una segunda familia de tablas de cursos, lecciones o progreso**. Reutiliza `school_courses`, `school_lessons`, `school_course_progress` y `school_lesson_progress`. La única tabla nueva es `school_notifications`, para separar los mensajes académicos de `order_notifications`, que pertenece al flujo de pedidos.

## Instalación

1. Haz copia de seguridad de D1 y R2.
2. Copia únicamente los archivos del ZIP a las mismas rutas de tu repositorio.
3. Ejecuta `npm run db:migrate` en local.
4. Ejecuta `npm run check`, `npm test` y `npm run build`.
5. En desarrollo, comprueba que el binding privado `FILES` de R2 esté configurado. El proyecto original ya define ese binding para entregas.
6. Prueba una compra de demostración que termine con `orders.status='paid'`; una orden pendiente no da acceso.
7. Solo después de probarlo, aplica `npm run db:migrate:remote`.

## Administración

Abre `/admin/escuela/tex`. Puedes crear un curso o una lectura, cargar un `.tex`, editar su contenido y asociarlo con un producto existente. Publica el contenido para que los compradores puedan abrirlo. Los archivos fuente se guardan en `FILES` (R2 privado); D1 guarda la ruta, metadatos y unidades procesadas.

Al guardar una revisión, el procesador actualiza las filas de `school_lessons` con los mismos identificadores/slug cuando el `id=` del entorno se conserva. Las unidades que ya no aparecen se archivan en lugar de borrarse, para no romper las claves foráneas ni perder entregas. Si quieres preservar el progreso al corregir una errata, conserva siempre los valores `id=`.

## Formato `.tex`

Subconjunto de TeX didáctico: no es un compilador completo de LaTeX. No se necesitan `\documentclass`, `\usepackage` ni `\begin{document}`. El lector admite fórmulas MathJax `\( ... \)` y `\[ ... \]`, capítulos/secciones, entornos matemáticos, listas, tablas, imágenes HTTPS y bloques HTML/CSS con etiquetas y propiedades limitadas.

```tex
\chapter{Fundamentos}
\section{Conjuntos}

\begin{lesson}[id=lectura-conjuntos,weight=0]
Un conjunto es una colección de objetos. Por ejemplo, \(A=\{1,2,3\}\).
\end{lesson}

\begin{definition}[id=def-subconjunto,title={Subconjunto},weight=0]
Decimos que \(A\subseteq B\) cuando todo elemento de \(A\) pertenece a \(B\).
\end{definition}

\begin{activity}[id=respuesta-subconjunto,type=short,weight=1,due=2026-11-15]
Explica con tus palabras qué significa \(A\subseteq B\).
\end{activity}

\begin{activity}[id=eleccion-subconjunto,type=choice,weight=2]
¿Cuál es un subconjunto de \(\{1,2,3\}\)?
\option{a}{\(\{1,2\}\)}
\option{b}{\(\{4\}\)}
\correct{a}
\end{activity}

\begin{activity}[id=demostracion,type=long,weight=2]
Demuestra el enunciado y explica cada paso.
\end{activity}

\begin{deliverable}[id=archivo-final,weight=3,due=2026-12-01]
Entrega un PDF con la solución completa.
\end{deliverable}

\begin{theorem}[id=teorema-union,title={Unión},weight=0]
Si \(A\subseteq B\), entonces \(A\cup B=B\).
\end{theorem}

\begin{table}[header=blue]
\row{Símbolo}{Significado}
\row{\(\in\)}{Pertenece a}
\row{\(\subseteq\)}{Es subconjunto de}
\end{table}

\image{https://example.com/diagrama.png}{Diagrama ilustrativo}{Un pie de imagen opcional}

\begin{htmlblock}
<div style="background-color:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:16px;color:#1e3a8a;text-align:left">
  <strong>Nota visual.</strong> Puedes destacar un concepto con HTML limitado.
</div>
\end{htmlblock}
```

### Entornos y tipos de actividad

- `chapter`, `section`, `subsection`, `subsubsection`: encabezados y niveles del índice.
- `lesson`: contenido de lectura; por defecto no pide respuesta.
- `activity[type=short]`: respuesta breve.
- `activity[type=long]`: respuesta desarrollada.
- `activity[type=choice]`: opción múltiple usando `\option{clave}{texto}`.
- `deliverable` o `activity[type=upload]`: entrega de archivo.
- `exercise`, `task`, `assignment`: actividades cortas/largas según el tipo.
- `definition`, `theorem`, `lemma`, `proposition`, `corollary`, `proof`, `example`, `remark`, `note`, `warning`, `solution`, `axiom`, `conjecture`, `problem`.
- `itemize`, `enumerate`, `equation`, `align`, `gather`, `multline`.
- `table[header=blue|teal|purple|dark|green|orange]` con filas `\row{celda}{celda}`.
- `\image{URL HTTPS o ruta local}{texto alternativo}{pie opcional}`.
- `htmlblock`: se filtran etiquetas y estilos; scripts, formularios, iframes y atributos de eventos no se permiten.

### Atributos de actividad

En el corchete inicial, separa atributos con comas: `id=`, `type=short|long|choice|upload`, `weight=`, `due=AAAA-MM-DD`, `required=false`. Usa un `id` explícito y estable. Peso `1` es normal; `<1` pesa menos y `>1` pesa más. Para las unidades de lectura, `weight=0` se interpreta como peso mínimo técnico para cumplir las restricciones actuales de `school_lessons`; para calificación, la lectura completada obtiene 10/10 y las actividades pendientes cuentan provisionalmente como cero.

## Acceso por compra

El acceso se calcula a partir de `school_courses.product_id`, `order_items` y `orders` (estado pagado y sin reembolso completo). No se crea una tabla de inscripciones duplicada. Los cursos anteriores siguen pudiendo usar `school_course_assignments` y los pagos académicos existentes.

## Calificaciones y avisos

La tabla escolar guarda las notas históricas en la escala 0–100 por compatibilidad. Para unidades TeX, la interfaz del administrador acepta 0–10 y convierte la nota a la escala interna; el alumno ve 0–10. Al guardar una calificación se crea una notificación en `school_notifications`.

## Limitaciones deliberadas

- No compila cualquier documento LaTeX ni ejecuta paquetes, TikZ o macros personalizadas arbitrarias.
- Las respuestas correctas de opción múltiple no se exponen al navegador ni se califican automáticamente; el administrador califica cada actividad.
- Para adjuntos se reutiliza el flujo privado existente y sus límites de tipo/tamaño.
- La asociación del producto se puede gestionar desde el editor del curso/lectura o desde Admin → Products mediante el campo “Curso o lectura matemática”. El producto debe existir antes de seleccionarlo.
