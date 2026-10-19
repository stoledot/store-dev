-- Curso de ejemplo: Nivel 0 de Matemáticas Puras.
-- Reutiliza las tablas creadas en 0040 y 0041. Es seguro volver a ejecutar
-- este seed porque los IDs y slugs son estables.

INSERT INTO school_courses
  (id, slug, title, summary, description_md, sequence_no, status, content_version)
VALUES
  ('curso-nivel-0', 'nivel-0', 'Nivel 0 · Matemáticas puras',
   'Introducción al lenguaje matemático, la lógica proposicional y los conjuntos.',
   'Curso introductorio de matemáticas formales desde cero.', 1, 'published', 1)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  summary = excluded.summary,
  description_md = excluded.description_md,
  sequence_no = excluded.sequence_no,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO school_lessons
  (id, course_id, slug, title, summary, content_md, sequence_no, lesson_type, status, required_to_complete, content_version)
VALUES
  ('nivel0-leccion-01', 'curso-nivel-0', 'lenguaje-matematico', 'El lenguaje matemático',
   'Aprende a distinguir enunciados matemáticos y a expresar ideas con precisión.',
   '# El lenguaje matemático\n\nLas matemáticas utilizan un lenguaje preciso para comunicar afirmaciones, relaciones y procedimientos. Antes de operar con símbolos, conviene identificar qué estamos diciendo.\n\n## 1. Proposiciones\n\nUna **proposición** es un enunciado declarativo al que se le puede asignar un valor de verdad: verdadero o falso.\n\nEjemplos:\n\n- «7 es un número primo» es una proposición verdadera.\n- «10 es menor que 3» es una proposición falsa.\n- «Cierra la puerta» no es una proposición, porque es una orden.\n- «¿Qué hora es?» no es una proposición, porque es una pregunta.\n\n## 2. Proposiciones abiertas\n\nUna expresión como `x > 3` contiene una variable libre. Su verdad depende del valor que se asigne a `x`; por eso, antes de fijar un dominio y un valor, se considera una proposición abierta.\n\n## 3. Lenguaje natural y lenguaje simbólico\n\nLa expresión «7 es mayor que 3» puede escribirse simbólicamente como `7 > 3`. La expresión «x es mayor que 3» se representa como `x > 3`.\n\n## Actividad\n\nClasifica cada expresión como proposición, proposición abierta o no proposición. En las proposiciones, indica si es verdadera o falsa.\n\n1. `2 + 2 = 4`\n2. `n + 1 = 5`\n3. «¡Estudia lógica!»\n4. `9 < 1`\n5. «¿Todos los números pares son divisibles entre 2?»\n\n**Antes de continuar:** explica con tus propias palabras por qué una pregunta no es una proposición lógica.',
   1, 'reading', 'published', 1, 1),
  ('nivel0-leccion-02', 'curso-nivel-0', 'conectivos-logicos', 'Conectivos lógicos y negación',
   'Construye proposiciones compuestas y estudia la negación.',
   '# Conectivos lógicos y negación\n\nLas proposiciones pueden combinarse para formar proposiciones compuestas. En esta primera aproximación usaremos la negación, la conjunción y la disyunción.\n\n## Negación\n\nSi `p` es una proposición, su negación se escribe `¬p` y se lee «no p». La negación cambia el valor de verdad: si `p` es verdadera, `¬p` es falsa; si `p` es falsa, `¬p` es verdadera.\n\nEjemplo:\n\n- `p`: «8 es par».\n- `¬p`: «8 no es par».\n\nLa doble negación `¬(¬p)` tiene el mismo valor de verdad que `p`.\n\n## Conjunción y disyunción\n\n- `p ∧ q` se lee «p y q» y es verdadera cuando ambas proposiciones son verdaderas.\n- `p ∨ q` se lee «p o q» (disyunción inclusiva) y es verdadera cuando al menos una de las dos proposiciones es verdadera.\n\n## Actividad\n\nSean `p`: «12 es divisible entre 3» y `q`: «12 es impar». Escribe en lenguaje natural `¬p`, `p ∧ q` y `p ∨ q`. Después determina el valor de verdad de cada expresión.',
   2, 'reading', 'published', 1, 1),
  ('nivel0-leccion-03', 'curso-nivel-0', 'introduccion-a-conjuntos', 'Introducción a los conjuntos',
   'Representa colecciones de objetos matemáticos y practica operaciones básicas.',
   '# Introducción a los conjuntos\n\nUn **conjunto** es una colección bien definida de objetos, llamados elementos. Si `a` pertenece al conjunto `A`, escribimos `a ∈ A`; si no pertenece, escribimos `a ∉ A`.\n\n## Representación\n\nPodemos describir un conjunto enumerando sus elementos: `A = {1, 2, 3, 4}`. El orden de los elementos no importa y repetir un elemento no crea un elemento nuevo.\n\n## Subconjuntos\n\n`A ⊆ B` significa que todo elemento de `A` también pertenece a `B`. Por ejemplo, si `A = {1, 2}` y `B = {1, 2, 3}`, entonces `A ⊆ B`.\n\n## Operaciones básicas\n\nSean `A = {1, 2, 3}` y `B = {3, 4}`.\n\n- Unión: `A ∪ B = {1, 2, 3, 4}`.\n- Intersección: `A ∩ B = {3}`.\n- Diferencia: `A \\ B = {1, 2}`.\n\n## Actividad\n\nSean `C = {a, b, c, d}` y `D = {c, d, e}`. Calcula `C ∪ D`, `C ∩ D` y `C \\ D`. Explica por qué la intersección contiene únicamente los elementos que aparecen en ambos conjuntos.',
   3, 'reading', 'published', 1, 1)
ON CONFLICT(id) DO UPDATE SET
  course_id = excluded.course_id,
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  content_md = excluded.content_md,
  sequence_no = excluded.sequence_no,
  lesson_type = excluded.lesson_type,
  status = excluded.status,
  required_to_complete = excluded.required_to_complete,
  content_version = excluded.content_version,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
