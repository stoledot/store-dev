import { describe, expect, it } from 'vitest';
import { hasSubscriptionConsent, SUBSCRIPTION_CONSENT_FIELDS, subscriptionPoliciesReady } from './consent';

describe('subscription consent', () => {
  it('requires every individual acknowledgement', () => {
    const form = new FormData();
    for (const field of SUBSCRIPTION_CONSENT_FIELDS) form.set(field, 'yes');
    expect(hasSubscriptionConsent(form)).toBe(true);
    for (const field of SUBSCRIPTION_CONSENT_FIELDS) {
      form.delete(field);
      expect(hasSubscriptionConsent(form)).toBe(false);
      form.set(field, 'yes');
    }
    form.set('authorize_recurring_charges', 'no');
    expect(hasSubscriptionConsent(form)).toBe(false);
  });

  it('blocks empty and placeholder policies', () => {
    expect(subscriptionPoliciesReady(['Condiciones', 'Reembolsos', 'Privacidad'])).toBe(true);
    expect(subscriptionPoliciesReady(['Condiciones', '', 'Privacidad'])).toBe(false);
    expect(subscriptionPoliciesReady(['Condiciones', '[REVISAR]', 'Privacidad'])).toBe(false);
  });
});
