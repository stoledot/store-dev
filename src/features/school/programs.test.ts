import { describe, expect, it } from 'vitest';
import { parseModality } from './programs';

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: 'Mensualidad', payment_product_id: 'p1', payment_type: 'classes',
    frequency_unit: 'month', frequency_count: '1', status: 'draft',
    period_start_on: '2026-01-01', period_end_on: '2026-01-31', advance_days: '5',
    proration_method: 'days', ...overrides,
  })) data.set(key, value);
  return data;
}

describe('parseModality', () => {
  it('accepts unlimited classes and validity, or a specific course and validity', () => {
    expect(parseModality(form())).toMatchObject({ classes: null, course: null, validity: null, validityUnit: null });
    expect(parseModality(form({ course_id: 'c1', classes_per_payment: '4', validity_count: '2', validity_unit: 'month', requires_current_enrollment: '1' })))
      .toMatchObject({ course: 'c1', classes: 4, validity: 2, validityUnit: 'month', requiresEnrollment: 1 });
  });

  it('rejects invalid frequency, class limits and incomplete validity', () => {
    const invalid: Record<string, string>[] = [
      { frequency_unit: 'once', frequency_count: '2' },
      { frequency_count: '0' },
      { frequency_count: '1.5' },
      { classes_per_payment: '0' },
      { validity_count: '2' },
      { validity_unit: 'day' },
      { validity_count: '1', validity_unit: 'invalid' },
    ];
    for (const fields of invalid) expect(() => parseModality(form(fields))).toThrow();
  });

  it('rejects enrollment that requires enrollment and invalid statuses', () => {
    expect(() => parseModality(form({ payment_type: 'enrollment', requires_current_enrollment: '1' }))).toThrow();
    expect(() => parseModality(form({ status: 'published' }))).toThrow();
  });

  it('validates calendar dates, overlapping periods and class calendars', () => {
    for (const fields of [
      { period_end_on: '2026-02-01' },
      { period_start_on: '2026-02-30' },
      { advance_days: '-1' },
      { class_weekdays: '' },
      { proration_method: 'classes' },
      { class_dates_added: '2026-01-01', class_dates_excluded: '2026-01-01' },
    ]) expect(() => parseModality(form(fields))).toThrow();
    expect(parseModality(form({ proration_method: 'classes', class_dates_added: '2026-01-05' })))
      .toMatchObject({ added: '["2026-01-05"]', advanceDays: 5 });
  });
});
