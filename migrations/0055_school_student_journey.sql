-- Ciclo académico sencillo: periodos, fechas importantes y avisos por alumno.
ALTER TABLE school_course_assignments ADD COLUMN start_date TEXT;
ALTER TABLE school_course_assignments ADD COLUMN end_date TEXT;
ALTER TABLE school_course_assignments ADD COLUMN period_id TEXT;

CREATE TABLE IF NOT EXISTS school_periods (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  period_no INTEGER NOT NULL DEFAULT 1,
  fee_payment_id TEXT REFERENCES school_fee_payments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','completed','expired')),
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(student_email, period_no)
);
CREATE INDEX IF NOT EXISTS idx_school_periods_student ON school_periods(student_email, period_no DESC);

CREATE TABLE IF NOT EXISTS school_calendar_events (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  assignment_id TEXT REFERENCES school_course_assignments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'important' CHECK(event_type IN ('start','activity','evaluation','end','important')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_calendar_student_date ON school_calendar_events(student_email,event_date);

CREATE TABLE IF NOT EXISTS school_notifications (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL DEFAULT '/escuela/mi-escuela',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_notifications_student ON school_notifications(student_email,created_at DESC);
