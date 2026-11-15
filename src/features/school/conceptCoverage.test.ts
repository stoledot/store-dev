import { describe, expect, it } from 'vitest';
import { conceptCoverage } from './conceptCoverage';

const base = {
  period_start_on: '2027-01-01', period_end_on: null, duration_count: null, duration_unit: null,
  advance_days: null, allow_after_start: 0, grace_days: 3,
};

describe('cobertura y plazos de conceptos', () => {
  it('uses inclusive coverage and three calendar days of access grace', () => {
    expect(conceptCoverage({ ...base, period_end_on: '2027-12-31', advance_days: 10 })).toEqual({
      startOn: '2027-01-01', endOn: '2027-12-31',
      validFrom: '2027-01-01T06:00:00.000Z', validUntil: '2028-01-01T06:00:00.000Z',
      availableFrom: '2026-12-22T06:00:00.000Z', paymentCutoff: '2027-01-01T06:00:00.000Z',
      accessGraceUntil: '2027-01-04T06:00:00.000Z',
    });
  });

  it('supports duration across leap years and an indefinite payment window', () => {
    const coverage = conceptCoverage({ ...base, period_start_on: '2028-02-29',
      duration_count: 1, duration_unit: 'year', allow_after_start: 1, grace_days: 0 });
    expect(coverage.endOn).toBe('2029-02-27');
    expect(coverage.validUntil).toBe('2029-02-28T06:00:00.000Z');
    expect(coverage.availableFrom).toBeNull();
    expect(coverage.paymentCutoff).toBeNull();
    expect(coverage.accessGraceUntil).toBe(coverage.validFrom);
  });

  it('supports indefinite coverage and rejects inconsistent policies', () => {
    expect(conceptCoverage(base).validUntil).toBeNull();
    expect(() => conceptCoverage({ ...base, period_end_on: '2027-12-31', duration_count: 1, duration_unit: 'year' })).toThrow();
    expect(() => conceptCoverage({ ...base, duration_count: 1 })).toThrow();
    expect(() => conceptCoverage({ ...base, period_start_on: '2027-02-30' })).toThrow();
  });
});
