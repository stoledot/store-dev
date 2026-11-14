import { describe, expect, it } from 'vitest';
import { suspensionDate } from './withdrawals';

describe('suspensionDate', () => {
  it('counts calendar days after the due date and rejects invalid settings', () => {
    expect(suspensionDate('2026-01-31', 0)).toBe('2026-02-01');
    expect(suspensionDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(suspensionDate('2026-01-31', 5)).toBe('2026-02-05');
    expect(() => suspensionDate('2026-01-31', -1)).toThrow();
  });
});
