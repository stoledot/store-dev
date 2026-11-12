# Límites máximos de lecciones y cuenta regresiva Doman

## Máximos en XML

Los límites aceptados en `<meta>` son:

```xml
<meta>
  <title>Curso</title>
  <summary>Resumen</summary>
  <author>Autor</author>
  <maxlessonsperday>3</maxlessonsperday>
  <maxlessonsperweek>12</maxlessonsperweek>
  <maxlessonspermonth>40</maxlessonspermonth>
  <maxlessonspertime>5/2w</maxlessonspertime>
</meta>
```

Los máximos de una sección se declaran como atributos:

```xml
<section id="unidad-1" title="Unidad 1"
  max-lessons-per-day="2"
  max-lessons-per-week="6"
  max-lessons-per-month="20"
  max-lessons-per-time="3/1w">
  ...
</section>
```

`maxlessonspertime` y `max-lessons-per-time` tienen formato `cantidad/duración`. La duración acepta valores como `2w`, `1month`, `3d`, `12h`, `30min` o `1200s`. El límite cuenta lecciones cuando el alumno las inicia por primera vez; volver a entrar a una lección ya iniciada no consume otro lugar. Una ventana móvil como `5/2w` cuenta inicios de los últimos 14 días. Los máximos diario, semanal y mensual usan el día local, la semana de lunes a domingo y el mes calendario en la zona horaria configurada para la escuela.

Si hay un máximo de curso y otro de sección, se deben cumplir ambos. El de sección cuenta únicamente las lecciones de esa sección; el de `<meta>` cuenta las lecciones del curso. Cuando se alcanza cualquiera, se bloquea el inicio de otra lección contable durante el periodo correspondiente.

## Excluir una lección del conteo

El nuevo atributo es opcional y por defecto equivale a `false`:

```xml
<lesson id="repaso" title="Repaso" exclude-from-number-max-lessons="true">
  <content><p>Esta lección no consume los máximos del curso ni de la sección.</p></content>
</lesson>
```

Usa `exclude-from-number-max-lessons="false"` para contarla explícitamente. Solo acepta `true` o `false`. Una lección excluida puede iniciarse aunque se haya alcanzado el máximo y no consume cupo de ningún límite, pero sigue apareciendo normalmente en el curso, el avance y la navegación.

## Cuenta regresiva de Slides Doman

Al pulsar **Reproducir** en un bloque Doman, el reproductor muestra `3`, `2`, `1` como tres pantallas consecutivas y genera un pitido breve y suave para cada número. Después empieza el audio y la secuencia de palabras del bloque, sin añadir un reproductor nuevo ni interrumpirla entre slides. La cuenta ocurre una vez al inicio del bloque; no se repite al avanzar manualmente entre slides. Al reiniciar la secuencia completa, vuelve a aparecer.

Cada `<domanslides>` directo en la lección es un bloque. Si se usa `<domanlabels>` con varios `<domanslides>` dentro, todos forman un solo bloque y comparten una cuenta regresiva. Los `<domanslides>` anidados dentro de otro son grupos de selección, no reproductores separados; el conteo aparece una sola vez antes de reproducir el bloque exterior.
