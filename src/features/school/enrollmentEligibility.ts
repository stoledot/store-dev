// The containing query uses the school_subprogram_enrollments alias "e".
export const enrollmentPaymentValidSql = `e.status='active' AND EXISTS (
  SELECT 1 FROM school_subprograms sub
  JOIN school_payment_modalities m ON m.id=e.modality_id
  JOIN school_subprogram_payment_schedules sched ON sched.enrollment_id=e.id AND sched.modality_id=m.id
  WHERE sub.id=e.subprogram_id AND sched.status='active'
    AND (EXISTS (SELECT 1 FROM school_payment_obligations fee
      JOIN orders paid_order ON paid_order.id=COALESCE(fee.order_id,fee.bundle_order_id)
      WHERE fee.subprogram_schedule_id=sched.id AND fee.status='paid' AND datetime(fee.paid_at)<=datetime('now')
        AND (fee.modality_valid_from IS NULL OR datetime(fee.modality_valid_from)<=datetime('now'))
        AND (fee.modality_valid_until IS NULL OR datetime(fee.modality_valid_until)>datetime('now'))
        AND paid_order.status='paid' AND COALESCE(paid_order.refunded_cents,0)<paid_order.amount_total_cents)
      OR EXISTS (SELECT 1 FROM school_subprogram_scholarship_periods scholarship
        WHERE scholarship.schedule_id=sched.id AND scholarship.status='active' AND datetime(scholarship.valid_from)<=datetime('now')
          AND datetime(scholarship.valid_until)>datetime('now')))
    AND NOT EXISTS (
      SELECT 1 FROM school_subprogram_payment_schedules overdue_schedule
      JOIN school_payment_obligations overdue ON overdue.subprogram_schedule_id=overdue_schedule.id
      WHERE overdue_schedule.enrollment_id=e.id AND overdue_schedule.status='active'
        AND (overdue_schedule.modality_id=e.modality_id
          OR (sub.enrollment_modality_id IS NOT NULL AND overdue_schedule.modality_id=sub.enrollment_modality_id))
        AND overdue.status='pending' AND ((overdue.overdue_from IS NOT NULL AND datetime(overdue.overdue_from)<=datetime('now'))
          OR (overdue.overdue_from IS NULL AND date(overdue.due_at)<date('now')))
    )
    AND ((m.requires_current_enrollment=0 AND sub.enrollment_modality_id IS NULL AND e.reenrollment_required=0) OR EXISTS (
      SELECT 1 FROM school_subprogram_enrollments e2
      JOIN school_subprogram_payment_schedules s2 ON s2.enrollment_id=e2.id
      JOIN school_payment_obligations enrollment_fee ON enrollment_fee.subprogram_schedule_id=s2.id
      JOIN orders enrollment_order ON enrollment_order.id=COALESCE(enrollment_fee.order_id,enrollment_fee.bundle_order_id)
      WHERE e2.id=e.id
        AND enrollment_fee.modality_payment_type='enrollment' AND enrollment_fee.status='paid'
        AND datetime(enrollment_fee.paid_at)<=datetime('now')
        AND (enrollment_fee.modality_valid_from IS NULL OR datetime(enrollment_fee.modality_valid_from)<=datetime('now'))
        AND (enrollment_fee.modality_valid_until IS NULL OR datetime(enrollment_fee.modality_valid_until)>datetime('now'))
        AND enrollment_order.status='paid'
        AND COALESCE(enrollment_order.refunded_cents,0)<enrollment_order.amount_total_cents
    ))
)`;
