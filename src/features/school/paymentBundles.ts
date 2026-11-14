import type { D1Database } from '@cloudflare/workers-types';
import type { WebhookResult } from '../payments/provider';
import { validityEnd } from './scheduleDates.ts';
import { reactivateOverdueEnrollment } from './withdrawals.ts';

export interface BundleCandidate {
  id: string;
  enrollment_id: string;
  subprogram_title: string;
  student_email: string;
  title_snapshot: string;
  amount_cents: number;
  currency: string;
  due_at: string;
  modality_payment_type: string | null;
  overdue: number;
}

export function selectBundleItems(rows: BundleCandidate[]): BundleCandidate[] {
  const sorted = [...rows].sort((a, b) => a.due_at.localeCompare(b.due_at) || a.id.localeCompare(b.id));
  const overdue = sorted.filter(row => row.overdue === 1);
  const nextClass = sorted.find(row => row.overdue !== 1 && row.modality_payment_type !== 'enrollment');
  const nextEnrollment = sorted.find(row => row.overdue !== 1 && row.modality_payment_type === 'enrollment');
  return [...overdue, ...(nextClass ? [nextClass] : []), ...(nextEnrollment ? [nextEnrollment] : [])];
}

const availableSql = `((o.available_from IS NOT NULL AND datetime(o.available_from)<=datetime('now'))
  OR (o.available_from IS NULL AND (o.available_at IS NULL OR date(o.available_at)<=date('now'))))`;

export async function listBundleCandidates(db: D1Database, email: string | null): Promise<BundleCandidate[]> {
  return (await db.prepare(`
    SELECT o.id,s.enrollment_id,sub.title AS subprogram_title,o.student_email,o.title_snapshot,o.amount_cents,o.currency,o.due_at,
           o.modality_payment_type,
           CASE WHEN (o.overdue_from IS NOT NULL AND datetime(o.overdue_from)<=datetime('now'))
             OR (o.overdue_from IS NULL AND date(o.due_at)<date('now')) THEN 1 ELSE 0 END AS overdue
      FROM school_payment_obligations o
      JOIN school_subprogram_payment_schedules s ON s.id=o.subprogram_schedule_id
      JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
      JOIN school_subprograms sub ON sub.id=e.subprogram_id
     WHERE (? IS NULL OR o.student_email=? COLLATE NOCASE) AND o.status='pending' AND ${availableSql}
       AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
     ORDER BY o.due_at,o.id
  `).bind(email, email).all<BundleCandidate>()).results;
}

export function groupBundleCandidates(rows: BundleCandidate[]): BundleCandidate[][] {
  const groups = new Map<string, BundleCandidate[]>();
  for (const row of rows) {
    const key = `${row.enrollment_id}\0${row.currency.toLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(selectBundleItems).filter(group => group.length > 0);
}

export async function releaseExpiredDemoBundles(db: D1Database, email: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE school_payment_bundles SET status='expired'
      WHERE student_email=? COLLATE NOCASE AND status='pending'
        AND EXISTS (SELECT 1 FROM pending_payments p WHERE p.payment_hash=school_payment_bundles.checkout_session_id
          AND p.backend='demo' AND p.status='pending' AND datetime(p.expires_at)<=datetime('now'))`).bind(email),
    db.prepare(`UPDATE school_payment_bundles SET status='failed'
      WHERE student_email=? COLLATE NOCASE AND status='pending' AND checkout_session_id IS NULL
        AND datetime(created_at)<datetime('now','-25 hours')`).bind(email),
    db.prepare(`UPDATE school_payment_obligations SET checkout_bundle_id=NULL,checkout_lock_token=NULL,
      checkout_locked_at=NULL,checkout_session_id=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE status='pending' AND checkout_bundle_id IN
        (SELECT id FROM school_payment_bundles WHERE student_email=? COLLATE NOCASE AND status IN ('expired','failed'))`).bind(email),
  ]);
}

