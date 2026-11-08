-- Construcciones XML privadas de GeoGebra vinculadas a refs por curso XML.
CREATE TABLE IF NOT EXISTS school_course_geogebra_assets (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE CASCADE,
  asset_ref TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  app_name TEXT NOT NULL CHECK (app_name IN ('graphing','3d')),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (course_id, asset_ref)
);

CREATE INDEX IF NOT EXISTS idx_school_course_geogebra_course
  ON school_course_geogebra_assets(course_id, asset_ref);
