import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { conceptCoverage, type ConceptCoverage } from './conceptCoverage.ts';
import { conceptOccurrences } from './conceptOccurrences.ts';
import { listPaymentConcepts, type PaymentConcept } from './paymentConcepts.ts';
import { addSchoolDays, parseSchoolDate, schoolMidnight, schoolToday } from './paymentPeriods.ts';
import { validityEnd } from './scheduleDates.ts';

type ConceptScheme = {
  id: string;
  subprogram_id: string;
  concept_mode: number;
  concept_revision: number;
  payment_type: string;
  requires_current_enrollment: number;
  status: string;
  enrollment_modality_id: string | null;
};

async function schemeFor(db: D1Database, id: string): Promise<ConceptScheme | null> {
  return db.prepare(`SELECT m.id,m.subprogram_id,m.concept_mode,m.concept_revision,m.payment_type,
      m.requires_current_enrollment,m.status,s.enrollment_modality_id
    FROM school_payment_modalities m JOIN school_subprograms s ON s.id=m.subprogram_id WHERE m.id=?`)
    .bind(id).first<ConceptScheme>();
}

function validateConcepts(concepts: PaymentConcept[]): void {
  if (!concepts.length) throw new Error('Agrega al menos un concepto al esquema.');
  for (const concept of concepts) {
    conceptCoverage(concept);
    conceptOccurrences(concept, concept.period_start_on, concept.period_start_on);
  }
}

function horizon(now: Date): { through: string; until: string } {
  const end = validityEnd(parseSchoolDate(schoolToday(now)), 1, 'year');
  if (!end) throw new Error('No se pudo calcular el horizonte de pagos.');
  const through = end.slice(0, 10);
  return { through, until: schoolMidnight(addSchoolDays(through, 1)) };
}

function coverages(concept: PaymentConcept, from: string, through: string): ConceptCoverage[] {
  return concept.recurrence_unit === 'once'
    ? [conceptCoverage(concept)]
    : conceptOccurrences(concept, from, through);
}

export async function enableConceptScheme(db: D1Database, id: string): Promise<void> {
  const scheme = await schemeFor(db, id);
  if (!scheme || scheme.status === 'archived' || scheme.payment_type === 'enrollment'
    || scheme.requires_current_enrollment || scheme.enrollment_modality_id) {
    throw new Error('El esquema debe estar disponible y el subprograma no debe exigir una inscripción anterior.');
  }
  if (scheme.concept_mode === 1) throw new Error('El esquema ya utiliza conceptos.');
  validateConcepts(await listPaymentConcepts(db, id));
  const result = await db.prepare(`UPDATE school_payment_modalities SET concept_mode=1
    WHERE id=? AND concept_mode=0 AND concept_revision=?
      AND status<>'archived' AND payment_type<>'enrollment' AND requires_current_enrollment=0
      AND EXISTS (SELECT 1 FROM school_subprograms sub WHERE sub.id=school_payment_modalities.subprogram_id
        AND sub.enrollment_modality_id IS NULL)
      AND EXISTS (SELECT 1 FROM school_payment_concepts c WHERE c.modality_id=school_payment_modalities.id AND c.active=1)
      AND NOT EXISTS (SELECT 1 FROM school_subprogram_enrollments e WHERE e.modality_id=school_payment_modalities.id)
      AND NOT EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s WHERE s.modality_id=school_payment_modalities.id)`)
    .bind(id, scheme.concept_revision).run();
  if (!result.meta.changes) throw new Error('El esquema tiene asignaciones o su configuración cambió; vuelve a revisarlo.');
}

