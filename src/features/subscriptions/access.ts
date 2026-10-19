
export interface SubscriptionAccessParams {
  customerId: string | number;
  subscriptionKey: string;
}

export async function hasSubscriptionAccess(
  db: D1Database,
  params: SubscriptionAccessParams,
): Promise<boolean> {
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `SELECT 1
       FROM customer_subscriptions
       WHERE customer_id = ?
         AND subscription_key = ?
         AND status = 'active'
         AND starts_at <= ?
         AND (
           expires_at IS NULL
           OR expires_at > ?
         )
       LIMIT 1`,
    )
    .bind(
      String(params.customerId),
      params.subscriptionKey,
      now,
      now,
    )
    .first<{ 1: number }>();

  return result !== null;
}
