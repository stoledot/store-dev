import type { D1Database } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import { hasSubscriptionProduct } from './purchaseGuard';

describe('subscription purchase guard', () => {
  it('does not query for an empty cart', async () => {
    const prepare = vi.fn();
    const db = { prepare } as unknown as D1Database;
    expect(await hasSubscriptionProduct(db, [])).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('checks all distinct product IDs regardless of plan status', async () => {
    const first = vi.fn().mockResolvedValue({ found: 1 });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;
    expect(await hasSubscriptionProduct(db, [2, 4, 2])).toBe(true);
    expect(bind).toHaveBeenCalledWith(2, 4);
    expect(prepare.mock.calls[0][0]).not.toContain('status');
    first.mockResolvedValue(null);
    expect(await hasSubscriptionProduct(db, [7])).toBe(false);
  });
});
