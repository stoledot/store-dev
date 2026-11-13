import type { D1Database } from '@cloudflare/workers-types';
import type { WebhookResult } from '../payments/provider';
import { validityEnd } from './scheduleDates.ts';

export async function settleSubprogramObligation(
  db: D1Database,
  paidOrder: NonNullable<WebhookResult['order']>,
  orderId: number,
  paymentMethod: string,
  validity: { modality_validity_count: number | null; modality_validity_unit: string | null },
): Promise<void> {
  const obligationId = paidOrder.schoolPaymentObligationId;
  if (!obligationId) throw new Error('Missing subprogram obligation.');
  const paidAt = new Date();
  const validUntil = validityEnd(paidAt, validity.modality_validity_count, validity.modality_validity_unit);
  const result = await db.batch([
    db.prepare(`
      UPDATE school_payment_obligations
         SET status='paid',order_id=?,paid_at=?,modality_valid_until=?,checkout_lock_token=NULL,checkout_locked_at=NULL,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id=? AND subprogram_schedule_id IS NOT NULL AND status='pending'
         AND (student_email=? COLLATE NOCASE OR EXISTS (
           SELECT 1 FROM customer_email_aliases a WHERE a.old_email=? COLLATE NOCASE
             AND a.current_email=school_payment_obligations.student_email COLLATE NOCASE))
         AND amount_cents=? AND lower(currency)=lower(?) AND checkout_session_id=?
    `).bind(orderId, paidAt.toISOString(), validUntil, obligationId, paidOrder.email ?? '', paidOrder.email ?? '',
      paidOrder.amountTotalCents, paidOrder.currency, paidOrder.providerSessionId),
    db.prepare(`
      UPDATE orders SET email=(SELECT student_email FROM school_payment_obligations WHERE id=?)
       WHERE id=? AND EXISTS (SELECT 1 FROM school_payment_obligations
         WHERE id=? AND status='paid' AND order_id=?)
    `).bind(obligationId, orderId, obligationId, orderId),
    db.prepare(`
      INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT 'subprogram-payment-' || id,student_email,'Pago confirmado',
             title_snapshot || ?,title_snapshot || ?,'/account/payments'
        FROM school_payment_obligations WHERE id=? AND status='paid' AND order_id=?
      ON CONFLICT(id) DO NOTHING
    `).bind(paymentMethod === 'demo' ? ' fue pagado correctamente (simulación demo).' : ' fue pagado correctamente.',
      paymentMethod === 'demo' ? ' fue pagado correctamente (simulación demo).' : ' fue pagado correctamente.',
      obligationId, orderId),
  ]);
  if (!result[0].meta.changes) {
    const existing = await db.prepare('SELECT status,order_id FROM school_payment_obligations WHERE id=?')
      .bind(obligationId).first<{ status: string; order_id: number | null }>();
    if (!(existing?.status === 'paid' && existing.order_id === orderId)) {
      throw new Error(`Paid school obligation ${obligationId} could not be matched to order ${orderId}; manual reconciliation required.`);
    }
  }
}
