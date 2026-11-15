CREATE TABLE school_concept_occurrence_charges (
  enrollment_id TEXT NOT NULL REFERENCES school_concept_assignments(enrollment_id) ON DELETE RESTRICT,
  concept_id TEXT NOT NULL REFERENCES school_payment_concepts(id) ON DELETE RESTRICT,
  occurrence_start_on TEXT NOT NULL,
  obligation_id TEXT NOT NULL UNIQUE REFERENCES school_payment_obligations(id) ON DELETE RESTRICT,
  access_grace_until TEXT NOT NULL,
  payment_cutoff TEXT,
  auto_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (auto_cancelled IN (0, 1)),
  PRIMARY KEY (enrollment_id, concept_id, occurrence_start_on)
);

INSERT INTO school_concept_occurrence_charges
  (enrollment_id, concept_id, occurrence_start_on, obligation_id, access_grace_until, payment_cutoff, auto_cancelled)
SELECT cc.enrollment_id, cc.concept_id, o.period_start_on, cc.obligation_id,
  cc.access_grace_until, cc.payment_cutoff, cc.auto_cancelled
FROM school_concept_charges cc JOIN school_payment_obligations o ON o.id=cc.obligation_id;

CREATE INDEX idx_school_concept_occurrences_concept
  ON school_concept_occurrence_charges(concept_id, enrollment_id);

ALTER TABLE school_concept_assignments ADD COLUMN generated_until TEXT;
