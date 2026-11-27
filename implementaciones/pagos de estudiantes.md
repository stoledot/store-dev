# Implementación de automatización de pagos # Guía de Implementación: Base de Datos Cloudflare D1 para Cobros y Subprogramas

Esta guía recopila el diseño del esquema SQLite (Cloudflare D1), la lógica de negocio para cobros recurrentes, reglas de morosidad, bajas automáticas y buenas prácticas de rendimiento.

---

## 1. Arquitectura General

Para manejar reglas de cobro recurrente, acumulación de adeudos y bajas automáticas en **Cloudflare D1 (SQLite)**, la mejor arquitectura consiste en **separar la configuración del plan (reglas) del libro mayor de cobros (transacciones/cargos individuales)**.

* **Evita calcular atrasos "al vuelo"** en cada consulta.
* **Genera cargos mensuales individuales** (facturas/recibos) y usa un proceso programado (**Cron Trigger en Cloudflare Workers**) para actualizar sus estados diariamente.

---

## 2. Esquema Completo de Base de Datos (SQLite / D1)

## Tabla de Alumnos: 
Un cliente puede registrar a varios alumnos
```sql
CREATE TABLE alumnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    genero TEXT, -- 'M' o 'F' u otro valor según corresponda
    email TEXT UNIQUE NOT NULL,
    telefono TEXT,
    whatsapp TEXT,
    customer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX idx_alumnos_email ON alumnos(email);
CREATE INDEX idx_alumnos_customer_id ON alumnos(customer_id);
```


# Guía Completa de Arquitectura en Cloudflare D1 (SQLite): Cobros, Bajas y Control de Clases

Este documento consolida el esquema de base de datos, las reglas de negocio automatizadas y los controles operativos para administrar subprogramas de aprendizaje, cobros recurrentes con morosidad y asignación exacta de clases por alumno en **Cloudflare D1**.

---

## 1. Arquitectura General

El sistema separa la **configuración** (reglas y catálogos) del **libro mayor transaccional** (inscripciones, cargos individuales y asistencias).

1. **Inscripción continua:** Un alumno se inscribe una sola vez a un subprograma (`inscripciones`). No se reinscribe cada mes.
2. **Cargos mensuales individuales:** Cada mensualidad genera una fila en `cargos` con sus propias fechas de visibilidad, vencimiento, gracia y cuota de clases.
3. **Bolsa de clases por periodo:** Cada cargo mensual desbloquea un número exacto de clases (`clases_incluidas`). Cada asistencia las descuenta (`clases_consumidas`), evitando dar sesiones de más o dejar alumnos sin sus clases.
4. **Automatización diaria:** Un Cloudflare Worker con **Cron Trigger** evalúa vencimientos, acumula atrasos, ejecuta bajas al 4to mes y emite los cobros del siguiente periodo.

---

## 2. Esquema Completo de Base de Datos (D1 / SQLite)

### A. Tabla `inscripciones`
Controla la relación activa entre el alumno y el subprograma, su ciclo de corte y su estado de morosidad.

```sql
CREATE TABLE inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL,
    subprograma_id INTEGER NOT NULL,
    
    -- Control de fechas del ciclo del alumno
    fecha_inscripcion DATE NOT NULL DEFAULT (date('now')),
    fecha_inicio_clases DATE NOT NULL,
    proximo_corte DATE NOT NULL,                           -- Fecha en que inicia su siguiente mensualidad por generar
    
    -- Cuota personalizada de clases por periodo
    clases_por_mes INTEGER NOT NULL DEFAULT 4,             -- Ej. 4 u 8 clases al mes según su plan
    
    -- Estado operativo y control de morosidad
    estado TEXT NOT NULL DEFAULT 'ACTIVO',                 -- 'ACTIVO', 'PAUSADO', 'BAJA_MOROSIDAD', 'BAJA_VOLUNTARIA', 'FINALIZADO'
    meses_atraso_consecutivos INTEGER NOT NULL DEFAULT 0,  -- Contador rápido (0 a 3; al llegar al 4to pasa a BAJA_MOROSIDAD)
    
    -- Auditoría de baja
    fecha_baja DATE,
    motivo_baja TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE RESTRICT,
    FOREIGN KEY (subprograma_id) REFERENCES subprogramas(id) ON DELETE RESTRICT
);

-- Índices de rendimiento
CREATE INDEX idx_inscripciones_alumno ON inscripciones(alumno_id);
CREATE INDEX idx_inscripciones_subprograma ON inscripciones(subprograma_id);
CREATE INDEX idx_inscripciones_cron ON inscripciones(estado, proximo_corte);

-- Evita duplicar inscripciones ACTIVAS al mismo subprograma, pero permite reingresos históricos
CREATE UNIQUE INDEX idx_inscripcion_activa_unica 
ON inscripciones(alumno_id, subprograma_id) 
WHERE estado = 'ACTIVO';
```

