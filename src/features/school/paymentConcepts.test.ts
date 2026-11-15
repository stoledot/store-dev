import { describe, expect, it } from 'vitest';
import { parsePaymentConcept } from './paymentConcepts';

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: 'Inscripción', period_start_on: '2027-01-01', amount: '123.456', currency: 'bhd',
    recurrence_unit: 'once', grace_days: '5', allow_after_start: '0', required_for_access: '1', ...fields,
  })) data.set(key, value);
  return data;
}

describe('conceptos de pago', () => {
  it('accepts indefinite coverage, unlimited advance and an amount in minor units', () => {
    expect(parsePaymentConcept(form())).toMatchObject({
      amount_cents: 123456, period_end_on: null, duration_count: null, advance_days: null,
      recurrence_unit: 'once', recurrence_count: null, grace_days: 5,
    });
  });

  it('accepts recurring durations and a zero-day payment window', () => {
    expect(parsePaymentConcept(form({ duration_count: '1', duration_unit: 'year', advance_days: '0',
      recurrence_unit: 'year', recurrence_count: '1', recurrence_end_on: '2029-01-01',
      allow_after_start: '1', required_for_access: '1', group_name: 'Inscripción' })))
      .toMatchObject({ duration_count: 1, duration_unit: 'year', advance_days: 0,
        recurrence_count: 1, recurrence_end_on: '2029-01-01', allow_after_start: 1, required_for_access: 1 });
  });

  it('rejects invalid dates, conflicting durations, recurrence and currency precision', () => {
    const invalid: Record<string, string>[] = [
      { period_start_on: '2027-02-29' },
      { period_end_on: '2026-12-31' },
      { period_end_on: '2027-12-31', duration_count: '1', duration_unit: 'year' },
      { duration_count: '1' },
      { recurrence_unit: 'month', recurrence_count: '0' },
      { recurrence_end_on: '2029-01-01' },
      { currency: 'jpy', amount: '1.1' },
      { advance_days: '-1' },
      { grace_days: '' },
    ];
    for (const fields of invalid) expect(() => parsePaymentConcept(form(fields))).toThrow();
  });
});
