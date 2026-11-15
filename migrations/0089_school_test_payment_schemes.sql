ALTER TABLE school_payment_modalities ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0
  CHECK (test_mode IN (0, 1));
