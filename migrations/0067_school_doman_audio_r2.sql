-- R2 object key for audio bytes. Existing GitHub rows keep a NULL key until the admin transfers them.
ALTER TABLE school_doman_audio_assets ADD COLUMN object_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_doman_audio_object_key
  ON school_doman_audio_assets(object_key) WHERE object_key IS NOT NULL;
