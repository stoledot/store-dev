import { describe, expect, it } from 'vitest';
import { calendarPeriods, proratedAmount, schoolMidnight, schoolToday, type CalendarPolicy } from './paymentPeriods';

const policy: CalendarPolicy = {
  period_start_on: '2024-01-01', period_end_on: '2024-01-31', frequency_unit: 'month',
  frequency_count: 1, advance_days: 6, proration_method: 'days',
  class_weekdays: [], class_dates_added: [], class_dates_excluded: [],
};

describe('payment periods', () => {
  it('keeps the end of each month inclusive and opens payment in advance', () => {
    const periods = calendarPeriods(policy, '2024-01-20');
    expect(periods.slice(0, 3).map(({ start, end, available }) => ({ start, end, available }))).toEqual([
      { start: '2024-01-01', end: '2024-01-31', available: '2023-12-26' },
      { start: '2024-02-01', end: '2024-02-29', available: '2024-01-26' },
      { start: '2024-03-01', end: '2024-03-31', available: '2024-02-24' },
    ]);
    expect(periods[0].validFrom).toBe('2024-01-01T06:00:00.000Z');
    expect(periods[0].validUntil).toBe('2024-02-01T06:00:00.000Z');
    expect(calendarPeriods({ ...policy, advance_days: 5 }, '2024-01-20')[1].available).toBe('2024-01-27');
  });

  it('uses the school timezone instead of the UTC date', () => {
    expect(schoolToday(new Date('2026-02-01T03:00:00Z'))).toBe('2026-01-31');
    expect(schoolMidnight('2021-07-01')).toBe('2021-07-01T05:00:00.000Z');
  });

  it('prorates calendar days, including the entry date', () => {
    const period = calendarPeriods(policy, '2024-01-20')[0];
    expect(proratedAmount(3100, period, '2024-01-20', policy)).toBe(1200);
    expect(proratedAmount(3100, period, '2024-01-01', policy)).toBe(3100);
  });

  it('counts recurring and added classes, excluding holidays and rejecting none remaining', () => {
    const classes: CalendarPolicy = { ...policy, proration_method: 'classes', class_weekdays: [1],
      class_dates_added: ['2024-01-10'], class_dates_excluded: ['2024-01-15'] };
    const period = calendarPeriods(classes, '2024-01-20')[0];
    expect(proratedAmount(5000, period, '2024-01-20', classes)).toBe(2000);
    expect(() => proratedAmount(5000, period, '2024-01-31', classes)).toThrow(/No quedan clases/);
  });

  it('rejects overlapping periods', () => {
    expect(() => calendarPeriods({ ...policy, period_end_on: '2024-02-01' }, '2024-01-01')).toThrow(/superponerse/);
  });
});
