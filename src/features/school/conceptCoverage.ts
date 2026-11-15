import { addSchoolDays, parseSchoolDate, schoolMidnight } from './paymentPeriods.ts';
import { validityEnd } from './scheduleDates.ts';
import type { PaymentConcept } from './paymentConcepts.ts';

export interface ConceptCoverage {
  startOn: string;
  endOn: string | null;
  validFrom: string;
  validUntil: string | null;
  availableFrom: string | null;
  paymentCutoff: string | null;
  accessGraceUntil: string;
}

export function conceptCoverage(
  concept: Pick<PaymentConcept, 'period_start_on' | 'period_end_on' | 'duration_count' | 'duration_unit'
    | 'advance_days' | 'allow_after_start' | 'grace_days'>,
): ConceptCoverage {
  const start = parseSchoolDate(concept.period_start_on);
  if (concept.period_end_on) {
    parseSchoolDate(concept.period_end_on);
    if (concept.period_end_on < concept.period_start_on) throw new Error('El fin de cobertura es anterior al inicio.');
  }
  if (concept.period_end_on && (concept.duration_count !== null || concept.duration_unit !== null)) {
    throw new Error('No se puede combinar fecha final y duración de cobertura.');
  }
  if (concept.advance_days !== null && (!Number.isSafeInteger(concept.advance_days) || concept.advance_days < 0)) {
    throw new Error('La anticipación no es válida.');
  }
  if (!Number.isSafeInteger(concept.grace_days) || concept.grace_days < 0 || ![0, 1].includes(concept.allow_after_start)) {
    throw new Error('La política de pago o gracia no es válida.');
  }
  const exclusiveEnd = concept.period_end_on
    ? addSchoolDays(concept.period_end_on, 1)
    : validityEnd(start, concept.duration_count, concept.duration_unit)?.slice(0, 10) ?? null;
  if (exclusiveEnd) parseSchoolDate(exclusiveEnd);
  const availableOn = concept.advance_days === null ? null : addSchoolDays(concept.period_start_on, -concept.advance_days);
  const graceEndOn = addSchoolDays(concept.period_start_on, concept.grace_days);
  if (availableOn) parseSchoolDate(availableOn);
  parseSchoolDate(graceEndOn);
  return {
    startOn: concept.period_start_on,
    endOn: exclusiveEnd ? addSchoolDays(exclusiveEnd, -1) : null,
    validFrom: schoolMidnight(concept.period_start_on),
    validUntil: exclusiveEnd ? schoolMidnight(exclusiveEnd) : null,
    availableFrom: availableOn ? schoolMidnight(availableOn) : null,
    paymentCutoff: concept.allow_after_start === 1 ? null : schoolMidnight(concept.period_start_on),
    accessGraceUntil: schoolMidnight(graceEndOn),
  };
}
