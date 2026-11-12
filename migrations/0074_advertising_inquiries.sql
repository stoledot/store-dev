CREATE TABLE IF NOT EXISTS advertising_inquiries (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  format_preference TEXT NOT NULL,
  monthly_views INTEGER,
  monthly_budget_minor INTEGER,
  message TEXT NOT NULL DEFAULT '',
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK(notification_status IN ('pending','sending','sent')),
  notification_attempts INTEGER NOT NULL DEFAULT 0,
  notification_claimed_at TEXT,
  notification_sent_at TEXT,
  notification_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_advertising_inquiries_created ON advertising_inquiries(created_at DESC);
