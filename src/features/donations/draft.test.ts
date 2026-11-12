import { describe, expect, it } from 'vitest';
import { parseDonationAmounts, readDonationDraft } from './draft';

describe('donation drafts', () => {
  it('parses exact amounts using the currency scale', () => {
    expect(parseDonationAmounts('100\n 250.50 ', 'MXN')).toEqual([10000, 25050]);
    expect(parseDonationAmounts('100', 'JPY')).toEqual([100]);
    expect(parseDonationAmounts('1.234', 'BHD')).toEqual([1234]);
  });

  it('rejects invalid, duplicate, zero and excessive amounts', () => {
    for (const input of ['0', '1.001', '-5', '2,50', '1\n1.00', '99999999999999999999']) {
      expect(() => parseDonationAmounts(input, 'MXN')).toThrow();
    }
    expect(() => parseDonationAmounts(Array(21).fill('1').join('\n'), 'MXN')).toThrow();
  });

  it('does not silently replace a malformed saved draft', () => {
    expect(readDonationDraft(null).oneTimeAmounts).toBe('');
    expect(() => readDonationDraft('{}')).toThrow();
    expect(() => readDonationDraft('invalid')).toThrow();
  });
});
