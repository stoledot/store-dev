export const SUBSCRIPTION_CONSENT_FIELDS = [
  'accept_subscription_terms',
  'accept_refund_policy',
  'acknowledge_privacy_notice',
  'authorize_recurring_charges',
] as const;

export function hasSubscriptionConsent(form: FormData): boolean {
  return SUBSCRIPTION_CONSENT_FIELDS.every((field) => form.get(field) === 'yes');
}

export function subscriptionPoliciesReady(policies: string[]): boolean {
  return policies.every((text) => text.trim().length > 0 && !text.includes('['));
}