### B. Tabla `reglas_cobro`
Define las tarifas y plazos vigentes por subprograma.

```sql
CREATE TABLE reglas_cobro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subprograma_id INTEGER NOT NULL,
    monto_inscripcion INTEGER NOT NULL,          -- Guardar en centavos (ej. 50000 = $500.00)
    monto_mensualidad INTEGER NOT NULL,          -- Guardar en centavos
    dias_anticipacion_emision INTEGER DEFAULT 5, -- Días antes del periodo en que el cobro se hace visible
    dias_gracia INTEGER DEFAULT 5,               -- Días extra después del vencimiento antes de marcar morosidad
    dia_corte INTEGER DEFAULT 1,                 -- Día del mes de corte (si aplica corte fijo)
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (subprograma_id) REFERENCES subprogramas(id)
);
```

### C. Tabla `cargos`
Libro mayor de todos los cobros (inscripciones y mensualidades) y contenedor de la bolsa de clases del periodo.

```sql
CREATE TABLE cargos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,                     -- 'INSCRIPCION', 'MENSUALIDAD', 'REINSCRIPCION'
    concepto TEXT NOT NULL,                 -- Ej. 'Mensualidad Noviembre 2026'
    monto INTEGER NOT NULL,                 -- En centavos
    
    -- Fechas del ciclo de vida del cobro
    periodo_inicio DATE NOT NULL,           -- Inicio de las clases que cubre este pago
    periodo_fin DATE NOT NULL,              -- Fin de las clases que cubre este pago
    fecha_visible_desde DATE NOT NULL,      -- periodo_inicio - dias_anticipacion_emision
    fecha_vencimiento DATE NOT NULL,        -- Fecha límite normal de pago
    fecha_limite_gracia DATE NOT NULL,      -- fecha_vencimiento + dias_gracia
    
    -- Control de bolsa de clases del periodo
    clases_incluidas INTEGER NOT NULL DEFAULT 0,  -- 0 para inscripción; copia inscripciones.clases_por_mes en mensualidad
    clases_consumidas INTEGER NOT NULL DEFAULT 0, -- Se incrementa con cada asistencia válida o falta injustificada
    
    -- Estado financiero
    estado TEXT DEFAULT 'PENDIENTE',        -- 'PENDIENTE', 'VENCIDO', 'PAGADO', 'CONDONADO', 'CANCELADO'
    fecha_pago DATETIME,
    metodo_pago TEXT,
    referencia_pago TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id)
);

CREATE INDEX idx_cargos_inscripcion ON cargos(inscripcion_id);
CREATE INDEX idx_cargos_estado_fechas ON cargos(estado, fecha_visible_desde, fecha_limite_gracia);
```

### D. Tablas de Clases y Asistencias (`clases_catalogo`, `clases_asignadas`, `asistencias`)
Controlan qué materias o sesiones le tocan a cada alumno y descuentan su cuota mensual.

```sql
-- 1. Catálogo de materias o sesiones dentro de un subprograma
CREATE TABLE clases_catalogo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subprograma_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    cupo_maximo INTEGER DEFAULT 15,
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (subprograma_id) REFERENCES subprogramas(id)
);

-- 2. Horario/clases específicas asignadas a cada alumno
CREATE TABLE clases_asignadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_id INTEGER NOT NULL,
    clase_id INTEGER NOT NULL,
    dia_semana INTEGER NOT NULL, -- 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo
    hora_inicio TEXT NOT NULL,   -- Formato '16:00'
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id),
    FOREIGN KEY (clase_id) REFERENCES clases_catalogo(id)
);

CREATE INDEX idx_clases_asignadas_inscripcion ON clases_asignadas(inscripcion_id);

-- 3. Registro de asistencia vinculado al cargo mensual
CREATE TABLE asistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_id INTEGER NOT NULL,
    clase_id INTEGER NOT NULL,
    cargo_id INTEGER NOT NULL,        -- Mensualidad a la que se le descuenta esta sesión
    fecha_clase DATE NOT NULL,
    estado TEXT NOT NULL,             -- 'ASISTIO', 'FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA', 'CANCELADA_ESCUELA'
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id),
    FOREIGN KEY (clase_id) REFERENCES clases_catalogo(id),
    FOREIGN KEY (cargo_id) REFERENCES cargos(id)
);

CREATE INDEX idx_asistencias_cargo ON asistencias(cargo_id);
```

---

## 3. Reglas de Negocio y Flujos Automatizados (Cron Diario)

