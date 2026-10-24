-- Keep conference entitlements independent from the current product/catalog link.
-- Existing access rows are backfilled from their purchased product when possible.
ALTER TABLE conference_access ADD COLUMN conference_id INTEGER;
UPDATE conference_access
SET conference_id = (
  SELECT pc.conference_id
  FROM order_items oi
  JOIN product_conferences pc ON pc.product_id = oi.product_id
  WHERE oi.id = conference_access.order_item_id
  LIMIT 1
)
WHERE conference_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_conference_access_conference
  ON conference_access(conference_id, order_id);
