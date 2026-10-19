-- MinShop Escuela Virtual: avance y finalización del alumno
-- IMPORTANTE: plantilla propuesta. Renombra al siguiente número libre de MinShop
-- y aplícala DESPUÉS de school_catalog.sql.
-- El correo debe provenir de la identidad verificada por el login de cliente.
-- No aceptes un email enviado por el navegador como prueba de identidad.

CREATE TABLE IF NOT EXISTS school_course_progress (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  course_id TEXT NOT NULL
    REFERENCES school_courses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TEXT,
  completed_at TEXT,
  score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(student_email, course_id),
  CHECK (
    (status = 'not_started' AND completed_at IS NULL)
    OR (status = 'in_progress' AND completed_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_school_course_progress_student_status
  ON school_course_progress(student_email, status);

CREATE TABLE IF NOT EXISTS school_lesson_progress (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  lesson_id TEXT NOT NULL
    REFERENCES school_lessons(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  started_at TEXT,
  completed_at TEXT,
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  last_activity_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(student_email, lesson_id),
  CHECK (
    (status = 'not_started' AND completed_at IS NULL)
    OR (status = 'in_progress' AND completed_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_school_lesson_progress_student_status
  ON school_lesson_progress(student_email, status);

CREATE INDEX IF NOT EXISTS idx_school_lesson_progress_lesson
  ON school_lesson_progress(lesson_id);

-- Nota de seguridad: estas tablas registran progreso, pero NO imponen por sí solas
-- la secuencia. El servidor debe comprobar suscripción vigente y prerequisitos
-- antes de entregar una lección o aceptar un cambio de progreso.
