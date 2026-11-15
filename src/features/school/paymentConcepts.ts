import type { D1Database } from '@cloudflare/workers-types';
import { toMajorUnits, toMinorUnits } from '../../money.ts';
import { parseSchoolDate } from './paymentPeriods.ts';

type DurationUnit = 'day' | 'week' | 'month' | 'year';
type RecurrenceUnit = 'once' | DurationUnit;

export interface PaymentConcept {
  id: string;
  modality_id: string;
  title: string;
  description: string;
  period_start_on: string;
  period_end_on: string | null;
  duration_count: number | null;
  duration_unit: DurationUnit | null;
  amount_cents: number;
  currency: string;
  advance_days: number | null;
  allow_after_start: number;
  grace_days: number;
  required_for_access: number;
  recurrence_unit: RecurrenceUnit;
  recurrence_count: number | null;
  recurrence_end_on: string | null;
  group_name: string | null;
  active: number;
}

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const units = ['day', 'week', 'month', 'year'] as const;

function integer(text: string, label: string, min: number, max: number): number {
  const result = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(result) || result < min || result > max) {
    throw new Error(`${label} debe ser un entero entre ${min} y ${max}.`);
  }
  return result;
}

function unit(text: string, label: string): DurationUnit {
  if (!units.some(item => item === text)) throw new Error(`${label} no es válida.`);
  return text as DurationUnit;
}

export function parsePaymentConcept(form: FormData): Omit<PaymentConcept, 'id' | 'modality_id' | 'active'> {
  const title = value(form, 'title');
  const description = value(form, 'description');
  const start = value(form, 'period_start_on');
  const end = value(form, 'period_end_on');
  const durationText = value(form, 'duration_count');
  const durationUnitText = value(form, 'duration_unit');
  const advanceText = value(form, 'advance_days');
  const groupName = value(form, 'group_name');
  const recurrence = value(form, 'recurrence_unit');
  const recurrenceCountText = value(form, 'recurrence_count');
  const recurrenceEnd = value(form, 'recurrence_end_on');
  const currency = value(form, 'currency').toLowerCase();
  const amountText = value(form, 'amount');
  const major = Number(amountText);
  const allowAfterStart = value(form, 'allow_after_start');
  const requiredForAccess = value(form, 'required_for_access');

  if (!title || title.length > 160 || description.length > 10000 || groupName.length > 160) {
    throw new Error('Revisa el nombre, la descripción y el grupo del concepto.');
  }
  parseSchoolDate(start);
  if (end) {
    parseSchoolDate(end);
    if (end < start) throw new Error('El fin de cobertura no puede ser anterior a su inicio.');
  }
  if ((durationText || durationUnitText) && (end || !durationText || !durationUnitText)) {
    throw new Error('Indica una fecha final o una duración completa, no ambas.');
  }
  const durationCount = durationText ? integer(durationText, 'La duración', 1, 10000) : null;
  const durationUnit = durationUnitText ? unit(durationUnitText, 'La unidad de duración') : null;
  if (!/^[a-z]{3}$/.test(currency) || !amountText || !Number.isFinite(major) || major <= 0 || major > 10000000) {
    throw new Error('Revisa el importe y la moneda.');
  }
  const amount = toMinorUnits(major, currency);
  if (!Number.isSafeInteger(amount) || amount <= 0 || toMajorUnits(amount, currency) !== major) {
    throw new Error('El importe no corresponde a las unidades de la moneda.');
  }
  if (recurrence !== 'once' && !units.some(item => item === recurrence)) {
    throw new Error('La frecuencia de recurrencia no es válida.');
  }
  if (!['0', '1'].includes(allowAfterStart) || !['0', '1'].includes(requiredForAccess)) {
    throw new Error('Indica si se puede pagar después del inicio y si el concepto controla el acceso.');
  }
  if (recurrence === 'once' && (recurrenceCountText || recurrenceEnd)) {
    throw new Error('Un concepto único no puede tener frecuencia ni fin de recurrencia.');
  }
  if (recurrenceEnd) {
    parseSchoolDate(recurrenceEnd);
    if (recurrenceEnd < start) throw new Error('El fin de recurrencia no puede ser anterior al inicio.');
  }
  return {
    title, description, period_start_on: start, period_end_on: end || null,
    duration_count: durationCount, duration_unit: durationUnit,
    amount_cents: amount, currency,
    advance_days: advanceText ? integer(advanceText, 'La anticipación', 0, 10000) : null,
    allow_after_start: Number(allowAfterStart),
    grace_days: integer(value(form, 'grace_days'), 'La gracia', 0, 10000),
    required_for_access: Number(requiredForAccess),
    recurrence_unit: recurrence as RecurrenceUnit,
    recurrence_count: recurrence === 'once' ? null : integer(recurrenceCountText, 'La frecuencia', 1, 10000),
    recurrence_end_on: recurrenceEnd || null, group_name: groupName || null,
  };
}

export async function listPaymentConcepts(db: D1Database, modalityId: string): Promise<PaymentConcept[]> {
  return (await db.prepare('SELECT * FROM school_payment_concepts WHERE modality_id=? AND active=1 ORDER BY period_start_on,title,id')
    .bind(modalityId).all<PaymentConcept>()).results;
}

