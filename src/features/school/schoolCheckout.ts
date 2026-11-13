import type { D1Database } from '@cloudflare/workers-types';

export interface SchoolCheckoutObligation {
  id: string;
  student_email: string;
  title_snapshot: string;
  description_snapshot: string;
  amount_cents: number;
  currency: string;
  due_at: string;
}

export async function claimSchoolCheckout(
  db: D1Database,
  id: string,
  email: string,
  lockToken: string,
): Promise<SchoolCheckoutObligation | null> {
  return db.prepare(`
    UPDATE school_payment_obligations
       SET checkout_lock_token=?, checkout_session_id=NULL, checkout_locked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=? AND student_email=? COLLATE NOCASE AND status='pending'
       AND (available_at IS NULL OR date(available_at)<=date('now'))
       AND (checkout_lock_token IS NULL OR (checkout_session_id IS NULL AND datetime(checkout_locked_at)<datetime('now','-25 hours'))
         OR EXISTS (SELECT 1 FROM pending_payments p WHERE p.payment_hash=school_payment_obligations.checkout_session_id
           AND p.backend='demo' AND p.status='pending' AND datetime(p.expires_at)<=datetime('now')))
       AND (subprogram_schedule_id IS NULL OR EXISTS (
         SELECT 1 FROM school_subprogram_payment_schedules target
         JOIN school_subprogram_enrollments e ON e.id=target.enrollment_id
         WHERE target.id=school_payment_obligations.subprogram_schedule_id AND e.status='active'
       ))
       AND ((subprogram_schedule_id IS NULL AND requires_current_enrollment=0) OR EXISTS (
         SELECT 1 FROM school_subprogram_payment_schedules target
         JOIN school_subprogram_enrollments e ON e.id=target.enrollment_id
         JOIN school_subprograms s ON s.id=e.subprogram_id
         JOIN school_payment_modalities m ON m.id=target.modality_id
         WHERE target.id=school_payment_obligations.subprogram_schedule_id
           AND (school_payment_obligations.modality_payment_type='enrollment'
             OR (s.enrollment_modality_id IS NULL AND m.requires_current_enrollment=0))
       ) OR EXISTS (
         SELECT 1 FROM school_subprogram_payment_schedules target
         JOIN school_subprogram_enrollments target_enrollment ON target_enrollment.id=target.enrollment_id
         JOIN school_subprogram_enrollments other_enrollment
           ON other_enrollment.client_number=target_enrollment.client_number
          AND other_enrollment.subprogram_id=target_enrollment.subprogram_id
         JOIN school_subprogram_payment_schedules other_schedule ON other_schedule.enrollment_id=other_enrollment.id
         JOIN school_payment_obligations paid ON paid.subprogram_schedule_id=other_schedule.id
         JOIN orders paid_order ON paid_order.id=paid.order_id
         WHERE target.id=school_payment_obligations.subprogram_schedule_id
           AND paid.modality_payment_type='enrollment' AND paid.status='paid'
           AND paid_order.status='paid' AND COALESCE(paid_order.refunded_cents,0)<paid_order.amount_total_cents
           AND datetime(paid.paid_at)<=datetime('now')
           AND (paid.modality_valid_until IS NULL OR datetime(paid.modality_valid_until)>datetime('now'))
       ))
     RETURNING id,student_email,title_snapshot,description_snapshot,amount_cents,currency,due_at
  `).bind(lockToken, id, email).first<SchoolCheckoutObligation>();
}
