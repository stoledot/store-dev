-- Paid mathematical TeX library and immutable purchase snapshots.
CREATE TABLE IF NOT EXISTS math_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  source_tex TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE products ADD COLUMN math_text_id INTEGER REFERENCES math_texts(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN math_text_id INTEGER;
ALTER TABLE order_items ADD COLUMN math_text_title TEXT;
ALTER TABLE order_items ADD COLUMN math_text_source TEXT;
CREATE INDEX IF NOT EXISTS idx_products_math_text ON products(math_text_id);
CREATE INDEX IF NOT EXISTS idx_order_items_math_text ON order_items(math_text_id, order_id);
