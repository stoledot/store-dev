-- TeX-first school/readings support. Reuses school_courses, school_lessons and progress tables.
-- Content remains in the private FILES R2 bucket; D1 stores only references and activity metadata.
ALTER TABLE school_courses ADD COLUMN tex_source_key TEXT;
ALTER TABLE school_courses ADD COLUMN tex_filename TEXT NOT NULL DEFAULT 'contenido.tex';
ALTER TABLE school_courses ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE school_courses ADD COLUMN content_kind TEXT NOT NULL DEFAULT 'course' CHECK (content_kind IN ('course','reading'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_courses_product_id ON school_courses(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_school_courses_content_kind ON school_courses(content_kind,status);

ALTER TABLE school_lessons ADD COLUMN tex_node_id TEXT;
ALTER TABLE school_lessons ADD COLUMN activity_kind TEXT NOT NULL DEFAULT 'reading';
ALTER TABLE school_lessons ADD COLUMN due_at TEXT;
CREATE INDEX IF NOT EXISTS idx_school_lessons_tex_node ON school_lessons(course_id,tex_node_id);

-- Notifications for feedback on school activities; the existing order_notifications table is order-specific.
CREATE TABLE IF NOT EXISTS school_notifications (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  course_id TEXT REFERENCES school_courses(id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES school_lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_notifications_student ON school_notifications(student_email,read_at,created_at DESC);

-- Snapshot the linked school content on each line item so existing buyers keep access
-- even if an admin later changes which course/reading is linked to the product.
ALTER TABLE order_items ADD COLUMN school_course_id TEXT REFERENCES school_courses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_school_course ON order_items(school_course_id,order_id);
UPDATE order_items SET school_course_id=(SELECT c.id FROM school_courses c WHERE c.product_id=order_items.product_id LIMIT 1)
 WHERE school_course_id IS NULL AND product_id IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS trg_order_items_school_content_snapshot
AFTER INSERT ON order_items
WHEN NEW.product_id IS NOT NULL AND NEW.school_course_id IS NULL
BEGIN
  UPDATE order_items SET school_course_id=(SELECT c.id FROM school_courses c WHERE c.product_id=NEW.product_id LIMIT 1)
   WHERE id=NEW.id AND school_course_id IS NULL;
END;
