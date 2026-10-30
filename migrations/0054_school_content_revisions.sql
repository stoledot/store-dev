-- Versioned TeX course revisions and stable lesson-content snapshots.
-- This migration never changes or deletes existing student progress.
ALTER TABLE school_lessons ADD COLUMN content_hash TEXT;

CREATE TABLE IF NOT EXISTS school_course_revisions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  source_key TEXT NOT NULL,
  source_filename TEXT NOT NULL DEFAULT 'contenido.tex',
  source_hash TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(course_id, version)
);
CREATE INDEX IF NOT EXISTS idx_school_course_revisions_course
  ON school_course_revisions(course_id, version DESC);

CREATE TABLE IF NOT EXISTS school_lesson_revisions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES school_lessons(id) ON DELETE RESTRICT,
  content_version INTEGER NOT NULL CHECK (content_version >= 1),
  stable_node_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(lesson_id, content_version)
);
CREATE INDEX IF NOT EXISTS idx_school_lesson_revisions_lesson
  ON school_lesson_revisions(lesson_id, content_version DESC);
