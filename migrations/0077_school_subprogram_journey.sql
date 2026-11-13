-- Data structures for subprogram diagnostics, enrollment and billing.
-- Existing payments are intentionally left unassociated.
ALTER TABLE school_subprograms ADD COLUMN enrollment_modality_id TEXT
  REFERENCES school_payment_modalities(id) ON DELETE RESTRICT;
ALTER TABLE school_payment_modalities ADD COLUMN billing_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE school_payment_products ADD COLUMN billing_revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE school_subprogram_questions (
  id TEXT NOT NULL PRIMARY KEY,
  subprogram_id TEXT NOT NULL REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  prompt TEXT NOT NULL,
  answer_type TEXT NOT NULL CHECK (answer_type IN ('text', 'choice')),
  options_json TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_subprogram_questions_order
  ON school_subprogram_questions(subprogram_id, position, id);

CREATE TABLE school_subprogram_diagnostics (
  id TEXT NOT NULL PRIMARY KEY,
  subprogram_id TEXT NOT NULL REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  client_number TEXT NOT NULL REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT NOT NULL DEFAULT '',
  approval_token TEXT,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);
CREATE INDEX idx_subprogram_diagnostics_review
  ON school_subprogram_diagnostics(status, submitted_at);
CREATE INDEX idx_subprogram_diagnostics_client
  ON school_subprogram_diagnostics(client_number, subprogram_id, submitted_at);
CREATE UNIQUE INDEX idx_subprogram_diagnostics_open
  ON school_subprogram_diagnostics(client_number, subprogram_id)
  WHERE status IN ('pending', 'approved');

CREATE TABLE school_subprogram_enrollments (
  id TEXT NOT NULL PRIMARY KEY,
  client_number TEXT NOT NULL REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  subprogram_id TEXT NOT NULL REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  diagnostic_id TEXT NOT NULL UNIQUE REFERENCES school_subprogram_diagnostics(id) ON DELETE RESTRICT,
  modality_id TEXT NOT NULL REFERENCES school_payment_modalities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'completed', 'withdrawn')),
  starts_on TEXT NOT NULL,
  policy_next_check_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_subprogram_enrollments_open
  ON school_subprogram_enrollments(client_number, subprogram_id)
  WHERE status IN ('active', 'suspended');
CREATE INDEX idx_subprogram_enrollments_subprogram
  ON school_subprogram_enrollments(subprogram_id, status);

CREATE TABLE school_subprogram_payment_schedules (
  id TEXT NOT NULL PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES school_subprogram_enrollments(id) ON DELETE RESTRICT,
  modality_id TEXT NOT NULL REFERENCES school_payment_modalities(id) ON DELETE RESTRICT,
  anchor_on TEXT NOT NULL,
  frequency_unit TEXT NOT NULL,
  frequency_count INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  skip_anchor INTEGER NOT NULL DEFAULT 0 CHECK (skip_anchor IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  next_check_at TEXT NOT NULL,
  UNIQUE (enrollment_id, modality_id)
);
CREATE INDEX idx_subprogram_payment_schedules_check
  ON school_subprogram_payment_schedules(next_check_at);

ALTER TABLE school_payment_obligations ADD COLUMN subprogram_schedule_id TEXT
  REFERENCES school_subprogram_payment_schedules(id) ON DELETE RESTRICT;
ALTER TABLE school_payment_obligations ADD COLUMN schedule_revision INTEGER;
ALTER TABLE school_payment_obligations ADD COLUMN modality_payment_type TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN modality_validity_count INTEGER;
ALTER TABLE school_payment_obligations ADD COLUMN modality_validity_unit TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN modality_valid_until TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN requires_current_enrollment INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_subprogram_obligations_occurrence
  ON school_payment_obligations(subprogram_schedule_id, schedule_revision, due_at);

CREATE TABLE school_subprogram_approval_emails (
  diagnostic_id TEXT NOT NULL PRIMARY KEY
    REFERENCES school_subprogram_diagnostics(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT '',
  claim_token TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  last_error TEXT
);

ALTER TABLE pending_payments ADD COLUMN school_payment_obligation_id TEXT
  REFERENCES school_payment_obligations(id) ON DELETE RESTRICT;
