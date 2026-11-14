import type { D1Database } from '@cloudflare/workers-types';
import { courseAccessSql } from './courseAccess.ts';

export async function getSchoolHomeSummary(db: D1Database, email: string) {
  const account = await db.prepare('SELECT client_number FROM customer_accounts WHERE email=? COLLATE NOCASE')
    .bind(email).first<{ client_number: string }>();
  const clientNumber = account?.client_number ?? null;
  const [courses, diagnostics, notifications, unread] = await Promise.all([
    db.prepare(`
      SELECT c.slug,c.title,COUNT(*) OVER() AS total_courses,
        (SELECT l.slug FROM school_lessons l
          LEFT JOIN school_lesson_progress lp ON lp.lesson_id=l.id AND lp.student_email=? COLLATE NOCASE
          WHERE l.course_id=c.id AND l.status='published'
          ORDER BY CASE WHEN COALESCE(lp.status,'not_started')='completed' THEN 1 ELSE 0 END,l.sequence_no,l.id LIMIT 1) AS lesson_slug,
        (SELECT l.title FROM school_lessons l
          LEFT JOIN school_lesson_progress lp ON lp.lesson_id=l.id AND lp.student_email=? COLLATE NOCASE
          WHERE l.course_id=c.id AND l.status='published'
          ORDER BY CASE WHEN COALESCE(lp.status,'not_started')='completed' THEN 1 ELSE 0 END,l.sequence_no,l.id LIMIT 1) AS lesson_title,
        COALESCE(cp.status,'not_started') AS progress_status
      FROM school_courses c
      LEFT JOIN school_course_progress cp ON cp.course_id=c.id AND cp.student_email=? COLLATE NOCASE
      WHERE c.status='published' AND c.content_kind IN ('course','reading') AND ${courseAccessSql}
      ORDER BY CASE cp.status WHEN 'in_progress' THEN 0 WHEN 'completed' THEN 2 ELSE 1 END,c.title COLLATE NOCASE
      LIMIT 4
    `).bind(email, email, email, email, email, email, email, clientNumber, clientNumber).all<{
      slug: string; title: string; total_courses: number; lesson_slug: string | null;
      lesson_title: string | null; progress_status: string;
    }>(),
    db.prepare(`
      SELECT d.subprogram_id,s.title,d.status,d.closed_at,
        (SELECT e.status FROM school_subprogram_enrollments e WHERE e.diagnostic_id=d.id LIMIT 1) AS enrollment_status,
        (SELECT g.title FROM school_subprogram_enrollments e
          JOIN school_subprogram_group_members gm ON gm.enrollment_id=e.id
          JOIN school_subprogram_groups g ON g.id=gm.group_id AND g.subprogram_id=e.subprogram_id
          WHERE e.client_number=d.client_number AND e.subprogram_id=d.subprogram_id AND e.status='active' AND g.status='active'
          LIMIT 1) AS group_title,
        CASE WHEN s.enrollment_modality_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM school_subprogram_enrollments e JOIN school_payment_modalities m ON m.id=e.modality_id
           WHERE e.client_number=d.client_number AND e.subprogram_id=d.subprogram_id AND e.status='active' AND m.requires_current_enrollment=1
        ) THEN 1 ELSE 0 END AS enrollment_required,
        EXISTS(SELECT 1 FROM school_payment_obligations o JOIN school_subprogram_payment_schedules ps ON ps.id=o.subprogram_schedule_id
          JOIN school_subprogram_enrollments e ON e.id=ps.enrollment_id JOIN orders paid ON paid.id=COALESCE(o.order_id,o.bundle_order_id)
          WHERE e.client_number=d.client_number AND e.subprogram_id=d.subprogram_id AND e.status='active'
            AND o.modality_payment_type='enrollment' AND o.status='paid' AND paid.status='paid'
            AND COALESCE(paid.refunded_cents,0)<paid.amount_total_cents AND datetime(o.paid_at)<=datetime('now')
            AND (o.modality_valid_from IS NULL OR datetime(o.modality_valid_from)<=datetime('now'))
            AND (o.modality_valid_until IS NULL OR datetime(o.modality_valid_until)>datetime('now'))) AS enrollment_valid,
        EXISTS(SELECT 1 FROM school_payment_obligations o JOIN school_subprogram_payment_schedules ps ON ps.id=o.subprogram_schedule_id
          JOIN school_subprogram_enrollments e ON e.id=ps.enrollment_id JOIN orders paid ON paid.id=COALESCE(o.order_id,o.bundle_order_id)
          WHERE e.client_number=d.client_number AND e.subprogram_id=d.subprogram_id AND e.status='active' AND ps.status='active'
            AND ps.modality_id=e.modality_id AND o.status='paid' AND paid.status='paid'
            AND COALESCE(paid.refunded_cents,0)<paid.amount_total_cents AND datetime(o.paid_at)<=datetime('now')
            AND (o.modality_valid_from IS NULL OR datetime(o.modality_valid_from)<=datetime('now'))
            AND (o.modality_valid_until IS NULL OR datetime(o.modality_valid_until)>datetime('now'))) AS modality_valid,
        (SELECT COUNT(*) FROM school_payment_obligations o
          JOIN school_subprogram_payment_schedules ps ON ps.id=o.subprogram_schedule_id
          JOIN school_subprogram_enrollments e ON e.id=ps.enrollment_id
          WHERE e.client_number=d.client_number AND e.subprogram_id=d.subprogram_id AND e.status='active'
            AND o.status='pending' AND ((o.available_from IS NOT NULL AND datetime(o.available_from)<=datetime('now'))
              OR (o.available_from IS NULL AND (o.available_at IS NULL OR date(o.available_at)<=date('now'))))) AS due_count,
        (SELECT COUNT(*) FROM school_payment_obligations o
          JOIN school_subprogram_payment_schedules ps ON ps.id=o.subprogram_schedule_id
          JOIN school_subprogram_enrollments e ON e.id=ps.enrollment_id
          WHERE e.client_number=d.client_number AND e.subprogram_id=d.subprogram_id AND e.status='active'
            AND o.modality_payment_type='enrollment' AND o.status='pending'
            AND ((o.available_from IS NOT NULL AND datetime(o.available_from)<=datetime('now'))
              OR (o.available_from IS NULL AND (o.available_at IS NULL OR date(o.available_at)<=date('now'))))) AS enrollment_due_count
      FROM school_subprogram_diagnostics d JOIN school_subprograms s ON s.id=d.subprogram_id
      WHERE d.client_number=? AND d.id=(SELECT d2.id FROM school_subprogram_diagnostics d2
        WHERE d2.client_number=d.client_number AND d2.subprogram_id=d.subprogram_id
        ORDER BY d2.submitted_at DESC,d2.rowid DESC LIMIT 1)
      ORDER BY CASE WHEN d.status='rejected' THEN 0 WHEN d.status='pending' THEN 1 WHEN due_count>0 THEN 2 ELSE 3 END,
        d.submitted_at DESC,d.rowid DESC
    `).bind(clientNumber).all<{
      subprogram_id: string; title: string; status: string; closed_at:string|null; enrollment_status:string|null;
      due_count: number; enrollment_due_count: number; group_title: string | null;
      enrollment_required: number; enrollment_valid: number; modality_valid: number;
    }>(),
    db.prepare(`SELECT id,title,COALESCE(NULLIF(message,''),body) AS message FROM school_notifications
      WHERE student_email=? COLLATE NOCASE AND read_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 2`)
      .bind(email).all<{ id: string; title: string; message: string }>(),
    db.prepare('SELECT COUNT(*) AS count FROM school_notifications WHERE student_email=? COLLATE NOCASE AND read_at IS NULL')
      .bind(email).first<{ count: number }>(),
  ]);
  return {
    courses: courses.results,
    courseCount: courses.results[0]?.total_courses ?? 0,
    diagnostics: diagnostics.results,
    notifications: notifications.results,
    unreadCount: unread?.count ?? 0,
  };
}
