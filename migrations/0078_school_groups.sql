CREATE TABLE school_subprogram_groups (
  id TEXT PRIMARY KEY,
  subprogram_id TEXT NOT NULL REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  conference_id INTEGER REFERENCES conferences(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_subprogram_groups_subprogram ON school_subprogram_groups(subprogram_id, status);

CREATE TABLE school_subprogram_group_courses (
  group_id TEXT NOT NULL REFERENCES school_subprogram_groups(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  PRIMARY KEY(group_id, course_id)
);
CREATE INDEX idx_subprogram_group_courses_course ON school_subprogram_group_courses(course_id, group_id);

CREATE TABLE school_subprogram_group_members (
  enrollment_id TEXT PRIMARY KEY REFERENCES school_subprogram_enrollments(id) ON DELETE RESTRICT,
  group_id TEXT NOT NULL REFERENCES school_subprogram_groups(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_subprogram_group_members_group ON school_subprogram_group_members(group_id, enrollment_id);

ALTER TABLE conference_participants ADD COLUMN manual_invitation INTEGER NOT NULL DEFAULT 0;
