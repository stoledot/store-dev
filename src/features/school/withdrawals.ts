import type { D1Database } from '@cloudflare/workers-types';
import { addSchoolDays, schoolToday } from './paymentPeriods.ts';

export function suspensionDate(dueDate: string, days: number): string {
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) throw new Error('Plazo de baja temporal inválido.');
  return addSchoolDays(dueDate, Math.max(1, days));
}

export async function reconcileOverdueSuspensions(db: D1Database, now = new Date()): Promise<void> {
  const today = schoolToday(now);
  const timestamp = now.toISOString();
  let cursor = '';
  for (;;) {
    const rows = (await db.prepare(`
      SELECT e.id,p.suspension_after_days,MIN(substr(o.due_at,1,10)) AS due_date
        FROM school_subprogram_enrollments e
        JOIN school_subprograms p ON p.id=e.subprogram_id
        JOIN school_subprogram_payment_schedules s ON s.enrollment_id=e.id AND s.status='active'
        JOIN school_payment_obligations o ON o.subprogram_schedule_id=s.id
       WHERE e.id>? AND e.status='active' AND p.suspension_after_days IS NOT NULL
         AND o.status='pending' AND o.modality_payment_type='classes' AND substr(o.due_at,1,10)<?
       GROUP BY e.id,p.suspension_after_days ORDER BY e.id LIMIT 100
    `).bind(cursor, today).all<{ id: string; suspension_after_days: number; due_date: string }>()).results;
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id;
      try {
        if (today < suspensionDate(row.due_date, row.suspension_after_days)) continue;
        const token = crypto.randomUUID();
        await db.batch([
          db.prepare(`UPDATE school_subprogram_enrollments SET status='suspended',suspension_reason='overdue',
            suspended_at=?,suspension_token=? WHERE id=? AND status='active'
              AND EXISTS (SELECT 1 FROM school_subprograms p WHERE p.id=school_subprogram_enrollments.subprogram_id
                AND p.suspension_after_days=?)
              AND EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s
                JOIN school_payment_obligations o ON o.subprogram_schedule_id=s.id
                WHERE s.enrollment_id=school_subprogram_enrollments.id AND s.status='active'
                  AND o.status='pending' AND o.modality_payment_type='classes' AND substr(o.due_at,1,10)=?)`)
            .bind(timestamp, token, row.id, row.suspension_after_days, row.due_date),
          db.prepare(`INSERT INTO school_notifications(id,student_email,title,body,message,href)
            SELECT ?,c.email,'Baja temporal',
              'Tu inscripción está en baja temporal por atraso. Paga tus adeudos para reactivarla.',
              'Tu inscripción está en baja temporal por atraso. Paga tus adeudos para reactivarla.','/account/payments'
              FROM school_subprogram_enrollments e JOIN customer_accounts c ON c.client_number=e.client_number
             WHERE e.id=? AND e.status='suspended' AND e.suspension_token=?
            ON CONFLICT(id) DO NOTHING`).bind(`school-suspended-${token}`, row.id, token),
        ]);
      } catch (error) {
        console.error(`No se pudo evaluar la baja temporal de ${row.id}:`, error);
      }
    }
    if (rows.length < 100) break;
  }
}

export async function reactivateOverdueEnrollment(db: D1Database, enrollmentId: string, now = new Date()): Promise<void> {
  const enrollment = await db.prepare(`SELECT suspension_token FROM school_subprogram_enrollments
    WHERE id=? AND status='suspended' AND suspension_reason='overdue'`)
    .bind(enrollmentId).first<{ suspension_token: string | null }>();
  if (!enrollment?.suspension_token) return;
  const token = enrollment.suspension_token;
  const timestamp = now.toISOString();
  const today = schoolToday(now);
  await db.batch([
    db.prepare(`UPDATE school_subprogram_enrollments SET status='active',suspension_reason=NULL,suspended_at=NULL
      WHERE id=? AND status='suspended' AND suspension_reason='overdue' AND suspension_token=?
        AND NOT EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s
          JOIN school_payment_obligations o ON o.subprogram_schedule_id=s.id
          WHERE s.enrollment_id=school_subprogram_enrollments.id AND s.status='active' AND o.status='pending'
            AND ((o.overdue_from IS NOT NULL AND datetime(o.overdue_from)<=datetime(?))
              OR (o.overdue_from IS NULL AND date(o.due_at)<date(?))))`)
      .bind(enrollmentId, token, timestamp, today),
    db.prepare(`INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT ?,c.email,'Inscripción reactivada',
        'Tus pagos vencidos se regularizaron. Tu inscripción fue reactivada.',
        'Tus pagos vencidos se regularizaron. Tu inscripción fue reactivada.','/account/payments'
        FROM school_subprogram_enrollments e JOIN customer_accounts c ON c.client_number=e.client_number
       WHERE e.id=? AND e.status='active' AND e.suspension_token=?
      ON CONFLICT(id) DO NOTHING`).bind(`school-reactivated-${token}`, enrollmentId, token),
  ]);
}

