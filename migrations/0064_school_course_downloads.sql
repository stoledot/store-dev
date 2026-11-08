-- Referencias privadas a materiales descargables por curso XML.
-- La clave del objeto R2 se mantiene del lado servidor y nunca dentro del XML.
CREATE TABLE IF NOT EXISTS school_course_download_assets (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE CASCADE,
  asset_ref TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (course_id, asset_ref)
);

CREATE INDEX IF NOT EXISTS idx_school_course_download_assets_course
  ON school_course_download_assets(course_id, asset_ref);
