import { describe, expect, it } from 'vitest';
import { conceptOccurrences } from './conceptOccurrences';

const monthly = {
  period_start_on: '2027-01-01', period_end_on: '2027-01-31',
  duration_count: null, duration_unit: null, advance_days: 5, allow_after_start: 1, grace_days: 3,
  recurrence_unit: 'month' as const, recurrence_count: 1, recurrence_end_on: null,
};

describe('ocurrencias de conceptos', () => {
  it('keeps inclusive month-end coverage and only generates the requested horizon', () => {
    const periods = conceptOccurrences(monthly, '2027-02-15', '2027-04-01');
    expect(periods.map(period => [period.startOn, period.endOn])).toEqual([
      ['2027-02-01', '2027-02-28'], ['2027-03-01', '2027-03-31'], ['2027-04-01', '2027-04-30'],
    ]);
    expect(periods[0].accessGraceUntil).toBe('2027-02-04T06:00:00.000Z');
  });

  it('honors leap days, duration and the final recurrence date', () => {
    const periods = conceptOccurrences({ ...monthly, period_start_on: '2028-02-29', period_end_on: null,
      duration_count: 1, duration_unit: 'year', recurrence_unit: 'year', recurrence_end_on: '2030-02-28' },
    '2028-01-01', '2031-12-31');
    expect(periods.map(period => [period.startOn, period.endOn])).toEqual([
      ['2028-02-29', '2029-02-27'], ['2029-02-28', '2030-02-27'], ['2030-02-28', '2031-02-27'],
    ]);
  });

  it('handles long histories without generating expired periods', () => {
    expect(() => conceptOccurrences({ ...monthly, recurrence_count: 0 }, '2027-01-01', '2028-01-01')).toThrow();
    const periods = conceptOccurrences({ ...monthly, recurrence_unit: 'day', period_start_on: '1900-01-01',
      period_end_on: '1900-01-01' }, '2027-01-01', '2028-01-01');
    expect(periods).toHaveLength(366);
    expect(periods[0].startOn).toBe('2027-01-01');
  });

  it('only assigns the latest overlapping coverage on enrollment and then future periods', () => {
    const overlapping = { ...monthly, period_start_on: '2027-01-01', period_end_on: null,
      duration_count: 2, duration_unit: 'month' as const };
    expect(conceptOccurrences(overlapping, '2027-03-15', '2027-04-01').map(period => period.startOn))
      .toEqual(['2027-03-01', '2027-04-01']);
    expect(conceptOccurrences({ ...overlapping, duration_count: null, duration_unit: null },
      '2027-03-15', '2027-04-01').map(period => period.startOn)).toEqual(['2027-03-01', '2027-04-01']);
  });

  it('does not assign an expired period when enrollment falls between recurring coverages', () => {
    const periods = conceptOccurrences({ ...monthly, period_start_on: '2027-01-04', period_end_on: null,
      duration_count: 7, duration_unit: 'day', recurrence_unit: 'week', recurrence_count: 2 },
    '2027-01-11', '2027-02-01');
    expect(periods.map(period => [period.startOn, period.endOn])).toEqual([
      ['2027-01-18', '2027-01-24'], ['2027-02-01', '2027-02-07'],
    ]);
  });
});