function initialConceptStatements(
  db: D1Database, enrollmentId: string, concept: PaymentConcept, coverage: ConceptCoverage, now: Date, revision: number, until: string,
): D1PreparedStatement[] {
  const obligationId = crypto.randomUUID();
  const status = coverage.paymentCutoff && coverage.paymentCutoff <= now.toISOString() ? 'cancelled' : 'pending';
  return [
    db.prepare(`INSERT INTO school_payment_obligations
      (id,student_email,title_snapshot,description_snapshot,amount_cents,currency,fee_type,validity_months,
       due_at,available_at,status,period_start_on,period_end_on,modality_valid_from,modality_valid_until,available_from,overdue_from)
      SELECT ?,a.email,?,?,?,?,'other',0,?,NULL,?,?,?,?,?,?,?
        FROM school_concept_assignments ca JOIN school_subprogram_enrollments e ON e.id=ca.enrollment_id
        JOIN customer_accounts a ON a.client_number=e.client_number
        JOIN school_payment_modalities m ON m.id=e.modality_id
        WHERE ca.enrollment_id=? AND m.concept_mode=1 AND m.concept_revision=?
          AND e.status IN ('active','suspended')
          AND (ca.generated_until IS NULL OR ca.generated_until<=?)
          AND NOT EXISTS (SELECT 1 FROM school_concept_occurrence_charges cc
            WHERE cc.enrollment_id=ca.enrollment_id AND cc.concept_id=? AND cc.occurrence_start_on=?)`)
      .bind(obligationId, concept.title, concept.description, concept.amount_cents, concept.currency,
        coverage.startOn, status, coverage.startOn, coverage.endOn, coverage.validFrom, coverage.validUntil,
        coverage.availableFrom, coverage.validFrom, enrollmentId, revision, until, concept.id, coverage.startOn),
    db.prepare(`INSERT INTO school_concept_occurrence_charges(enrollment_id,concept_id,occurrence_start_on,obligation_id,access_grace_until,payment_cutoff,auto_cancelled)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM school_payment_obligations WHERE id=?)`)
      .bind(enrollmentId, concept.id, coverage.startOn, obligationId, coverage.accessGraceUntil, coverage.paymentCutoff,
        status === 'cancelled' ? 1 : 0, obligationId),
  ];
}