export async function savePaymentConcept(db: D1Database, modalityId: string, form: FormData): Promise<void> {
  const data = parsePaymentConcept(form);
  const id = value(form, 'concept_id') || crypto.randomUUID();
  const existing = value(form, 'concept_id');
  const values = [data.title, data.description, data.period_start_on, data.period_end_on,
    data.duration_count, data.duration_unit, data.amount_cents, data.currency, data.advance_days,
    data.allow_after_start, data.grace_days, data.required_for_access, data.recurrence_unit,
    data.recurrence_count, data.recurrence_end_on, data.group_name];
  const token = crypto.randomUUID();
  const unlocked = `NOT EXISTS (SELECT 1 FROM school_subprogram_enrollments e
    JOIN school_concept_occurrence_charges cc ON cc.enrollment_id=e.id
    JOIN school_payment_obligations o ON o.id=cc.obligation_id
    WHERE e.modality_id=? AND o.status='pending'
      AND (o.checkout_lock_token IS NOT NULL OR o.checkout_session_id IS NOT NULL OR o.checkout_bundle_id IS NOT NULL))`;
  const mutation = existing
    ? db.prepare(`UPDATE school_payment_concepts SET title=?,description=?,period_start_on=?,period_end_on=?,
        duration_count=?,duration_unit=?,amount_cents=?,currency=?,advance_days=?,allow_after_start=?,grace_days=?,
        required_for_access=?,recurrence_unit=?,recurrence_count=?,recurrence_end_on=?,group_name=?,
        mutation_token=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=? AND modality_id=? AND active=1 AND (? IS NULL OR NOT EXISTS (
          SELECT 1 FROM school_payment_concepts other WHERE other.modality_id=school_payment_concepts.modality_id
            AND other.id<>school_payment_concepts.id AND other.active=1 AND other.group_name=? COLLATE NOCASE AND other.currency<>?))
          AND ${unlocked}
          AND (NOT EXISTS (SELECT 1 FROM school_concept_occurrence_charges cc
            JOIN school_payment_obligations o ON o.id=cc.obligation_id
            WHERE cc.concept_id=school_payment_concepts.id AND o.status='paid')
            OR (period_start_on IS ? AND period_end_on IS ? AND duration_count IS ? AND duration_unit IS ?
              AND recurrence_unit IS ? AND recurrence_count IS ? AND recurrence_end_on IS ?))`)
      .bind(...values, token, id, modalityId, data.group_name, data.group_name, data.currency, modalityId,
        data.period_start_on, data.period_end_on, data.duration_count, data.duration_unit,
        data.recurrence_unit, data.recurrence_count, data.recurrence_end_on)
    : db.prepare(`INSERT INTO school_payment_concepts
        (title,description,period_start_on,period_end_on,duration_count,duration_unit,amount_cents,currency,
         advance_days,allow_after_start,grace_days,required_for_access,recurrence_unit,recurrence_count,recurrence_end_on,group_name,id,mutation_token,modality_id)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,m.id FROM school_payment_modalities m
        WHERE m.id=? AND (? IS NULL OR NOT EXISTS (
          SELECT 1 FROM school_payment_concepts other WHERE other.modality_id=m.id AND other.active=1
            AND other.group_name=? COLLATE NOCASE AND other.currency<>?))
          AND ${unlocked}`)
      .bind(...values, id, token, modalityId, data.group_name, data.group_name, data.currency, modalityId);
  const result = await db.batch([
    mutation,
    db.prepare(`UPDATE school_payment_modalities SET concept_revision=concept_revision+1
      WHERE id=? AND EXISTS (SELECT 1 FROM school_payment_concepts WHERE id=? AND mutation_token=?)`)
      .bind(modalityId, id, token),
  ]);
  if (!result[0].meta.changes || !result[1].meta.changes) {
    throw new Error('Revisa el esquema y la moneda del grupo. No se puede editar con pagos en curso ni cambiar las fechas o la recurrencia de un concepto con pagos realizados.');
  }
}

export async function removePaymentConcept(db: D1Database, modalityId: string, conceptId: string): Promise<void> {
  const token = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`UPDATE school_payment_concepts SET active=0,mutation_token=? WHERE id=? AND modality_id=? AND active=1
      AND NOT EXISTS (SELECT 1 FROM school_subprogram_enrollments e
        JOIN school_concept_occurrence_charges cc ON cc.enrollment_id=e.id
        JOIN school_payment_obligations o ON o.id=cc.obligation_id
        WHERE e.modality_id=? AND o.status='pending'
          AND (o.checkout_lock_token IS NOT NULL OR o.checkout_session_id IS NOT NULL OR o.checkout_bundle_id IS NOT NULL))`)
      .bind(token, conceptId, modalityId, modalityId),
    db.prepare(`UPDATE school_payment_modalities SET concept_revision=concept_revision+1
      WHERE id=? AND EXISTS (SELECT 1 FROM school_payment_concepts WHERE id=? AND mutation_token=?)`)
      .bind(modalityId, conceptId, token),
  ]);
  if (!result[0].meta.changes || !result[1].meta.changes) throw new Error('El concepto no existe o hay pagos en curso.');
}
