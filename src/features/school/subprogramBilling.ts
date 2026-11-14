import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { type FrequencyUnit } from './scheduleDates.ts';
import { calendarPeriods, hasScheduledClasses, proratedAmount, schoolMidnight, schoolToday, type CalendarPolicy, type PaymentPeriod } from './paymentPeriods.ts';
import { migrateLegacyPaymentPeriods } from './paymentPeriodMigration.ts';
import { scholarshipAmount } from './scholarships.ts';

type Modality = {
  id: string;
  subprogram_id: string;
  payment_type: 'enrollment' | 'classes' | 'other';
  frequency_unit: FrequencyUnit;
  frequency_count: number;
  requires_current_enrollment: number;
  status: string;
  product_active: number;
  fee_type: 'enrollment' | 'monthly' | 'other';
  modality_revision: number;
  product_revision: number;
  amount_cents: number;
  period_start_on: string;
  period_end_on: string;
  advance_days: number;
  proration_method: 'days' | 'classes';
  class_weekdays: string;
  class_dates_added: string;
  class_dates_excluded: string;
};

function policyFor(modality: Pick<Modality, 'period_start_on' | 'period_end_on' | 'frequency_unit' | 'frequency_count'
  | 'advance_days' | 'proration_method' | 'class_weekdays' | 'class_dates_added' | 'class_dates_excluded'>): CalendarPolicy {
  const weekdays: unknown = JSON.parse(modality.class_weekdays);
  const added: unknown = JSON.parse(modality.class_dates_added);
  const excluded: unknown = JSON.parse(modality.class_dates_excluded);
  if (!Array.isArray(weekdays) || !weekdays.every((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    || !Array.isArray(added) || !added.every((value) => typeof value === 'string')
    || !Array.isArray(excluded) || !excluded.every((value) => typeof value === 'string')
    || !['days', 'classes'].includes(modality.proration_method)) {
    throw new Error('El calendario de clases de la modalidad no es válido.');
  }
  return { ...modality, class_weekdays: weekdays, class_dates_added: added, class_dates_excluded: excluded };
}

async function activeModality(db: D1Database, id: string, subprogramId: string): Promise<Modality | null> {
  return db.prepare(`
    SELECT m.id,m.subprogram_id,m.payment_type,m.frequency_unit,m.frequency_count,
           m.requires_current_enrollment,m.status,p.active AS product_active,p.fee_type,
           m.billing_revision AS modality_revision,p.billing_revision AS product_revision,p.amount_cents,
           m.period_start_on,m.period_end_on,m.advance_days,m.proration_method,
           m.class_weekdays,m.class_dates_added,m.class_dates_excluded
      FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
     WHERE m.id=? AND m.subprogram_id=? AND m.status='active' AND p.active=1
  `).bind(id, subprogramId).first<Modality>();
}

function chargeStatement(
  db: D1Database,
  scheduleId: string,
  revision: number,
  period: PaymentPeriod,
  amount: number,
  feeType: Modality['fee_type'],
  modalityRevision: number,
  productRevision: number,
  scholarshipPercent: number,
  appliedPercent: number,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO school_payment_obligations
      (id,payment_product_id,student_email,title_snapshot,description_snapshot,amount_cents,currency,
       fee_type,validity_months,due_at,available_at,subprogram_schedule_id,schedule_revision,
       modality_payment_type,modality_validity_count,modality_validity_unit,requires_current_enrollment,
       period_start_on,period_end_on,modality_valid_from,modality_valid_until,available_from,overdue_from,scholarship_percent_snapshot)
    SELECT ?,p.id,c.email,p.title,p.description,?,p.currency,
           ?,p.validity_months,?,?,s.id,s.revision,m.payment_type,m.validity_count,m.validity_unit,m.requires_current_enrollment,
           ?,?,?,?,?,?,?
      FROM school_subprogram_payment_schedules s
      JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
      JOIN customer_accounts c ON c.client_number=e.client_number
      JOIN school_payment_modalities m ON m.id=s.modality_id
      JOIN school_payment_products p ON p.id=m.payment_product_id
     WHERE s.id=? AND s.revision=? AND s.status='active'
       AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
       AND m.status='active' AND p.active=1
       AND e.scholarship_percent=?
       AND m.billing_revision=? AND p.billing_revision=?
       AND NOT EXISTS (SELECT 1 FROM school_payment_obligations old
         WHERE old.subprogram_schedule_id=s.id AND old.status<>'cancelled' AND old.due_at=?)
       AND NOT EXISTS (SELECT 1 FROM school_subprogram_scholarship_periods free
         WHERE free.schedule_id=s.id AND free.period_start_on=? AND free.status='active')
    ON CONFLICT(subprogram_schedule_id,schedule_revision,due_at) DO NOTHING
  `).bind(crypto.randomUUID(), amount, feeType,
    period.start, period.available, period.start, period.end, period.validFrom, period.validUntil,
    schoolMidnight(period.available), period.overdueFrom, appliedPercent,
    scheduleId, revision, scholarshipPercent, modalityRevision, productRevision, period.start, period.start);
}

function scholarshipPeriodStatement(db: D1Database, scheduleId: string, revision: number, period: PaymentPeriod,
  modalityRevision: number, productRevision: number): D1PreparedStatement {
  return db.prepare(`INSERT INTO school_subprogram_scholarship_periods
      (schedule_id,revision,period_start_on,period_end_on,valid_from,valid_until)
    SELECT s.id,s.revision,?,?,?,? FROM school_subprogram_payment_schedules s
      JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
      JOIN school_payment_modalities m ON m.id=s.modality_id
      JOIN school_payment_products p ON p.id=m.payment_product_id
    WHERE s.id=? AND s.revision=? AND s.status='active'
      AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
      AND e.scholarship_percent=100 AND m.payment_type='classes'
      AND m.status='active' AND p.active=1 AND m.billing_revision=? AND p.billing_revision=?
      AND NOT EXISTS (SELECT 1 FROM school_payment_obligations old
        WHERE old.subprogram_schedule_id=s.id AND old.status<>'cancelled' AND old.due_at=?)
      AND NOT EXISTS (SELECT 1 FROM school_subprogram_scholarship_periods old
        WHERE old.schedule_id=s.id AND old.period_start_on=? AND old.status='active')
    ON CONFLICT(schedule_id,revision,period_start_on) DO NOTHING`)
    .bind(period.start, period.end, period.validFrom, period.validUntil, scheduleId, revision,
      modalityRevision, productRevision, period.start, period.start);
}

export async function reviewSubprogramDiagnostic(
  db: D1Database,
  diagnosticId: string,
  decision: 'approved' | 'rejected',
  modalityId: string,
  notes: string,
  now = new Date(),
  entryPeriod: 'current' | 'next' = 'current',
): Promise<void> {
  if (notes.length > 2000) throw new Error('La nota es demasiado larga.');
  const diagnostic = await db.prepare(`
    SELECT d.id,d.client_number,d.subprogram_id,d.status,c.email,s.title,s.enrollment_modality_id
      FROM school_subprogram_diagnostics d
      JOIN customer_accounts c ON c.client_number=d.client_number
      JOIN school_subprograms s ON s.id=d.subprogram_id
     WHERE d.id=?
  `).bind(diagnosticId).first<{
    id: string; client_number: string; subprogram_id: string; status: string;
    email: string; title: string; enrollment_modality_id: string | null;
  }>();
  if (!diagnostic || diagnostic.status !== 'pending') throw new Error('El diagnóstico ya no está pendiente.');
  const token = crypto.randomUUID();
  const timestamp = now.toISOString();
  if (decision === 'rejected') {
    const result = await db.batch([
      db.prepare(`UPDATE school_subprogram_diagnostics SET status='rejected',admin_notes=?,reviewed_at=?,approval_token=? WHERE id=? AND status='pending'`)
        .bind(notes, timestamp, token, diagnosticId),
      db.prepare(`
        INSERT INTO school_notifications(id,student_email,title,body,message,href)
        SELECT ?,c.email,'Diagnóstico revisado',?,?,?
          FROM school_subprogram_diagnostics d JOIN customer_accounts c ON c.client_number=d.client_number
         WHERE d.id=? AND d.approval_token=? AND d.status='rejected'
      `).bind(crypto.randomUUID(), `El diagnóstico de ${diagnostic.title} requiere seguimiento.`, `El diagnóstico de ${diagnostic.title} requiere seguimiento.`, `/subprogramas/${diagnostic.subprogram_id}`, diagnosticId, token),
    ]);
    if (!result[0].meta.changes) throw new Error('El diagnóstico ya no está pendiente.');
    return;
  }
  if (!['current', 'next'].includes(entryPeriod)) throw new Error('Selecciona el período de ingreso.');
  await migrateLegacyPaymentPeriods(db, now);
  const previousWithdrawal = await db.prepare(`SELECT id FROM school_subprogram_enrollments
    WHERE client_number=? AND subprogram_id=? AND status='withdrawn' LIMIT 1`)
    .bind(diagnostic.client_number, diagnostic.subprogram_id).first<{ id: string }>();
  if (previousWithdrawal && !diagnostic.enrollment_modality_id) {
    throw new Error('Para el reingreso, configura primero una modalidad de inscripción activa.');
  }
  const selected = await activeModality(db, modalityId, diagnostic.subprogram_id);
  if (!selected || selected.payment_type === 'enrollment') throw new Error('Selecciona una modalidad de pago activa del subprograma.');
  let enrollment: Modality | null = null;
  if (diagnostic.enrollment_modality_id) {
    enrollment = await activeModality(db, diagnostic.enrollment_modality_id, diagnostic.subprogram_id);
    if (!enrollment || enrollment.payment_type !== 'enrollment') throw new Error('La modalidad de inscripción obligatoria no está disponible.');
  }
  if (selected.requires_current_enrollment && !enrollment) throw new Error('La modalidad requiere inscripción, pero el subprograma no tiene una modalidad de inscripción configurada.');
  const enrollmentId = crypto.randomUUID();
  const today = schoolToday(now);
  const plans = [selected, ...(enrollment ? [enrollment] : [])].map((modality) => {
    const policy = policyFor(modality);
    const allPeriods = calendarPeriods(policy, today);
    const first = entryPeriod === 'current'
      ? allPeriods.find((period) => period.start <= today && period.end >= today)
      : allPeriods.find((period) => period.start > today);
    if (!first) throw new Error('No hay un período de pago disponible para la opción de ingreso seleccionada.');
    const firstAmount = proratedAmount(modality.amount_cents, first, first.start <= today ? today : first.start, policy);
    return {
      modality, id: crypto.randomUUID(), first,
      periods: allPeriods.filter((period) => period.start >= first.start
        && (policy.proration_method !== 'classes' || hasScheduledClasses(period, policy))),
      firstAmount,
    };
  });
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      UPDATE school_subprogram_diagnostics SET status='approved',admin_notes=?,reviewed_at=?,approval_token=?
       WHERE id=? AND status='pending'
         AND EXISTS (SELECT 1 FROM school_subprograms s JOIN school_programs p ON p.slug=s.program_slug
                      WHERE s.id=school_subprogram_diagnostics.subprogram_id AND s.status='active' AND p.status='active'
                        AND s.enrollment_modality_id IS ?)
         AND EXISTS (SELECT 1 FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
                      WHERE m.id=? AND m.subprogram_id=school_subprogram_diagnostics.subprogram_id AND m.status='active' AND p.active=1
                        AND m.frequency_unit=? AND m.frequency_count=? AND m.requires_current_enrollment=?
                        AND m.billing_revision=? AND p.billing_revision=?)
         AND (? IS NULL OR EXISTS (SELECT 1 FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
                      WHERE m.id=? AND m.subprogram_id=school_subprogram_diagnostics.subprogram_id AND m.status='active' AND p.active=1
                        AND m.payment_type='enrollment' AND m.frequency_unit=? AND m.frequency_count=?
                        AND m.billing_revision=? AND p.billing_revision=?))
    `).bind(notes, timestamp, token, diagnosticId, diagnostic.enrollment_modality_id, modalityId,
      selected.frequency_unit, selected.frequency_count, selected.requires_current_enrollment, selected.modality_revision, selected.product_revision,
      enrollment?.id ?? null, enrollment?.id ?? null, enrollment?.frequency_unit ?? null, enrollment?.frequency_count ?? null,
      enrollment?.modality_revision ?? null, enrollment?.product_revision ?? null),
    db.prepare(`
      INSERT INTO school_subprogram_enrollments(id,client_number,subprogram_id,diagnostic_id,modality_id,starts_on,reenrollment_required)
      SELECT ?,client_number,subprogram_id,id,?,?,? FROM school_subprogram_diagnostics
       WHERE id=? AND status='approved' AND approval_token=?
    `).bind(enrollmentId, modalityId, plans[0].first.start > today ? plans[0].first.start : today,
      previousWithdrawal ? 1 : 0, diagnosticId, token),
  ];
  for (const plan of plans) {
    statements.push(db.prepare(`
      INSERT INTO school_subprogram_payment_schedules(id,enrollment_id,modality_id,anchor_on,frequency_unit,frequency_count,next_check_at,calendar_revision)
      SELECT ?,id,?,?,?,?,?,? FROM school_subprogram_enrollments WHERE id=?
    `).bind(plan.id, plan.modality.id, plan.first.start, plan.modality.frequency_unit, plan.modality.frequency_count,
      timestamp, plan.modality.modality_revision, enrollmentId));
    for (const period of plan.periods) statements.push(chargeStatement(db, plan.id, 1, period,
      period.start === plan.first.start ? plan.firstAmount : plan.modality.amount_cents,
      plan.modality.payment_type === 'enrollment' ? 'enrollment' : plan.modality.fee_type,
      plan.modality.modality_revision, plan.modality.product_revision, 0, 0));
  }
  statements.push(
    db.prepare(`
      INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT ?,?, 'Diagnóstico aprobado',?,?, '/account/payments'
       WHERE EXISTS (SELECT 1 FROM school_subprogram_enrollments WHERE id=?)
    `).bind(crypto.randomUUID(), diagnostic.email, `Tu diagnóstico de ${diagnostic.title} fue aprobado. Tienes pagos asignados.`, `Tu diagnóstico de ${diagnostic.title} fue aprobado. Tienes pagos asignados.`, enrollmentId),
    db.prepare(`
      INSERT INTO school_subprogram_approval_emails(diagnostic_id)
      SELECT ? WHERE EXISTS (SELECT 1 FROM school_subprogram_enrollments WHERE id=?)
    `).bind(diagnosticId, enrollmentId),
  );
  const results = await db.batch(statements);
  if (!results[0].meta.changes) throw new Error('El diagnóstico o la configuración cambiaron. Vuelve a intentarlo.');
}

