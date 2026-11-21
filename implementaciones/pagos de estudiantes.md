# Implementación de automatización de pagos # Guía de Implementación: Base de Datos Cloudflare D1 para Cobros y Subprogramas

Esta guía recopila el diseño del esquema SQLite (Cloudflare D1), la lógica de negocio para cobros recurrentes, reglas de morosidad, bajas automáticas y buenas prácticas de rendimiento.

---

## 1. Arquitectura General

Para manejar reglas de cobro recurrente, acumulación de adeudos y bajas automáticas en **Cloudflare D1 (SQLite)**, la mejor arquitectura consiste en **separar la configuración del plan (reglas) del libro mayor de cobros (transacciones/cargos individuales)**.

* **Evita calcular atrasos "al vuelo"** en cada consulta.
* **Genera cargos mensuales individuales** (facturas/recibos) y usa un proceso programado (**Cron Trigger en Cloudflare Workers**) para actualizar sus estados diariamente.

---

## 2. Esquema Completo de Base de Datos (SQLite / D1)

### A. Tabla `inscripciones`
Controla la relación entre el alumno y el subprograma, su ciclo de corte, estado operativo y contador de morosidad.

```sql
CREATE TABLE inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL,
    subprograma_id INTEGER NOT NULL,
    
    -- Control de fechas del ciclo del alumno
    fecha_inscripcion DATE NOT NULL DEFAULT (date('now')), -- Cuándo se dio de alta
    fecha_inicio_clases DATE NOT NULL,                     -- Cuándo arranca su primer periodo (clave si cobran por aniversario)
    proximo_corte DATE NOT NULL,                           -- Fecha en que inicia su siguiente mensualidad por generar
    
    -- Estado operativo y control de morosidad
    estado TEXT NOT NULL DEFAULT 'ACTIVO',                 -- 'ACTIVO', 'PAUSADO', 'BAJA_MOROSIDAD', 'BAJA_VOLUNTARIA', 'FINALIZADO'
    meses_atraso_consecutivos INTEGER NOT NULL DEFAULT 0,  -- Contador rápido (0 a 3; al llegar al 4to pasa a BAJA_MOROSIDAD)
    
    -- Auditoría de baja (si aplica)
    fecha_baja DATE,
    motivo_baja TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Llaves foráneas
    FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE RESTRICT,
    FOREIGN KEY (subprograma_id) REFERENCES subprogramas(id) ON DELETE RESTRICT
);

-- Índices esenciales para el rendimiento en D1
CREATE INDEX idx_inscripciones_alumno ON inscripciones(alumno_id);
CREATE INDEX idx_inscripciones_subprograma ON inscripciones(subprograma_id);
CREATE INDEX idx_inscripciones_cron ON inscripciones(estado, proximo_corte);

-- Evitar que un alumno tenga dos inscripciones ACTIVAS al mismo subprograma simultáneamente
CREATE UNIQUE INDEX idx_inscripcion_activa_unica 
ON inscripciones(alumno_id, subprograma_id) 
WHERE estado = 'ACTIVO';
```

#### Decisiones clave en `inscripciones`:
* **Índice único parcial (`idx_inscripcion_activa_unica`):** Evita inscribir dos veces al mismo alumno en un subprograma mientras ya está `ACTIVO`, pero **le permite volver a inscribirse** en el futuro si antes causó baja (conservando su historial intacto).
* **Columna `proximo_corte`:** Simplifica el Cron diario; permite identificar rápidamente qué inscripciones requieren la generación de un nuevo cargo.
* **`ON DELETE RESTRICT`:** Evita borrar accidentalmente un alumno o subprograma si ya tiene historial asociado.

---

### B. Tabla `reglas_cobro`
Configuración financiera por subprograma. Permite cambiar precios o días de gracia en el futuro sin afectar los cargos históricos.

