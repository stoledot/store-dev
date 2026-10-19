-- MinShop Escuela Virtual: catálogo de cursos y mini lecciones
-- IMPORTANTE: plantilla propuesta. Renombra al siguiente número libre de MinShop
-- (por ejemplo, 00NN_school_catalog.sql) antes de ejecutar la migración.

CREATE TABLE IF NOT EXISTS school_courses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description_md TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER NOT NULL UNIQUE CHECK (sequence_no >= 1),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  completion_min_score REAL
    CHECK (completion_min_score IS NULL OR
           (completion_min_score >= 0 AND completion_min_score <= 100)),
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_school_courses_status_sequence
  ON school_courses(status, sequence_no);

CREATE TABLE IF NOT EXISTS school_lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL
    REFERENCES school_courses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 1),
  lesson_type TEXT NOT NULL DEFAULT 'reading'
    CHECK (lesson_type IN ('reading', 'quiz', 'exercise', 'assignment')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  required_to_complete INTEGER NOT NULL DEFAULT 1
    CHECK (required_to_complete IN (0, 1)),
  passing_score REAL
    CHECK (passing_score IS NULL OR (passing_score >= 0 AND passing_score <= 100)),
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(course_id, slug),
  UNIQUE(course_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_school_lessons_course_status_sequence
  ON school_lessons(course_id, status, sequence_no);
