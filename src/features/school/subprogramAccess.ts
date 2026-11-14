import { enrollmentPaymentValidSql } from './enrollmentEligibility.ts';
import { manualGroupPaymentValidSql } from './manualGroupPayment.ts';

// The containing query uses the school_courses alias "c" and binds a client number.
export const subprogramCourseAccessSql = `EXISTS (
  WITH actor AS (SELECT ? AS client_number)
  SELECT 1 FROM actor
  JOIN school_subprogram_enrollments e ON e.client_number=actor.client_number
  JOIN school_subprogram_group_members member ON member.enrollment_id=e.id
  JOIN school_subprogram_groups g ON g.id=member.group_id AND g.subprogram_id=e.subprogram_id AND g.status='active'
  JOIN school_subprogram_group_courses gc ON gc.group_id=g.id AND gc.course_id=c.id
  JOIN school_payment_modalities m ON m.id=e.modality_id
  WHERE ${enrollmentPaymentValidSql} AND (m.course_id IS NULL OR m.course_id=c.id)
    AND ${manualGroupPaymentValidSql('actor.client_number', 'g.id')}
    AND NOT EXISTS (SELECT 1 FROM school_manual_access deny WHERE deny.client_number=actor.client_number
      AND deny.decision='deny' AND ((deny.resource_type='group' AND deny.resource_id=g.id)
        OR (deny.resource_type='subprogram' AND deny.resource_id=g.subprogram_id))
      AND (deny.expires_at IS NULL OR date(deny.expires_at)>=date('now')))
  UNION ALL
  SELECT 1 FROM actor JOIN school_manual_access a ON a.client_number=actor.client_number
  WHERE a.resource_type='course' AND a.resource_id=c.id AND a.decision='allow'
    AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now'))
  UNION ALL
  SELECT 1 FROM actor JOIN school_manual_access a ON a.client_number=actor.client_number
  JOIN school_subprogram_courses sc ON sc.subprogram_id=a.resource_id AND sc.course_id=c.id
  JOIN school_subprograms sub ON sub.id=sc.subprogram_id AND sub.status='active'
  WHERE a.resource_type='subprogram' AND a.decision='allow'
    AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now'))
  UNION ALL
  SELECT 1 FROM actor JOIN school_manual_access a ON a.client_number=actor.client_number
  JOIN school_subprogram_groups g ON g.id=a.resource_id AND g.status='active'
  JOIN school_subprogram_group_courses gc ON gc.group_id=g.id AND gc.course_id=c.id
  WHERE a.resource_type='group' AND a.decision='allow'
    AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now'))
    AND ${manualGroupPaymentValidSql('actor.client_number', 'g.id')}
    AND NOT EXISTS (SELECT 1 FROM school_manual_access deny WHERE deny.client_number=actor.client_number
      AND deny.resource_type='subprogram' AND deny.resource_id=g.subprogram_id AND deny.decision='deny'
      AND (deny.expires_at IS NULL OR date(deny.expires_at)>=date('now')))
)`;
