# Corrección del orden del checklist de inscripción

Se modifica únicamente `src/features/school/enrollmentChecklist.ts` para que el orden sea el mismo tanto para alumnos sin sesión como para alumnos autenticados:

1. Iniciar sesión
2. Conocer los programas de matemáticas o lectura
3. Pagar inscripción
4. Pagar mensualidad
5. Enviar diagnóstico
6. Iniciar curso asignado

La consulta de estados y las condiciones que determinan cada palomita no cambian. Como la interfaz numera los pasos según el arreglo recibido, también se actualizan automáticamente la numeración, el orden visual y el cálculo del siguiente paso.

## Instalación

Extrae este ZIP en la raíz del proyecto y permite que se sobrescriba el archivo indicado. No requiere una migración nueva ni cambios en la base de datos.

## Verificación

Se revisó que ambas listas (sin sesión y con sesión) contengan los seis pasos en el orden solicitado. No se ejecutó el build de Astro ni pruebas del proyecto.
