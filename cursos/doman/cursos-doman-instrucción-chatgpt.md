
<curso lessons-per-time="8/24h" max-lessons-current-day="2">
    <!- weight >= 0, optional, default 1-->
    <section id="section-id" title="Título de la sección" weight="1"> 
        <lesson id="lesson-id" title="Título de la lección" weight="1"
            lockout-period-until-the-next-lesson="1h (0) (1d) (1w) (1month) (30min) (1200s)">    
            <!-
            Lecciones del curso
            weight >= 0, optional, default 1 
            -->
            <domanslides regex="" category="category-id-1 category-id-2" type="words" 
                level="level-1 level-2"
                max-time-length="3s" cantity="2" velocity="x1"
                initial-time-margin="=+2s" final-time-margin="0"
                automatic-sliding="true" mute="false" random-mute="false"
                random-selection="true" allow-pause="true"
                >
                <!-
                Slides de texto estilo Doman ligadas a audio.
                El sistema elegirá de forma palabras (ligadas a audio) utilizando los siguientes parámetros y las mostrará en forma de slides en la lección en la que está incluido el entorno <domanslides> con la configuración de los parámetros y con la configuración que establezcan los hijos.
                Parámetros:
                    Parámetros para la selección de palabras (el orden aquí es por jerarquía de mayor a menor jerarquía).
                        - regex: (opcional) expresión regular para seleccionar palabras o frases, si no se especifica se utilizan los otros parámetros de selección de palabras. Este es un parámetro de selección de palabras.
                        - category: (opcional) categorías de las palabras/frases separadas por espacios, si no se especifica, se pasarán de todas las categorías. Este es un parámetro de filtro de selección de palabras.
                        - type: (opcional) tipos de palabras, separados por espacios, si no se especifican, se omitirá el filtro. Este es otro parámetro de filtro de selección de palabras.
                        - level: (opcional) valores separados por espacios, se mostrarán solamente las palabras correspondientes a estos levels. Si no se especifíca, se mostrarán de todos los levels. Este es un parámetro de filtro de selección de palabras.
                    Parámetros de cantidad de palabras seleccionadas:
                        - max-time-leght: (opcional, default "60s") tiempo máximo que tardarán todas las slides en pasar (ejemplo "60s", 60 segundos). Este es un parámetro para la selección de palabras. Se elegirán las palabras de tal forma que todas las palabras juntas seleccionadas ocuparán máximo esta cantidad de tiempo.
                        - cantity: (opcional) cantidad de palabras que se pasarán, si no se especifica, se utiliza max-time-lenght como parámetro de referencia.
                    Parámetros de forma de seleccionar las palabras:
                        - random-selection: (optional, default "true") si las slides se seleccionarán de forma aleatoria respetando los parámetros de selección establecidos. Este es un parámetro de selección de palabras.
                    Parámetros para la interfaz:
                        - velocity: (opcional, default "x1") velocidad de reproducción de las slides (e.g. "x2", "x0.5"). Este es un parámetro para la selección de palabras.
                        - initial-time-margin: (opcional) margen de tiempo inicial de cada slide en que no se reproducirá audio, si no se especifica, no se dará margen inicial. E.g. "=+1s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, más 1 segundo. E.g. "=-2s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, menos 2 segundos. E.g. "0s" significa sin margen. E.g. "2s" significa 2 segundos de margen en cada slide. Este es un parámetro para la interfaz.
                        - final-time-margin: (opcional) margen de tiempo final de cada slide en que no se reproducirá audio, si no se especifica, no se dará margen final. E.g. "=+1s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, más 1 segundo. E.g. "=-2s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, menos 2 segundos. E.g. "0s" significa sin margen. E.g. "2s" significa 2 segundos de margen en cada slide. Este es un parámetro para la interfaz.
                        - automatic-sliding: (opcional, default "true") si las slides se reproducirán de forma automática. Este es un parámetro para la interfaz.
                        - mute: (opcional, default "false") si las slides estarán en silencio (sin reproducción de audio). Este es un parámetro para la interfaz.
                        - random-mute: (opcional, default "false") si en las slides estarán muteadas aleatoriamente (algunas sí y otras no). Este es un parámetro para la interfaz.
                        - allow-pause: (opcional, default "true"). Establece que durante la ejecución del proceso de pasar los slides de palabras, se pueda permitir al usuario ponerle pausa.
                    -->
                    <domanslides regex="" category="category-id-1 category-id-2" type="words oraciones" 
                        level="level-1 level-2"
                        max-time-length="3s" cantity="2" velocity="x1"
                        initial-time-margin="=+2s" final-time-margin="0"
                        mute="false" random-mute="false"
                        random-selection="true">
                        <!-
                        Slides hijas, que me permiten especificar al sistema qué palabras/frases se deben seleccionar para incluir en el padre. Las palabras/frases se seleccionarán primero tomando en cuenta a los hijos y luego al padre.
                        -->
                    </domanslides>
            </domanslides>
        </lesson>
    </section>
