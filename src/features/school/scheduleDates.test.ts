import { describe, expect, it } from 'vitest';
import { futureChargeDates, validityEnd } from './scheduleDates';

describe('futureChargeDates', () => {
  it('clamps the end of a month without changing the original anchor', () => {
    expect(futureChargeDates('2024-01-31', 'month', 1, '2024-01-31').slice(0, 4))
      .toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
  });
  it('generates only one installment for a one-time fee', () => {
    expect(futureChargeDates('2026-03-01', 'once', 1, '2026-03-01')).toEqual(['2026-03-01']);
  });
  it('rejects invalid dates and frequencies', () => {
    expect(() => futureChargeDates('2026-02-30', 'month', 1, '2026-03-01')).toThrow();
    expect(() => futureChargeDates('2026-03-01', 'once', 2, '2026-03-01')).toThrow();
  });
  it('calculates enrollment expiry from payment time or leaves it unlimited', () => {
    const paid = new Date('2024-01-31T12:34:56.000Z');
    expect(validityEnd(paid, 1, 'month')).toBe('2024-02-29T12:34:56.000Z');
    expect(validityEnd(paid, null, null)).toBeNull();
    expect(() => validityEnd(paid, 1, null)).toThrow();
  });
});