export async function claimPaymentBundle(
  db: D1Database, anchorId: string, email: string, token: string,
): Promise<{ id: string; student_email: string; currency: string; amount_cents: number; items: BundleCandidate[] } | null> {
  await releaseExpiredDemoBundles(db, email);
  const candidates = await listBundleCandidates(db, email);
  const anchor = candidates.find(row => row.id === anchorId);
  if (!anchor) return null;
  const scope = candidates.filter(row => row.enrollment_id === anchor.enrollment_id
    && row.currency.toLowerCase() === anchor.currency.toLowerCase());
  const selected = selectBundleItems(scope);
  const total = selected.reduce((sum, item) => sum + item.amount_cents, 0);
  if (!selected.length || !Number.isSafeInteger(total) || total <= 0) throw new Error('El total del pago agrupado no es válido.');
  const leader = selected[0];
  const allJson = JSON.stringify(scope);
  const selectedJson = JSON.stringify(selected);
  const result = await db.batch([
    db.prepare(`
      INSERT INTO school_payment_bundles(id,leader_obligation_id,enrollment_id,student_email,currency,amount_cents,item_count,status,created_at)
      SELECT ?,?,?,?,?,?,?,'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE EXISTS (SELECT 1 FROM school_subprogram_enrollments e
         WHERE e.id=? AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue')))
         AND (SELECT count(*) FROM school_payment_obligations o JOIN school_subprogram_payment_schedules s ON s.id=o.subprogram_schedule_id
           WHERE s.enrollment_id=? AND o.student_email=? COLLATE NOCASE AND lower(o.currency)=lower(?)
             AND o.status='pending' AND ${availableSql})=json_array_length(?)
         AND NOT EXISTS (SELECT 1 FROM json_each(?) j LEFT JOIN school_payment_obligations o ON o.id=json_extract(j.value,'$.id')
           LEFT JOIN school_subprogram_payment_schedules s ON s.id=o.subprogram_schedule_id
           WHERE o.id IS NULL OR s.enrollment_id IS NOT ? OR o.student_email<>? COLLATE NOCASE OR o.status<>'pending'
             OR lower(o.currency)<>lower(?) OR o.amount_cents<>json_extract(j.value,'$.amount_cents')
             OR o.title_snapshot<>json_extract(j.value,'$.title_snapshot') OR o.due_at<>json_extract(j.value,'$.due_at')
             OR o.modality_payment_type IS NOT json_extract(j.value,'$.modality_payment_type')
             OR NOT ${availableSql}
             OR (CASE WHEN (o.overdue_from IS NOT NULL AND datetime(o.overdue_from)<=datetime('now'))
               OR (o.overdue_from IS NULL AND date(o.due_at)<date('now')) THEN 1 ELSE 0 END)<>json_extract(j.value,'$.overdue'))
         AND NOT EXISTS (SELECT 1 FROM json_each(?) j JOIN school_payment_obligations o ON o.id=json_extract(j.value,'$.id')
           WHERE o.checkout_bundle_id IS NOT NULL OR (o.checkout_session_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM pending_payments p WHERE p.payment_hash=o.checkout_session_id
                 AND p.backend='demo' AND p.status='pending' AND datetime(p.expires_at)<=datetime('now')))
             OR (o.checkout_lock_token IS NOT NULL AND NOT (
             (o.checkout_session_id IS NULL AND datetime(o.checkout_locked_at)<datetime('now','-25 hours'))
             OR EXISTS (SELECT 1 FROM pending_payments p WHERE p.payment_hash=o.checkout_session_id
               AND p.backend='demo' AND p.status='pending' AND datetime(p.expires_at)<=datetime('now')))))
         AND NOT EXISTS (SELECT 1 FROM json_each(?) j
           JOIN school_payment_obligations o ON o.id=json_extract(j.value,'$.id')
           JOIN school_subprogram_payment_schedules s ON s.id=o.subprogram_schedule_id
           JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
           JOIN school_subprograms sub ON sub.id=e.subprogram_id
           JOIN school_payment_modalities m ON m.id=s.modality_id
           WHERE COALESCE(o.modality_payment_type,'')<>'enrollment'
             AND (sub.enrollment_modality_id IS NOT NULL OR m.requires_current_enrollment=1 OR e.reenrollment_required=1)
             AND NOT EXISTS (SELECT 1 FROM school_subprogram_payment_schedules ps
               JOIN school_payment_obligations fee ON fee.subprogram_schedule_id=ps.id
               JOIN orders ord ON ord.id=COALESCE(fee.order_id,fee.bundle_order_id)
               WHERE ps.enrollment_id=e.id AND fee.modality_payment_type='enrollment' AND fee.status='paid'
                 AND ord.status='paid' AND COALESCE(ord.refunded_cents,0)<ord.amount_total_cents
                 AND datetime(fee.paid_at)<=datetime('now')
                 AND (fee.modality_valid_from IS NULL OR datetime(fee.modality_valid_from)<=
                   CASE WHEN datetime(o.modality_valid_from)>datetime('now') THEN datetime(o.modality_valid_from) ELSE datetime('now') END)
                 AND (fee.modality_valid_until IS NULL OR datetime(fee.modality_valid_until)>
                   CASE WHEN datetime(o.modality_valid_from)>datetime('now') THEN datetime(o.modality_valid_from) ELSE datetime('now') END))
             AND NOT EXISTS (SELECT 1 FROM json_each(?) k JOIN school_payment_obligations fee ON fee.id=json_extract(k.value,'$.id')
               WHERE fee.modality_payment_type='enrollment'
                 AND (fee.modality_valid_from IS NULL OR datetime(fee.modality_valid_from)<=
                   CASE WHEN datetime(o.modality_valid_from)>datetime('now') THEN datetime(o.modality_valid_from) ELSE datetime('now') END)
                 AND (fee.modality_valid_until IS NULL OR datetime(fee.modality_valid_until)>
                   CASE WHEN datetime(o.modality_valid_from)>datetime('now') THEN datetime(o.modality_valid_from) ELSE datetime('now') END)))
    `).bind(token, leader.id, anchor.enrollment_id, email, anchor.currency.toLowerCase(), total, selected.length,
      anchor.enrollment_id, anchor.enrollment_id, email, anchor.currency, allJson,
      allJson, anchor.enrollment_id, email, anchor.currency, selectedJson, selectedJson, selectedJson),
    db.prepare(`UPDATE school_payment_obligations SET checkout_bundle_id=?,checkout_lock_token=?,
      checkout_locked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),checkout_session_id=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?))
        AND EXISTS (SELECT 1 FROM school_payment_bundles WHERE id=? AND status='pending')`)
      .bind(token, token, selectedJson, token),
    db.prepare(`INSERT INTO school_payment_bundle_items(bundle_id,obligation_id,title_snapshot,amount_cents,currency,due_at)
      SELECT ?,o.id,o.title_snapshot,o.amount_cents,o.currency,o.due_at
      FROM school_payment_obligations o WHERE o.checkout_bundle_id=? AND o.checkout_lock_token=?`)
      .bind(token, token, token),
  ]);
  if (!result[0].meta.changes) return null;
  if (result[1].meta.changes !== selected.length || result[2].meta.changes !== selected.length) {
    throw new Error(`El paquete escolar ${token} no pudo bloquear todos sus cargos.`);
  }
  return { id: leader.id, student_email: email, currency: anchor.currency, amount_cents: total, items: selected };
}

