import { enrollmentPaymentValidSql } from './enrollmentEligibility.ts';

// The containing query uses the school_courses alias "c" and binds a client number.
export const subprogramCourseAccessSql = `EXISTS (
  SELECT 1 FROM school_subprogram_enrollments e
  JOIN school_subprogram_group_members member ON member.enrollment_id=e.id
  JOIN school_subprogram_groups g ON g.id=member.group_id AND g.subprogram_id=e.subprogram_id AND g.status='active'
  JOIN school_subprogram_group_courses gc ON gc.group_id=g.id AND gc.course_id=c.id
  JOIN school_payment_modalities m ON m.id=e.modality_id
  WHERE e.client_number=? AND ${enrollmentPaymentValidSql}
    AND (m.course_id IS NULL OR m.course_id=c.id)
)`;
