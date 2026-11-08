-- XML source metadata and hierarchy labels. Existing TeX fields stay available to old courses.
ALTER TABLE school_courses ADD COLUMN source_format TEXT NOT NULL DEFAULT 'tex' CHECK (source_format IN ('tex','xml'));
ALTER TABLE school_courses ADD COLUMN xml_source_key TEXT;
ALTER TABLE school_courses ADD COLUMN xml_filename TEXT NOT NULL DEFAULT 'contenido.xml';
ALTER TABLE school_courses ADD COLUMN xml_author TEXT NOT NULL DEFAULT '';

-- Keep section/lesson grouping and its component weights on each persisted unit.
-- The existing lesson/progress IDs remain untouched so student history is preserved.
ALTER TABLE school_lessons ADD COLUMN xml_section_id TEXT;
ALTER TABLE school_lessons ADD COLUMN xml_section_title TEXT;
ALTER TABLE school_lessons ADD COLUMN xml_section_slug TEXT;
ALTER TABLE school_lessons ADD COLUMN xml_lesson_id TEXT;
ALTER TABLE school_lessons ADD COLUMN xml_lesson_title TEXT;
CREATE INDEX IF NOT EXISTS idx_school_lessons_xml_hierarchy
  ON school_lessons(course_id, xml_section_id, xml_lesson_id, sequence_no);
