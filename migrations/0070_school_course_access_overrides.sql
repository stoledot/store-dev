-- Optional per-student course access end date. A row overrides the XML course duration for that learner.
CREATE TABLE IF NOT EXISTS school_course_access_overrides (
  student_email TEXT NOT NULL COLLATE NOCASE,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT,
  PRIMARY KEY (student_email, course_id)
);
CREATE INDEX IF NOT EXISTS idx_school_course_access_overrides_expiry ON school_course_access_overrides(expires_at);
