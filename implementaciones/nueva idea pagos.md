
# Implementación del Sistema de Pagos de Estudiantes

## Niveles académicos

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| nombre | TEXT | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |

## Tabla de alumnos (número de alumno, y número de cliente (Customer ID))

Alumnos (Students)
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| student_number | TEXT | UNIQUE NOT NULL |
| customer_id | TEXT | UNIQUE NOT NULL |
| nivel_academico_id | INTEGER | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (student_number) REFERENCES school_students(student_number) ON DELETE CASCADE |
| FOREIGN KEY (nivel_academico_id) REFERENCES niveles_academicos(id) ON DELETE CASCADE |
| FOREIGN KEY (customer_id) REFERENCES school_students(customer_id) ON DELETE CASCADE |

## Tabla de subprogramas (Subprograms)
Ya implementada en la migración 0076_school_subprograms.sql

ESQUEMA (YA IMPLEMENTADO)
CREATE TABLE school_subprograms (
  id TEXT PRIMARY KEY,
  program_slug TEXT NOT NULL
    REFERENCES school_programs(slug) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  education_level TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  methodology TEXT NOT NULL DEFAULT '',
  terms_md TEXT NOT NULL DEFAULT '',
  policies_md TEXT NOT NULL DEFAULT '',
  duration_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (program_slug, slug)
);

## Tabla de relación de alumnos y subprogramas (Student-Subprogram Relationship)

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| alumno_id | INTEGER | NOT NULL |
| subprograma_id | TEXT | NOT NULL |
| creado_en | TEXT | NOT NULL DEFAULT (datetime('now')) |
| FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE |
| FOREIGN KEY (subprograma_id) REFERENCES school_subprograms(id) ON DELETE CASCADE |
| PRIMARY KEY (alumno_id, subprograma_id) |

# REGLAS ADMINISTRATIVAS DE COBRO




## PROCESO PARA LA ASIGNACIÓN DE REGLAS ADMINISTRATIVAS A SUBPROGRAMAS
1. Creación de regla administrativa:
   - Se define el nombre, descripción, tipo y consecuencia de la regla administrativa.
   - Se especifica el objeto al que se aplicará la regla (subprograma, producto, etc.).
   - Se establece si la regla estará activa o no.
   - Se registran las fechas de creación y actualización de la regla administrativa.

2. Asignación de regla administrativa a subprograma:
   - Se selecciona el subprograma al que se aplicará la regla administrativa.
   - Se elige la regla administrativa previamente creada.
   - Se establece si la asignación estará activa o no.
   - Se registran las fechas de creación y actualización de la asignación.

## Tabla de reglas administrativas
| Campo | Tipo | Valores posibles | Descripción |
|-------|------|-----------------|-------------|
| id | INTEGER |  | Identificador único de la regla administrativa |
| nombre | TEXT |  | Nombre descriptivo de la regla administrativa |
| descripcion | TEXT |  | Descripción detallada de la regla administrativa |
| tipo | TEXT | cobro, acceso | Define si la regla es de cobro o de acceso |
| consecuencia | TEXT |  | Define la acción que se tomará si no se cumple la regla administrativa |
| tipo_objeto_aplicable | TEXT |  | Especifica el tipo de objeto al que se aplica la regla administrativa |
| objeto_aplicable_id | INTEGER |  | Identificador del objeto específico al que se aplica la regla administrativa |
| activo | BOOLEAN |  | Indica si la regla administrativa está activa o no |
| created_at | TEXT |  | Fecha de creación de la regla administrativa |
| updated_at | TEXT |  | Fecha de última actualización de la regla administrativa |


## Tabla de parámetros de cobro de las reglas administrativas

