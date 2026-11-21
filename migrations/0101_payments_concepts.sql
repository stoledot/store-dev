-- Habilitar llaves foráneas (recomendado en SQLite/D1)
PRAGMA foreign_keys = ON;

-- 1. Tabla de Alumnos (con control maestro de acceso)
CREATE TABLE IF NOT EXISTS alumnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    acceso_forzado TEXT NOT NULL DEFAULT 'automatico' 
        CHECK (acceso_forzado IN ('automatico', 'permitir_siempre', 'bloquear_siempre')),
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Catálogo de Conceptos (reutilizables y configurables)
CREATE TABLE IF NOT EXISTS conceptos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    monto_default REAL NOT NULL DEFAULT 0.0,
    dias_tolerancia INTEGER NOT NULL DEFAULT 0,
    -- Guardamos el JSON como TEXT (D1 soporta funciones JSON nativas como json_extract)
    configuracion TEXT NOT NULL DEFAULT '{}',
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

-- 3. Estados de Cuenta (Pagos programados + Pagos reales unificados)
CREATE TABLE IF NOT EXISTS estados_cuenta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL,
    concepto_id INTEGER NOT NULL,
    etiqueta TEXT NOT NULL, -- Ej: "Mensualidad Noviembre 2026"
    monto_esperado REAL NOT NULL,
    monto_pagado REAL NOT NULL DEFAULT 0.0,
    fecha_vencimiento TEXT NOT NULL, -- Formato ISO: 'YYYY-MM-DD'
    fecha_pago TEXT, -- Formato ISO: 'YYYY-MM-DD HH:MM:SS' (NULL si no se ha liquidado)
    estatus TEXT NOT NULL DEFAULT 'pendiente' 
        CHECK (estatus IN ('pendiente', 'parcial', 'pagado', 'exento')),
    -- Aquí guardas método de pago, referencia o historial de abonos en JSON
    detalles_pago TEXT DEFAULT '{}',
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE,
    FOREIGN KEY (concepto_id) REFERENCES conceptos(id) ON DELETE RESTRICT
);

-- Índices para que las consultas de permisos en el Edge sean ultrarrápidas
CREATE INDEX IF NOT EXISTS idx_estados_cuenta_alumno_estatus 
    ON estados_cuenta(alumno_id, estatus);

CREATE INDEX IF NOT EXISTS idx_estados_cuenta_vencimiento 
    ON estados_cuenta(fecha_vencimiento);
