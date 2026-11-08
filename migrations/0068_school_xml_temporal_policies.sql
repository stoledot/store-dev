-- Optional XML course, section, lesson and Doman playback policies.
-- JSON keeps the policy versioned and allows old TeX courses to remain unchanged.
ALTER TABLE school_courses ADD COLUMN xml_policy_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE school_lessons ADD COLUMN xml_policy_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE school_lesson_progress ADD COLUMN doman_extra_playbacks INTEGER NOT NULL DEFAULT 0 CHECK (doman_extra_playbacks >= 0);
