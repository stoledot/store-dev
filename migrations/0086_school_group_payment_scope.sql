ALTER TABLE school_payment_obligations ADD COLUMN group_access_only INTEGER NOT NULL DEFAULT 0
  CHECK (group_access_only IN (0,1));

UPDATE school_payment_obligations SET group_access_only=1
WHERE id IN (SELECT obligation_id FROM school_manual_access_payment);
