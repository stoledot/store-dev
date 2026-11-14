import { describe, expect, it, vi } from 'vitest';
import { getContactConfig, saveContactConfig } from './contact';

describe('contact settings', () => {
  it('stores validated HTTPS links and rejects unsafe protocols', async () => {
    const run = vi.fn().mockResolvedValue({});
    const bind = vi.fn().mockReturnValue({ run });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;
    const form = new FormData();
    form.set('whatsapp', 'https://wa.me/123');
    form.set('instagram', 'javascript:alert(1)');
    await expect(saveContactConfig(db, form)).rejects.toThrow('HTTPS');
    expect(run).not.toHaveBeenCalled();
    form.set('instagram', 'https://instagram.com/example');
    await saveContactConfig(db, form);
    expect(JSON.parse(bind.mock.calls[0][1])).toMatchObject({
      whatsapp: 'https://wa.me/123', instagram: 'https://instagram.com/example',
    });
  });

  it('does not silently accept corrupt stored configuration', async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({ value: '{"x":"javascript:alert(1)"}' }) }) }) } as unknown as D1Database;
    await expect(getContactConfig(db)).rejects.toThrow('HTTPS');
  });
});