</curso>

Establecer tiempos de desbloqueos

en cada lección se establece un tiempo en el que la siguiente lección estará bloqueada.

abecedarío: Mayúsculas y minúsculas usar expresiones regulares



fase1: palabras sueltas
fase2: parejas de palabras 
fase3: oraciones sencillas
fase4: frases cuentos cortos 

fase5: lectura de libros

Quiero que me des los archivos en .zip de la siguiente implementación. En el panel de admin quiero una sección donde pueda grabar archivos de audio y estos se almacenen en github (ponme en github el formulario para guardar las credenciales de github). Estos audios quiero que tengan varios atributos: texto asociado, category (categoría), type (tipo), level (nivel), y ponme para poder definir a parte los atributos. Quiero que la interfaz de admin para grabar los audios pueda grabar varios audios corridos sin tener que meterle todos los campos de nuevo, porque voy a grabar muchos. También ponme un panel para administrar/editar todos los audios con sus atributos. Después quiero poder definir en los xml de curso entornos <domanlabels> con las siguientes características: cada <domanslides></domanslides> deben ir dentro de <lesson>. Además esta es la estructura de cada <domanslides>:
<domanslides regex="" category="category-id-1 category-id-2" type="words" 
                level="level-1 level-2"
                max-time-length="3s" cantity="2" velocity="x1"
                initial-time-margin="=+2s" final-time-margin="0"
                automatic-sliding="true" mute="false" random-mute="false"
                random-selection="true" allow-pause="true"
                >
                <!-
                Slides de texto estilo Doman ligadas a audio.
                El sistema elegirá de forma palabras (ligadas a audio) utilizando los siguientes parámetros y las mostrará en forma de slides en la lección en la que está incluido el entorno <domanslides> con la configuración de los parámetros y con la configuración que establezcan los hijos.
                Parámetros:
                    Parámetros para la selección de palabras (el orden aquí es por jerarquía de mayor a menor jerarquía).
                        - regex: (opcional) expresión regular para seleccionar palabras o frases, si no se especifica se utilizan los otros parámetros de selección de palabras. Este es un parámetro de selección de palabras.
                        - category: (opcional) categorías de las palabras/frases separadas por espacios, si no se especifica, se pasarán de todas las categorías. Este es un parámetro de filtro de selección de palabras.
                        - type: (opcional) tipos de palabras, separados por espacios, si no se especifican, se omitirá el filtro. Este es otro parámetro de filtro de selección de palabras.
                        - level: (opcional) valores separados por espacios, se mostrarán solamente las palabras correspondientes a estos levels. Si no se especifíca, se mostrarán de todos los levels. Este es un parámetro de filtro de selección de palabras.
                    Parámetros de cantidad de palabras seleccionadas:
                        - max-time-leght: (opcional, default "60s") tiempo máximo que tardarán todas las slides en pasar (ejemplo "60s", 60 segundos). Este es un parámetro para la selección de palabras. Se elegirán las palabras de tal forma que todas las palabras juntas seleccionadas ocuparán máximo esta cantidad de tiempo.
                        - cantity: (opcional) cantidad de palabras que se pasarán, si no se especifica, se utiliza max-time-lenght como parámetro de referencia.
                    Parámetros de forma de seleccionar las palabras:
                        - random-selection: (optional, default "true") si las slides se seleccionarán de forma aleatoria respetando los parámetros de selección establecidos. Este es un parámetro de selección de palabras.
                    Parámetros para la interfaz:
                        - velocity: (opcional, default "x1") velocidad de reproducción de las slides (e.g. "x2", "x0.5"). Este es un parámetro para la selección de palabras.
                        - initial-time-margin: (opcional) margen de tiempo inicial de cada slide en que no se reproducirá audio, si no se especifica, no se dará margen inicial. E.g. "=+1s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, más 1 segundo. E.g. "=-2s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, menos 2 segundos. E.g. "0s" significa sin margen. E.g. "2s" significa 2 segundos de margen en cada slide. Este es un parámetro para la interfaz.
                        - final-time-margin: (opcional) margen de tiempo final de cada slide en que no se reproducirá audio, si no se especifica, no se dará margen final. E.g. "=+1s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, más 1 segundo. E.g. "=-2s" significa que se dará de margen igual a lo que dura el audio ligado a la slide, menos 2 segundos. E.g. "0s" significa sin margen. E.g. "2s" significa 2 segundos de margen en cada slide. Este es un parámetro para la interfaz.
                        - automatic-sliding: (opcional, default "true") si las slides se reproducirán de forma automática. Este es un parámetro para la interfaz.
                        - mute: (opcional, default "false") si las slides estarán en silencio (sin reproducción de audio). Este es un parámetro para la interfaz.
                        - random-mute: (opcional, default "false") si en las slides estarán muteadas aleatoriamente (algunas sí y otras no). Este es un parámetro para la interfaz.
                        - allow-pause: (opcional, default "true"). Establece que durante la ejecución del proceso de pasar los slides de palabras, se pueda permitir al usuario ponerle pausa.
                    -->
                    <domanslides regex="" category="category-id-1 category-id-2" type="words oraciones" 
                        level="level-1 level-2"
                        max-time-length="3s" cantity="2" velocity="x1"
                        initial-time-margin="=+2s" final-time-margin="0"
                        mute="false" random-mute="false"
                        random-selection="true">
                        <!-
                        Slides hijas, que me permiten especificar al sistema qué palabras/frases se deben seleccionar para incluir en el padre. Las palabras/frases se seleccionarán primero tomando en cuenta a los hijos y luego al padre.
                        -->
                    </domanslides>
            </domanslides>
Quiero que el sistema traduzca estos entornos para que en cada lección del curso se puedan aparecer Slides Doman. En la interfaz de cada lección el <domanslides> quiero que se traduzca de la siguiente manera: el sistema elija las palabras/frases almacenadas respetando las instrucciones del xml del curso, y que muestre slides de las palabras/frases sincronizadas con el audio ligado, y que cada vez que pase una slide se repoduzca automáticamente el audio ligado respetando los márgenes de tiempo inicial o final establecidos en los parámetros de <domanslides>. Quiero que los slides se muestren de forma grande y abarquen gran parte de la pantalla y pon un botón de play, de pausa (si lo permite el parámetro allow-pause) y de replay, y uno de pantalla completa, para que las slides se muestren en pantalla completa, y con las palabras/frases del tamaño más grande posible pero sin que se mochen, adapatativo a todos los dispositivos. Color de fondo blanco de cada slide. Ponme de fácil acceso la edición de estilos de las slides. Todas las slides sin transiciones (animaciones de transicion entre una y otra).

-- Especificar los styles en base.css