| Campo | Tipo | Restricciones | Ejemplos |
|-------|------|---------------|----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| regla_id | INTEGER | NOT NULL |
| product_id | INTEGER | NOT NULL | Identificador del producto asociado al cobro |
| concepto_cobro | TEXT | | Descripción del concepto de cobro |
| fecha_vencimiento | DATE | NOT NULL | Fecha de vencimiento del cobro |
| fecha_inicio_cobertura | DATE | NOT NULL | Fecha de inicio de la cobertura del cobro |
| fecha_fin_cobertura | DATE | NOT NULL | Fecha de fin de la cobertura del cobro |
| dias_gracia | INTEGER |  | Número de días de gracia para el cobro |
| dias_de_aviso | INTEGER |  | Número de días de aviso previo al cobro |
| dias_disponible_anticipacion | INTEGER |  | Número de días disponibles para realizar el cobro de manera anticipada |
| estado | TEXT |  | Estado del parámetro de cobro, por ejemplo, "activo", "inactivo" |
| disparador_de_incumplimiento | TEXT |  | Acción a tomar en caso de incumplimiento del cobro | producto-no-pagado & fecha > fecha_vencimiento + dias_gracia |
| disparador_de_cumplimiento | TEXT |  | Acción a tomar en caso de cumplimiento del cobro | producto-pagado & fecha <= fecha_vencimiento + dias_gracia |
| disparador_de_en_curso | TEXT |  | Acción a tomar mientras el cobro está en curso | fecha >= fecha_inicio_cobertura & fecha <= fecha_fin_cobertura |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | Fecha de creación del parámetro de cobro |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | Fecha de última actualización del parámetro de cobro |
| FOREIGN KEY (regla_id) REFERENCES reglas_administrativas(id) ON DELETE CASCADE |
| FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE | Identificador del producto asociado al cobro |


## Tabla de asignación de reglas administrativas a alumnos
|Campo | Tipo | Restricciones | Descripción |
|------|------|----------------|-------------|
| regla_administrativa_id | INTEGER | NOT NULL | Identificador de la regla administrativa asignada al alumno |
| subprograma_id | INTEGER | NOT NULL | Identificador del subprograma al que se le asigna la regla administrativa |
| fecha_asignacion | DATE | NOT NULL | Fecha en la que se asigna la regla administrativa al alumno |
| activa | BOOLEAN | NOT NULL DEFAULT 1 | Indica si la asignación de la regla administrativa al alumno está activa o no |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | Fecha de creación de la asignación de la regla administrativa al alumno |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | Fecha de última actualización de la asignación de la regla administrativa al alumno |


## Tabla de registro de cumplimiento de reglas administrativas
|Campo | Tipo | Restricciones | Descripción |
|------|------|----------------|-------------|
| regla_administrativa_id | INTEGER | NOT NULL | Identificador de la regla administrativa que se está registrando |
| alumno_id | INTEGER | NOT NULL | Identificador del alumno al que se le está registrando el cumplimiento de la regla administrativa |
| fecha_cumplimiento | DATE | NOT NULL | Fecha en la que se cumple la regla administrativa |
| estado_cumplimiento | TEXT | NOT NULL | Estado del cumplimiento de la regla administrativa, por ejemplo, "cumplido", "incumplido", "pendiente", "en curso"|
| observaciones | TEXT |  | Observaciones adicionales sobre el cumplimiento de la regla administrativa |


## Tratamiento de organización escolar
¿cómo organizo la escuela?
Hay carreras, areas de interes, programas, subprogramas, grupos escolares, salones de clases, periodos escolares, lecturas, conferencias, 

Creo que para asignarle un privilegio a un alumno, debe ser por tabla:
    Si se crea una pareja ordenada de (alumno, lectura), esta lectura se maneja como un acceso independiente a todo lo demás,
    Si se crea una pareja ordenada de (alumno, conferencia), la conferencia le apatecerá al alumno, independite de todo lo demás.
    Si se crea una pareja ordenada de (alumno, salon de clases), es porque el alumno puede acceder a los beneficios que el salón de clases ofrece: conferencias, cursos, lecturas, pero dentro del salón de clases específico.
    Si se crea una pereja ordenada de (alumno, subprograma), entonces, solo se indica que ese alumno está inscrito a un subprograma específico, aunque, esto no sirve de mucho.
    
Es mejor crear grupos (salones) de alumnos independiente a cualquier objeto adicional, para simplificar relaciones.



# OTRA IDEA
tengo que asignarle a cada alumno un nivel académico



# Implementación para después:




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


# Notas de reglas administraticas:
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

