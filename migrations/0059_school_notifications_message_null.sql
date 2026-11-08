-- SQLite/D1 does not support ALTER COLUMN ... DROP NOT NULL. Rebuild this
-- table in place so optional notification messages are supported while all
-- existing notifications and the table's foreign keys remain intact.
CREATE TABLE school_notifications__new (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  course_id TEXT REFERENCES school_courses(id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES school_lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  body TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL DEFAULT ''
);
INSERT INTO school_notifications__new
  (id,student_email,course_id,lesson_id,title,message,read_at,created_at,body,href)
SELECT id,student_email,course_id,lesson_id,title,message,read_at,created_at,body,href
FROM school_notifications;
DROP TABLE school_notifications;
ALTER TABLE school_notifications__new RENAME TO school_notifications;
CREATE INDEX IF NOT EXISTS idx_school_notifications_student
  ON school_notifications(student_email,created_at DESC);
