CREATE TABLE school_payment_concepts (
  id TEXT PRIMARY KEY,
  modality_id TEXT NOT NULL REFERENCES school_payment_modalities(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  period_start_on TEXT NOT NULL,
  period_end_on TEXT,
  duration_count INTEGER,
  duration_unit TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  advance_days INTEGER,
  allow_after_start INTEGER NOT NULL,
  grace_days INTEGER NOT NULL,
  required_for_access INTEGER NOT NULL,
  recurrence_unit TEXT NOT NULL,
  recurrence_count INTEGER,
  recurrence_end_on TEXT,
  group_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_school_payment_concepts_modality
  ON school_payment_concepts(modality_id, period_start_on, id);
