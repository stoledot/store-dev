ALTER TABLE content_subscriptions ADD COLUMN refund_policy_text TEXT NOT NULL DEFAULT '';
ALTER TABLE content_subscriptions ADD COLUMN privacy_notice_text TEXT NOT NULL DEFAULT '';
ALTER TABLE content_subscriptions ADD COLUMN privacy_notice_url TEXT NOT NULL DEFAULT '';
ALTER TABLE content_subscriptions ADD COLUMN subscription_terms_text TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS subscription_consents (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL,
  content_subscription_id TEXT NOT NULL REFERENCES content_subscriptions(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  accepted_policy_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  stripe_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_consents_owner ON subscription_consents(student_email,accepted_at);
CREATE INDEX IF NOT EXISTS idx_subscription_consents_stripe ON subscription_consents(stripe_subscription_id);
CREATE TABLE IF NOT EXISTS subscription_renewal_reminders (
  subscription_id TEXT NOT NULL REFERENCES school_subscriptions(id) ON DELETE CASCADE,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','sent')),
  claimed_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY(subscription_id,period_end)
);
