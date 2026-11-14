import { describe, expect, it } from 'vitest';
import { groupBundleCandidates, selectBundleItems, type BundleCandidate } from './paymentBundles';

function charge(id: string, due: string, overdue: number, enrollment = 'e1', currency = 'mxn', type = 'classes'): BundleCandidate {
  return { id, due_at: due, overdue, enrollment_id: enrollment, currency, modality_payment_type: type,
    student_email: 'student@example.test', subprogram_title: 'Clases', title_snapshot: id, amount_cents: 100 };
}

describe('school payment grouping', () => {
  it('combines all overdue charges with only the next available class and enrollment', () => {
    const items = selectBundleItems([
      charge('later', '2026-04-01', 0), charge('overdue-1', '2026-01-01', 1),
      charge('next', '2026-03-01', 0), charge('overdue-2', '2026-02-01', 1),
      charge('enrollment', '2026-03-01', 0, 'e1', 'mxn', 'enrollment'),
    ]);
    expect(items.map(item => item.id)).toEqual(['overdue-1', 'overdue-2', 'next', 'enrollment']);
  });

  it('permits overdue-only payments and never mixes enrollments or currencies', () => {
    const groups = groupBundleCandidates([
      charge('overdue', '2026-01-01', 1), charge('usd', '2026-01-01', 1, 'e1', 'USD'),
      charge('other', '2026-01-01', 1, 'e2'), charge('usd-2', '2026-02-01', 0, 'e1', 'usd'),
    ]);
    expect(groups.map(group => group.map(item => item.id))).toEqual([['overdue'], ['usd', 'usd-2'], ['other']]);
  });
});
