-- Store each XML lesson's editor instruction and each student's saved LaTeX draft.
ALTER TABLE school_lessons ADD COLUMN inputlatex_instruction TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS school_latex_drafts (
  student_email TEXT NOT NULL COLLATE NOCASE,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE CASCADE,
  xml_lesson_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '' CHECK (length(source) <= 20000),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(student_email,course_id,xml_lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_school_latex_drafts_course_student
  ON school_latex_drafts(course_id,student_email,updated_at);
