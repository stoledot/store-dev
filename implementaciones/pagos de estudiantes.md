
# Implementación del Sistema de Pagos de Estudiantes

## Tabla de alumnos (número de alumno, y número de cliente (Customer ID))

Alumnos (Students)
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| student_number | TEXT | UNIQUE NOT NULL |
| customer_id | TEXT | UNIQUE NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (student_id) REFERENCES school_students(student_id) ON DELETE CASCADE |

## Tabla de salon de clases (Classroom)

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| nombre | TEXT | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |

## Tabla de relación entre alumnos y salones de clases (Student-Classroom Relationship)

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| alumno_id | INTEGER | NOT NULL |
| salon_id | INTEGER | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE |
| FOREIGN KEY (salon_id) REFERENCES salon(id) ON DELETE CASCADE |

## Tabla de relación entre salon de clases y cursos (Classroom-Course Relationship) (Tabla de cursos de la migración 0040_school_catalog.sql)

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| salon_id | INTEGER | NOT NULL |
| curso_id | INTEGER | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (salon_id) REFERENCES salon(id) ON DELETE CASCADE |
| FOREIGN KEY (curso_id) REFERENCES curso(id) ON DELETE CASCADE |

## Tabla de relación entre conferencias y salon de clases (Conference-Classroom Relationship) (Tabla de conferencias de la migración 0050_zoom_conferences.sql)

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| conference_id | INTEGER | NOT NULL |
| salon_id | INTEGER | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE |
| FOREIGN KEY (salon_id) REFERENCES salon(id) ON DELETE CASCADE |

## Tabla de relación entre salon de clases y lectura (Classroom-Reading Relationship) (lecturas de la migración 0099_products_lecturas.sql)

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| salon_id | INTEGER | NOT NULL |
| lectura_id | INTEGER | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (salon_id) REFERENCES salon(id) ON DELETE CASCADE |
| FOREIGN KEY (lectura_id) REFERENCES lectura(id) ON DELETE CASCADE |


## Tabla de reglas administrativas
| Campo | Tipo | Valores posibles | Descripción |
|-------|------|-----------------|-------------|
|id | INTEGER |  | Identificador único de la regla administrativa |
| nombre | TEXT |  | Nombre descriptivo de la regla administrativa |
| descripcion | TEXT |  | Descripción detallada de la regla administrativa |
|tipo | TEXT | cobro, acceso | Define si la regla es de cobro o de acceso |
| consecuencia | TEXT |  | Define la acción que se tomará si no se cumple la regla administrativa |
| tipo_objeto_aplicable | TEXT |  | Especifica el tipo de objeto al que se aplica la regla administrativa |
| objeto_aplicable_id | INTEGER |  | Identificador del objeto específico al que se aplica la regla administrativa |
| activo | BOOLEAN |  | Indica si la regla administrativa está activa o no |
| created_at | TEXT |  | Fecha de creación de la regla administrativa |
| updated_at | TEXT |  | Fecha de última actualización de la regla administrativa |


## Tabla de parámetros de cobro de las reglas administrativas

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| regla_id | INTEGER | NOT NULL |
| product_id | INTEGER | NOT NULL | Identificador del producto asociado al cobro |

| moneda | TEXT | NOT NULL | Moneda del cobro |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (regla_id) REFERENCES reglas_administrativas(id) ON DELETE CASCADE |




