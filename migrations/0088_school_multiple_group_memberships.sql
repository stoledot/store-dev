CREATE TABLE school_subprogram_group_memberships (
  enrollment_id TEXT NOT NULL REFERENCES school_subprogram_enrollments(id) ON DELETE RESTRICT,
  group_id TEXT NOT NULL REFERENCES school_subprogram_groups(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (enrollment_id, group_id)
);

CREATE INDEX idx_subprogram_group_memberships_group
  ON school_subprogram_group_memberships(group_id, enrollment_id);

INSERT INTO school_subprogram_group_memberships (enrollment_id, group_id, assigned_at)
  SELECT enrollment_id, group_id, assigned_at FROM school_subprogram_group_members;
