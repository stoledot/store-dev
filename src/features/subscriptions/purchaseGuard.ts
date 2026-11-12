import type { D1Database } from '@cloudflare/workers-types';

/** Any associated plan makes the product subscription-only, even if archived. */
export async function hasSubscriptionProduct(db: D1Database, productIds: number[]): Promise<boolean> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return false;
  const placeholders = ids.map(() => '?').join(',');
  const row = await db.prepare(
    `SELECT 1 AS found FROM product_content_subscriptions WHERE product_id IN (${placeholders}) LIMIT 1`,
  ).bind(...ids).first<{ found: number }>();
  return row !== null;
}