regla es la condición o criterio que determina cómo se aplican los accesos a un salon de clases específico. Por ejemplo, puede definir si un alumno puede acceder a un curso, una lectura o una conferencia, o cualquier otra política de acceso que se desee implementar para ese salon de clases.
regla se expresa en Json, lo que permite definir estructuras complejas y flexibles para las políticas de acceso, como restricciones por alumno, curso, lectura o conferencia, entre otros criterios.
Ejemplo de estructura JSON para la regla de cobro:
```json
Descripción del json:
- "consecuencia": Define la acción que se tomará si no se cumple la regla de cobro, por ejemplo, "bloqueo-de-acceso".
    -> Posibles valores: "bloqueo-de-acceso", "notificacion", "suspension", "multas", "ninguna"
- "tipo_objeto_aplicable": Especifica el tipo de objeto al que se aplica la regla, en este caso, "salon".
    -> Posibles valores: "salon", "curso", "lectura", "conferencia"
- "objeto_aplicable_id": Identificador del objeto específico al que se aplica la regla.
    -> Debe ser un número entero que corresponda al ID del objeto en cuestión.
    -> Debe ser un número entero que corresponda al ID del producto en cuestión.
- "parametros_cobro": Contiene los detalles del cobro, incluyendo:
    -> Debe ser un objeto JSON con los siguientes campos:
    - "product_id": Identificador del producto asociado al cobro.
        -> Debe ser un número entero que corresponda al ID del producto en cuestión.
    - "concepto_cobro": Concepto del cobro, por ejemplo, "mensualidad", "inscripción", "materiales", "Cuota SEP"
    - "fechas_vencimiento": Lista de fechas de vencimiento del cobro.
    - "dias_gracia": Número de días de gracia antes de aplicar la consecuencia.
    - "dias_aviso": Número de días de aviso antes de la fecha de vencimiento.
    - "dias_disponibles_de_anticipacion": Número de días anteriores a la fecha de vencimiento en que estará disponible el cobro.
    
Ejemplo de regla de cobro:
(Para establecer que si no se cumple la regla de cobro una vez, se aplique la consecuencia de bloqueo de acceso al salon)
{
    "consecuencia": "bloqueo-de-acceso",
    "tipo_objeto_aplicable": "salon",
    "objeto_aplicable_id": 1,
    "parametros_cobro": [
        {
            "product_id": 1,
            "concepto_cobro": "mensualidad",
            "fecha_vencimiento": "2024-12-31",
            "periodo_cobertura": ["2024-12-01", "2024-12-31"],
            "dias_gracia": 7,
            "dias_aviso": 3,
            "dias_disponibles_de_anticipacion": 5,
        },
        {
            "product_id": 1,
            "concepto_cobro": "mensualidad",
            "fecha_vencimiento": "2025-01-31",
            "periodo_cobertura": ["2025-01-01", "2025-01-31"],
            "dias_gracia": 7,
            "dias_aviso": 3,
            "dias_disponibles_de_anticipacion": 5
        }
    ],
    "condiciones_incumplimiento": [
        {
            "usar_otra_regla": false,
            "numero_incumplimientos": 1
        }
    ]
}


Otro ejemplo de regla de cobro
(Para establecer que si se incumplen tres veces la regla administrativa id 1, se aplique la consecuencia de baja temporal del salon de clases)
{
    "consecuencia": "baja-temporal",
    "tipo_objeto_aplicable": "salon",
    "objeto_aplicable_id": 1,
    "condiciones_incumplimiento": [
        {
            "usar_otra_regla": true,
            "regla_administrativa_aplicable_id": 1,
            "numero_incumplimientos": 3,
        }
    ]
    
}




```

## Tabla de asignación de reglas administrativas a alumnos

|Campo | Tipo | Restricciones | Descripción |
|------|------|----------------|-------------|
| regla_administrativa_id | INTEGER | NOT NULL | Identificador de la regla administrativa asignada al alumno |
| alumno_id | INTEGER | NOT NULL | Identificador del alumno al que se le asigna la regla administrativa |
| fecha_asignacion | DATE | NOT NULL | Fecha en la que se asigna la regla administrativa al alumno |


## Tabla de registro de cumplimiento de reglas administrativas
|Campo | Tipo | Restricciones | Descripción |
|------|------|----------------|-------------|
| regla_administrativa_id | INTEGER | NOT NULL | Identificador de la regla administrativa que se está registrando |
| alumno_id | INTEGER | NOT NULL | Identificador del alumno al que se le está registrando el cumplimiento de la regla administrativa |
| fecha_cumplimiento | DATE | NOT NULL | Fecha en la que se cumple la regla administrativa |
| estado_cumplimiento | TEXT | NOT NULL | Estado del cumplimiento de la regla administrativa, por ejemplo, "cumplido", "incumplido" |
| observaciones | TEXT |  | Observaciones adicionales sobre el cumplimiento de la regla administrativa |
