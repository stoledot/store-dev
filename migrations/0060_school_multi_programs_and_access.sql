-- Expand the existing school model to multiple academic programs, interests,
-- area-specific diagnostics, concurrent course assignments and retry controls.

CREATE TABLE IF NOT EXISTS school_programs (
  slug TEXT PRIMARY KEY CHECK (slug IN ('matematicas','lectura')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO school_programs (slug,title,description) VALUES
  ('matematicas','Matemáticas','Programa de estudio de matemáticas.'),
  ('lectura','Lectura','Programa de estudio de lectura.');

ALTER TABLE school_areas ADD COLUMN program_slug TEXT NOT NULL DEFAULT 'matematicas'
  CHECK (program_slug IN ('matematicas','lectura'));
CREATE INDEX IF NOT EXISTS idx_school_areas_program_status ON school_areas(program_slug,status,title);

CREATE TABLE IF NOT EXISTS school_student_interests (
  student_email TEXT NOT NULL COLLATE NOCASE,
  area_id TEXT NOT NULL REFERENCES school_areas(id) ON DELETE RESTRICT,
  selected INTEGER NOT NULL DEFAULT 1 CHECK (selected IN (0,1)),
  diagnostic_unlocked INTEGER NOT NULL DEFAULT 1 CHECK (diagnostic_unlocked IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(student_email,area_id)
);
CREATE INDEX IF NOT EXISTS idx_school_student_interests_email ON school_student_interests(student_email,selected);

CREATE TABLE IF NOT EXISTS school_area_diagnostics (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  area_id TEXT NOT NULL REFERENCES school_areas(id) ON DELETE RESTRICT,
  attempt_no INTEGER NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
  diagnostic_answers TEXT NOT NULL,
  suggested_level TEXT,
  approved_level TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  UNIQUE(student_email,area_id,attempt_no)
);
CREATE INDEX IF NOT EXISTS idx_school_area_diagnostics_review ON school_area_diagnostics(status,submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_area_diagnostics_student_area ON school_area_diagnostics(student_email,area_id,attempt_no DESC);

-- Preserve the current one-area intake as each student's first area-specific record.
INSERT OR IGNORE INTO school_student_interests (student_email,area_id,selected,diagnostic_unlocked)
SELECT student_email,selected_area_id,1,CASE WHEN status='approved' THEN 0 ELSE 1 END
FROM school_student_intake;
INSERT OR IGNORE INTO school_area_diagnostics
  (id,student_email,area_id,attempt_no,diagnostic_answers,suggested_level,approved_level,status,admin_notes,submitted_at,reviewed_at)
SELECT 'legacy-' || lower(student_email) || '-' || selected_area_id,student_email,selected_area_id,1,
  diagnostic_answers,suggested_level,approved_level,status,admin_notes,submitted_at,reviewed_at
FROM school_student_intake;

-- A student may actively study several different assigned courses at once,
-- while duplicate active rows for the same course remain prohibited.
DROP INDEX IF EXISTS idx_school_one_active_course_per_student;
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_one_active_assignment_per_course
  ON school_course_assignments(student_email,course_id) WHERE status='active';

ALTER TABLE school_courses ADD COLUMN omitted_activities_allowed INTEGER NOT NULL DEFAULT 0
  CHECK (omitted_activities_allowed >= 0);

-- Per-student, per-lesson control for allowing a new submission after the first one.
CREATE TABLE IF NOT EXISTS school_lesson_resubmission_controls (
  student_email TEXT NOT NULL COLLATE NOCASE,
  lesson_id TEXT NOT NULL REFERENCES school_lessons(id) ON DELETE CASCADE,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT 'admin',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(student_email,lesson_id)
);
