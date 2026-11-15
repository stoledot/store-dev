ALTER TABLE school_payment_modalities ADD COLUMN concept_mode INTEGER NOT NULL DEFAULT 0
  CHECK (concept_mode IN (0, 1));
ALTER TABLE school_payment_modalities ADD COLUMN concept_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE school_payment_concepts ADD COLUMN active INTEGER NOT NULL DEFAULT 1
  CHECK (active IN (0, 1));
ALTER TABLE school_payment_concepts ADD COLUMN mutation_token TEXT;

CREATE TABLE school_concept_assignments (
  enrollment_id TEXT PRIMARY KEY REFERENCES school_subprogram_enrollments(id) ON DELETE RESTRICT,
  synced_revision INTEGER NOT NULL
);

CREATE TABLE school_concept_charges (
  enrollment_id TEXT NOT NULL REFERENCES school_concept_assignments(enrollment_id) ON DELETE RESTRICT,
  concept_id TEXT NOT NULL REFERENCES school_payment_concepts(id) ON DELETE RESTRICT,
  obligation_id TEXT NOT NULL UNIQUE REFERENCES school_payment_obligations(id) ON DELETE RESTRICT,
  access_grace_until TEXT NOT NULL,
  payment_cutoff TEXT,
  PRIMARY KEY (enrollment_id, concept_id)
);

CREATE INDEX idx_school_concept_charges_concept ON school_concept_charges(concept_id, enrollment_id);
