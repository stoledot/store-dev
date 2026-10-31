-- Registro verificable de que un alumno autenticado consultó los programas.
CREATE TABLE IF NOT EXISTS school_program_views (
  student_email TEXT NOT NULL COLLATE NOCASE,
  program_slug TEXT NOT NULL CHECK (program_slug IN ('matematicas','lectura')),
  first_viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(student_email, program_slug)
);
CREATE INDEX IF NOT EXISTS idx_school_program_views_student
  ON school_program_views(student_email);
