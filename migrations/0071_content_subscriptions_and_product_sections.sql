-- Reusable commercial subscriptions can unlock any mix of published courses and readings.
CREATE TABLE IF NOT EXISTS content_subscriptions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stripe_price_id TEXT NOT NULL UNIQUE,
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'mxn' CHECK (length(currency)=3),
  interval_unit TEXT NOT NULL CHECK (interval_unit IN ('month','year')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS content_subscription_courses (
  subscription_id TEXT NOT NULL REFERENCES content_subscriptions(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE CASCADE,
  PRIMARY KEY(subscription_id,course_id)
);
CREATE TABLE IF NOT EXISTS product_content_subscriptions (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES content_subscriptions(id) ON DELETE CASCADE,
  PRIMARY KEY(product_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_content_subscriptions_active ON content_subscriptions(status,title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_content_subscription_courses_course ON content_subscription_courses(course_id,subscription_id);
ALTER TABLE school_subscriptions ADD COLUMN content_subscription_id TEXT REFERENCES content_subscriptions(id);
ALTER TABLE school_subscriptions ADD COLUMN last_payment_at TEXT;
CREATE INDEX IF NOT EXISTS idx_school_subscriptions_plan ON school_subscriptions(content_subscription_id,status);
ALTER TABLE products ADD COLUMN content_sections_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN video_sections_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE school_courses ADD COLUMN xml_date TEXT NOT NULL DEFAULT '';
