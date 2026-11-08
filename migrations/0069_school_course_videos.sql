-- Private lesson videos stored in R2 and addressed from course XML by asset_ref.
CREATE TABLE IF NOT EXISTS school_course_video_assets (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE CASCADE,
  asset_ref TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  asset_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL CHECK (content_type IN ('video/mp4','video/webm','video/ogg')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(course_id, asset_ref)
);

CREATE INDEX IF NOT EXISTS idx_school_course_video_assets_course
  ON school_course_video_assets(course_id, asset_ref);
