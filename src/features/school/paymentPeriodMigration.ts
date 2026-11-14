import type { D1Database } from '@cloudflare/workers-types';
import { addSchoolDays, schoolToday } from './paymentPeriods.ts';

export async function migrateLegacyPaymentPeriods(db: D1Database, now = new Date()): Promise<void> {
  const today = schoolToday(now);
  const start = `${today.slice(0, 7)}-01`;
  const endDate = new Date(`${start}T00:00:00.000Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = addSchoolDays(endDate.toISOString().slice(0, 10), -1);
  const modalities = (await db.prepare('SELECT id FROM school_payment_modalities WHERE period_start_on IS NULL')
    .all<{ id: string }>()).results;
  for (const modality of modalities) {
    const token = crypto.randomUUID();
    const results = await db.batch([
      db.prepare(`UPDATE school_payment_modalities SET period_start_on=?,period_end_on=?,frequency_unit='month',
        frequency_count=1,proration_method='days',period_migration_token=?,billing_revision=billing_revision+1
        WHERE id=? AND period_start_on IS NULL`).bind(start, end, token, modality.id),
      db.prepare(`UPDATE school_payment_obligations SET status='cancelled',updated_at=?
        WHERE status='pending' AND due_at>? AND checkout_lock_token IS NULL AND checkout_session_id IS NULL AND subprogram_schedule_id IN
          (SELECT id FROM school_subprogram_payment_schedules WHERE modality_id=?)
        AND EXISTS (SELECT 1 FROM school_payment_modalities WHERE id=? AND period_migration_token=?)`)
        .bind(now.toISOString(), today, modality.id, modality.id, token),
      db.prepare(`UPDATE school_subprogram_payment_schedules SET anchor_on=?,frequency_unit='month',
        frequency_count=1,revision=revision+1,skip_anchor=0,next_check_at=?,
        calendar_revision=(SELECT billing_revision FROM school_payment_modalities WHERE id=?)
        WHERE modality_id=? AND EXISTS (SELECT 1 FROM school_payment_modalities WHERE id=? AND period_migration_token=?)`)
        .bind(start, now.toISOString(), modality.id, modality.id, modality.id, token),
    ]);
    if (results[0].meta.changes && results[1].meta.changes) {
      console.warn(`Se cancelaron ${results[1].meta.changes} cobros futuros de prueba de la modalidad ${modality.id}.`);
    }
  }
}