type ScheduleRow = {
  id: string;
  enrollment_id: string;
  modality_id: string;
  anchor_on: string;
  frequency_unit: FrequencyUnit;
  frequency_count: number;
  revision: number;
  skip_anchor: number;
  current_unit: FrequencyUnit;
  current_count: number;
  payment_type: Modality['payment_type'];
  fee_type: Modality['fee_type'];
  title: string;
  product_id: string;
  description: string;
  amount_cents: number;
  currency: string;
  validity_months: number;
  validity_count: number | null;
  validity_unit: string | null;
  requires_current_enrollment: number;
  modality_revision: number;
  product_revision: number;
  calendar_revision: number;
  period_start_on: string;
  period_end_on: string;
  advance_days: number;
  proration_method: 'days' | 'classes';
  class_weekdays: string;
  class_dates_added: string;
  class_dates_excluded: string;
  scholarship_percent: number;
};

export async function reconcileSubprogramSchedules(db: D1Database, now = new Date()): Promise<void> {
  await migrateLegacyPaymentPeriods(db, now);
  const timestamp = now.toISOString();
  const today = schoolToday(now);
  const rows = (await db.prepare(`
    SELECT s.*,m.frequency_unit AS current_unit,m.frequency_count AS current_count,
           m.payment_type,m.validity_count,m.validity_unit,m.requires_current_enrollment,
           m.period_start_on,m.period_end_on,m.advance_days,m.proration_method,
           m.class_weekdays,m.class_dates_added,m.class_dates_excluded,
           p.id AS product_id,p.title,p.description,p.amount_cents,p.currency,p.fee_type,p.validity_months,
           m.billing_revision AS modality_revision,p.billing_revision AS product_revision,e.scholarship_percent
      FROM school_subprogram_payment_schedules s
      JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
      JOIN school_payment_modalities m ON m.id=s.modality_id
      JOIN school_payment_products p ON p.id=m.payment_product_id
     WHERE s.next_check_at<=? AND s.status='active'
       AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
       AND m.status='active' AND p.active=1
     ORDER BY s.next_check_at,s.id LIMIT 50
  `).bind(timestamp).all<ScheduleRow>()).results;
  for (const row of rows) {
    try {
      let revision = row.revision;
      let anchor = row.anchor_on;
      let skipAnchor = row.skip_anchor === 1;
      const policy = policyFor({ ...row, frequency_unit: row.current_unit, frequency_count: row.current_count });
      const allPeriods = calendarPeriods(policy, today);
      if (row.frequency_unit !== row.current_unit || row.frequency_count !== row.current_count
        || row.calendar_revision !== row.modality_revision) {
        const current = allPeriods.find((period) => period.start <= today && period.end >= today)
          ?? allPeriods.find((period) => period.start > today);
        if (!current) throw new Error('No hay períodos futuros en la modalidad.');
        anchor = current.start > row.anchor_on ? current.start : row.anchor_on;
        const changed = await db.batch([
          db.prepare(`
            UPDATE school_subprogram_payment_schedules
               SET frequency_unit=?,frequency_count=?,anchor_on=?,skip_anchor=0,revision=revision+1,calendar_revision=?
             WHERE id=? AND revision=? AND EXISTS (
               SELECT 1 FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
               WHERE m.id=school_subprogram_payment_schedules.modality_id AND m.billing_revision=? AND p.billing_revision=? AND m.status='active' AND p.active=1
             )
          `).bind(row.current_unit, row.current_count, anchor, row.modality_revision, row.id, row.revision, row.modality_revision, row.product_revision),
          db.prepare(`
            UPDATE school_payment_obligations SET status='cancelled',updated_at=?
             WHERE subprogram_schedule_id=? AND schedule_revision=? AND status='pending'
               AND available_at>? AND checkout_lock_token IS NULL AND checkout_session_id IS NULL
               AND EXISTS (SELECT 1 FROM school_subprogram_payment_schedules WHERE id=? AND revision=?)
          `).bind(timestamp, row.id, row.revision, today, row.id, row.revision + 1),
          db.prepare(`UPDATE school_subprogram_scholarship_periods SET status='cancelled'
            WHERE schedule_id=? AND revision=? AND status='active' AND datetime(valid_from)>datetime(?)
              AND EXISTS (SELECT 1 FROM school_subprogram_payment_schedules WHERE id=? AND revision=?)`)
            .bind(row.id, row.revision, timestamp, row.id, row.revision + 1),
        ]);
        if (!changed[0].meta.changes) continue;
        revision++;
        skipAnchor = false;
      }

      const feeType = row.payment_type === 'enrollment' ? 'enrollment' : row.fee_type;
      const periods = allPeriods.filter((period) => period.start >= anchor && period.end >= today
        && !(skipAnchor && period.start === anchor)
        && (policy.proration_method !== 'classes' || hasScheduledClasses(period, policy)));
      const statements: D1PreparedStatement[] = [
        db.prepare(`
          UPDATE school_payment_obligations
             SET payment_product_id=?,title_snapshot=?,description_snapshot=?,amount_cents=?,currency=?,fee_type=?,
                 validity_months=?,modality_validity_count=?,modality_validity_unit=?,
                 requires_current_enrollment=?,updated_at=?
           WHERE subprogram_schedule_id=? AND schedule_revision=? AND status='pending' AND available_at>?
             AND scholarship_percent_snapshot=0
             AND checkout_lock_token IS NULL AND checkout_session_id IS NULL
             AND EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s
               JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
               JOIN school_payment_modalities m ON m.id=s.modality_id
               JOIN school_payment_products p ON p.id=m.payment_product_id
               WHERE s.id=school_payment_obligations.subprogram_schedule_id AND s.revision=? AND s.status='active'
                 AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
                 AND m.status='active' AND p.active=1
                 AND m.billing_revision=? AND p.billing_revision=?)
        `).bind(row.product_id, row.title, row.description, row.amount_cents, row.currency, feeType,
          row.validity_months, row.validity_count, row.validity_unit, row.requires_current_enrollment,
          timestamp, row.id, revision, today, revision, row.modality_revision, row.product_revision),
        ...periods.map((period) => {
          const percent = row.payment_type === 'classes' ? row.scholarship_percent : 0;
          const amount = scholarshipAmount(row.amount_cents, percent);
          return amount === 0
            ? scholarshipPeriodStatement(db, row.id, revision, period, row.modality_revision, row.product_revision)
            : chargeStatement(db, row.id, revision, period, amount,
              feeType, row.modality_revision, row.product_revision, row.scholarship_percent, percent);
        }),
        db.prepare(`
          INSERT INTO school_notifications(id,student_email,title,body,message,href)
          SELECT 'subprogram-due-' || o.id,o.student_email,'Pago escolar pendiente',
                 o.title_snapshot || ' está disponible para pagar.',o.title_snapshot || ' está disponible para pagar.','/account/payments'
            FROM school_payment_obligations o
            JOIN school_subprogram_payment_schedules s ON s.id=o.subprogram_schedule_id
            JOIN school_subprogram_enrollments e ON e.id=s.enrollment_id
           WHERE s.id=? AND s.revision=? AND s.status='active'
             AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
             AND o.status='pending' AND ((o.available_from IS NOT NULL AND datetime(o.available_from)<=datetime(?))
               OR (o.available_from IS NULL AND date(o.available_at)<=date(?)))
          ON CONFLICT(id) DO NOTHING
        `).bind(row.id, revision, timestamp, today),
        db.prepare(`UPDATE school_subprogram_payment_schedules SET next_check_at=? WHERE id=? AND revision=?
          AND EXISTS (SELECT 1 FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
            WHERE m.id=school_subprogram_payment_schedules.modality_id AND m.billing_revision=? AND p.billing_revision=?)
          AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e WHERE e.id=school_subprogram_payment_schedules.enrollment_id AND e.scholarship_percent=?)`)
          .bind(new Date(now.getTime() + 86400000).toISOString(), row.id, revision, row.modality_revision, row.product_revision, row.scholarship_percent),
      ];
      await db.batch(statements);
    } catch (error) {
      console.error(`No se pudo actualizar la programación escolar ${row.id}:`, error);
      await db.prepare('UPDATE school_subprogram_payment_schedules SET next_check_at=? WHERE id=? AND revision=?')
        .bind(new Date(now.getTime() + 3600000).toISOString(), row.id, row.revision).run();
    }
  }
}