```sql
CREATE TABLE reglas_cobro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subprograma_id INTEGER NOT NULL,
    monto_inscripcion INTEGER NOT NULL,          -- Guardar en centavos (ej. $500.00 = 50000)
    monto_mensualidad INTEGER NOT NULL,          -- Guardar en centavos
    dias_anticipacion_emision INTEGER DEFAULT 5, -- Días antes de iniciar el periodo para mostrar el cobro
    dias_gracia INTEGER DEFAULT 5,               -- Días extra después de la fecha límite antes de marcar vencido
    dia_corte INTEGER DEFAULT 1,                 -- Día del mes en que inicia el periodo (si es fecha fija)
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (subprograma_id) REFERENCES subprogramas(id)
);
```

---

### C. Tabla `cargos` (Libro mayor de cobros)
Cada fila es un cobro específico (una inscripción o una mensualidad de un mes concreto). Esta tabla resuelve la acumulación de adeudos.

```sql
CREATE TABLE cargos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,                     -- 'INSCRIPCION', 'MENSUALIDAD'
    concepto TEXT NOT NULL,                 -- Ej. 'Mensualidad Noviembre 2026'
    monto INTEGER NOT NULL,                 -- En centavos
    
    -- Fechas clave del ciclo de vida del cobro
    periodo_inicio DATE NOT NULL,           -- Fecha en que empiezan las clases que cubre este pago
    periodo_fin DATE NOT NULL,              -- Fecha en que terminan las clases que cubre este pago
    fecha_visible_desde DATE NOT NULL,      -- periodo_inicio - dias_anticipacion_emision
    fecha_vencimiento DATE NOT NULL,        -- Fecha límite normal de pago
    fecha_limite_gracia DATE NOT NULL,      -- fecha_vencimiento + dias_gracia
    
    -- Estado del pago
    estado TEXT DEFAULT 'PENDIENTE',        -- 'PROGRAMADO', 'PENDIENTE', 'VENCIDO', 'PAGADO', 'CONDONADO', 'CANCELADO'
    fecha_pago DATETIME,
    metodo_pago TEXT,
    referencia_pago TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id)
);

-- Índices para consultas rápidas en D1
CREATE INDEX idx_cargos_inscripcion ON cargos(inscripcion_id);
CREATE INDEX idx_cargos_estado_fechas ON cargos(estado, fecha_visible_desde, fecha_limite_gracia);
```

---

## 3. Lógica de las Reglas Administrativas (Flujos)

Implementa un **Cloudflare Worker con Cron Trigger** que se ejecute todos los días (ej. `00:05 hrs`).

### Flujo 1: Al inscribir al alumno
1. Creas el registro en `inscripciones` con `estado = 'ACTIVO'` y `meses_atraso_consecutivos = 0`.
2. Insertas inmediatamente dos registros en `cargos`:
   * **Cargo 1 (`INSCRIPCION`):** Con vencimiento inmediato (hoy).
   * **Cargo 2 (`MENSUALIDAD`):** Correspondiente a su primer mes de clases.

### Flujo 2: Generación y visibilidad de mensualidades (Cron Diario)
* **Acumulación de adeudos:** Al crear un nuevo registro en `cargos` cada mes sin borrar los anteriores, la deuda se acumula naturalmente. El saldo total de un alumno es `SUM(monto) WHERE estado IN ('PENDIENTE', 'VENCIDO')`.
* **Visibilidad anticipada:** En tu frontend/API, filtra los cargos donde `date('now') >= fecha_visible_desde`.
* **Emisión automática:** El Cron busca inscripciones activas donde `date('now', '+' || dias_anticipacion || ' days') >= proximo_corte`, inserta el nuevo cargo del mes entrante y actualiza `proximo_corte` al mes siguiente *(validando que no exista duplicado para ese `periodo_inicio`)*.

### Flujo 3: Días de gracia, vencimientos y baja al 4to mes (Cron Diario)

