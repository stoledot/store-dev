# Reglas temporales XML (base de implementación)

La importación XML reconoce y valida los valores opcionales de curso, sección,
lección y reproducciones Doman. Las políticas se almacenan en
`school_courses.xml_policy_json` y `school_lessons.xml_policy_json`; los límites
de reproducciones adicionales se conservan en los filtros de cada
`domanslides`. Los cursos TeX existentes conservan los valores vacíos por
defecto.

Duraciones admitidas: `month`, `months`, `w`, `d`, `h`, `min` y `s`, por ejemplo
`1month 2w 3d 4h 5min 6s`. Los contadores por día, semana y mes deben ser enteros
entre 1 y 10000. `maxlessonspertime` acepta `número/duración`, por ejemplo
`5/2w`. `number-playbacks-allowed` es un entero entre 0 y 10000 y representa
reproducciones adicionales a la primera.

## Migración

Aplicar en desarrollo con `npm run db:migrate` y en producción con
`npm run db:migrate:remote` antes del despliegue. La migración `0068` es aditiva:
agrega JSON de políticas y un contador de reproducciones adicionales inicializado
en cero.

## Alcance

Este cambio cubre parseo, validación y persistencia de configuración. La
aplicación de esas reglas en los puntos de acceso del alumno (expiración,
contabilización por zona horaria/ventana móvil, retención, lockout y cuotas de
reproducción) aún requiere integrar los controles en la lectura y mutación del
progreso estudiantil. No habilites las etiquetas en cursos publicados hasta que
esa integración esté desplegada.
