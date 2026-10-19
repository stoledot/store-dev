-- Evaluaciones, entregas, archivos privados, calificación y retroalimentación.
-- Aplicar después de 0046_school_lesson_submission.sql.
ALTER TABLE school_lessons
  ADD COLUMN assessment_json TEXT NOT NULL DEFAULT '{"version":1,"questions":[]}';

ALTER TABLE school_lessons
  ADD COLUMN grading_weight REAL NOT NULL DEFAULT 1
  CHECK (grading_weight > 0 AND grading_weight <= 1000);

ALTER TABLE school_lesson_progress
  ADD COLUMN grade REAL
  CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100));

ALTER TABLE school_lesson_progress ADD COLUMN feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE school_lesson_progress ADD COLUMN graded_at TEXT;
ALTER TABLE school_lesson_progress ADD COLUMN graded_by TEXT;
ALTER TABLE school_lesson_progress ADD COLUMN submission_file_key TEXT;
ALTER TABLE school_lesson_progress ADD COLUMN submission_file_name TEXT;
ALTER TABLE school_lesson_progress ADD COLUMN submission_file_type TEXT;
ALTER TABLE school_lesson_progress ADD COLUMN submission_file_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_school_lesson_progress_submissions
  ON school_lesson_progress(submission_at, grade);
