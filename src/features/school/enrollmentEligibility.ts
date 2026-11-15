// The containing query uses the school_subprogram_enrollments alias "e".
export const enrollmentPaymentValidSql = `e.status='active' AND (EXISTS (
  SELECT 1 FROM school_subprograms sub
  JOIN school_payment_modalities m ON m.id=e.modality_id
  JOIN school_subprogram_payment_schedules sched ON sched.enrollment_id=e.id AND sched.modality_id=m.id
  WHERE sub.id=e.subprogram_id AND sched.status='active' AND m.concept_mode=0
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
) OR EXISTS (
  SELECT 1 FROM school_payment_modalities plan
  JOIN school_concept_assignments assignment ON assignment.enrollment_id=e.id
  WHERE plan.id=e.modality_id AND plan.concept_mode=1 AND plan.concept_revision=assignment.synced_revision
    AND NOT EXISTS (SELECT 1 FROM school_payment_concepts c
      WHERE c.modality_id=plan.id AND c.active=1 AND c.recurrence_unit='once'
        AND NOT EXISTS (SELECT 1 FROM school_concept_occurrence_charges cc
          WHERE cc.enrollment_id=e.id AND cc.concept_id=c.id AND cc.retired=0))
    AND NOT EXISTS (SELECT 1 FROM school_payment_concepts c
      WHERE c.modality_id=plan.id AND c.active=1 AND c.required_for_access=1 AND c.recurrence_unit<>'once'
        AND (assignment.generated_until IS NULL OR datetime(assignment.generated_until)<=datetime('now'))
        AND (assignment.generated_until IS NULL OR c.recurrence_end_on IS NULL
          OR date(c.recurrence_end_on)>=date(assignment.generated_until)))
    AND NOT EXISTS (SELECT 1 FROM school_concept_occurrence_charges cc
      JOIN school_payment_concepts c ON c.id=cc.concept_id AND c.active=1 AND c.required_for_access=1
      JOIN school_payment_obligations o ON o.id=cc.obligation_id
      WHERE cc.enrollment_id=e.id AND cc.retired=0
        AND datetime(o.modality_valid_from)<=datetime('now')
        AND (o.modality_valid_until IS NULL OR datetime(o.modality_valid_until)>datetime('now'))
        AND datetime(cc.access_grace_until)<=datetime('now')
        AND NOT EXISTS (SELECT 1 FROM orders ord
          WHERE ord.id=COALESCE(o.order_id,o.bundle_order_id) AND o.status='paid'
            AND datetime(o.paid_at)<=datetime('now') AND ord.status='paid'
            AND COALESCE(ord.refunded_cents,0)<ord.amount_total_cents))
))`;
