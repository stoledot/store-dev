CREATE TABLE school_payment_bundles (
  id TEXT PRIMARY KEY,
  leader_obligation_id TEXT NOT NULL REFERENCES school_payment_obligations(id),
  enrollment_id TEXT NOT NULL REFERENCES school_subprogram_enrollments(id),
  student_email TEXT NOT NULL COLLATE NOCASE,
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  item_count INTEGER NOT NULL CHECK (item_count > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','failed')),
  checkout_session_id TEXT,
  order_id INTEGER REFERENCES orders(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_school_payment_bundles_leader ON school_payment_bundles(leader_obligation_id, status);
CREATE TABLE school_payment_bundle_items (
  bundle_id TEXT NOT NULL REFERENCES school_payment_bundles(id),
  obligation_id TEXT NOT NULL REFERENCES school_payment_obligations(id),
  title_snapshot TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  due_at TEXT NOT NULL,
  PRIMARY KEY (bundle_id, obligation_id)
);
ALTER TABLE school_payment_obligations ADD COLUMN checkout_bundle_id TEXT REFERENCES school_payment_bundles(id);
ALTER TABLE school_payment_obligations ADD COLUMN bundle_order_id INTEGER REFERENCES orders(id);