export async function reconcileOverdueReactivations(db: D1Database, now = new Date()): Promise<void> {
  let cursor = '';
  for (;;) {
    const rows = (await db.prepare(`SELECT id FROM school_subprogram_enrollments
      WHERE id>? AND status='suspended' AND suspension_reason='overdue' ORDER BY id LIMIT 100`)
      .bind(cursor).all<{ id: string }>()).results;
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id;
      try {
        await reactivateOverdueEnrollment(db, row.id, now);
      } catch (error) {
        console.error(`No se pudo evaluar la reactivación de ${row.id}:`, error);
      }
    }
    if (rows.length < 100) break;
  }
}

export async function withdrawEnrollment(db: D1Database, enrollmentId: string, now = new Date()): Promise<void> {
  if (!enrollmentId) throw new Error('Selecciona una inscripción.');
  const token = crypto.randomUUID();
  const timestamp = now.toISOString();
  const results = await db.batch([
    db.prepare(`UPDATE school_subprogram_enrollments SET status='withdrawn',withdrawn_at=?,withdrawal_token=?
      WHERE id=? AND status='suspended' AND suspension_reason='overdue'
        AND NOT EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s
          JOIN school_payment_obligations o ON o.subprogram_schedule_id=s.id
          WHERE s.enrollment_id=school_subprogram_enrollments.id AND o.status='pending'
            AND ((o.checkout_bundle_id IS NOT NULL AND EXISTS (SELECT 1 FROM school_payment_bundles b
              WHERE b.id=o.checkout_bundle_id AND b.status='pending'
                AND (b.checkout_session_id IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM pending_payments p WHERE p.payment_hash=b.checkout_session_id
                    AND p.backend='demo' AND p.status='pending' AND datetime(p.expires_at)<=datetime(?))
                  OR b.checkout_session_id IS NULL AND (datetime(o.checkout_locked_at) IS NULL
                    OR datetime(o.checkout_locked_at)>datetime(?,'-25 hours')))))
              OR (o.checkout_session_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM pending_payments p WHERE p.payment_hash=o.checkout_session_id
                AND p.backend='demo' AND p.status='pending' AND datetime(p.expires_at)<=datetime(?)))
              OR (o.checkout_lock_token IS NOT NULL AND o.checkout_session_id IS NULL
                AND (datetime(o.checkout_locked_at) IS NULL
                  OR datetime(o.checkout_locked_at)>datetime(?,'-25 hours'))
                AND (o.checkout_bundle_id IS NULL OR NOT EXISTS (
                  SELECT 1 FROM school_payment_bundles b JOIN pending_payments p ON p.payment_hash=b.checkout_session_id
                   WHERE b.id=o.checkout_bundle_id AND p.backend='demo' AND p.status='pending'
                     AND datetime(p.expires_at)<=datetime(?))))))`)
      .bind(timestamp, token, enrollmentId, timestamp, timestamp, timestamp, timestamp, timestamp),
    db.prepare(`UPDATE school_subprogram_diagnostics SET closed_at=?
      WHERE id=(SELECT diagnostic_id FROM school_subprogram_enrollments WHERE id=? AND withdrawal_token=?)`)
      .bind(timestamp, enrollmentId, token),
    db.prepare(`DELETE FROM school_subprogram_group_members
      WHERE enrollment_id=? AND EXISTS (SELECT 1 FROM school_subprogram_enrollments
        WHERE id=? AND status='withdrawn' AND withdrawal_token=?)`).bind(enrollmentId, enrollmentId, token),
    db.prepare(`UPDATE school_payment_obligations SET status='cancelled',checkout_lock_token=NULL,
      checkout_locked_at=NULL,updated_at=?
      WHERE status='pending' AND subprogram_schedule_id IN
        (SELECT id FROM school_subprogram_payment_schedules WHERE enrollment_id=?)
        AND EXISTS (SELECT 1 FROM school_subprogram_enrollments WHERE id=? AND withdrawal_token=?)`)
      .bind(timestamp, enrollmentId, enrollmentId, token),
    db.prepare(`UPDATE school_subprogram_payment_schedules SET status='inactive'
      WHERE enrollment_id=? AND EXISTS (SELECT 1 FROM school_subprogram_enrollments WHERE id=? AND withdrawal_token=?)`)
      .bind(enrollmentId, enrollmentId, token),
    db.prepare(`INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT ?,c.email,'Baja definitiva',
        'Para reincorporarte debes realizar un nuevo diagnóstico y pagar nuevamente la inscripción y las clases.',
        'Para reincorporarte debes realizar un nuevo diagnóstico y pagar nuevamente la inscripción y las clases.',
        '/subprogramas/' || e.subprogram_id || '#diagnostico'
        FROM school_subprogram_enrollments e JOIN customer_accounts c ON c.client_number=e.client_number
       WHERE e.id=? AND e.withdrawal_token=? ON CONFLICT(id) DO NOTHING`)
      .bind(`school-withdrawn-${token}`, enrollmentId, token),
  ]);
  if (!results[0].meta.changes) {
    throw new Error('No se pudo dar la baja: verifica que sea temporal por atraso y espera a que terminen los pagos en curso.');
  }
}
