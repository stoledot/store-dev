import type { D1Database } from '@cloudflare/workers-types';
import { courseAccessNotBlockedSqlFor } from '../school/courseAccess.ts';

export async function blockedOrderItemIds(db: D1Database, orderId: number, email: string | null): Promise<Set<number>> {
  const { results } = await db.prepare(`
    WITH purchaser AS (
      SELECT COALESCE((SELECT current_email FROM customer_email_aliases WHERE old_email=? COLLATE NOCASE), ?) AS email
    )
    SELECT oi.id FROM order_items oi CROSS JOIN purchaser
    JOIN school_courses c ON c.id=oi.school_course_id
    WHERE oi.order_id=? AND NOT (${courseAccessNotBlockedSqlFor('purchaser.email')})
  `).bind(email ?? '', email ?? '', orderId).all<{id:number}>();
  return new Set((results ?? []).map(item => item.id));
}
