-- Paid conference access is an additive entitlement, separate from order_items.
-- One credential is issued per purchased seat and remains attached to its order.
CREATE TABLE IF NOT EXISTS conference_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL CHECK (seat_number > 0),
  access_key TEXT NOT NULL UNIQUE,
  zoom_url TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(order_item_id, seat_number)
);
CREATE INDEX IF NOT EXISTS idx_conference_access_order
  ON conference_access(order_id, order_item_id, seat_number);
