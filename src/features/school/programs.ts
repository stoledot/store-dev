import type { D1Database } from '@cloudflare/workers-types';
import { removeDiagnosticSection, saveDiagnosticQuestion, saveDiagnosticSection } from './subprogramDiagnostics.ts';
import { calendarPeriods, parseSchoolDate, type CalendarPolicy } from './paymentPeriods.ts';
import type { FrequencyUnit } from './scheduleDates.ts';

export interface Program {
  slug: string;
  title: string;
  description: string;
  image_url: string;
  status: string;
}

export interface Subprogram {
  id: string;
  program_slug: string;
  slug: string;
  title: string;
  description: string;
  education_level: string;
  image_url: string;
  objectives: string;
  methodology: string;
  terms_md: string;
  policies_md: string;
  duration_description: string;
  status: string;
  enrollment_modality_id?: string | null;
  suspension_after_days: number | null;
}

export interface Modality {
  id: string;
  subprogram_id: string;
  title: string;
  payment_product_id: string;
  payment_type: string;
  frequency_unit: string;
  frequency_count: number;
  classes_per_payment: number | null;
  course_id: string | null;
  validity_count: number | null;
  validity_unit: string | null;
  period_start_on: string | null;
  period_end_on: string | null;
  advance_days: number;
  proration_method: string;
  class_weekdays: string;
  class_dates_added: string;
  class_dates_excluded: string;
  requires_current_enrollment: number;
  status: string;
}

export interface Course {
  id: string;
  title: string;
  status: string;
}

export interface PaymentProduct {
  id: string;
  title: string;
  amount_cents: number;
  currency: string;
  active: number;
}

