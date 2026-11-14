import type { D1Database } from '@cloudflare/workers-types';
import { pendingToPaidOrder, type PendingPayment } from '../payments/lightning/pending';
import { settleSchoolObligation } from '../orders/recordWebhook';

export async function reconcileDemoSchoolPayments(db: D1Database): Promise<void> {
  const rows = (await db.prepare(`
    SELECT p.*,o.id AS settled_order_id
      FROM pending_payments p
      JOIN orders o ON o.public_id=p.public_id AND o.provider_session_id=p.payment_hash
      JOIN school_payment_obligations ob ON ob.id=p.school_payment_obligation_id
     WHERE p.backend='demo' AND p.status='settled' AND o.payment_method='demo'
       AND o.school_payment_obligation_id=ob.id AND (
         ob.status='pending' OR
         (ob.status='paid' AND ob.subprogram_schedule_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM school_notifications n WHERE n.id='subprogram-payment-' || ob.id
         )) OR
         (ob.status='paid' AND ob.subprogram_schedule_id IS NULL AND ob.group_access_only=0 AND ob.fee_type IN ('enrollment','monthly') AND NOT EXISTS (
           SELECT 1 FROM school_fee_payments fp
            WHERE fp.obligation_id=ob.id AND (ob.fee_type<>'monthly'
              OR EXISTS (SELECT 1 FROM school_periods sp WHERE sp.fee_payment_id=fp.id))
         )))
     ORDER BY p.created_at LIMIT 50
  `).all<PendingPayment & { settled_order_id: number }>()).results;
  for (const row of rows) {
    try {
      await settleSchoolObligation(pendingToPaidOrder(row), row.settled_order_id, 'demo');
    } catch (error) {
      console.error(`No se pudo reconciliar el pago demo escolar ${row.public_id}:`, error);
    }
  }
}
