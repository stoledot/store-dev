# IDs de audio en slides Doman

En Administración > Escuela > Audios Doman, cada registro muestra su ID. La biblioteca carga 20 registros por página; usa Anterior/Siguiente para navegar.

En un bloque `<domanslides>`, el atributo opcional `idslide` acepta IDs únicos separados por espacios. Los audios se reproducen en el orden indicado y no se aleatorizan:

```xml
<domanslides idslide="7c64c39e-4c47-4c70-a0e6-f3b90dfcb1df 68d…" />
```

Usa los IDs completos que muestra el panel. `idslide` puede combinarse con `category`, `type`, `level` y `regex`; los elementos listados también deben cumplir esos filtros.

## Vigencia individual

En Administración > Escuela, en la fila del curso asignado, “Vigencia personalizada (anula XML)” guarda una fecha hasta la que ese alumno puede acceder. “Restablecer XML” elimina la excepción y vuelve al vencimiento normal del curso.

## Migración

Aplica `migrations/0070_school_course_access_overrides.sql` sobre D1 con el mecanismo de migraciones del proyecto. La migración agrega una tabla y no modifica registros existentes.
