import { env } from 'cloudflare:workers';
import type { WebhookResult } from '../payments/provider';
import { recordPaidOrder, getOrderByProviderSessionId } from './db';
import { deliverOrderNotifications, sweepStaleNotifications } from '../email/outbox';
import { persistRefundEvent, applyRefundEvent } from '../refunds/sync';
import { sendRefundNotice } from '../refunds/notify';
import { getPaymentProvider, type PaymentMethod } from '../payments';
import type { StoreSettings } from '../settings/db';
import {
  getSettlementReservation,
  markInventoryReservationPaymentPending,
  markInventoryReservationTerminal,
} from './reservations';
import { markPendingSettled } from '../payments/lightning/pending';
import { purgeStockProductCache } from '../cache/purge';

/**
 * Persist a verified paid-webhook order (idempotent on the provider session id)
 * and fire the confirmation + owner-notification emails exactly once. Shared by
 * the default `/api/webhook` and the per-provider `/api/webhook/[provider]`
 * routes; `paymentMethod` records which rail settled it (for refund routing).
 * Email failures are swallowed — the order is already saved.
 *
 * `settings` is optional but every caller already has it (middleware for /pay,
 * an explicit load in the webhook routes). Passing it removes four D1 reads from
 * the settlement path — the whole-table settings scan plus the three individual
 * lookups whose values are already on `StoreSettings`.
 *
 * `waitUntil` (the ExecutionContext's, when the caller has one) moves the whole
 * notification pipeline — provider construction, the order/items reads, both
 * sends — off the response's critical path. Best-effort by design: sends were
 * already swallowed on failure, so backgrounding them weakens nothing the
 * caller could observe. Callers that need delivery attempted before they
 * answer (the provider webhook routes, whose retries are the safety net) simply
 * don't pass it.
 */