1. **Marcar vencidos (pasando días de gracia):**
```sql
UPDATE cargos 
SET estado = 'VENCIDO' 
WHERE estado = 'PENDIENTE' 
  AND date('now') > fecha_limite_gracia;
```

2. **Recalcular meses de atraso por inscripción:**
```sql
UPDATE inscripciones
SET meses_atraso_consecutivos = (
    SELECT COUNT(*) 
    FROM cargos 
    WHERE cargos.inscripcion_id = inscripciones.id 
      AND cargos.tipo = 'MENSUALIDAD' 
      AND cargos.estado = 'VENCIDO'
)
WHERE estado = 'ACTIVO';
```

3. **Ejecutar baja automática en el 4to mes de atraso:**
*(Si la baja ocurre al iniciar el 4to mes sin haber pagado los 3 anteriores)*:
```sql
UPDATE inscripciones
SET estado = 'BAJA_MOROSIDAD',
    fecha_baja = date('now'),
    motivo_baja = 'Acumulación de 4 meses de adeudo'
WHERE estado = 'ACTIVO'
  AND (
      SELECT COUNT(*) FROM cargos 
      WHERE cargos.inscripcion_id = inscripciones.id 
        AND cargos.tipo = 'MENSUALIDAD' 
        AND cargos.estado IN ('VENCIDO', 'PENDIENTE')
        AND date('now') >= cargos.periodo_inicio
  ) >= 4;
```
*(Opcional: Al dar de baja, puedes marcar como `'CANCELADO'` el 4to cargo si el alumno no tomará clases ese mes, dejando los 3 anteriores como deuda histórica).*

### Flujo 4: Cuando el alumno paga
1. Aplica el pago al cargo más antiguo primero (**regla FIFO**: primero mes 1 de atraso, luego mes 2, etc.).
2. Recalcula `meses_atraso_consecutivos` en `inscripciones`.

---

## 4. Buenas Prácticas y Límites en Cloudflare D1

### Consejos Técnicos
* **Usa enteros para el dinero (Centavos):** En SQLite, `REAL` usa punto flotante y puede provocar errores de redondeo. Guarda `$500.00` como `50000` (`INTEGER`) y divide entre 100 en el frontend.
* **Formato de fechas ISO-8601:** Guarda siempre las fechas como `YYYY-MM-DD` (ej. `2026-11-21`) para aprovechar nativamente `date('now')` y modificadores como `date(fecha, '+5 days')`.
* **Transacciones (`db.batch`):** Al registrar un pago o procesar una baja, usa `env.DB.batch([...])` en Cloudflare Workers para garantizar atomicidad.

### Importancia de los Índices y Cuotas de Cloudflare D1
Los índices (`CREATE INDEX`) crean estructuras ordenadas (B-Trees) que evitan lecturas completas de tabla (*Full Table Scans*). En D1 esto es vital porque las cuotas se miden por **renglones leídos y escritos**:

* **Plan Gratuito de Cloudflare D1:**
  * **Almacenamiento:** Hasta **500 MB por base de datos** (aprox. 2 a 3 millones de renglones) y hasta 5 GB totales en la cuenta (máximo 10 bases de datos).
  * **Lecturas diarias:** Hasta **5,000,000 de renglones leídos por día**.
  * **Escrituras diarias:** Hasta **100,000 renglones escritos por día** (`INSERT`, `UPDATE`, `DELETE`).
  * *(Los contadores diarios se reinician a las 00:00 UTC / 6:00 PM hora del centro de México).*
* **Plan de Pago ($5 USD/mes):** Sube a 10 GB por base de datos, 25 mil millones de lecturas/mes y 50 millones de escrituras/mes.
















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
| concepto_cobro | TEXT | | Descripción del concepto de cobro |
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
| activa | BOOLEAN | NOT NULL DEFAULT 1 | si esta activa o no la aplicacion a este alumno |


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

