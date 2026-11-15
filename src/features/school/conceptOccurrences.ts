import { conceptCoverage, type ConceptCoverage } from './conceptCoverage.ts';
import { addSchoolDays, parseSchoolDate } from './paymentPeriods.ts';
import { validityEnd } from './scheduleDates.ts';
import type { PaymentConcept } from './paymentConcepts.ts';

type RecurringConcept = Pick<PaymentConcept, 'period_start_on' | 'period_end_on' | 'duration_count' | 'duration_unit'
  | 'advance_days' | 'allow_after_start' | 'grace_days' | 'recurrence_unit' | 'recurrence_count' | 'recurrence_end_on'>;

function shiftDate(date: string, unit: Exclude<PaymentConcept['recurrence_unit'], 'once'>, count: number, end: boolean): string {
  if (count === 0) return date;
  if (unit === 'day' || unit === 'week') return addSchoolDays(date, count * (unit === 'week' ? 7 : 1));
  const parsed = parseSchoolDate(date);
  const result = validityEnd(parsed, count, unit);
  if (!result) throw new Error('No se pudo calcular la recurrencia.');
  if (!end) return result.slice(0, 10);
  const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  if (parsed.getUTCDate() !== lastDay) return result.slice(0, 10);
  const shifted = new Date(result);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function conceptOccurrences(concept: RecurringConcept, from: string, through: string): ConceptCoverage[] {
  parseSchoolDate(from);
  parseSchoolDate(through);
  if (through < from) throw new Error('El horizonte de conceptos no es válido.');
  conceptCoverage(concept);
  if (concept.recurrence_unit === 'once') {
    if (concept.recurrence_count !== null || concept.recurrence_end_on !== null) throw new Error('La recurrencia no es válida.');
    const coverage = conceptCoverage(concept);
    return coverage.startOn <= through && (coverage.endOn === null || coverage.endOn >= from) ? [coverage] : [];
  }
  const unit = concept.recurrence_unit;
  const count = concept.recurrence_count;
  if (!['day', 'week', 'month', 'year'].includes(unit) || !Number.isSafeInteger(count) || count === null || count < 1) {
    throw new Error('La recurrencia no es válida.');
  }
  if (concept.recurrence_end_on) {
    parseSchoolDate(concept.recurrence_end_on);
    if (concept.recurrence_end_on < concept.period_start_on) throw new Error('El fin de recurrencia no es válido.');
  }
  const first = parseSchoolDate(concept.period_start_on);
  const limit = parseSchoolDate(concept.recurrence_end_on && concept.recurrence_end_on < through ? concept.recurrence_end_on : through);
  if (limit < first) return [];
  const distance = unit === 'day' || unit === 'week'
    ? Math.floor((limit.getTime() - first.getTime()) / (86400000 * (unit === 'week' ? 7 : 1)))
    : (limit.getUTCFullYear() - first.getUTCFullYear()) * (unit === 'year' ? 1 : 12)
      + (unit === 'month' ? limit.getUTCMonth() - first.getUTCMonth() : 0);
  const maximum = Math.floor(distance / count) + 1;
  const coverageAt = (index: number) => {
    const start = shiftDate(concept.period_start_on, unit, index * count, false);
    const end = concept.period_end_on ? shiftDate(concept.period_end_on, unit, index * count, true) : null;
    return conceptCoverage({ ...concept, period_start_on: start, period_end_on: end });
  };
  let low = 0;
  let high = maximum + 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (coverageAt(middle).startOn <= from) low = middle + 1;
    else high = middle;
  }
  const previous = low > 0 ? coverageAt(low - 1) : null;
  const startIndex = previous && (previous.endOn === null || previous.endOn >= from) ? low - 1 : low;
  const occurrences: ConceptCoverage[] = [];
  for (let index = startIndex; index <= maximum; index++) {
    const coverage = coverageAt(index);
    if (coverage.startOn > through || (concept.recurrence_end_on && coverage.startOn > concept.recurrence_end_on)) return occurrences;
    if (coverage.endOn === null || coverage.endOn >= from) occurrences.push(coverage);
    if (occurrences.length > 10000) throw new Error('La recurrencia contiene demasiados períodos y requiere revisión.');
  }
  return occurrences;
}
