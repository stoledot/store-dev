ALTER TABLE school_subprogram_groups ADD COLUMN image_key TEXT;
ALTER TABLE school_subprogram_groups ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE school_subprogram_groups ADD COLUMN schedule TEXT NOT NULL DEFAULT '';
ALTER TABLE school_subprogram_groups ADD COLUMN rules TEXT NOT NULL DEFAULT '';
ALTER TABLE school_subprogram_groups ADD COLUMN evaluation_description TEXT NOT NULL DEFAULT '';

CREATE TABLE school_subprogram_diagnostic_sections (
  id TEXT PRIMARY KEY,
  subprogram_id TEXT NOT NULL REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_diagnostic_sections_subprogram
  ON school_subprogram_diagnostic_sections(subprogram_id, position, id);

ALTER TABLE school_subprogram_questions ADD COLUMN section_id TEXT
  REFERENCES school_subprogram_diagnostic_sections(id) ON DELETE SET NULL;
ALTER TABLE school_subprogram_questions ADD COLUMN correct_options_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE school_subprogram_questions ADD COLUMN choice_mode TEXT NOT NULL DEFAULT 'single'
  CHECK (choice_mode IN ('single', 'multiple'));

CREATE TABLE school_subprogram_faqs (
  id TEXT PRIMARY KEY,
  subprogram_id TEXT NOT NULL REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_subprogram_faqs_order ON school_subprogram_faqs(subprogram_id, position, id);
