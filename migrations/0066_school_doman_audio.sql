-- Audio library used by Doman slides. Audio bytes live in the configured GitHub repository;
-- D1 stores searchable labels, duration, and the private repository path/SHA.
CREATE TABLE IF NOT EXISTS school_doman_audio_assets (
  id TEXT PRIMARY KEY,
  text_value TEXT NOT NULL,
  category TEXT NOT NULL,
  audio_type TEXT NOT NULL,
  level TEXT NOT NULL,
  github_path TEXT NOT NULL UNIQUE,
  github_sha TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  duration_seconds REAL NOT NULL CHECK (duration_seconds >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_school_doman_audio_filter
  ON school_doman_audio_assets(status, category, audio_type, level);
CREATE TABLE IF NOT EXISTS school_doman_audio_labels (
  id TEXT PRIMARY KEY,
  label_kind TEXT NOT NULL CHECK (label_kind IN ('category','type','level')),
  label_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(label_kind, label_value)
);
