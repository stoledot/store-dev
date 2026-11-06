
# ¿Cómo escribir un curso en xml?
En archivo .xml

En el encabezado <?xml version="1.0" encoding="UTF-8"?>

Todo el curso debe estar en <curso>...</curso>

<curso>
    <meta>
        <title>
        Título del curso
        </title>
        <summary>
        Descripción o resumen del curso
        </summary>
        <author>
        Brillinury y Samuel
        </author>
        <id></id>
        <slug></slug>
    </meta>
    <section id="" title="" slug="" weight="">
        <lesson id="" slug="" title="" weight="">
            <content>
            Aquí puedes agregar html o código latex
            </content>
            <inputlatex title="Título"> <!-Aquí el alumno puede escribir código latex, estas entradas se almacenan en la bd y en el curso, el alumno puede descargar el .tex con sus entradas-->
            html con instrucciones 
            </inputlatex>
            <activity id="" type="" weight="">
            <!-
            Se usa para actividades revisables por la administración o el maestro asignado
            o si son choise o multiple-choise, se califica automáticamente
            type: choise, multiple-choise, short, long
            -->
                <question>
                    ¿Cuál de las siguientes es una proposición?
                </question>
                <options>
                    <option id="a" correct>"El cielo es azul."</option>
                    <option id="b" correct>"¿Qué hora es?"</option>
                    <option id="c">"2 + 2 = 5."</option>
                </options>
                <explanation>
                    La opción "El cielo es azul." es una proposición porque puede ser verdadera o falsa. 
                    La opción "¿Qué hora es?" no es una proposición porque es una pregunta. 
                    La opción "2 + 2 = 5." es una proposición, pero es falsa.
                </explanation>
            </activity>
            <activity id="actividad-2" type="long" weight=2>
                <question>
                    Explica la diferencia entre una proposición y una pregunta cotidiana.
                </question>
                <instructions>
                    Escribe tu respuesta en el espacio proporcionado.
                </instructions>
            </activity>
            <activity id="actividad-3" type="multiple-choice" weight=1>
                <question>
                    ¿Cuál de las siguientes afirmaciones es verdadera?
                </question>
                <options>
                    <option id="a">"El sol es un planeta."</option>
                    <option id="b" correct>"El agua hierve a 100°C."</option>
                    <option id="c">"La tierra es plana."</option>
                </options>
                <explanation>
                    La afirmación "El agua hierve a 100°C." es verdadera. 
                    Las otras afirmaciones son falsas.
                </explanation>
            </activity>
            <geogebragraphics ref="" title="">
            </geogebragraphics>
            <download ref=... title=...></download>
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