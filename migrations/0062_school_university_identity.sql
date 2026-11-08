-- University identity, admission, careers, academic cycles, classrooms and messaging.
-- New academic records use opaque numeric client/student/teacher identifiers;
-- legacy commerce and school email references remain available during migration.

CREATE TABLE IF NOT EXISTS customer_accounts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  client_number TEXT NOT NULL UNIQUE CHECK (length(client_number)=10 AND client_number NOT GLOB '*[^0-9]*'),
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_client_number ON customer_accounts(client_number);

CREATE TABLE IF NOT EXISTS school_number_sequences (
  sequence_name TEXT PRIMARY KEY CHECK (sequence_name IN ('student','teacher')),
  next_value INTEGER NOT NULL CHECK (next_value >= 1)
);
INSERT OR IGNORE INTO school_number_sequences(sequence_name,next_value) VALUES ('student',1),('teacher',1);

CREATE TABLE IF NOT EXISTS school_careers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS school_career_courses (
  career_id TEXT NOT NULL REFERENCES school_careers(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  course_role TEXT NOT NULL DEFAULT 'regular' CHECK (course_role IN ('regular','preparatory')),
  sequence_no INTEGER NOT NULL DEFAULT 1 CHECK (sequence_no >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(career_id,course_id)
);
CREATE INDEX IF NOT EXISTS idx_school_career_courses_course ON school_career_courses(course_id,career_id);

CREATE TABLE IF NOT EXISTS school_course_prerequisites (
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  prerequisite_course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  PRIMARY KEY(course_id,prerequisite_course_id),
  CHECK (course_id <> prerequisite_course_id)
);

CREATE TABLE IF NOT EXISTS school_academic_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','closed','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(name),
  CHECK (date(starts_on) IS NOT NULL AND date(ends_on) IS NOT NULL AND starts_on <= ends_on)
);
CREATE INDEX IF NOT EXISTS idx_school_cycles_status_dates ON school_academic_cycles(status,starts_on,ends_on);

CREATE TABLE IF NOT EXISTS school_enrollment_applications (
  client_number TEXT PRIMARY KEY REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  applicant_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  requested_career_id TEXT REFERENCES school_careers(id) ON DELETE SET NULL,
  applicant_id_document_key TEXT,
  guardian_name TEXT NOT NULL DEFAULT '',
  guardian_relationship TEXT NOT NULL DEFAULT '',
  guardian_phone TEXT NOT NULL DEFAULT '',
  guardian_email TEXT NOT NULL DEFAULT '',
  guardian_id_document_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','correction_requested','approved','rejected')),
  correction_request TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (date(date_of_birth) IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_school_enrollment_review ON school_enrollment_applications(status,submitted_at);

CREATE TABLE IF NOT EXISTS school_students (
  student_number TEXT PRIMARY KEY,
  client_number TEXT NOT NULL UNIQUE REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  career_id TEXT REFERENCES school_careers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','graduated','withdrawn')),
  admitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_students_career_status ON school_students(career_id,status);

CREATE TABLE IF NOT EXISTS school_cycle_students (
  cycle_id TEXT NOT NULL REFERENCES school_academic_cycles(id) ON DELETE RESTRICT,
  student_number TEXT NOT NULL REFERENCES school_students(student_number) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL DEFAULT 'admin',
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','withdrawn')),
  PRIMARY KEY(cycle_id,student_number)
);
CREATE INDEX IF NOT EXISTS idx_school_cycle_students_student ON school_cycle_students(student_number,status);

CREATE TABLE IF NOT EXISTS school_teachers (
  teacher_number TEXT PRIMARY KEY,
  client_number TEXT NOT NULL UNIQUE REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT '',
  career_id TEXT REFERENCES school_careers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  assigned_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_teachers_career_status ON school_teachers(career_id,status);

CREATE TABLE IF NOT EXISTS school_teacher_courses (
  teacher_number TEXT NOT NULL REFERENCES school_teachers(teacher_number) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL DEFAULT 'admin',
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(teacher_number,course_id)
);
CREATE INDEX IF NOT EXISTS idx_school_teacher_courses_course ON school_teacher_courses(course_id,teacher_number);

CREATE TABLE IF NOT EXISTS school_classrooms (
  id TEXT PRIMARY KEY,
  classroom_code TEXT NOT NULL,
  name TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES school_courses(id) ON DELETE RESTRICT,
  cycle_id TEXT NOT NULL REFERENCES school_academic_cycles(id) ON DELETE RESTRICT,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','closed','archived')),
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(classroom_code,cycle_id),
  CHECK (date(starts_on) IS NOT NULL AND date(ends_on) IS NOT NULL AND starts_on <= ends_on)
);
CREATE INDEX IF NOT EXISTS idx_school_classrooms_course_cycle ON school_classrooms(course_id,cycle_id,status);

CREATE TABLE IF NOT EXISTS school_classroom_students (
  classroom_id TEXT NOT NULL REFERENCES school_classrooms(id) ON DELETE RESTRICT,
  student_number TEXT NOT NULL REFERENCES school_students(student_number) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL DEFAULT 'admin',
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','withdrawn')),
  PRIMARY KEY(classroom_id,student_number)
);
CREATE INDEX IF NOT EXISTS idx_school_classroom_students_student ON school_classroom_students(student_number,status);

CREATE TABLE IF NOT EXISTS school_classroom_teachers (
  classroom_id TEXT NOT NULL REFERENCES school_classrooms(id) ON DELETE RESTRICT,
  teacher_number TEXT NOT NULL REFERENCES school_teachers(teacher_number) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL DEFAULT 'admin',
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  PRIMARY KEY(classroom_id,teacher_number)
);
CREATE INDEX IF NOT EXISTS idx_school_classroom_teachers_teacher ON school_classroom_teachers(teacher_number,status);

CREATE TABLE IF NOT EXISTS school_classroom_messages (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL REFERENCES school_classrooms(id) ON DELETE RESTRICT,
  sender_client_number TEXT NOT NULL REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('student','teacher')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_class_messages_room_time ON school_classroom_messages(classroom_id,created_at,id);
