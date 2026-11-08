Los cursos y lecturas debo escribirlas en archivos .tex para subirlas a la plataforma.

## Esta es la esctructura de los documentos:
\chapter{Lógica matemática}
\section{Proposiciones}

\begin{lesson}[id=intro-proposiciones,weight=0]
Una proposición es un enunciado que puede ser verdadero o falso. Por ejemplo, \(2+2=4\) es verdadero, mientras que \(2+2=5\) es falso.
\end{lesson}

\begin{definition}[id=def-negacion,title={Negación},weight=0]
La negación de una proposición \(p\) se representa por \(\neg p\) y cambia su valor de verdad.
\end{definition}

\begin{activity}[id=respuesta-negacion,type=short,weight=1,due=2026-11-15]
Escribe la negación de la proposición: “Todos los números naturales son pares”.
\end{activity}

\begin{activity}[id=tabla-verdad,type=choice,weight=2]
¿Cuál es la negación de \(p\)?
\option{a}{\(p\)}
\option{b}{\(\neg p\)}
\option{c}{\(p\land q\)}
\correct{b}
\end{activity}

\begin{activity}[id=explicacion,type=long,weight=2]
Explica la diferencia entre una proposición y una pregunta cotidiana.
\end{activity}

\begin{deliverable}[id=entrega-logica,type=upload,weight=3,due=2026-12-01]
Entrega un PDF con una tabla de verdad y una explicación de sus resultados.
\end{deliverable}

\begin{table}[header=teal]
\row{Símbolo}{Lectura}
\row{\(\neg p\)}{No \(p\)}
\row{\(p\land q\)}{\(p\) y \(q\)}
\row{\(p\lor q\)}{\(p\) o \(q\)}
\end{table}


## Regla esencial para editar los archivos `.tex`

Asigna un `id` permanente a cada lectura o actividad. No cambies ese ID solo porque cambie el título, el orden o el texto de las instrucciones.

```tex
\begin{lesson}[id=limites-introduccion,weight=0]
Contenido de la lectura...
\end{lesson}

\begin{activity}[id=limites-ejercicio-01,type=short,weight=1]
Resuelve el ejercicio...
\end{activity}
```

### Cómo decidir los IDs

- **Mismo objetivo y misma actividad:** conserva el ID. Corregir una errata, mejorar una explicación o mover la actividad no reinicia el avance.
- **Actividad nueva:** asigna un ID nuevo. Aparecerá como pendiente para los alumnos actuales y nuevos. Si cambias el ID de una actividad que ya existía, el sistema la trata como una actividad nueva; la anterior queda archivada.
- **Actividad reemplazada por otra sustancialmente diferente:** asigna un ID nuevo a la actividad nueva. La anterior queda archivada y su historial no se elimina.
- **Actividad retirada:** quítala del `.tex`; se archiva y deja de contar en el total de actividades publicadas, pero su historial se conserva.
- **Evita repetir IDs dentro de un mismo archivo.**

Si una actividad antigua no tenía un ID explícito, el sistema intenta conservarla mediante su ID anterior, su slug o la combinación de título y tipo. Esta compatibilidad ayuda a las migraciones iniciales, pero para futuras actualizaciones se recomienda declarar IDs explícitos y estables.

## Qué significa “conservar el avance”

El avance se vincula a la identidad de una actividad, no a su número de posición en el documento. Por eso insertar una actividad entre dos existentes no debería desplazar ni mezclar sus entregas. Si la actividad existente mantiene su ID, se mantiene su estado. Si el trabajo cambia lo suficiente como para requerir una nueva entrega, debe usarse otro ID para que no se considere completada por error.

Las versiones anteriores del TeX se conservan en el bucket privado `FILES`. No se elimina ni se sobrescribe la clave de una versión anterior. La columna `school_courses.tex_source_key` apunta a la versión activa.

