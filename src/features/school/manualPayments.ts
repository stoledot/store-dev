import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { toMajorUnits, toMinorUnits } from '../../money.ts';
import { reactivateOverdueEnrollment } from './withdrawals.ts';

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function assignManualPayment(db: D1Database, email: string, form: FormData, clientNumber?: string): Promise<void> {
  const productId = String(form.get('product_id') ?? '').trim();
  const due = String(form.get('due_at') ?? '').trim();
  const available = String(form.get('available_at') ?? '').trim();
  const amountText = String(form.get('amount') ?? '').trim();
  const note = String(form.get('notes') ?? '').trim();
  const groupId = String(form.get('group_id') ?? '').trim() || null;
  if (groupId && !clientNumber) throw new Error('No se encontró la cuenta del alumno.');
  if (!productId || !validDate(due) || (available && (!validDate(available) || available > due)) || note.length > 500) {
    throw new Error('Revisa el concepto, las fechas y la nota del pago.');
  }
  const product = await db.prepare(`SELECT id,title,description,amount_cents,currency,fee_type,validity_months,billing_revision
    FROM school_payment_products WHERE id=? AND active=1`).bind(productId)
    .first<{id:string;title:string;description:string;amount_cents:number;currency:string;fee_type:string;validity_months:number;billing_revision:number}>();
  if (!product) throw new Error('El concepto de pago no existe o está inactivo.');
  const major = amountText ? Number(amountText) : toMajorUnits(product.amount_cents, product.currency);
  if (!Number.isFinite(major) || major <= 0 || major > 10000000) throw new Error('El importe debe ser mayor que cero.');
  const amount = toMinorUnits(major, product.currency);
  if (!Number.isSafeInteger(amount) || amount <= 0 || toMajorUnits(amount, product.currency) !== major) {
    throw new Error('El importe no corresponde a las unidades de la moneda.');
  }
  const id = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO school_payment_obligations(id,payment_product_id,student_email,title_snapshot,description_snapshot,
      amount_cents,currency,fee_type,validity_months,due_at,available_at,notes,group_access_only)
      SELECT ?,p.id,?,p.title,p.description,?,p.currency,p.fee_type,p.validity_months,?,?,?,?
      FROM school_payment_products p WHERE p.id=? AND p.active=1 AND p.billing_revision=?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM school_subprogram_groups g
          JOIN customer_accounts account ON account.client_number=? AND account.email=? COLLATE NOCASE
          WHERE g.id=? AND g.status='active'
            AND NOT EXISTS (SELECT 1 FROM school_manual_access_payment link JOIN school_payment_obligations existing ON existing.id=link.obligation_id
              WHERE link.client_number=account.client_number AND link.resource_type='group'
                AND link.resource_id=g.id AND existing.status='pending')))`)
      .bind(id, email, amount, due, available || null, note, groupId ? 1 : 0, productId, product.billing_revision,
        groupId, clientNumber ?? null, email, groupId),
    db.prepare(`INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT ?,student_email,'Tienes un pago escolar asignado',title_snapshot || ' · vence ' || due_at,
        title_snapshot || ' · vence ' || due_at,'/account/payments'
      FROM school_payment_obligations WHERE id=?`).bind(crypto.randomUUID(), id),
  ];
  if (groupId && clientNumber) {
    statements.push(
      db.prepare(`INSERT INTO school_manual_access(client_number,resource_type,resource_id,decision,expires_at)
        SELECT ?,'group',?,'allow',NULL WHERE EXISTS (SELECT 1 FROM school_payment_obligations WHERE id=?)
        ON CONFLICT(client_number,resource_type,resource_id) DO UPDATE SET decision='allow',expires_at=NULL,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(clientNumber, groupId, id),
      db.prepare(`INSERT INTO school_manual_access_payment(client_number,resource_type,resource_id,obligation_id)
        SELECT ?,'group',?,? WHERE EXISTS (SELECT 1 FROM school_payment_obligations WHERE id=?)
        ON CONFLICT(client_number,resource_type,resource_id) DO UPDATE SET obligation_id=excluded.obligation_id`)
        .bind(clientNumber, groupId, id, id),
    );
  }
  const results = await db.batch(statements);
  if (!results[0].meta.changes) throw new Error('El concepto o el grupo cambió, o el grupo ya tiene un pago pendiente vinculado.');
}

export async function cancelManualPayment(db: D1Database, email: string, id: string): Promise<void> {
  const cancelled = await db.prepare(`UPDATE school_payment_obligations SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND student_email=? COLLATE NOCASE AND status='pending' AND checkout_lock_token IS NULL
      AND checkout_session_id IS NULL AND checkout_bundle_id IS NULL
    RETURNING subprogram_schedule_id`).bind(id, email).first<{subprogram_schedule_id:string|null}>();
  if (!cancelled) throw new Error('El pago no está pendiente o tiene un checkout en curso.');
  if (cancelled.subprogram_schedule_id) {
    const schedule = await db.prepare('SELECT enrollment_id FROM school_subprogram_payment_schedules WHERE id=?')
      .bind(cancelled.subprogram_schedule_id).first<{enrollment_id:string}>();
    if (!schedule) throw new Error('No se encontró la inscripción del pago cancelado.');
    await reactivateOverdueEnrollment(db, schedule.enrollment_id);
  }
}
