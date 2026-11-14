ALTER TABLE school_subprogram_enrollments ADD COLUMN scholarship_percent INTEGER NOT NULL DEFAULT 0
  CHECK (scholarship_percent BETWEEN 0 AND 100);
ALTER TABLE school_payment_obligations ADD COLUMN scholarship_percent_snapshot INTEGER NOT NULL DEFAULT 0
  CHECK (scholarship_percent_snapshot BETWEEN 0 AND 100);

CREATE TABLE school_subprogram_scholarship_periods (
  schedule_id TEXT NOT NULL REFERENCES school_subprogram_payment_schedules(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  period_start_on TEXT NOT NULL,
  period_end_on TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (schedule_id, revision, period_start_on)
);
