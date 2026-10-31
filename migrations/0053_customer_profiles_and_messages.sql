-- Customer profiles, verified email changes, school payment notes and persistent inbox.
-- Additive only: existing orders remain the source of truth for purchases.
CREATE TABLE IF NOT EXISTS customer_profiles (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  full_name TEXT NOT NULL DEFAULT '',
  age INTEGER CHECK (age IS NULL OR (age >= 5 AND age <= 120)),
  education_level TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  academic_interests TEXT NOT NULL DEFAULT '',
  academic_goals TEXT NOT NULL DEFAULT '',
  profile_locked INTEGER NOT NULL DEFAULT 0 CHECK (profile_locked IN (0,1)),
  payment_status TEXT NOT NULL DEFAULT 'unknown' CHECK (payment_status IN ('unknown','pending','confirmed','overdue','waived')),
  next_payment_at TEXT,
  payment_notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_name ON customer_profiles(full_name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS customer_email_aliases (
  old_email TEXT PRIMARY KEY COLLATE NOCASE,
  current_email TEXT NOT NULL COLLATE NOCASE,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_email_aliases_current ON customer_email_aliases(current_email COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS customer_messages (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer','admin')),
  sender_label TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_messages_thread_date ON customer_messages(customer_email COLLATE NOCASE, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_messages_unread ON customer_messages(customer_email COLLATE NOCASE, sender_role, read_at);