export async function approveConceptDiagnostic(
  db: D1Database, diagnosticId: string, modalityId: string, notes: string, now: Date,
): Promise<void> {
  const scheme = await schemeFor(db, modalityId);
  if (!scheme || scheme.concept_mode !== 1 || scheme.status !== 'active'
    || scheme.enrollment_modality_id || scheme.requires_current_enrollment) {
    throw new Error('El esquema de conceptos no está disponible.');
  }
  const concepts = await listPaymentConcepts(db, modalityId);
  validateConcepts(concepts);
  const enrollmentId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const today = schoolToday(now);
  const window = horizon(now);
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE school_subprogram_diagnostics SET status='approved',admin_notes=?,reviewed_at=?,approval_token=?
      WHERE id=? AND status='pending' AND subprogram_id=?
        AND EXISTS (SELECT 1 FROM school_subprograms sub JOIN school_programs p ON p.slug=sub.program_slug
          WHERE sub.id=school_subprogram_diagnostics.subprogram_id AND sub.status='active' AND p.status='active'
            AND sub.enrollment_modality_id IS NULL)
        AND EXISTS (SELECT 1 FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
          WHERE m.id=? AND m.subprogram_id=school_subprogram_diagnostics.subprogram_id AND m.status='active'
            AND m.concept_mode=1 AND m.concept_revision=? AND p.active=1)
        AND NOT EXISTS (SELECT 1 FROM school_subprogram_enrollments old
          WHERE old.client_number=school_subprogram_diagnostics.client_number
            AND old.subprogram_id=school_subprogram_diagnostics.subprogram_id AND old.status='withdrawn')`)
      .bind(notes, now.toISOString(), token, diagnosticId, scheme.subprogram_id, modalityId, scheme.concept_revision),
    db.prepare(`INSERT INTO school_subprogram_enrollments(id,client_number,subprogram_id,diagnostic_id,modality_id,starts_on)
      SELECT ?,client_number,subprogram_id,id,?,? FROM school_subprogram_diagnostics
      WHERE id=? AND status='approved' AND approval_token=?`)
      .bind(enrollmentId, modalityId, today, diagnosticId, token),
    db.prepare(`INSERT INTO school_concept_assignments(enrollment_id,synced_revision,generated_until)
      SELECT id,?,? FROM school_subprogram_enrollments WHERE id=?`)
      .bind(scheme.concept_revision, window.until, enrollmentId),
    ...concepts.flatMap(concept => coverages(concept, today, window.through)
      .flatMap(coverage => initialConceptStatements(db, enrollmentId, concept, coverage, now, scheme.concept_revision, window.until))),
    db.prepare(`INSERT INTO school_notifications(id,student_email,title,body,message,href)
      SELECT ?,a.email,'Diagnóstico aprobado','Tienes pagos escolares asignados.',
        'Tienes pagos escolares asignados.','/account/payments'
      FROM school_subprogram_enrollments e JOIN customer_accounts a ON a.client_number=e.client_number WHERE e.id=?`)
      .bind(crypto.randomUUID(), enrollmentId),
    db.prepare(`INSERT INTO school_subprogram_approval_emails(diagnostic_id)
      SELECT diagnostic_id FROM school_subprogram_enrollments WHERE id=?`).bind(enrollmentId),
  ];
  const result = await db.batch(statements);
  if (!result[0].meta.changes) {
    throw new Error('El diagnóstico o el esquema cambió, o requiere un proceso de reingreso.');
  }
}

export async function syncConceptScheme(db: D1Database, modalityId: string, now = new Date(), scheduled = false): Promise<void> {
  const scheme = await schemeFor(db, modalityId);
  if (!scheme) throw new Error('El esquema ya no existe.');
  if (scheme.concept_mode !== 1) return;
  const concepts = await listPaymentConcepts(db, modalityId);
  const window = horizon(now);
  const enrollments = (await db.prepare(`SELECT ca.enrollment_id,ca.synced_revision,ca.generated_until,e.starts_on
    FROM school_concept_assignments ca JOIN school_subprogram_enrollments e ON e.id=ca.enrollment_id
    WHERE e.modality_id=? AND e.status IN ('active','suspended')
      AND (ca.synced_revision<>? OR ca.generated_until IS NULL OR ca.generated_until<?)
      AND (?=0 OR ca.sync_retry_at IS NULL OR datetime(ca.sync_retry_at)<=datetime(?))
    ORDER BY CASE WHEN ca.synced_revision<>? THEN 0 ELSE 1 END,ca.generated_until,ca.enrollment_id LIMIT ?`)
    .bind(modalityId, scheme.concept_revision, window.until, scheduled ? 1 : 0, now.toISOString(), scheme.concept_revision, scheduled ? 5 : -1)
    .all<{enrollment_id:string;synced_revision:number;generated_until:string|null;starts_on:string}>()).results;
  for (const enrollment of enrollments) {
    try {
    const changed = enrollment.synced_revision !== scheme.concept_revision;
    const until = enrollment.generated_until && enrollment.generated_until > window.until ? enrollment.generated_until : window.until;
    const through = schoolToday(new Date(new Date(until).getTime() - 1));
    const existing = (await db.prepare(`SELECT cc.concept_id,cc.occurrence_start_on,cc.obligation_id,cc.auto_cancelled,cc.retired,o.status
      FROM school_concept_occurrence_charges cc JOIN school_payment_obligations o ON o.id=cc.obligation_id
      WHERE cc.enrollment_id=?`).bind(enrollment.enrollment_id)
      .all<{concept_id:string;occurrence_start_on:string;obligation_id:string;auto_cancelled:number;retired:number;status:string}>()).results;
    const keyed = new Map(existing.map(row => [`${row.concept_id}\0${row.occurrence_start_on}`, row]));
    const expected = new Set<string>();
    const statements: D1PreparedStatement[] = [];
    for (const concept of concepts) {
      for (const coverage of coverages(concept, enrollment.starts_on, through)) {
        const key = `${concept.id}\0${coverage.startOn}`;
        expected.add(key);
        const charge = keyed.get(key);
        if (!charge) {
          statements.push(...initialConceptStatements(db, enrollment.enrollment_id, concept, coverage, now, scheme.concept_revision, until));
          continue;
        }
        if (changed && charge.retired === 1) {
          statements.push(db.prepare(`UPDATE school_concept_occurrence_charges SET retired=0
            WHERE obligation_id=? AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e
              JOIN school_payment_modalities m ON m.id=e.modality_id
              JOIN school_concept_assignments ca ON ca.enrollment_id=e.id
              WHERE e.id=? AND e.status IN ('active','suspended') AND m.concept_revision=?
                AND (ca.generated_until IS NULL OR ca.generated_until<=?))`)
            .bind(charge.obligation_id, enrollment.enrollment_id, scheme.concept_revision, until));
        }
        if (!changed || (charge.status !== 'pending' && !(charge.status === 'cancelled' && charge.auto_cancelled === 1))) continue;
        const status = coverage.paymentCutoff && coverage.paymentCutoff <= now.toISOString() ? 'cancelled' : 'pending';
        statements.push(
          db.prepare(`UPDATE school_payment_obligations SET title_snapshot=?,description_snapshot=?,amount_cents=?,currency=?,
            due_at=?,available_at=NULL,status=?,period_start_on=?,period_end_on=?,modality_valid_from=?,modality_valid_until=?,
            available_from=?,overdue_from=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id=? AND status=? AND checkout_bundle_id IS NULL AND checkout_lock_token IS NULL AND checkout_session_id IS NULL
              AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e JOIN school_payment_modalities m ON m.id=e.modality_id
                JOIN school_concept_assignments ca ON ca.enrollment_id=e.id
                WHERE e.id=? AND e.status IN ('active','suspended') AND m.concept_mode=1 AND m.concept_revision=?
                  AND (ca.generated_until IS NULL OR ca.generated_until<=?))`)
            .bind(concept.title, concept.description, concept.amount_cents, concept.currency, coverage.startOn, status,
              coverage.startOn, coverage.endOn, coverage.validFrom, coverage.validUntil, coverage.availableFrom, coverage.validFrom,
              charge.obligation_id, charge.status, enrollment.enrollment_id, scheme.concept_revision, until),
          db.prepare(`UPDATE school_concept_occurrence_charges SET access_grace_until=?,payment_cutoff=?,auto_cancelled=?
            WHERE obligation_id=? AND changes()=1`)
            .bind(coverage.accessGraceUntil, coverage.paymentCutoff, status === 'cancelled' ? 1 : 0, charge.obligation_id),
        );
      }
    }
    if (changed) {
      for (const charge of existing.filter(row => !expected.has(`${row.concept_id}\0${row.occurrence_start_on}`))) {
        statements.push(
          db.prepare(`UPDATE school_payment_obligations SET status='cancelled',
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id=? AND status='pending' AND checkout_bundle_id IS NULL AND checkout_lock_token IS NULL AND checkout_session_id IS NULL
              AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e JOIN school_payment_modalities m ON m.id=e.modality_id
                JOIN school_concept_assignments ca ON ca.enrollment_id=e.id
                WHERE e.id=? AND m.concept_revision=? AND (ca.generated_until IS NULL OR ca.generated_until<=?))`)
            .bind(charge.obligation_id, enrollment.enrollment_id, scheme.concept_revision, until),
          db.prepare(`UPDATE school_concept_occurrence_charges SET retired=1,
            auto_cancelled=CASE WHEN changes()=1 THEN 1 ELSE auto_cancelled END
            WHERE obligation_id=? AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e
              JOIN school_payment_modalities m ON m.id=e.modality_id
              JOIN school_concept_assignments ca ON ca.enrollment_id=e.id
              JOIN school_payment_obligations o ON o.id=school_concept_occurrence_charges.obligation_id
              WHERE e.id=? AND m.concept_revision=? AND (ca.generated_until IS NULL OR ca.generated_until<=?) AND (o.status<>'pending'
                OR (o.checkout_bundle_id IS NULL AND o.checkout_lock_token IS NULL AND o.checkout_session_id IS NULL)))`)
            .bind(charge.obligation_id, enrollment.enrollment_id, scheme.concept_revision, until),
        );
      }
    }
    const required = JSON.stringify([...expected].map(key => {
      const [conceptId, start] = key.split('\0');
      return { conceptId, start };
    }));
    statements.push(db.prepare(`UPDATE school_concept_assignments SET synced_revision=?,generated_until=?,sync_retry_at=NULL
      WHERE enrollment_id=? AND EXISTS (SELECT 1 FROM school_subprogram_enrollments e
        JOIN school_payment_modalities m ON m.id=e.modality_id
        WHERE e.id=school_concept_assignments.enrollment_id AND e.status IN ('active','suspended')
          AND m.concept_mode=1 AND m.concept_revision=?)
        AND (generated_until IS NULL OR generated_until<=?)
        AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (
          SELECT 1 FROM school_concept_occurrence_charges cc WHERE cc.enrollment_id=school_concept_assignments.enrollment_id
            AND cc.concept_id=json_extract(j.value,'$.conceptId') AND cc.occurrence_start_on=json_extract(j.value,'$.start')
            AND cc.retired=0))
        AND (?=0 OR NOT EXISTS (SELECT 1 FROM school_concept_occurrence_charges cc
          JOIN school_payment_obligations o ON o.id=cc.obligation_id
          WHERE cc.enrollment_id=school_concept_assignments.enrollment_id AND o.status='pending'
            AND (o.checkout_bundle_id IS NOT NULL OR o.checkout_lock_token IS NOT NULL OR o.checkout_session_id IS NOT NULL)))`)
      .bind(scheme.concept_revision, until, enrollment.enrollment_id, scheme.concept_revision, until, required, changed ? 1 : 0));
    const results = await db.batch(statements);
    if (!results[results.length - 1].meta.changes) throw new Error('El esquema cambió o tiene pagos en curso; vuelve a sincronizarlo.');
    } catch (error) {
      if (!scheduled) throw error;
      console.error(`No se pudo sincronizar la inscripción ${enrollment.enrollment_id}:`, error);
      await db.prepare(`UPDATE school_concept_assignments SET sync_retry_at=? WHERE enrollment_id=?
        AND (synced_revision<>? OR generated_until IS NULL OR generated_until<?)`)
        .bind(new Date(now.getTime() + 30 * 60 * 1000).toISOString(), enrollment.enrollment_id,
          scheme.concept_revision, window.until).run();
    }
  }
}

export async function reconcileConceptSchemes(db: D1Database, now = new Date()): Promise<void> {
  const window = horizon(now);
  const schemes = (await db.prepare(`SELECT e.modality_id FROM school_concept_assignments ca
    JOIN school_subprogram_enrollments e ON e.id=ca.enrollment_id
    JOIN school_payment_modalities m ON m.id=e.modality_id
    WHERE m.concept_mode=1 AND e.status IN ('active','suspended')
      AND (ca.sync_retry_at IS NULL OR datetime(ca.sync_retry_at)<=datetime(?))
      AND (ca.synced_revision<>m.concept_revision OR ((ca.generated_until IS NULL OR ca.generated_until<?)
        AND EXISTS (SELECT 1 FROM school_payment_concepts c WHERE c.modality_id=m.id AND c.active=1 AND c.recurrence_unit<>'once')))
    GROUP BY e.modality_id
    ORDER BY MIN(CASE WHEN ca.synced_revision<>m.concept_revision THEN 0 ELSE 1 END),MIN(ca.generated_until),e.modality_id
    LIMIT 2`)
    .bind(now.toISOString(), window.until).all<{modality_id:string}>()).results;
  for (const scheme of schemes) {
    try {
      await syncConceptScheme(db, scheme.modality_id, now, true);
    } catch (error) {
      console.error(`No se pudo sincronizar el esquema de conceptos ${scheme.modality_id}:`, error);
    }
  }
}
