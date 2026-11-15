ALTER TABLE school_concept_charges ADD COLUMN auto_cancelled INTEGER NOT NULL DEFAULT 0
  CHECK (auto_cancelled IN (0, 1));
