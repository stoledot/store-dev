-- Private school payment products and student-specific payment obligations.
-- These are NOT storefront products and are never exposed in the public catalog.
CREATE TABLE IF NOT EXISTS school_payment_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'mxn' CHECK (length(currency) = 3),
  fee_type TEXT NOT NULL DEFAULT 'other' CHECK (fee_type IN ('other','enrollment','monthly')),
  validity_months INTEGER NOT NULL DEFAULT 0 CHECK (validity_months >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_payment_products_active
  ON school_payment_products(active, title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS school_payment_obligations (
  id TEXT PRIMARY KEY,
  payment_product_id TEXT REFERENCES school_payment_products(id) ON DELETE SET NULL,
  student_email TEXT NOT NULL COLLATE NOCASE,
  title_snapshot TEXT NOT NULL,
  description_snapshot TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'mxn' CHECK (length(currency) = 3),
  fee_type TEXT NOT NULL DEFAULT 'other' CHECK (fee_type IN ('other','enrollment','monthly')),
  validity_months INTEGER NOT NULL DEFAULT 0 CHECK (validity_months >= 0),
  due_at TEXT NOT NULL,
  available_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
  paid_at TEXT,
  checkout_session_id TEXT,
  checkout_lock_token TEXT,
  checkout_locked_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_payment_obligations_student_due
  ON school_payment_obligations(student_email, status, due_at);
CREATE INDEX IF NOT EXISTS idx_school_payment_obligations_product
  ON school_payment_obligations(payment_product_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_payment_obligations_checkout_session
  ON school_payment_obligations(checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

-- Back-reference on the order is an audit trail. It is nullable for ordinary orders.
ALTER TABLE orders ADD COLUMN school_payment_obligation_id TEXT REFERENCES school_payment_obligations(id);
CREATE INDEX IF NOT EXISTS idx_orders_school_payment_obligation
  ON orders(school_payment_obligation_id)
  WHERE school_payment_obligation_id IS NOT NULL;

-- Link a confirmed online obligation to the legacy school access ledger so the
-- enrollment checklist and period/access rules observe the real Stripe payment.
ALTER TABLE school_fee_payments ADD COLUMN obligation_id TEXT REFERENCES school_payment_obligations(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_fee_payments_obligation
  ON school_fee_payments(obligation_id);

-- Hide the legacy public monthly-school product by exact title (keep order history intact).
UPDATE products SET active=0
 WHERE lower(trim(name))='mensualidad de escuela' AND active=1;