### Flujo 1: Alta de un alumno
1. Se inserta la fila en `inscripciones` con `estado = 'ACTIVO'`.
2. Se insertan dos cargos iniciales en `cargos`:
   - `INSCRIPCION` (`clases_incluidas = 0`).
   - `MENSUALIDAD` del primer periodo (`clases_incluidas = inscripciones.clases_por_mes`).

### Flujo 2: Emisión anticipada y acumulación de adeudos
- Cada madrugada, el Cron busca inscripciones en estado `ACTIVO` cuya fecha `proximo_corte` esté dentro de la ventana `dias_anticipacion_emision`.
- Inserta el nuevo cargo mensual sin borrar los anteriores (acumulando naturalmente el adeudo si existen meses sin pagar) y actualiza `proximo_corte` al mes siguiente.
- El portal del alumno solo muestra cargos donde `date('now') >= fecha_visible_desde`.

### Flujo 3: Días de gracia, morosidad y baja automática al 4to mes
Ejecutar diariamente en este orden dentro de un `db.batch()`:

```sql
-- Paso 1: Marcar como VENCIDO todo cargo cuya fecha límite de gracia haya pasado
UPDATE cargos 
SET estado = 'VENCIDO' 
WHERE estado = 'PENDIENTE' 
  AND date('now') > fecha_limite_gracia;

-- Paso 2: Recalcular meses de atraso consecutivos en inscripciones activas
UPDATE inscripciones
SET meses_atraso_consecutivos = (
    SELECT COUNT(*) 
    FROM cargos 
    WHERE cargos.inscripcion_id = inscripciones.id 
      AND cargos.tipo = 'MENSUALIDAD' 
      AND cargos.estado = 'VENCIDO'
)
WHERE estado = 'ACTIVO';

-- Paso 3: Ejecutar baja automática al iniciar el 4to mes de atraso (3 vencidos + 4to periodo iniciado)
UPDATE inscripciones
SET estado = 'BAJA_MOROSIDAD',
    fecha_baja = date('now'),
    motivo_baja = 'Baja automática por acumulación de 4 meses de adeudo'
WHERE estado = 'ACTIVO'
  AND (
      SELECT COUNT(*) FROM cargos 
      WHERE cargos.inscripcion_id = inscripciones.id 
        AND cargos.tipo = 'MENSUALIDAD' 
        AND cargos.estado IN ('VENCIDO', 'PENDIENTE')
        AND date('now') >= cargos.periodo_inicio
  ) >= 4;
```

### Flujo 4: Registro de pagos (FIFO)
- Al recibir un abono o pago, liquidar primero el cargo con `periodo_inicio` más antiguo (`ORDER BY periodo_inicio ASC`).
- Recalcular `meses_atraso_consecutivos` en `inscripciones`.

---

## 4. Reglas Operativas de Clases (Ni de más, ni de menos)

1. **Bloqueo por límite de clases (No dar clases de más):**
   - Al pasar lista, verificar que `cargos.clases_consumidas < cargos.clases_incluidas` para el periodo actual y que `inscripciones.estado = 'ACTIVO'`.
   - Si ya alcanzó su límite, bloquear el registro y alertar al docente/administrador.
2. **Consumo según tipo de asistencia:**
   - `ASISTIO` y `FALTA_INJUSTIFICADA`: Suman `+1` a `clases_consumidas` (clase impartida o perdida por el alumno).
   - `FALTA_JUSTIFICADA` y `CANCELADA_ESCUELA`: **No suman** a `clases_consumidas`, dejando el crédito disponible para reagendar.
3. **Control de clases pendientes (No dejarlos sin clases):**
   - Al cierre de cada periodo (`periodo_fin`), consultar los cargos donde `clases_consumidas < clases_incluidas` para generar el reporte de **reposiciones pendientes** o transferir ese saldo a favor al siguiente cargo mensual.

---

## 5. Buenas Prácticas y Límites en Cloudflare D1

- **Montos en enteros (Centavos):** Evita el tipo `REAL` para dinero; usa `INTEGER` (ej. `45000` para `$450.00`) para prevenir errores de redondeo de punto flotante.
- **Fechas en formato ISO-8601 (`YYYY-MM-DD`):** Garantiza compatibilidad exacta con `date('now')` y modificadores como `date(fecha, '+5 days')`.
- **Operaciones atómicas (`db.batch`):** Agrupa escrituras relacionadas (como registrar una asistencia e incrementar `clases_consumidas`) en un mismo batch para mantener integridad de datos.
- **Uso de índices:** En el plan gratuito de D1 tienes **500 MB por base de datos** (~2 a 3 millones de filas) y **5 millones de lecturas diarias / 100,000 escrituras diarias**. Los índices definidos evitan escaneos completos de tabla (*Full Table Scans*) y mantienen el consumo diario en niveles mínimos.




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