export async function linkPaymentBundle(db: D1Database, token: string, leaderId: string, sessionId: string): Promise<void> {
  const result = await db.batch([
    db.prepare(`UPDATE school_payment_bundles SET checkout_session_id=?
      WHERE id=? AND leader_obligation_id=? AND status='pending' AND checkout_session_id IS NULL`)
      .bind(sessionId, token, leaderId),
    db.prepare(`UPDATE school_payment_obligations SET checkout_session_id=?
      WHERE id=? AND checkout_bundle_id=? AND checkout_lock_token=? AND status='pending'
        AND EXISTS (SELECT 1 FROM school_payment_bundles WHERE id=? AND checkout_session_id=? AND status='pending')`)
      .bind(sessionId, leaderId, token, token, token, sessionId),
  ]);
  if (!result[0].meta.changes || !result[1].meta.changes) throw new Error('No se pudo vincular la sesión de pago agrupado.');
}

export async function releasePaymentBundle(db: D1Database, token: string, status: 'failed' | 'expired', sessionId: string | null): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE school_payment_bundles SET status=?
      WHERE id=? AND status='pending' AND checkout_session_id IS ?`).bind(status, token, sessionId),
    db.prepare(`UPDATE school_payment_obligations SET checkout_bundle_id=NULL,checkout_lock_token=NULL,
      checkout_locked_at=NULL,checkout_session_id=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE checkout_bundle_id=? AND status='pending'
        AND EXISTS (SELECT 1 FROM school_payment_bundles WHERE id=? AND status=?)`).bind(token, token, status),
  ]);
}

export async function releaseExpiredPaymentBundle(db: D1Database, leaderId: string, sessionId: string): Promise<boolean> {
  const bundle = await db.prepare(`SELECT id FROM school_payment_bundles
    WHERE leader_obligation_id=? AND checkout_session_id=? AND status='pending'`)
    .bind(leaderId, sessionId).first<{ id: string }>();
  if (!bundle) return false;
  await releasePaymentBundle(db, bundle.id, 'expired', sessionId);
  return true;
}

export async function settlePaymentBundle(
  db: D1Database, paidOrder: NonNullable<WebhookResult['order']>, orderId: number, paymentMethod: string,
): Promise<boolean> {
  const leader = paidOrder.schoolPaymentObligationId;
  if (!leader) return false;
  const bundle = await db.prepare(`SELECT id,enrollment_id,status,order_id FROM school_payment_bundles
    WHERE leader_obligation_id=? AND checkout_session_id=? ORDER BY created_at DESC LIMIT 1`)
    .bind(leader, paidOrder.providerSessionId).first<{ id: string; enrollment_id: string; status: string; order_id: number | null }>();
  if (!bundle) return false;
  if (bundle.status === 'paid' && bundle.order_id === orderId) {
    await reactivateOverdueEnrollment(db, bundle.enrollment_id);
    return true;
  }
  const paidAt = new Date();
  const items = (await db.prepare(`SELECT o.id,o.modality_validity_count,o.modality_validity_unit
    FROM school_payment_bundle_items bi JOIN school_payment_obligations o ON o.id=bi.obligation_id
    WHERE bi.bundle_id=?`).bind(bundle.id).all<{id:string;modality_validity_count:number|null;modality_validity_unit:string|null}>()).results;
  const updates = items.map(item => db.prepare(`UPDATE school_payment_obligations
    SET status='paid',order_id=CASE WHEN id=? THEN ? ELSE NULL END,bundle_order_id=?,paid_at=?,
      modality_valid_until=COALESCE(modality_valid_until,?),checkout_lock_token=NULL,checkout_locked_at=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND checkout_bundle_id=? AND status='pending'
      AND EXISTS (SELECT 1 FROM school_payment_bundles WHERE id=? AND status='paid' AND order_id=?)`)
    .bind(leader, orderId, orderId, paidAt.toISOString(),
      validityEnd(paidAt, item.modality_validity_count, item.modality_validity_unit), item.id, bundle.id, bundle.id, orderId));
  const result = await db.batch([
    db.prepare(`UPDATE school_payment_bundles SET status='paid',order_id=?
      WHERE id=? AND status='pending' AND checkout_session_id=? AND amount_cents=? AND lower(currency)=lower(?)
        AND (student_email=? COLLATE NOCASE OR EXISTS (SELECT 1 FROM customer_email_aliases a
          WHERE a.old_email=? COLLATE NOCASE AND a.current_email=school_payment_bundles.student_email COLLATE NOCASE))
        AND item_count=(SELECT count(*) FROM school_payment_bundle_items WHERE bundle_id=school_payment_bundles.id)
        AND amount_cents=(SELECT sum(amount_cents) FROM school_payment_bundle_items WHERE bundle_id=school_payment_bundles.id)
        AND NOT EXISTS (SELECT 1 FROM school_payment_bundle_items bi
          LEFT JOIN school_payment_obligations o ON o.id=bi.obligation_id
          WHERE bi.bundle_id=school_payment_bundles.id AND (o.id IS NULL OR o.status<>'pending'
            OR o.checkout_bundle_id IS NOT school_payment_bundles.id OR o.checkout_lock_token IS NOT school_payment_bundles.id
            OR o.amount_cents<>bi.amount_cents OR lower(o.currency)<>lower(bi.currency)
            OR lower(bi.currency)<>lower(school_payment_bundles.currency)))`)
      .bind(orderId, bundle.id, paidOrder.providerSessionId, paidOrder.amountTotalCents, paidOrder.currency, paidOrder.email ?? '', paidOrder.email ?? ''),
    ...updates,
    db.prepare(`UPDATE orders SET email=(SELECT student_email FROM school_payment_bundles WHERE id=?)
      WHERE id=? AND EXISTS (SELECT 1 FROM school_payment_bundles WHERE id=? AND status='paid' AND order_id=?)`)
      .bind(bundle.id, orderId, bundle.id, orderId),
    db.prepare(`INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT 'subprogram-payment-' || leader_obligation_id,student_email,'Pago confirmado',?,?,'/account/payments'
      FROM school_payment_bundles WHERE id=? AND status='paid' AND order_id=? ON CONFLICT(id) DO NOTHING`)
      .bind(paymentMethod === 'demo' ? 'Tu pago agrupado fue confirmado (simulación demo).' : 'Tu pago agrupado fue confirmado.',
        paymentMethod === 'demo' ? 'Tu pago agrupado fue confirmado (simulación demo).' : 'Tu pago agrupado fue confirmado.',
        bundle.id, orderId),
  ]);
  if (!result[0].meta.changes || updates.some((_, index) => !result[index + 1].meta.changes)) {
    throw new Error(`El pago agrupado ${bundle.id} no coincide con el pedido ${orderId}; requiere conciliación manual.`);
  }
  await reactivateOverdueEnrollment(db, bundle.enrollment_id, paidAt);
  return true;
}
