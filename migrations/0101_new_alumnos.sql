-- Habilitar llaves foráneas (recomendado en SQLite/D1)

CREATE TABLE alumnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT,
    fecha_nacimiento DATE,
    genero TEXT, -- 'M' o 'F' u otro valor según corresponda
    email TEXT,
    telefono TEXT,
    whatsapp TEXT,
    customer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE INDEX idx_alumnos_customer_id ON alumnos(customer_id);

CREATE TABLE inscripciones_subprogramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL,
    school_subprogram_id TEXT NOT NULL,
    
    -- Control de fechas del ciclo del alumno
    fecha_inscripcion DATE NOT NULL DEFAULT (date('now')),
    fecha_inicio_clases DATE,
    proximo_corte DATE,                           -- Fecha en que inicia su siguiente mensualidad por generar
    
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
    FOREIGN KEY (school_subprogram_id) REFERENCES school_subprograms(id) ON DELETE RESTRICT
);

-- Índices de rendimiento
CREATE INDEX idx_inscripciones_subprogramas_alumno ON inscripciones_subprogramas(alumno_id);
CREATE INDEX idx_inscripciones_subprogramas_subprograma ON inscripciones_subprogramas(school_subprogram_id);
CREATE INDEX idx_inscripciones_subprogramas_cron ON inscripciones_subprogramas(estado, proximo_corte);

-- Evita duplicar inscripciones ACTIVAS al mismo subprograma, pero permite reingresos históricos
CREATE UNIQUE INDEX idx_inscripcion_subprograma_activa_unica 
ON inscripciones_subprogramas(alumno_id, school_subprogram_id) 
WHERE estado = 'ACTIVO';

CREATE TABLE reglas_cobro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_subprogram_id TEXT NOT NULL,
    monto_inscripcion INTEGER NOT NULL,          -- Guardar en centavos (ej. 50000 = $500.00)
    monto_mensualidad INTEGER NOT NULL,          -- Guardar en centavos
    dias_anticipacion_emision INTEGER DEFAULT 5, -- Días antes del periodo en que el cobro se hace visible
    dias_gracia INTEGER DEFAULT 5,               -- Días extra después del vencimiento antes de marcar morosidad
    dia_corte INTEGER DEFAULT 1,                 -- Día del mes de corte (si aplica corte fijo)
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (school_subprogram_id) REFERENCES school_subprograms(id) ON DELETE RESTRICT
);


CREATE TABLE cargos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_subprograma_id INTEGER NOT NULL REFERENCES inscripciones_subprogramas(id) ON DELETE RESTRICT,
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
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cargos_inscripcion ON cargos(inscripcion_subprograma_id);
CREATE INDEX idx_cargos_estado_fechas ON cargos(estado, fecha_visible_desde, fecha_limite_gracia);

-- 1. Catálogo de materias o sesiones dentro de un subprograma
CREATE TABLE clases_subprograma_catalogo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_subprogram_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cupo_maximo INTEGER DEFAULT 15,
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (school_subprogram_id) REFERENCES school_subprograms(id) ON DELETE RESTRICT
);

-- 2. Horario/clases específicas asignadas a cada alumno
CREATE TABLE clases_subprograma_asignadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_subprograma_id INTEGER NOT NULL,
    clase_id INTEGER NOT NULL,
    dia_semana INTEGER NOT NULL, -- 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo
    hora_inicio TEXT NOT NULL,   -- Formato '16:00'
    activa BOOLEAN DEFAULT 1,
    FOREIGN KEY (inscripcion_subprograma_id) REFERENCES inscripciones_subprogramas(id) ON DELETE RESTRICT,
    FOREIGN KEY (clase_id) REFERENCES clases_subprograma_catalogo(id)
);

CREATE INDEX idx_clases_subprograma_asignadas_inscripcion ON clases_subprograma_asignadas(inscripcion_subprograma_id);

-- 3. Registro de asistencia vinculado al cargo mensual
CREATE TABLE asistencias_subprograma (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscripcion_subprograma_id INTEGER NOT NULL,
    clase_id INTEGER NOT NULL,
    cargo_id INTEGER NOT NULL,        -- Mensualidad a la que se le descuenta esta sesión
    fecha_clase DATE NOT NULL,
    estado TEXT NOT NULL,             -- 'ASISTIO', 'FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA', 'CANCELADA_ESCUELA'
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inscripcion_subprograma_id) REFERENCES inscripciones_subprogramas(id) ON DELETE RESTRICT,
    FOREIGN KEY (clase_id) REFERENCES clases_subprograma_catalogo(id) ON DELETE RESTRICT,
    FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE RESTRICT
);

CREATE INDEX idx_asistencias_subprograma_cargo ON asistencias_subprograma(cargo_id);
CREATE INDEX idx_asistencias_subprograma_inscripcion ON asistencias_subprograma(inscripcion_subprograma_id);