async function settleSchoolObligation(
  paidOrder: NonNullable<WebhookResult['order']>,
  orderId: number,
): Promise<void> {
  const obligationId = paidOrder.schoolPaymentObligationId;
  if (!obligationId) return;
  const updated = await env.DB.prepare(`
    UPDATE school_payment_obligations
       SET status='paid', order_id=?, paid_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           checkout_lock_token=NULL, checkout_locked_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=? AND student_email=? COLLATE NOCASE AND status='pending'
       AND amount_cents=? AND lower(currency)=lower(?) AND checkout_session_id=?
  `).bind(orderId, obligationId, paidOrder.email ?? '', paidOrder.amountTotalCents, paidOrder.currency, paidOrder.providerSessionId).run();
  if ((updated.meta?.changes ?? 0) === 0) {
    const existing = await env.DB.prepare(`SELECT status,order_id FROM school_payment_obligations WHERE id=?`).bind(obligationId).first<{status:string;order_id:number|null}>();
    if (!(existing?.status === 'paid' && existing.order_id === orderId)) {
      // Do not silently attach a mismatched, cancelled, or stale checkout.
      console.error(`Paid school obligation ${obligationId} could not be matched to order ${orderId}; manual reconciliation required.`);
      return;
    }
  }

  // Mirror enrollment/monthly payments into the existing school access ledger.
  // This keeps the enrollment checklist and period-based access rules in sync.
  const obligation = await env.DB.prepare(`
    SELECT student_email,fee_type,validity_months,amount_cents,currency,title_snapshot
      FROM school_payment_obligations WHERE id=? AND status='paid' AND order_id=?
  `).bind(obligationId, orderId).first<{
    student_email:string;fee_type:string;validity_months:number;amount_cents:number;currency:string;title_snapshot:string;
  }>();
  if (!obligation || !['enrollment','monthly'].includes(obligation.fee_type)) return;
  const feeId = crypto.randomUUID();
  const validMonths = Math.max(1, Math.min(36, Number(obligation.validity_months) || 1));
  const statements = [env.DB.prepare(`
    INSERT INTO school_fee_payments
      (id,student_email,fee_type,amount_cents,currency,order_id,paid_at,valid_until,recorded_by,note,obligation_id)
    VALUES (?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),date('now','+' || ? || ' months'),'stripe',?,?)
    ON CONFLICT(obligation_id) DO NOTHING
  `).bind(feeId,obligation.student_email,obligation.fee_type,obligation.amount_cents,obligation.currency,orderId,validMonths,`Pago en línea: ${obligation.title_snapshot}`,obligationId)];
  if (obligation.fee_type === 'monthly') {
    // This condition is true only until the period for THIS fee row is created.
    // On webhook retries the period already exists, so the active period is not
    // incorrectly marked completed a second time.
    statements.push(env.DB.prepare(`
      UPDATE school_periods SET status='completed'
       WHERE student_email=? COLLATE NOCASE AND status='active'
         AND EXISTS (SELECT 1 FROM school_fee_payments fp WHERE fp.obligation_id=?
                      AND NOT EXISTS (SELECT 1 FROM school_periods sp WHERE sp.fee_payment_id=fp.id))
    `).bind(obligation.student_email,obligationId));
    statements.push(env.DB.prepare(`
      INSERT INTO school_periods(id,student_email,period_no,fee_payment_id,status,starts_on,ends_on)
      SELECT ?,fp.student_email,(SELECT COALESCE(MAX(period_no),0)+1 FROM school_periods WHERE student_email=fp.student_email COLLATE NOCASE),fp.id,'active',date('now'),fp.valid_until
        FROM school_fee_payments fp
       WHERE fp.obligation_id=? AND NOT EXISTS (SELECT 1 FROM school_periods sp WHERE sp.fee_payment_id=fp.id)
    `).bind(crypto.randomUUID(),obligationId));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO school_notifications(id,student_email,title,body,href)
    SELECT ?,?,?,?,'/account/payments'
     WHERE NOT EXISTS (SELECT 1 FROM school_notifications WHERE student_email=? COLLATE NOCASE AND title='Pago confirmado' AND body=?)
  `).bind(crypto.randomUUID(),obligation.student_email,'Pago confirmado',`${obligation.title_snapshot} fue pagado correctamente.`,obligation.student_email,`${obligation.title_snapshot} fue pagado correctamente.`));
  await env.DB.batch(statements);
}

export async function recordPaidWebhookOrder(
  result: WebhookResult,
  origin: string,
  paymentMethod: string,
  settings?: StoreSettings,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<void> {
  const markPending = async () => {
    if (result.settlePendingPaymentId) {
      await markPendingSettled(env.DB, result.settlePendingPaymentId);
    }
  };
  if (result.releaseReservationId) {
    await markInventoryReservationTerminal(
      env.DB,
      result.releaseReservationId,
      'failed',
      purgeStockProductCache,
    );
  }
  if (result.pendingReservationId) {
    await markInventoryReservationPaymentPending(env.DB, result.pendingReservationId);
  }

  // A signed Stripe expiry/failure event releases the private school checkout lock.
  if (result.schoolObligationId && result.schoolCheckoutSessionId && !result.order) {
    await env.DB.prepare(`UPDATE school_payment_obligations
      SET checkout_lock_token=NULL, checkout_locked_at=NULL, checkout_session_id=NULL,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND checkout_session_id=? AND status='pending'`)
      .bind(result.schoolObligationId, result.schoolCheckoutSessionId).run();
  }

  // A refund reported by the provider. persistRefundEvent is deliberately NOT
  // wrapped: if we can't even record the event, the caller should 5xx so the
  // provider retries. Everything after it is recoverable from the stored row,
  // so an unmatched or conflicting event still answers 200 rather than making
  // the provider redeliver a valid event forever.
  if (result.refundSync) {
    await persistRefundEvent(env.DB, paymentMethod, result.refundSync);
    // Building the client throws if the rail isn't fully configured. That must
    // not turn a valid, already-persisted event into a 500 and an endless
    // provider retry — without the lookup the event simply stays queued.
    let findSessionIdForPayment;
    try {
      const provider = await getPaymentProvider(paymentMethod as PaymentMethod);
      findSessionIdForPayment = provider.findSessionIdForPayment?.bind(provider);
    } catch (err) {
      console.error('Refund correlation provider unavailable:', err);
    }
    const outcome = await applyRefundEvent(env.DB, paymentMethod, result.refundSync, {
      findSessionIdForPayment,
    });
    if (outcome.status === 'processed') {
      await sendRefundNotice(outcome.orderId, outcome.deltaCents, origin);
    }
    return;
  }

  if (!result.order) return;

  // Provider metadata carries only a compact reservation id. The authoritative
  // item/price/quantity snapshot stays in D1, avoiding provider metadata limits
  // and ensuring settlement consumes inventory that was atomically held.
  let paidOrder = result.order;
  if (paidOrder.reservationId) {
    const reservation = await getSettlementReservation(env.DB, paidOrder.reservationId);
    if (!reservation) {
      // Normal idempotent redelivery after the first delivery settled the
      // reservation. Anything else is a real integrity failure and must retry.
      // This is THE redelivery path for reserved checkouts, so it must finish
      // any emails the first delivery left unsent — same as the branch below.
      const settled = await getOrderByProviderSessionId(env.DB, paidOrder.providerSessionId);
      if (settled) {
        await markPending();
        await deliverOrderNotifications(env.DB, settled.id, origin, settings);
        return;
      }
      throw new Error(`Missing or expired inventory reservation ${paidOrder.reservationId}.`);
    }
    paidOrder = {
      ...paidOrder,
      items: reservation.items,
      reservationStatus:
        reservation.status === 'active' || reservation.status === 'payment_pending'
          ? reservation.status
          : reservation.status === 'expired'
            ? 'expired'
            : 'failed',
    };
  }

  // recordPaidOrder returns the new id, or null if this session was already
  // recorded (re-delivered webhook) — so emails send exactly once.
  const orderId = await recordPaidOrder(
    env.DB,
    { ...paidOrder, paymentMethod },
    purgeStockProductCache,
  );
  if (!orderId) {
    const existing = await getOrderByProviderSessionId(env.DB, paidOrder.providerSessionId);
    if (existing) {
      await settleSchoolObligation(paidOrder, existing.id);
      await markPending();
      // The redelivery IS the safety net: if the first delivery recorded the
      // order but died before its emails went out, this retry finishes them.
      // (Previously this path returned with the emails unsent, forever.)
      await deliverOrderNotifications(env.DB, existing.id, origin, settings);
      return;
    }
    throw new Error(`Could not settle inventory reservation ${paidOrder.reservationId ?? 'legacy'}.`);
  }
  await settleSchoolObligation(paidOrder, orderId);

  // Orders built from a pending payment settle it inside the batch above
  // (settlePaymentHash); the separate round trip is only for results that
  // carry a settle id without one (none today — belt and braces).
  if (!paidOrder.settlePaymentHash) await markPending();

  // The batch above committed the outbox rows with the order; delivery is a
  // separate, repeatable act. A send that fails here stays claimed-then-failed
  // in the outbox and is finished by a webhook redelivery or the sweep — so
  // this call reports outcomes into the outbox instead of throwing. The sweep
  // rides along to drain any OTHER order's stranded rows a little per sale.
  const deliver = async () => {
    await deliverOrderNotifications(env.DB, orderId, origin, settings);
    await sweepStaleNotifications(env.DB, origin);
  };
  if (waitUntil) waitUntil(deliver().catch((err) => console.error('Notification delivery failed:', err)));
  else await deliver();
}