export interface SubprogramFaq {
  id: string;
  subprogram_id: string;
  question: string;
  answer: string;
  position: number;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function required(form: FormData, key: string, label: string): string {
  const value = text(form, key);
  if (!value) throw new Error(`${label} es obligatorio.`);
  return value;
}

function choice(form: FormData, key: string, values: readonly string[], label: string): string {
  const value = required(form, key, label);
  if (!values.includes(value)) throw new Error(`${label} no es válido.`);
  return value;
}

function positiveInteger(value: string, label: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} debe ser un número entero positivo.`);
  }
  return Number(value);
}

export function parseModality(form: FormData) {
  const paymentType = choice(form, 'payment_type', ['enrollment', 'classes', 'other'], 'El tipo de pago');
  const frequencyUnit = choice(form, 'frequency_unit', ['once', 'week', 'month', 'year'], 'La frecuencia');
  const frequencyCount = positiveInteger(text(form, 'frequency_count'), 'La frecuencia');
  if (frequencyUnit === 'once' && frequencyCount !== 1) {
    throw new Error('Un pago único debe tener frecuencia 1.');
  }
  const classes = text(form, 'classes_per_payment');
  const validity = text(form, 'validity_count');
  const validityUnit = text(form, 'validity_unit');
  if (Boolean(validity) !== Boolean(validityUnit)) {
    throw new Error('Indica tanto la cantidad como la unidad de vigencia, o deja ambas vacías.');
  }
  if (validityUnit && !['day', 'week', 'month', 'year'].includes(validityUnit)) {
    throw new Error('La unidad de vigencia no es válida.');
  }
  const requiresEnrollment = form.get('requires_current_enrollment') === '1' ? 1 : 0;
  if (paymentType === 'enrollment' && requiresEnrollment) {
    throw new Error('Una inscripción no puede exigir una inscripción vigente.');
  }
  const start = required(form, 'period_start_on', 'El inicio del período');
  const end = required(form, 'period_end_on', 'El fin del período');
  parseSchoolDate(start);
  parseSchoolDate(end);
  const advanceText = text(form, 'advance_days');
  if (!/^\d+$/.test(advanceText) || Number(advanceText) > 366) throw new Error('La anticipación debe ser de 0 a 366 días.');
  const proration = choice(form, 'proration_method', ['days', 'classes'], 'El prorrateo') as 'days' | 'classes';
  const weekdayValues = form.getAll('class_weekdays').map(String);
  if (weekdayValues.some((day) => !/^[0-6]$/.test(day)) || new Set(weekdayValues).size !== weekdayValues.length) {
    throw new Error('Los días de clase no son válidos.');
  }
  const weekdays = weekdayValues.map(Number);
  const dates = (key: string) => {
    const values = text(form, key).split(/[\s,]+/).filter(Boolean);
    if (values.length > 1000) throw new Error('Hay demasiadas fechas de clase.');
    values.forEach(parseSchoolDate);
    return [...new Set(values)].sort();
  };
  const added = dates('class_dates_added');
  const excluded = dates('class_dates_excluded');
  if (added.some((day) => excluded.includes(day))) throw new Error('Una fecha no puede estar incluida y excluida a la vez.');
  if (proration === 'classes' && weekdays.length === 0 && added.length === 0) throw new Error('Configura los días o las fechas de clase.');
  const policy: CalendarPolicy = {
    period_start_on: start, period_end_on: end, frequency_unit: frequencyUnit as FrequencyUnit,
    frequency_count: frequencyCount, advance_days: Number(advanceText), proration_method: proration,
    class_weekdays: weekdays, class_dates_added: added, class_dates_excluded: excluded,
  };
  if ((parseSchoolDate(end).getTime() - parseSchoolDate(start).getTime()) / 86400000 > 366) {
    throw new Error('El período no puede durar más de 367 días.');
  }
  calendarPeriods(policy, start);
  return {
    title: required(form, 'title', 'El nombre'),
    product: required(form, 'payment_product_id', 'El producto de pago'),
    paymentType,
    frequencyUnit,
    frequencyCount,
    classes: classes ? positiveInteger(classes, 'Las clases por pago') : null,
    course: text(form, 'course_id') || null,
    validity: validity ? positiveInteger(validity, 'La vigencia') : null,
    validityUnit: validityUnit || null,
    start, end, advanceDays: policy.advance_days, proration,
    weekdays: JSON.stringify(weekdays), added: JSON.stringify(added), excluded: JSON.stringify(excluded),
    requiresEnrollment,
    status: choice(form, 'status', ['draft', 'active', 'archived'], 'El estado'),
  };
}

export async function saveProgramAction(db: D1Database, form: FormData): Promise<void> {
  const action = text(form, 'action');
  if (action === 'save-subprogram-faq') {
    const subprogram = required(form, 'subprogram_id', 'El subprograma');
    const id = text(form, 'faq_id');
    const question = required(form, 'question', 'La pregunta');
    const answer = required(form, 'answer', 'La respuesta');
    const position = Number(text(form, 'position') || '0');
    if (question.length > 1000 || answer.length > 10000 || !Number.isSafeInteger(position) || position < 0 || position > 10000) {
      throw new Error('Revisa la pregunta, respuesta y orden de la pregunta frecuente.');
    }
    const result = id
      ? await db.prepare('UPDATE school_subprogram_faqs SET question=?,answer=?,position=? WHERE id=? AND subprogram_id=?')
        .bind(question, answer, position, id, subprogram).run()
      : await db.prepare(`INSERT INTO school_subprogram_faqs(id,subprogram_id,question,answer,position)
          SELECT ?,id,?,?,? FROM school_subprograms WHERE id=?`)
        .bind(crypto.randomUUID(), question, answer, position, subprogram).run();
    if (!result.meta.changes) throw new Error('La pregunta frecuente o el subprograma no existe.');
    return;
  }
  if (action === 'remove-subprogram-faq') {
    const result = await db.prepare('DELETE FROM school_subprogram_faqs WHERE id=? AND subprogram_id=?')
      .bind(required(form, 'faq_id', 'La pregunta'), required(form, 'subprogram_id', 'El subprograma')).run();
    if (!result.meta.changes) throw new Error('La pregunta frecuente no existe.');
    return;
  }
  if (action === 'add-diagnostic-question' || action === 'save-diagnostic-question') {
    await saveDiagnosticQuestion(db, form);
    return;
  }
  if (action === 'save-diagnostic-section') {
    await saveDiagnosticSection(db, form);
    return;
  }
  if (action === 'remove-diagnostic-section') {
    await removeDiagnosticSection(db, required(form, 'subprogram_id', 'El subprograma'), required(form, 'section_id', 'La sección'));
    return;
  }
  if (action === 'remove-diagnostic-question') {
    const result = await db.prepare('DELETE FROM school_subprogram_questions WHERE id=? AND subprogram_id=?')
      .bind(required(form, 'question_id', 'La pregunta'), required(form, 'subprogram_id', 'El subprograma')).run();
    if (!result.meta.changes) throw new Error('No se encontró la pregunta.');
    return;
  }
  if (action === 'set-enrollment-modality') {
    const subprogram = required(form, 'subprogram_id', 'El subprograma');
    const modality = text(form, 'enrollment_modality_id');
    if (modality) {
      const valid = await db.prepare(`
        SELECT m.id FROM school_payment_modalities m
        JOIN school_payment_products p ON p.id=m.payment_product_id
        WHERE m.id=? AND m.subprogram_id=? AND m.payment_type='enrollment'
          AND m.status='active' AND p.active=1
      `).bind(modality, subprogram).first<{ id: string }>();
      if (!valid) throw new Error('Selecciona una modalidad de inscripción activa del subprograma.');
    } else {
      const requiredByAssigned = await db.prepare(`
        SELECT e.id FROM school_subprogram_enrollments e
        JOIN school_payment_modalities m ON m.id=e.modality_id
        WHERE e.subprogram_id=? AND e.status IN ('active','suspended')
          AND (m.requires_current_enrollment=1 OR e.reenrollment_required=1) LIMIT 1
      `).bind(subprogram).first<{ id: string }>();
      if (requiredByAssigned) throw new Error('Primero desactiva el requisito de inscripción en las modalidades asignadas a alumnos activos.');
    }
    const result = await db.prepare(`
      UPDATE school_subprograms SET enrollment_modality_id=? WHERE id=?
        AND (? IS NOT NULL AND EXISTS (
          SELECT 1 FROM school_payment_modalities m JOIN school_payment_products p ON p.id=m.payment_product_id
           WHERE m.id=? AND m.subprogram_id=school_subprograms.id AND m.payment_type='enrollment'
             AND m.status='active' AND p.active=1
        ) OR ? IS NULL AND NOT EXISTS (
          SELECT 1 FROM school_subprogram_enrollments e JOIN school_payment_modalities m ON m.id=e.modality_id
           WHERE e.subprogram_id=school_subprograms.id AND e.status IN ('active','suspended')
             AND (m.requires_current_enrollment=1 OR e.reenrollment_required=1)
        ))
    `).bind(modality || null, subprogram, modality || null, modality || null, modality || null).run();
    if (!result.meta.changes) throw new Error('El subprograma o la configuración cambiaron. Vuelve a intentarlo.');
    return;
  }
  if (action === 'save-program') {
    const slug = required(form, 'program_slug', 'El programa');
    const result = await db.prepare('UPDATE school_programs SET title=?, description=?, image_url=?, status=? WHERE slug=?')
      .bind(required(form, 'title', 'El nombre'), text(form, 'description'), text(form, 'image_url'),
        choice(form, 'status', ['active', 'archived'], 'El estado'), slug).run();
    if (!result.meta.changes) throw new Error('Programa no encontrado.');
    return;
  }
  if (action === 'save-subprogram') {
    const id = text(form, 'id');
    const program = required(form, 'program_slug', 'El programa');
    const slug = required(form, 'slug', 'El identificador');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error('El identificador debe contener letras minúsculas, números y guiones.');
    }
    const suspension = text(form, 'suspension_after_days');
    if (suspension && (!/^\d+$/.test(suspension) || Number(suspension) > 3650)) {
      throw new Error('El plazo de baja temporal debe estar entre 0 y 3650 días.');
    }
    const values = [program, slug, required(form, 'title', 'El nombre'), text(form, 'description'),
      text(form, 'education_level'), text(form, 'image_url'), text(form, 'objectives'),
      text(form, 'methodology'), text(form, 'terms_md'), text(form, 'policies_md'),
      text(form, 'duration_description'), choice(form, 'status', ['draft', 'active', 'archived'], 'El estado'),
      suspension ? Number(suspension) : null];
    if (id) {
      const result = await db.prepare(`UPDATE school_subprograms SET program_slug=?, slug=?, title=?, description=?,
        education_level=?, image_url=?, objectives=?, methodology=?, terms_md=?, policies_md=?,
        duration_description=?, status=?, suspension_after_days=? WHERE id=?`).bind(...values, id).run();
      if (!result.meta.changes) throw new Error('Subprograma no encontrado.');
    } else {
      await db.prepare(`INSERT INTO school_subprograms (program_slug, slug, title, description, education_level,
        image_url, objectives, methodology, terms_md, policies_md, duration_description, status, suspension_after_days, id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values, crypto.randomUUID()).run();
    }
    return;
  }
  if (action === 'add-course' || action === 'remove-course') {
    const subprogram = required(form, 'subprogram_id', 'El subprograma');
    const course = required(form, 'course_id', 'El curso');
    if (action === 'add-course') {
      await db.prepare('INSERT INTO school_subprogram_courses (subprogram_id, course_id) VALUES (?, ?)')
        .bind(subprogram, course).run();
    } else {
      const result = await db.prepare('DELETE FROM school_subprogram_courses WHERE subprogram_id=? AND course_id=?')
        .bind(subprogram, course).run();
      if (!result.meta.changes) throw new Error('El curso vinculado no existe.');
    }
    return;
  }
  if (action === 'save-modality') {
    const id = text(form, 'id');
    const subprogram = required(form, 'subprogram_id', 'El subprograma');
    const data = parseModality(form);
    const values = [data.title, data.product, data.paymentType, data.frequencyUnit, data.frequencyCount,
      data.classes, data.course, data.validity, data.validityUnit, data.requiresEnrollment, data.status,
      data.start, data.end, data.advanceDays, data.proration, data.weekdays, data.added, data.excluded];
    if (id) {
      const results = await db.batch([db.prepare(`UPDATE school_payment_modalities SET billing_revision=billing_revision+1, title=?, payment_product_id=?, payment_type=?,
        frequency_unit=?, frequency_count=?, classes_per_payment=?, course_id=?, validity_count=?, validity_unit=?,
        requires_current_enrollment=?, status=?, period_start_on=?, period_end_on=?, advance_days=?, proration_method=?,
        class_weekdays=?, class_dates_added=?, class_dates_excluded=? WHERE id=? AND subprogram_id=?
        AND (payment_type=? OR (NOT EXISTS (SELECT 1 FROM school_subprogram_payment_schedules s WHERE s.modality_id=school_payment_modalities.id)
          AND NOT EXISTS (SELECT 1 FROM school_subprograms p WHERE p.enrollment_modality_id=school_payment_modalities.id)))
        AND (?=0 OR EXISTS (SELECT 1 FROM school_subprograms p WHERE p.id=school_payment_modalities.subprogram_id AND p.enrollment_modality_id IS NOT NULL))`)
          .bind(...values, id, subprogram, data.paymentType, data.requiresEnrollment),
        db.prepare(`UPDATE school_subprogram_payment_schedules SET next_check_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE modality_id=?`).bind(id)]);
      if (!results[0].meta.changes) throw new Error('No se puede cambiar el tipo de una modalidad asignada ni exigir una inscripción no configurada.');
    } else {
      await db.prepare(`INSERT INTO school_payment_modalities (title, payment_product_id, payment_type, frequency_unit,
        frequency_count, classes_per_payment, course_id, validity_count, validity_unit, requires_current_enrollment,
        status, period_start_on, period_end_on, advance_days, proration_method, class_weekdays, class_dates_added,
        class_dates_excluded, id, subprogram_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(...values, crypto.randomUUID(), subprogram).run();
    }
    return;
  }
  throw new Error('Acción no reconocida.');
}
