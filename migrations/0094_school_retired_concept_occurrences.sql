ALTER TABLE school_concept_occurrence_charges ADD COLUMN retired INTEGER NOT NULL DEFAULT 0
  CHECK (retired IN (0, 1));
