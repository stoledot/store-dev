-- Zoom conference administration: conferences can have multiple independent Zoom sessions.
CREATE TABLE IF NOT EXISTS conferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled','completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS conference_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  zoom_meeting_id TEXT,
  join_url TEXT,
  passcode TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conference_sessions_conference ON conference_sessions(conference_id, starts_at);
CREATE TABLE IF NOT EXISTS conference_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  access_key TEXT NOT NULL,
  source_order_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invited','failed')),
  invited_at TEXT,
  last_email_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conference_id, email)
);
CREATE INDEX IF NOT EXISTS idx_conference_participants_conference ON conference_participants(conference_id, created_at);
CREATE TABLE IF NOT EXISTS product_conferences (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
