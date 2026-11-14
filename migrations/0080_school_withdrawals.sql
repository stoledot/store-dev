ALTER TABLE school_subprograms ADD COLUMN suspension_after_days INTEGER
  CHECK (suspension_after_days IS NULL OR suspension_after_days >= 0);

ALTER TABLE school_subprogram_enrollments ADD COLUMN suspension_reason TEXT;
ALTER TABLE school_subprogram_enrollments ADD COLUMN suspended_at TEXT;
ALTER TABLE school_subprogram_enrollments ADD COLUMN suspension_token TEXT;
ALTER TABLE school_subprogram_enrollments ADD COLUMN withdrawn_at TEXT;
ALTER TABLE school_subprogram_enrollments ADD COLUMN withdrawal_token TEXT;
ALTER TABLE school_subprogram_enrollments ADD COLUMN reenrollment_required INTEGER NOT NULL DEFAULT 0
  CHECK (reenrollment_required IN (0, 1));

ALTER TABLE school_subprogram_diagnostics ADD COLUMN closed_at TEXT;
DROP INDEX IF EXISTS idx_subprogram_diagnostics_open;
CREATE UNIQUE INDEX idx_subprogram_diagnostics_open
  ON school_subprogram_diagnostics(client_number, subprogram_id)
  WHERE status IN ('pending', 'approved') AND closed_at IS NULL;
