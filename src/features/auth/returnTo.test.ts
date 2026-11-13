import { describe, expect, it } from 'vitest';
import { customerReturnTo } from './returnTo';

describe('customerReturnTo', () => {
  it('allows a subprogram diagnostic path', () => {
    const path = '/subprogramas/01234567-89ab-cdef-0123-456789abcdef';
    expect(customerReturnTo(path)).toBe(path);
  });

  it('rejects external or malformed return paths', () => {
    for (const path of ['//example.com', '/subprogramas/../admin', '/subprogramas/x?next=//example.com']) {
      expect(customerReturnTo(path)).toBe('/account');
    }
  });
});