export async function reconcileEnrollmentPolicies(db: D1Database, now = new Date()): Promise<void> {
        await migrateLegacyPaymentPeriods(db, now);
        const timestamp = now.toISOString();
        const today = schoolToday(now);
        const enrollments = (await db.prepare(`
          SELECT e.id,e.subprogram_id,p.enrollment_modality_id
            FROM school_subprogram_enrollments e JOIN school_subprograms p ON p.id=e.subprogram_id
           WHERE e.status='active' AND e.policy_next_check_at<=? AND (
             EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s
                     JOIN school_payment_modalities m ON m.id=s.modality_id
                     WHERE s.enrollment_id=e.id AND s.status='active' AND m.payment_type='enrollment'
                       AND s.modality_id<>COALESCE(p.enrollment_modality_id,''))
             OR (p.enrollment_modality_id IS NOT NULL AND NOT EXISTS (
                     SELECT 1 FROM school_subprogram_payment_schedules s
                     WHERE s.enrollment_id=e.id AND s.modality_id=p.enrollment_modality_id AND s.status='active'))
           ) ORDER BY e.id LIMIT 50
        `).bind(timestamp).all<{id:string;subprogram_id:string;enrollment_modality_id:string|null}>()).results;
        for (const enrollment of enrollments) {
          try {
            const desired = enrollment.enrollment_modality_id
              ? await activeModality(db, enrollment.enrollment_modality_id, enrollment.subprogram_id) : null;
            if (enrollment.enrollment_modality_id && (!desired || desired.payment_type !== 'enrollment')) {
              throw new Error('La modalidad de inscripción configurada no está activa.');
            }
            const desiredPeriods = desired ? calendarPeriods(policyFor(desired), today) : [];
            const desiredPeriod = desiredPeriods.find((period) => period.start <= today && period.end >= today)
              ?? desiredPeriods.find((period) => period.start > today);
            if (desired && !desiredPeriod) throw new Error('La inscripción no tiene períodos disponibles.');
            const alreadyDueToday = !!(await db.prepare(`
              SELECT o.id FROM school_payment_obligations o
              JOIN school_subprogram_payment_schedules s ON s.id=o.subprogram_schedule_id
              WHERE s.enrollment_id=? AND o.modality_payment_type='enrollment'
                AND o.due_at=? AND o.status<>'cancelled' LIMIT 1
            `).bind(enrollment.id, today).first<{id:string}>());
            const statements: D1PreparedStatement[] = [
              db.prepare(`
                UPDATE school_subprogram_payment_schedules SET status='inactive'
                 WHERE enrollment_id=? AND status='active' AND modality_id<>COALESCE(?,'')
                   AND modality_id IN (SELECT id FROM school_payment_modalities WHERE payment_type='enrollment')
                   AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e
                     JOIN school_subprograms p ON p.id=e.subprogram_id
                     WHERE e.id=? AND e.status='active' AND p.enrollment_modality_id IS ?)
              `).bind(enrollment.id, enrollment.enrollment_modality_id, enrollment.id, enrollment.enrollment_modality_id),
              db.prepare(`
                UPDATE school_payment_obligations SET status='cancelled',updated_at=?
                 WHERE status='pending' AND available_at>? AND checkout_lock_token IS NULL AND checkout_session_id IS NULL
                   AND subprogram_schedule_id IN (SELECT id FROM school_subprogram_payment_schedules WHERE enrollment_id=? AND status='inactive')
                   AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e
                     JOIN school_subprograms p ON p.id=e.subprogram_id
                     WHERE e.id=? AND e.status='active' AND p.enrollment_modality_id IS ?)
              `).bind(timestamp, today, enrollment.id, enrollment.id, enrollment.enrollment_modality_id),
            ];
            if (desired) statements.push(db.prepare(`
              INSERT INTO school_subprogram_payment_schedules
                (id,enrollment_id,modality_id,anchor_on,frequency_unit,frequency_count,skip_anchor,status,next_check_at,calendar_revision)
              SELECT ?,e.id,?,?,?,?,?,'active',?,? FROM school_subprogram_enrollments e
              JOIN school_subprograms p ON p.id=e.subprogram_id
              WHERE e.id=? AND e.status='active' AND p.enrollment_modality_id=?
                AND EXISTS (SELECT 1 FROM school_payment_modalities m JOIN school_payment_products product ON product.id=m.payment_product_id
                  WHERE m.id=? AND m.billing_revision=? AND product.billing_revision=?
                    AND m.status='active' AND product.active=1 AND m.payment_type='enrollment')
              ON CONFLICT(enrollment_id,modality_id) DO UPDATE SET
                anchor_on=excluded.anchor_on,frequency_unit=excluded.frequency_unit,frequency_count=excluded.frequency_count,
                skip_anchor=excluded.skip_anchor,status='active',revision=school_subprogram_payment_schedules.revision+1,
                next_check_at=excluded.next_check_at,calendar_revision=excluded.calendar_revision
              WHERE school_subprogram_payment_schedules.status='inactive'
            `).bind(crypto.randomUUID(), desired.id, desiredPeriod!.start, desired.frequency_unit, desired.frequency_count,
              alreadyDueToday ? 1 : 0, timestamp, desired.modality_revision, enrollment.id, desired.id,
              desired.id, desired.modality_revision, desired.product_revision));
            await db.batch(statements);
          } catch (error) {
            console.error(`No se pudo actualizar la inscripción escolar ${enrollment.id}:`, error);
            await db.prepare('UPDATE school_subprogram_enrollments SET policy_next_check_at=? WHERE id=?')
              .bind(new Date(now.getTime() + 3600000).toISOString(), enrollment.id).run();
          }
        }
}
