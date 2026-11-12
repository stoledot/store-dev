CREATE TABLE IF NOT EXISTS math_magazines (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  editor TEXT NOT NULL DEFAULT '',
  issn_print TEXT NOT NULL DEFAULT '',
  issn_online TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  copyright_notice TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'es',
  frequency TEXT NOT NULL DEFAULT '',
  cover_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS math_magazine_issues (
  id TEXT PRIMARY KEY,
  magazine_id TEXT NOT NULL REFERENCES math_magazines(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  issue_number TEXT NOT NULL,
  volume TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  xml_source_key TEXT NOT NULL,
  xml_filename TEXT NOT NULL,
  cover_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(magazine_id,slug),
  UNIQUE(magazine_id,volume,issue_number)
);
ALTER TABLE content_subscriptions ADD COLUMN magazine_id TEXT REFERENCES math_magazines(id);
ALTER TABLE content_subscriptions ADD COLUMN magazine_access TEXT CHECK(magazine_access IN ('latest','all'));
CREATE INDEX IF NOT EXISTS idx_math_magazine_issues_publication ON math_magazine_issues(magazine_id,status,issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_content_subscriptions_magazine ON content_subscriptions(magazine_id,magazine_access,status);

CREATE TABLE IF NOT EXISTS math_magazine_issue_notifications (
  issue_id TEXT NOT NULL REFERENCES math_magazine_issues(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  PRIMARY KEY(issue_id,student_email)
);
CREATE INDEX IF NOT EXISTS idx_math_magazine_issue_notifications_pending
  ON math_magazine_issue_notifications(status,claimed_at);
