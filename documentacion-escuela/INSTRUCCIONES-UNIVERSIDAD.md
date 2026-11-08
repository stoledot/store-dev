# Implementación de administración universitaria Minshop Astro/Cloudflare

## Archivos incluidos

Este paquete contiene únicamente archivos agregados o modificados para la infraestructura universitaria. Está pensado para integrarse en el mismo árbol del proyecto Minshop Astro.

## Instalación

1. Haz respaldo de D1 y del proyecto antes de aplicar cambios.
2. Copia las rutas del ZIP sobre la raíz del repositorio, conservando su estructura.
3. Confirma que el binding D1 `DB` y el bucket privado R2 `FILES` existan en los entornos que usarán las inscripciones (el bucket también se usa para otros adjuntos de la escuela).
4. Aplica las migraciones en orden con el comando D1 habitual del proyecto. La migración `0059_school_notifications_message_null.sql` corrige una migración preexistente inválida para SQLite/D1; si un entorno ya aplicó manualmente una variante de `0059`, revisa el estado de `school_notifications` antes de volver a aplicarla.
5. Despliega la aplicación. En local, ejecuta el flujo normal de desarrollo del repositorio completo (este ZIP no incluye dependencias ni configuración de Astro).

## Flujos nuevos

- **Cliente:** al verificar por primera vez el enlace mágico, recibe un número de cliente de 10 dígitos. El número aparece en `/account/profile`. Ahí puede establecer una contraseña (mínimo 12 caracteres) para entrar con número y contraseña. El enlace mágico por correo sigue disponible.
- **Inscripción:** `/escuela/inscripcion`. El solicitante registra sus datos y carrera. Para mayores de edad solicita subir identificación; para menores pide los datos del padre/tutor y permite adjuntar su identificación. Los documentos se guardan en R2 privado con claves opacas; no se almacena un número de identificación oficial en D1. La administración puede ver el estado, pedir correcciones, rechazar o aprobar.
- **Administración universitaria:** `/admin/escuela/universidad`, enlazada desde `/admin/escuela`. Permite crear carreras, vincular cursos regulares o propedéuticos y prerrequisitos, crear ciclos, registrar maestros a partir de un cliente verificado, asignarles cursos y aulas, revisar inscripciones y asignar alumnos a ciclos y aulas.
- **Aulas y comunicación:** cada aula tiene exactamente un curso, un ciclo, fechas de inicio y término y cupo opcional. Un alumno puede estar en varios ciclos y aulas. `/escuela/alumno` muestra sus aulas; `/escuela/docente` muestra los grupos del maestro. Los mensajes de `/escuela/aulas/[id]` requieren pertenecer al grupo como alumno o maestro.
- **Acceso a cursos:** la lección permite acceso por matrícula activa en un aula del curso cuando el ciclo y el aula están activos y la fecha actual está dentro del periodo. Las vías anteriores de compra/asignación siguen funcionando. El enlace desde Mis aulas abre la primera lección publicada.

## Números e identidad

Los nuevos expedientes, aplicaciones de inscripción, maestros, rosters y mensajes se relacionan mediante `client_number`, `student_number` y `teacher_number`. Los correos verificados siguen siendo la forma de comprobar la propiedad de la cuenta y de enviar enlaces mágicos.

Por compatibilidad, las tablas de pedidos y el progreso escolar histórico que ya identifican al alumno con `email` no se migran ni se reescriben en este paquete. Las lecciones continúan escribiendo el progreso histórico con el email autenticado; el número de cliente se utiliza para resolver la matrícula del aula y autorizar el acceso a ese curso. Esto conserva el progreso existente, pero una conversión integral de todas las consultas heredadas a números requiere una migración de datos y cambios coordinados en los demás módulos de compra, calificaciones, reportes y mensajes.

## Notas operativas

- El administrador debe registrar al maestro con su número de cliente después de que este haya verificado su primer enlace mágico.
- El número de alumno se emite al aprobar una inscripción. El número es permanente aunque cambie de ciclo o de aula.
- El ciclo y el aula deben activarse, además de estar en fechas vigentes, para que la matrícula dé acceso a las lecciones.
- La capacidad se valida al asignar alumnos y las listas por solicitud se limitan a 100 números para respetar límites prácticos de parámetros D1.
- Las asignaciones de aula se conservan al cambiar de curso futuro; no se sobrescribe historial ni progreso.

## Comprobaciones y límites

La secuencia SQL completa se ejecutó en SQLite en memoria, con claves foráneas activadas, desde la primera migración hasta `0062_school_university_identity.sql`; se confirmó que `school_notifications.message` quedó nullable. No fue posible ejecutar un build Astro de producción: la copia fuente no contiene el `package.json`, la configuración Astro/Wrangler ni las dependencias de la raíz del proyecto. Antes de desplegar, ejecuta el build y prueba en staging: magic link, contraseña, carga y descarga administrativa de documentos, aprobación/corrección de solicitudes, asignación de maestro/alumnos y acceso al curso durante y fuera de las fechas del ciclo.
