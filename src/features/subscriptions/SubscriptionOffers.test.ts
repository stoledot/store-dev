import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import SubscriptionOffers from './SubscriptionOffers.astro';
import { SUBSCRIPTION_CONSENT_FIELDS } from './consent';

describe('subscription offers', () => {
  it('shows the policies and requires each acknowledgement', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(SubscriptionOffers, {
      props: {
        productId: 'prod_example',
        plans: [{
          slug: 'mensual', title: 'Plan', description: '', formattedPrice: '$100.00',
          intervalLabel: 'cada mes', updatedAt: '2026-01-01T00:00:00Z',
          terms: 'Condiciones del plan', refundPolicy: 'Política de reembolso',
          privacyNotice: 'Aviso de privacidad', privacyNoticeUrl: '',
        }],
      },
    });
    expect(html).toContain('Condiciones del plan');
    expect(html).toContain('Política de reembolso');
    expect(html).toContain('Aviso de privacidad');
    expect(html).toContain('value="2026-01-01T00:00:00Z"');
    for (const field of SUBSCRIPTION_CONSENT_FIELDS) {
      expect(html).toMatch(new RegExp(`name="${field}"[^>]*required`));
    }
  });
});
