export function manualGroupPaymentValidSql(client: string, group: string): string {
  return `(NOT EXISTS (SELECT 1 FROM school_manual_access_payment link
    WHERE link.client_number=${client} AND link.resource_type='group' AND link.resource_id=${group})
    OR EXISTS (SELECT 1 FROM school_manual_access_payment link
      JOIN school_payment_obligations fee ON fee.id=link.obligation_id
      JOIN orders paid ON paid.id=COALESCE(fee.order_id,fee.bundle_order_id)
      WHERE link.client_number=${client} AND link.resource_type='group' AND link.resource_id=${group}
        AND fee.status='paid' AND paid.status='paid' AND COALESCE(paid.refunded_cents,0)<paid.amount_total_cents
        AND datetime(fee.paid_at)<=datetime('now')
        AND (fee.modality_valid_from IS NULL OR datetime(fee.modality_valid_from)<=datetime('now'))
        AND (fee.modality_valid_until IS NULL OR datetime(fee.modality_valid_until)>datetime('now'))))`;
}
