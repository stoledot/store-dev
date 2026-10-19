-- Modelo sencillo de escuela: áreas, diagnóstico, asignación individual y pagos por periodo.
-- Requiere las tablas school_courses, school_lessons creadas por 0040.

CREATE TABLE IF NOT EXISTS school_areas (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Las columnas nuevas son opcionales para cursos creados antes de este modelo.
ALTER TABLE school_courses ADD COLUMN area_id TEXT REFERENCES school_areas(id) ON DELETE RESTRICT;
ALTER TABLE school_courses ADD COLUMN level_code TEXT NOT NULL DEFAULT 'N0';
CREATE INDEX IF NOT EXISTS idx_school_courses_area_level ON school_courses(area_id, level_code, status);

CREATE TABLE IF NOT EXISTS school_student_intake (
  student_email TEXT PRIMARY KEY COLLATE NOCASE,
  selected_area_id TEXT NOT NULL REFERENCES school_areas(id) ON DELETE RESTRICT,
  diagnostic_answers TEXT NOT NULL DEFAULT '',
  suggested_level TEXT,
  approved_level TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_school_intake_status ON school_student_intake(status, submitted_at);

CREATE TABLE IF NOT EXISTS school_course_assignments (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','suspended')),
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  assigned_by TEXT NOT NULL DEFAULT 'admin',
  previous_course_score REAL CHECK (previous_course_score IS NULL OR (previous_course_score >= 0 AND previous_course_score <= 100)),
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_school_assignments_student_status ON school_course_assignments(student_email, status, assigned_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_one_active_course_per_student
  ON school_course_assignments(student_email) WHERE status = 'active';

-- El administrador registra el pago después de comprobar el pedido en MinShop.
-- valid_until: 6 meses para inscripción; 1 mes para mensualidad.
CREATE TABLE IF NOT EXISTS school_fee_payments (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('enrollment','monthly')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'mxn',
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  valid_until TEXT NOT NULL,
  recorded_by TEXT NOT NULL DEFAULT 'admin',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_school_fee_access ON school_fee_payments(student_email, fee_type, valid_until);
