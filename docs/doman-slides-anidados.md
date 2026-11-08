# Uso de `<domanslides>` anidados

Los grupos anidados permiten reservar primero palabras con filtros específicos y completar después la misma secuencia con los filtros del padre. Cada lección conserva un solo reproductor: pulsar **Reproducir** inicia una secuencia continua; no se crean reproductores ni botones separados para los hijos.

## Ejemplo

```xml
<lesson id="vocales" title="Vocales">
  <content><p>Observa las palabras.</p></content>
  <domanslides category="vocabulario" cantity="8" random-selection="false">
    <domanslides type="vocal" level="N1" cantity="3" random-selection="false" />
    <domanslides idslide="ID_AUDIO_4 ID_AUDIO_9" />
  </domanslides>
</lesson>
```

Comportamiento del ejemplo:

1. Se buscan primero hasta tres audios que coincidan con `type="vocal"` y `level="N1"`.
2. Después se intentan seleccionar los IDs `ID_AUDIO_4` y `ID_AUDIO_9`, en ese orden. Un audio ya seleccionado por el primer hijo no se repite.
3. Si todavía no hay ocho audios, el padre completa los lugares restantes con audios que coincidan con `category="vocabulario"`.
4. La secuencia final reproduce primero lo elegido por el primer hijo, luego lo elegido por el segundo hijo y al final el complemento del padre. Todo ocurre en una sola reproducción continua.

Los hijos se procesan en el orden en que aparecen en el XML. La selección es sin repetición dentro del bloque superior, incluso si un audio coincide con más de un hijo. Los filtros de clasificación (`category`, `type`, `level`, `regex`, `idslide`) y los ajustes de reproducción del padre se heredan; un hijo puede afinarlos o reemplazarlos con sus propios atributos.

## Cuotas y atributos

- `cantity="N"` en un grupo padre fija el máximo total de diapositivas de ese grupo, contando las elegidas por todos sus descendientes. Los hijos consumen primero esa cuota; el padre solo completa el resto. Un `cantity` en un hijo limita cuántas selecciona ese hijo y sus propios descendientes en conjunto.
- `max-time-length="60s"` fija de manera equivalente el presupuesto total aproximado de reproducción del grupo. Los hijos consumen primero el presupuesto del padre. Si se declaran `cantity` y `max-time-length` en el mismo grupo, `cantity` controla su cantidad y el límite de tiempo queda sin efecto para esa cuota.
- Si el grupo superior no declara ninguna cuota, se usa un máximo predeterminado de 60 segundos.
- `idslide="ID1 ID2"` limita la selección a esos IDs y conserva el orden indicado. Los IDs deben ser únicos y coincidir con audios activos de la biblioteca. También deben cumplir los demás filtros aplicables.
- `random-selection="true"` (predeterminado) mezcla candidatos que no estén fijados por `idslide`; usa `false` para conservar el orden de la biblioteca.
- Cada hijo debe ser otro `<domanslides />`; no admite texto ni otros elementos XML. Se permiten hasta ocho niveles de anidación.

Los grupos superiores de una misma lección también se unen en la secuencia del mismo reproductor. Para crear una sección con reservas específicas y complemento, coloca sus grupos como hijos de un mismo padre.
