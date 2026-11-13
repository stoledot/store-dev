// The containing query uses the school_courses alias "c" and binds a client number.
export const subprogramCourseAccessSql = `EXISTS (
  SELECT 1 FROM school_subprogram_enrollments e
  JOIN school_subprograms sub ON sub.id=e.subprogram_id
  JOIN school_subprogram_courses sc ON sc.subprogram_id=e.subprogram_id AND sc.course_id=c.id
  JOIN school_payment_modalities m ON m.id=e.modality_id
  JOIN school_subprogram_payment_schedules sched ON sched.enrollment_id=e.id AND sched.modality_id=m.id
  JOIN school_payment_obligations fee ON fee.subprogram_schedule_id=sched.id
  JOIN orders paid_order ON paid_order.id=fee.order_id
  WHERE e.client_number=? AND e.status='active' AND sched.status='active'
    AND (m.course_id IS NULL OR m.course_id=c.id)
    AND fee.status='paid' AND datetime(fee.paid_at)<=datetime('now')
    AND (fee.modality_valid_until IS NULL OR datetime(fee.modality_valid_until)>datetime('now'))
    AND paid_order.status='paid' AND COALESCE(paid_order.refunded_cents,0)<paid_order.amount_total_cents
    AND ((m.requires_current_enrollment=0 AND sub.enrollment_modality_id IS NULL) OR EXISTS (
      SELECT 1 FROM school_subprogram_enrollments e2
      JOIN school_subprogram_payment_schedules s2 ON s2.enrollment_id=e2.id
      JOIN school_payment_obligations enrollment_fee ON enrollment_fee.subprogram_schedule_id=s2.id
      JOIN orders enrollment_order ON enrollment_order.id=enrollment_fee.order_id
      WHERE e2.client_number=e.client_number AND e2.subprogram_id=e.subprogram_id
        AND enrollment_fee.modality_payment_type='enrollment' AND enrollment_fee.status='paid'
        AND datetime(enrollment_fee.paid_at)<=datetime('now')
        AND (enrollment_fee.modality_valid_until IS NULL OR datetime(enrollment_fee.modality_valid_until)>datetime('now'))
        AND enrollment_order.status='paid'
        AND COALESCE(enrollment_order.refunded_cents,0)<enrollment_order.amount_total_cents
    ))
)`;
